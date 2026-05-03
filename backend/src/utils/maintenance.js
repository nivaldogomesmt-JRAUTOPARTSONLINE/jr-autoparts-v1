function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function toIntOrNull(value) {
  if (!hasValue(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toDateOrNull(value) {
  if (!hasValue(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(dateValue, months) {
  const date = toDateOrNull(dateValue);
  const parsedMonths = toIntOrNull(months);
  if (!date || !parsedMonths) return null;
  const next = new Date(date);
  next.setMonth(next.getMonth() + parsedMonths);
  return next;
}

function computeMaintenanceForecast(maintenance, options = {}) {
  const baselineDate = toDateOrNull(options.baselineDate) || new Date();
  const baselineKm = toIntOrNull(options.baselineKm);

  const intervalMonths = toIntOrNull(maintenance?.intervalMonths);
  const intervalKm = toIntOrNull(maintenance?.intervalKm);
  const lastDate = toDateOrNull(maintenance?.lastDate);
  const lastKm = toIntOrNull(maintenance?.lastKm);

  let nextDate = toDateOrNull(maintenance?.nextDate);
  let nextKm = toIntOrNull(maintenance?.nextKm);

  if (!nextDate && intervalMonths) {
    nextDate = addMonths(lastDate || baselineDate, intervalMonths);
  }

  if (!hasValue(nextKm) && intervalKm) {
    const kmBase = hasValue(lastKm) ? lastKm : baselineKm;
    if (hasValue(kmBase)) {
      nextKm = kmBase + intervalKm;
    }
  }

  return { nextDate, nextKm };
}

function getMaintenanceAlertLevel(maintenance, currentKm, options = {}) {
  const now = toDateOrNull(options.now) || new Date();
  const dueSoonDays = toIntOrNull(options.dueSoonDays) || 30;
  const dueSoonKm = toIntOrNull(options.dueSoonKm) || 1000;
  const kmAtual = toIntOrNull(currentKm);

  const { nextDate, nextKm } = computeMaintenanceForecast(maintenance, options);

  const dueSoonLimit = new Date(now.getTime() + dueSoonDays * 24 * 60 * 60 * 1000);

  if (nextDate && nextDate < now) return 'OVERDUE';
  if (hasValue(nextKm) && hasValue(kmAtual) && kmAtual >= nextKm) return 'OVERDUE';

  if (nextDate && nextDate <= dueSoonLimit) return 'DUE_SOON';
  if (hasValue(nextKm) && hasValue(kmAtual) && nextKm - kmAtual <= dueSoonKm) return 'DUE_SOON';

  return 'OK';
}

function getVehicleMaintenanceSummary(maintenances, currentKm, options = {}) {
  const items = Array.isArray(maintenances) ? maintenances : [];

  let overdueCount = 0;
  let dueSoonCount = 0;

  const enriched = items.map((item) => {
    const forecast = computeMaintenanceForecast(item, options);
    const merged = { ...item, ...forecast };
    const alertLevel = getMaintenanceAlertLevel(merged, currentKm, options);

    if (alertLevel === 'OVERDUE') overdueCount += 1;
    if (alertLevel === 'DUE_SOON') dueSoonCount += 1;

    return { ...merged, alertLevel };
  });

  const status = overdueCount > 0 ? 'OVERDUE' : (dueSoonCount > 0 ? 'DUE_SOON' : 'OK');

  return {
    status,
    overdueCount,
    dueSoonCount,
    items: enriched,
  };
}

module.exports = {
  addMonths,
  computeMaintenanceForecast,
  getMaintenanceAlertLevel,
  getVehicleMaintenanceSummary,
  hasValue,
  toDateOrNull,
  toIntOrNull,
};
