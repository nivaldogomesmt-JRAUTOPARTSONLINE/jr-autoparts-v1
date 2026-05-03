const prisma = require('../lib/prisma');

const STORAGE_CODE = 'INTEGRATION_LOGS';
const STORAGE_LABEL = 'Logs Integracoes';
const MAX_ENTRIES = 500;

function parseMaybeJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildEntry(raw = {}) {
  const nowIso = new Date().toISOString();
  const area = String(raw.area || '').trim() || 'Operacao';
  const user = String(raw.user || '').trim() || 'Sistema';
  const quantity = toNumber(raw.quantity, 0);
  const failures = toInt(raw.failures, 0);
  const reason = String(raw.reason || '').trim() || '-';
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined;

  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    when: nowIso,
    area,
    user,
    quantity,
    failures,
    reason,
    ...(meta ? { meta } : {}),
  };
}

async function findOrCreateStore() {
  const byCode = await prisma.digitalAccount.findFirst({
    where: { code: STORAGE_CODE },
    orderBy: { updatedAt: 'desc' },
  });
  if (byCode) return byCode;

  const byLabel = await prisma.digitalAccount.findFirst({
    where: {
      platform: 'OTHER',
      label: STORAGE_LABEL,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (byLabel) return byLabel;

  const seed = {
    kind: 'integration_logs',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    entries: [],
  };

  return prisma.digitalAccount.create({
    data: {
      code: STORAGE_CODE,
      platform: 'OTHER',
      label: STORAGE_LABEL,
      status: 'ACTIVE',
      verified: true,
      active: true,
      notes: JSON.stringify(seed),
    },
  });
}

async function appendIntegrationLog(rawEntry = {}, actor = 'system') {
  const store = await findOrCreateStore();
  const notes = parseMaybeJson(store.notes) || {};
  const currentEntries = Array.isArray(notes.entries) ? notes.entries : [];

  const entry = buildEntry(rawEntry);
  const nextEntries = [entry, ...currentEntries].slice(0, MAX_ENTRIES);

  const payload = {
    kind: 'integration_logs',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: String(actor || 'system'),
    entries: nextEntries,
  };

  await prisma.digitalAccount.update({
    where: { id: store.id },
    data: {
      notes: JSON.stringify(payload),
      active: true,
      status: 'ACTIVE',
      platform: 'OTHER',
      label: STORAGE_LABEL,
      code: STORAGE_CODE,
    },
  });

  return entry;
}

async function listIntegrationLogs({ search = '', page = 1, limit = 50 } = {}) {
  const store = await findOrCreateStore();
  const notes = parseMaybeJson(store.notes) || {};
  const entries = Array.isArray(notes.entries) ? notes.entries : [];

  const safePage = Math.max(1, toInt(page, 1));
  const safeLimit = Math.min(200, Math.max(1, toInt(limit, 50)));
  const token = normalizeText(search).trim();

  const filtered = token
    ? entries.filter((item) => {
        const text = normalizeText([
          item.when,
          item.area,
          item.user,
          item.reason,
          item.quantity,
          item.failures,
          JSON.stringify(item.meta || {}),
        ].join(' '));
        return text.includes(token);
      })
    : entries;

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const offset = (safePage - 1) * safeLimit;
  const data = filtered.slice(offset, offset + safeLimit);

  return {
    data,
    total,
    page: safePage,
    pages,
    updatedAt: notes.updatedAt || null,
    updatedBy: notes.updatedBy || null,
  };
}

module.exports = {
  appendIntegrationLog,
  listIntegrationLogs,
};
