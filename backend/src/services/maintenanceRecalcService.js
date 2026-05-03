const prisma = require('../lib/prisma');
const { computeMaintenanceForecast } = require('../utils/maintenance');

function sameDate(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

async function recalcMaintenanceForecasts(options = {}) {
  const {
    apply = false,
    all = false,
    limit = 0,
    logger = console,
  } = options;

  const where = all
    ? {}
    : {
        OR: [
          { nextDate: null },
          { nextKm: null },
        ],
      };

  const maintenances = await prisma.preventiveMaintenance.findMany({
    where,
    include: {
      vehicle: {
        select: { id: true, plate: true, currentKm: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  const summary = {
    scanned: maintenances.length,
    candidates: 0,
    updated: 0,
    unchanged: 0,
    mode: apply ? 'APPLY' : 'DRY_RUN',
    scope: all ? 'ALL' : 'MISSING_NEXT_FIELDS',
  };

  for (const row of maintenances) {
    const forecast = computeMaintenanceForecast(row, {
      baselineDate: row.createdAt,
      baselineKm: row.vehicle?.currentKm,
    });

    const nextDateChanged = !sameDate(row.nextDate, forecast.nextDate);
    const nextKmChanged = Number(row.nextKm ?? -1) !== Number(forecast.nextKm ?? -1);

    const data = {};
    if ((all || row.nextDate === null) && forecast.nextDate && nextDateChanged) {
      data.nextDate = forecast.nextDate;
    }
    if ((all || row.nextKm === null) && forecast.nextKm !== null && forecast.nextKm !== undefined && nextKmChanged) {
      data.nextKm = forecast.nextKm;
    }

    if (!Object.keys(data).length) {
      summary.unchanged += 1;
      continue;
    }

    summary.candidates += 1;

    if (!apply) {
      logger.log(`[DRY] ${row.vehicle?.plate || row.vehicleId} | ${row.label} -> nextDate=${data.nextDate ? new Date(data.nextDate).toISOString().slice(0, 10) : '-'} nextKm=${data.nextKm ?? '-'}`);
      continue;
    }

    await prisma.preventiveMaintenance.update({ where: { id: row.id }, data });
    summary.updated += 1;
    logger.log(`[OK] ${row.vehicle?.plate || row.vehicleId} | ${row.label}`);
  }

  return summary;
}

module.exports = {
  recalcMaintenanceForecasts,
};
