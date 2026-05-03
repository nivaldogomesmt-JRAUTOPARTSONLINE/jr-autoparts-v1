// src/services/leadCronService.js — cron de follow-up leads parados
// Usa setInterval simples (não depende de node-cron)
const leadService = require('./leadService');

let started = false;
let lastNotifyDate = null;

async function runCheck() {
  try {
    const now = new Date();
    // Roda apenas uma vez por dia, depois das 9h da manhã (Cuiabá UTC-4)
    const hour = (now.getUTCHours() - 4 + 24) % 24;
    const today = now.toISOString().slice(0, 10);

    if (hour < 9) return;
    if (lastNotifyDate === today) return;

    const parados = await leadService.leadsParados(2);
    if (parados.length === 0) {
      lastNotifyDate = today;
      return;
    }

    const top5 = parados.slice(0, 5);
    const linhas = top5.map(l => {
      const intent = l.intentJson || {};
      const peca = intent.peca ? intent.peca + (intent.modelo ? ' (' + intent.modelo + ')' : '') : 'sem peça';
      const dias = Math.floor((Date.now() - new Date(l.lastContact)) / 86400000);
      return `• ${l.name || l.phone} — ${peca} — ${dias}d sem contato (score ${l.score})`;
    }).join('\n');

    const msg = `🔔 *${parados.length} leads parados >2 dias*\n\nTop 5:\n${linhas}\n\nPainel: https://app.jrautopartsmt.com.br/leads`;
    console.log('[lead-followup]', parados.length, 'leads parados');

    // Tenta notificar via auditService se existe
    try {
      const audit = require('./auditService');
      if (typeof audit.notifyJunior === 'function') {
        await audit.notifyJunior(msg);
      }
    } catch (e) {
      console.log('[lead-followup] notify falhou:', e.message);
    }

    lastNotifyDate = today;
  } catch (e) {
    console.error('[lead-cron] erro:', e.message);
  }
}

function startCron() {
  if (started) return;
  started = true;
  // Checa a cada 30min se já passou das 9h e ainda não notificou hoje
  setInterval(runCheck, 30 * 60 * 1000);
  // Primeira checagem 1min após start
  setTimeout(runCheck, 60_000);
  console.log('[lead-cron] iniciado (setInterval 30min, notifica 1x/dia após 9h Cuiabá)');
}

module.exports = { startCron, runCheck };
