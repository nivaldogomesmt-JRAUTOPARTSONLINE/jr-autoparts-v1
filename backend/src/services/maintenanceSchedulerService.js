const { recalcMaintenanceForecasts } = require('./maintenanceRecalcService');
const { sendMaintenanceAlerts } = require('./maintenanceNotificationService');
const { sendBotBoletoProactiveNotifications } = require('./botBoletoNotificationService');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'sim', 's'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'nao', 'não'].includes(normalized)) return false;
  return fallback;
}

function getDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: parsePositiveInt(get('hour'), 0),
    minute: parsePositiveInt(get('minute'), 0),
  };
}

function createMaintenanceScheduler(config = {}) {
  const enabled = config.enabled;
  const hour = parsePositiveInt(config.hour, 3);
  const minute = parsePositiveInt(config.minute, 15);
  const timeZone = config.timeZone || 'America/Cuiaba';
  const intervalMs = Math.max(60_000, parsePositiveInt(config.intervalMs, 5 * 60 * 1000));
  const notifyEnabled = toBoolean(config.notifyEnabled, true);
  const notifyLimit = Math.max(1, parsePositiveInt(config.notifyLimit, 500));
  const botBoletoNotifyEnabled = toBoolean(config.botBoletoNotifyEnabled, false);

  const state = {
    timer: null,
    running: false,
    lastRunKey: null,
  };

  async function runOnce(reason = 'scheduled') {
    if (state.running) return;
    state.running = true;

    try {
      const summary = await recalcMaintenanceForecasts({ apply: true, all: false, logger: console });
      console.log(`[maintenance-scheduler] ${reason}: ${summary.updated} atualizados (candidatos=${summary.candidates}, lidos=${summary.scanned})`);

      if (notifyEnabled) {
        const notify = await sendMaintenanceAlerts({ dryRun: false, limit: notifyLimit });
        console.log(`[maintenance-notify] ${reason}: enviados=${notify.summary.sent}, duplicados=${notify.summary.duplicates}, falhas=${notify.summary.failed}, candidatos=${notify.summary.candidates}`);
      }

      if (botBoletoNotifyEnabled) {
        const billing = await sendBotBoletoProactiveNotifications({ dryRun: false });
        console.log(`[bot-boleto-notify] ${reason}: enviados=${billing.summary.notified}, duplicados=${billing.summary.duplicates}, falhas=${billing.summary.failed}, candidatos=${billing.summary.candidates}`);
      }
    } catch (err) {
      console.error('[maintenance-scheduler] erro ao executar rotina diaria:', err.message);
    } finally {
      state.running = false;
    }
  }

  async function tick() {
    if (!enabled) return;

    const now = new Date();
    const parts = getDateParts(now, timeZone);
    const todayKey = `${parts.year}-${parts.month}-${parts.day}`;

    const reachedSchedule = parts.hour > hour || (parts.hour === hour && parts.minute >= minute);
    if (!reachedSchedule) return;
    if (state.lastRunKey === todayKey) return;

    state.lastRunKey = todayKey;
    await runOnce('daily-window');
  }

  function start() {
    if (!enabled) {
      console.log('[maintenance-scheduler] desabilitado por configuracao.');
      return;
    }

    console.log(`[maintenance-scheduler] ativo. Janela diaria: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (${timeZone})`);

    tick().catch(() => {});
    state.timer = setInterval(() => {
      tick().catch(() => {});
    }, intervalMs);
  }

  function stop() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  return {
    start,
    stop,
    runNow: runOnce,
  };
}

function startMaintenanceRecalcSchedulerFromEnv() {
  const enabled = toBoolean(process.env.MAINTENANCE_RECALC_ENABLED, process.env.NODE_ENV === 'production');

  const scheduler = createMaintenanceScheduler({
    enabled,
    hour: process.env.MAINTENANCE_RECALC_HOUR,
    minute: process.env.MAINTENANCE_RECALC_MINUTE,
    timeZone: process.env.MAINTENANCE_RECALC_TZ || 'America/Cuiaba',
    intervalMs: process.env.MAINTENANCE_RECALC_CHECK_INTERVAL_MS,
    notifyEnabled: process.env.MAINTENANCE_NOTIFY_ENABLED,
    notifyLimit: process.env.MAINTENANCE_NOTIFY_LIMIT,
    botBoletoNotifyEnabled: process.env.BOT_BOLETO_NOTIFY_ENABLED,
  });

  scheduler.start();
  return scheduler;
}

module.exports = {
  createMaintenanceScheduler,
  startMaintenanceRecalcSchedulerFromEnv,
};
