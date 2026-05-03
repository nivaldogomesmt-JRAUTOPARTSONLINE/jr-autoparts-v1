// src/services/metaCronService.js — Cron de sincronizacao incremental Meta Catalog.
// Rodado a cada hora. Pega produtos modificados nas ultimas 2h (margem de seguranca pra duplicar).

const { syncIncremental, syncAll } = require('./metaCatalogService');

let timer = null;
let bootstrapDone = false;

async function runIncremental() {
  try {
    console.log('[meta-cron] tick — iniciando sync incremental');
    const summary = await syncIncremental(2);
    console.log('[meta-cron] resultado:', JSON.stringify(summary));
  } catch (e) {
    console.log('[meta-cron] erro:', e.message);
  }
}

async function runBootstrapOnce() {
  // Roda 1 sync completa logo apos o startup, com pequeno delay pra deixar o sistema acordar.
  if (bootstrapDone) return;
  bootstrapDone = true;
  setTimeout(async () => {
    try {
      console.log('[meta-cron] BOOTSTRAP — primeira sync completa apos startup');
      const summary = await syncAll();
      console.log('[meta-cron] bootstrap concluido:', JSON.stringify(summary));
    } catch (e) {
      console.log('[meta-cron] bootstrap erro:', e.message);
    }
  }, 30_000); // 30s apos startup
}

function start() {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_CATALOG_ID) {
    console.log('[meta-cron] desabilitado — META_ACCESS_TOKEN ou META_CATALOG_ID nao configurados');
    return;
  }
  if (timer) {
    console.log('[meta-cron] ja rodando');
    return;
  }
  // Bootstrap inicial (uma sync completa)
  if (process.env.META_BOOTSTRAP_ON_START !== 'false') {
    runBootstrapOnce();
  }
  // Cron incremental a cada 1h
  timer = setInterval(runIncremental, 60 * 60 * 1000);
  console.log('[meta-cron] iniciado — sync incremental a cada 1h');
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[meta-cron] parado');
  }
}

module.exports = { start, stop, runIncremental };
