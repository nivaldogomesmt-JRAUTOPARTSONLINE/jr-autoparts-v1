const prisma = require('../lib/prisma');
const efiService = require('./efiCobrancasService');
const { sendWhatsAppMessageWithDedupe } = require('./whatsappService');

const OPEN_STATUSES = new Set(['waiting', 'unpaid', 'pending']);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeDocumentDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getDocumentType(docDigits) {
  return docDigits.length === 14 ? 'CNPJ' : 'CPF';
}

function formatDateBR(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

function formatAmountForTemplate(value) {
  const raw = Number(value || 0) / 100;
  return raw.toFixed(2).replace('.', ',');
}

function asDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(fromDate, toDate) {
  const ms = dateOnly(toDate).getTime() - dateOnly(fromDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function extractEfiChargeItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.charges)) return raw.charges;
  return [];
}

function normalizeCharge(charge) {
  const status = String(charge?.status || charge?.situacao || '').toLowerCase();
  const dueDate = asDate(charge?.expire_at || charge?.dataVencimento);
  const amountCents = Number(charge?.value ?? charge?.valor ?? 0);

  return {
    status,
    dueDate,
    amountCents,
    charge,
  };
}

function pickNotification(charges, dueSoonDays, now = new Date()) {
  const normalized = charges
    .map(normalizeCharge)
    .filter((entry) => entry.dueDate && OPEN_STATUSES.has(entry.status));

  if (!normalized.length) return null;

  const overdue = normalized
    .map((entry) => ({ ...entry, days: diffInDays(entry.dueDate, now) }))
    .filter((entry) => entry.days > 0)
    .sort((a, b) => b.days - a.days);

  if (overdue.length) {
    return {
      eventKey: 'BOT_BOLETO_OVERDUE',
      picked: overdue[0],
      daysToDue: -overdue[0].days,
    };
  }

  const dueSoon = normalized
    .map((entry) => ({ ...entry, days: diffInDays(now, entry.dueDate) }))
    .filter((entry) => entry.days >= 0 && entry.days <= dueSoonDays)
    .sort((a, b) => a.days - b.days);

  if (dueSoon.length) {
    return {
      eventKey: 'BOT_BOLETO_DUE_SOON',
      picked: dueSoon[0],
      daysToDue: dueSoon[0].days,
    };
  }

  return null;
}

function buildDateRange(rangeDaysBack, rangeDaysForward) {
  const now = new Date();

  const begin = new Date(now);
  begin.setDate(begin.getDate() - rangeDaysBack);

  const end = new Date(now);
  end.setDate(end.getDate() + rangeDaysForward);

  const toIso = (d) => d.toISOString().slice(0, 10);

  return {
    beginDate: toIso(begin),
    endDate: toIso(end),
  };
}

async function listCandidateClients({ batchSize = 100, maxClients = 1000 } = {}) {
  const take = Math.max(1, Math.min(500, batchSize));
  const max = Math.max(1, maxClients);

  let cursor = null;
  let fetched = 0;
  const result = [];

  while (fetched < max) {
    const page = await prisma.client.findMany({
      where: {
        active: true,
        cpfCnpj: { not: null },
        OR: [
          { whatsapp: { not: null } },
          { phone: { not: null } },
        ],
      },
      orderBy: { id: 'asc' },
      take: Math.min(take, max - fetched),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        cpfCnpj: true,
        whatsapp: true,
        phone: true,
      },
    });

    if (!page.length) break;

    result.push(...page);
    fetched += page.length;
    cursor = page[page.length - 1].id;
  }

  return result;
}

async function sendBotBoletoProactiveNotifications({
  dryRun = false,
  maxClients,
  batchSize,
  dueSoonDays,
  rangeDaysBack,
  rangeDaysForward,
  logger = console,
} = {}) {
  const safeMaxClients = parsePositiveInt(maxClients, parsePositiveInt(process.env.BOT_BOLETO_NOTIFY_MAX_CLIENTS, 300));
  const safeBatchSize = parsePositiveInt(batchSize, parsePositiveInt(process.env.BOT_BOLETO_NOTIFY_BATCH_SIZE, 100));
  const safeDueSoonDays = parsePositiveInt(dueSoonDays, parsePositiveInt(process.env.BOT_BOLETO_DUE_SOON_DAYS, 3));
  const safeRangeBack = parsePositiveInt(rangeDaysBack, parsePositiveInt(process.env.BOT_BOLETO_LOOKBACK_DAYS, 60));
  const safeRangeForward = parsePositiveInt(rangeDaysForward, parsePositiveInt(process.env.BOT_BOLETO_LOOKAHEAD_DAYS, 15));

  const clients = await listCandidateClients({ batchSize: safeBatchSize, maxClients: safeMaxClients });
  const summary = {
    candidates: clients.length,
    checked: 0,
    withDocument: 0,
    notified: 0,
    duplicates: 0,
    skipped: 0,
    efiUnavailable: 0,
    failed: 0,
  };

  const range = buildDateRange(safeRangeBack, safeRangeForward);

  for (const client of clients) {
    summary.checked += 1;

    const document = normalizeDocumentDigits(client.cpfCnpj);
    if (document.length !== 11 && document.length !== 14) {
      summary.skipped += 1;
      continue;
    }

    summary.withDocument += 1;

    let chargesRaw;
    try {
      chargesRaw = await efiService.listChargesByDocument({
        document,
        beginDate: range.beginDate,
        endDate: range.endDate,
        limit: 100,
        offset: 0,
      });
    } catch (err) {
      if (typeof efiService.isEfiUnavailableError === 'function' && efiService.isEfiUnavailableError(err)) {
        summary.efiUnavailable += 1;
        logger.warn(`[bot-boleto-notify] Efi indisponivel para clientId=${client.id}`);
        continue;
      }

      summary.failed += 1;
      logger.error(`[bot-boleto-notify] Falha ao consultar Efi para clientId=${client.id}: ${err.message}`);
      continue;
    }

    const charges = extractEfiChargeItems(chargesRaw);
    const decision = pickNotification(charges, safeDueSoonDays);
    if (!decision) {
      summary.skipped += 1;
      continue;
    }

    const phone = client.whatsapp || client.phone;
    if (!phone) {
      summary.skipped += 1;
      continue;
    }

    const docType = getDocumentType(document);
    const templateVariables = {
      clientName: client.name || 'cliente',
      documentType: docType,
      documentLast4: document.slice(-4),
      dueDate: formatDateBR(decision.picked.dueDate),
      amount: formatAmountForTemplate(decision.picked.amountCents),
      daysToDue: decision.daysToDue,
    };

    const fallbackContent = decision.eventKey === 'BOT_BOLETO_OVERDUE'
      ? `Ola, ${templateVariables.clientName}! Existe boleto em atraso (${templateVariables.documentType} final ${templateVariables.documentLast4}) vencido em ${templateVariables.dueDate}. Valor: R$ ${templateVariables.amount}.`
      : `Ola, ${templateVariables.clientName}! Existe boleto para ${templateVariables.documentType} final ${templateVariables.documentLast4} vencendo em ${templateVariables.dueDate}. Valor: R$ ${templateVariables.amount}.`;

    if (dryRun) {
      summary.notified += 1;
      logger.info(`[bot-boleto-notify] dry-run ${decision.eventKey} clientId=${client.id} dueDate=${templateVariables.dueDate}`);
      continue;
    }

    const result = await sendWhatsAppMessageWithDedupe({
      clientId: client.id,
      soId: null,
      phone,
      content: fallbackContent,
      dedupeHours: 24,
      eventKey: decision.eventKey,
      templateVariables,
    });

    if (result?.skipped) {
      if (result.reason === 'duplicate') {
        summary.duplicates += 1;
      } else {
        summary.skipped += 1;
      }
      continue;
    }

    if (result?.success) {
      summary.notified += 1;
    } else {
      summary.failed += 1;
    }
  }

  return {
    summary,
    config: {
      dueSoonDays: safeDueSoonDays,
      rangeDaysBack: safeRangeBack,
      rangeDaysForward: safeRangeForward,
      maxClients: safeMaxClients,
      batchSize: safeBatchSize,
      dryRun: !!dryRun,
    },
  };
}

module.exports = {
  sendBotBoletoProactiveNotifications,
  pickNotification,
};
