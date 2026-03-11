const prisma = require('../lib/prisma');
const { computeMaintenanceForecast, getMaintenanceAlertLevel } = require('../utils/maintenance');
const { sendWhatsAppMessageWithDedupe, wasWhatsAppRecentlySent } = require('./whatsappService');
const { resolveNotificationPayload } = require('./notificationCenterService');

const ALERT_LABEL = {
  OVERDUE: 'Urgencia',
  DUE_SOON: 'Atencao',
  OK: 'OK',
};

const ALERT_WINDOW_HOURS = {
  OVERDUE: 24 * 7,
  DUE_SOON: 24 * 3,
};

function toSafeLimit(value, fallback = 500) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 3000);
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function formatKm(value) {
  const km = Number(value);
  if (!Number.isFinite(km)) return '-';
  return `${Math.trunc(km).toLocaleString('pt-BR')} km`;
}

function buildMaintenanceAlertMessage({ clientName, plate, label, alertLevel, nextDate, nextKm }) {
  const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal`;
  const urgencyText = alertLevel === 'OVERDUE' ? 'esta vencida' : 'esta proxima do vencimento';
  const header = `Ola, ${clientName}! A manutencao ${label} do veiculo ${plate} ${urgencyText}.`;
  const details = `Previsao: ${formatDate(nextDate)} ou ${formatKm(nextKm)}.`;
  return `${header}\nNivel: ${ALERT_LABEL[alertLevel] || alertLevel}.\n${details}\nAcompanhe no portal: ${portalUrl}`;
}

async function loadMaintenanceCandidates(limit) {
  return prisma.preventiveMaintenance.findMany({
    where: {
      vehicle: {
        active: true,
        client: {
          OR: [
            { whatsapp: { not: null } },
            { phone: { not: null } },
          ],
        },
      },
      OR: [
        { nextDate: { not: null } },
        { nextKm: { not: null } },
        { intervalMonths: { not: null } },
        { intervalKm: { not: null } },
      ],
    },
    include: {
      vehicle: {
        select: {
          id: true,
          plate: true,
          currentKm: true,
          client: { select: { id: true, name: true, whatsapp: true, phone: true } },
        },
      },
    },
    orderBy: [{ updatedAt: 'asc' }],
    take: limit,
  });
}

function priorityWeight(alertLevel) {
  if (alertLevel === 'OVERDUE') return 0;
  if (alertLevel === 'DUE_SOON') return 1;
  return 9;
}

function getMaintenanceEventKey(alertLevel) {
  if (alertLevel === 'OVERDUE') return 'MAINTENANCE_OVERDUE';
  if (alertLevel === 'DUE_SOON') return 'MAINTENANCE_DUE_SOON';
  return null;
}

async function sendMaintenanceAlerts({ dryRun = false, limit = 500, now = new Date() } = {}) {
  const safeLimit = toSafeLimit(limit, 500);
  const rows = await loadMaintenanceCandidates(safeLimit);

  const evaluated = [];

  for (const row of rows) {
    const forecast = computeMaintenanceForecast(row, {
      baselineDate: row.createdAt,
      baselineKm: row.vehicle?.currentKm,
    });

    const merged = {
      ...row,
      nextDate: forecast.nextDate,
      nextKm: forecast.nextKm,
    };

    const alertLevel = getMaintenanceAlertLevel(merged, row.vehicle?.currentKm, { now });

    if (!['OVERDUE', 'DUE_SOON'].includes(alertLevel)) continue;

    const client = row.vehicle?.client;
    const phone = client?.whatsapp || client?.phone;

    evaluated.push({
      id: row.id,
      type: row.type,
      label: row.label,
      alertLevel,
      nextDate: merged.nextDate,
      nextKm: merged.nextKm,
      clientId: client?.id || null,
      clientName: client?.name || 'Cliente',
      plate: row.vehicle?.plate || '-',
      phone: phone || null,
    });
  }

  evaluated.sort((a, b) => {
    const levelDiff = priorityWeight(a.alertLevel) - priorityWeight(b.alertLevel);
    if (levelDiff !== 0) return levelDiff;
    return String(a.plate || '').localeCompare(String(b.plate || ''));
  });

  const summary = {
    scanned: rows.length,
    candidates: evaluated.length,
    sent: 0,
    duplicates: 0,
    skippedNoPhone: 0,
    disabled: 0,
    failed: 0,
    overdue: evaluated.filter((i) => i.alertLevel === 'OVERDUE').length,
    dueSoon: evaluated.filter((i) => i.alertLevel === 'DUE_SOON').length,
  };

  const details = [];

  for (const item of evaluated) {
    if (!item.phone || !item.clientId) {
      summary.skippedNoPhone += 1;
      details.push({ ...item, status: 'NO_PHONE' });
      continue;
    }

    const content = buildMaintenanceAlertMessage({
      clientName: item.clientName,
      plate: item.plate,
      label: item.label,
      alertLevel: item.alertLevel,
      nextDate: item.nextDate,
      nextKm: item.nextKm,
    });

    const eventKey = getMaintenanceEventKey(item.alertLevel);
    const fallbackDedupeHours = ALERT_WINDOW_HOURS[item.alertLevel] || 24;
    const templateVariables = {
      clientName: item.clientName,
      plate: item.plate,
      maintenanceLabel: item.label,
      alertLevel: item.alertLevel,
      alertLabel: ALERT_LABEL[item.alertLevel] || item.alertLevel,
      nextDate: formatDate(item.nextDate),
      nextKm: formatKm(item.nextKm),
      portalUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal`,
    };

    if (dryRun) {
      const preview = await resolveNotificationPayload({
        eventKey,
        fallbackContent: content,
        variables: templateVariables,
        fallbackDedupeHours,
      });

      if (!preview.enabled) {
        summary.disabled += 1;
        details.push({ ...item, status: 'DISABLED', reason: preview.reason, eventKey: preview.eventKey });
        continue;
      }

      const duplicate = await wasWhatsAppRecentlySent({
        clientId: item.clientId,
        soId: null,
        content: preview.content,
        windowHours: preview.dedupeHours,
      });

      if (duplicate) {
        summary.duplicates += 1;
        details.push({ ...item, status: 'DUPLICATE', eventKey: preview.eventKey });
      } else {
        details.push({ ...item, status: 'WOULD_SEND', eventKey: preview.eventKey });
      }
      continue;
    }

    const result = await sendWhatsAppMessageWithDedupe({
      clientId: item.clientId,
      soId: null,
      phone: item.phone,
      content,
      dedupeHours: fallbackDedupeHours,
      eventKey,
      templateVariables,
    });

    if (result?.skipped) {
      if (result.reason === 'duplicate') {
        summary.duplicates += 1;
        details.push({ ...item, status: 'DUPLICATE', eventKey: result.eventKey || eventKey });
      } else {
        summary.disabled += 1;
        details.push({ ...item, status: 'DISABLED', reason: result.reason, eventKey: result.eventKey || eventKey });
      }
      continue;
    }

    if (result?.success) {
      summary.sent += 1;
      details.push({ ...item, status: 'SENT', eventKey: result.eventKey || eventKey });
      continue;
    }

    summary.failed += 1;
    details.push({ ...item, status: 'FAILED', reason: result?.error || 'Falha ao enviar', eventKey: result?.eventKey || eventKey });
  }

  return {
    dryRun: !!dryRun,
    summary,
    details,
  };
}

module.exports = {
  ALERT_LABEL,
  buildMaintenanceAlertMessage,
  sendMaintenanceAlerts,
};
