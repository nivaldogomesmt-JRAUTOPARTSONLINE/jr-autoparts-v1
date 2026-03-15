const prisma = require('../lib/prisma');

const STORAGE_CODE = 'NOTIFICATION_CENTER';
const STORAGE_LABEL = 'Central de Notificacoes';
const CACHE_TTL_MS = 60 * 1000;

const DEFAULT_EVENTS = [
  {
    key: 'OS_STATUS_STARTED',
    module: 'OS',
    title: 'OS iniciada',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) foi iniciado. OS #{soNumber}.\nAcompanhe em tempo real: {portalUrl}',
  },
  {
    key: 'OS_STATUS_IN_PROGRESS',
    module: 'OS',
    title: 'OS em andamento',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Seu {brand} {model} ({plate}) está em execução. Nossa equipe está trabalhando nele. OS #{soNumber}.',
  },
  {
    key: 'OS_STATUS_WAITING_PART',
    module: 'OS',
    title: 'OS aguardando peça',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) está pausado aguardando peça. OS #{soNumber}. Assim que chegar, continuamos e te avisamos!',
  },
  {
    key: 'OS_STATUS_FINISHING',
    module: 'OS',
    title: 'OS finalizando',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Quase pronto! O serviço do seu {brand} {model} ({plate}) está na fase final. OS #{soNumber}.',
  },
  {
    key: 'OS_STATUS_DONE',
    module: 'OS',
    title: 'OS concluída',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) está pronto. OS #{soNumber}. Entraremos em contato para combinar a retirada.',
  },
  {
    key: 'OS_STATUS_DELIVERED',
    module: 'OS',
    title: 'OS entregue',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Seu {brand} {model} ({plate}) foi entregue. Obrigado pela preferência! Seu histórico: {portalUrl}',
  },
  {
    key: 'DELIVERY_STATUS_AWAITING_DISPATCH',
    module: 'ENTREGA',
    title: 'Entrega aguardando envio',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Atualização da entrega — OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_OUT_FOR_DELIVERY',
    module: 'ENTREGA',
    title: 'Entrega saiu para entrega',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Seu veículo ({plate}) está a caminho — OS #{soNumber}: {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_DELIVERED',
    module: 'ENTREGA',
    title: 'Entrega concluida',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Entrega da OS #{soNumber} ({plate}) concluída: {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_DELIVERY_FAILED',
    module: 'ENTREGA',
    title: 'Entrega com falha',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Não foi possível concluir a entrega — OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },  {
    key: 'ORDER_PHASE_CONFIRMED',
    module: 'ENTREGA',
    title: 'Pedido confirmado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pedido da OS #{soNumber} ({plate}) confirmado: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_PAYMENT_APPROVED',
    module: 'ENTREGA',
    title: 'Pagamento aprovado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pagamento aprovado — pedido da OS #{soNumber} ({plate}): {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_IN_SEPARATION',
    module: 'ENTREGA',
    title: 'Pedido em separacao',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pedido da OS #{soNumber} ({plate}) em separação: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_SHIPPED',
    module: 'ENTREGA',
    title: 'Pedido enviado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pedido da OS #{soNumber} ({plate}) enviado: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_DELIVERED',
    module: 'ENTREGA',
    title: 'Pedido entregue',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pedido da OS #{soNumber} ({plate}) entregue: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_CANCELED',
    module: 'ENTREGA',
    title: 'Pedido cancelado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Olá, {clientName}! Pedido da OS #{soNumber} ({plate}) cancelado: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'MAINTENANCE_DUE_SOON',
    module: 'MANUTENCAO',
    title: 'Manutenção próxima',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 72,
    template: 'Olá, {clientName}! A manutenção *{maintenanceLabel}* do {plate} está se aproximando.\nPrevisão: {nextDate} ou {nextKm}.\nAgende pelo portal: {portalUrl}',
  },
  {
    key: 'MAINTENANCE_OVERDUE',
    module: 'MANUTENCAO',
    title: 'Manutenção vencida',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 168,
    template: 'Olá, {clientName}! Atenção: a manutenção *{maintenanceLabel}* do {plate} está vencida.\nPrevisão: {nextDate} ou {nextKm}.\nAgende agora: {portalUrl}',
  },
  {
    key: 'PROFILE_WHATSAPP_UPDATED',
    module: 'CADASTRO',
    title: 'WhatsApp atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Olá, {clientName}! Seu WhatsApp foi atualizado para {newWhatsapp}. Se não foi você, entre em contato conosco imediatamente.',
  },
  {
    key: 'PROFILE_EMAIL_UPDATED',
    module: 'CADASTRO',
    title: 'Email atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Olá, {clientName}! Seu e-mail foi atualizado para {newEmail}. Se não foi você, entre em contato conosco imediatamente.',
  },
  {
    key: 'PROFILE_UPDATED',
    module: 'CADASTRO',
    title: 'Cadastro atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Olá, {clientName}! Seu cadastro foi atualizado. Acesse o portal: {portalUrl}',
  },
  {
    key: 'TRACKING_BILLING_UPCOMING',
    module: 'RASTREAMENTO',
    title: 'Cobranca a vencer',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Olá, {clientName}! A mensalidade de rastreamento ({referenceMonth}) do {plate} vence em {dueDate}. Valor: R$ {amount}.',
  },
  {
    key: 'TRACKING_BILLING_LIGHT',
    module: 'RASTREAMENTO',
    title: 'Cobranca atrasada leve',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Olá, {clientName}! A mensalidade {referenceMonth} do {plate} está em atraso ({daysOverdue} dias). Valor: R$ {amount}. Regularize em breve.',
  },
  {
    key: 'TRACKING_BILLING_INTENSIVE',
    module: 'RASTREAMENTO',
    title: 'Cobranca atrasada intensa',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Olá, {clientName}! Atenção: a mensalidade {referenceMonth} do {plate} segue em aberto há {daysOverdue} dias. Valor: R$ {amount}. Entre em contato para regularizar.',
  },
  {
    key: 'TRACKING_BILLING_CRITICAL',
    module: 'RASTREAMENTO',
    title: 'Cobranca critica',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Olá, {clientName}! Seu contrato de rastreamento do {plate} está em atraso crítico ({daysOverdue} dias). Valor pendente: R$ {amount}. Regularize para evitar suspensão.',
  },
  {
    key: 'TRACKING_BILLING_RECOVERY',
    module: 'RASTREAMENTO',
    title: 'Cobranca recuperacao',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Olá, {clientName}! O contrato de rastreamento do {plate} está em atraso há {daysOverdue} dias. Entre em contato urgente para evitar retirada do equipamento.',
  },
  {
    key: 'TRACKING_INSTALL_DONE',
    module: 'RASTREAMENTO',
    title: 'InstalaÃ§Ã£o concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'Olá, {clientName}! O rastreador foi instalado com sucesso no {plate} ({model}). Qualquer dúvida, estamos à disposição.',
  },
  {
    key: 'TRACKING_MAINTENANCE_DONE',
    module: 'RASTREAMENTO',
    title: 'ManutenÃ§Ã£o concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'Olá, {clientName}! A manutenção do rastreador do {plate} ({model}) foi concluída. Tudo funcionando!',
  },
  {
    key: 'TRACKING_REMOVAL_DONE',
    module: 'RASTREAMENTO',
    title: 'Retirada concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'Olá, {clientName}! O rastreador do {plate} ({model}) foi retirado. Obrigado pela confiança!',
  },
];

const ALLOWED_CHANNELS = new Set(['WHATSAPP']);

let centerCache = {
  expiresAt: 0,
  value: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toSafeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function parseJson(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeDedupeHours(value, fallback = 24) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(24 * 30, n));
}

function renderTemplate(template, variables = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

function getDefaultEventsMap() {
  const map = {};
  for (const item of DEFAULT_EVENTS) {
    map[item.key] = {
      key: item.key,
      module: item.module,
      title: item.title,
      channel: item.channel,
      active: item.active !== false,
      dedupeHours: normalizeDedupeHours(item.dedupeHours, 24),
      template: toSafeString(item.template, ''),
    };
  }
  return map;
}

function sanitizeEventConfig(input, base) {
  const fallback = base || {};
  const key = toSafeString(input?.key, fallback.key || '');
  const moduleName = toSafeString(input?.module, fallback.module || 'GERAL');
  const title = toSafeString(input?.title, fallback.title || key || 'Evento');
  const channelRaw = toSafeString(input?.channel, fallback.channel || 'WHATSAPP').toUpperCase();
  const channel = ALLOWED_CHANNELS.has(channelRaw) ? channelRaw : 'WHATSAPP';
  const active = input?.active === undefined ? (fallback.active !== false) : !!input.active;
  const dedupeHours = normalizeDedupeHours(input?.dedupeHours, normalizeDedupeHours(fallback.dedupeHours, 24));
  const template = toSafeString(input?.template, toSafeString(fallback.template, ''));

  return {
    key,
    module: moduleName,
    title,
    channel,
    active,
    dedupeHours,
    template,
  };
}

function mergeEventsWithDefaults(rawEvents = {}) {
  const defaults = getDefaultEventsMap();
  const merged = {};

  for (const key of Object.keys(defaults)) {
    const fallback = defaults[key];
    const incoming = rawEvents[key];
    merged[key] = sanitizeEventConfig({ ...(incoming || {}), key }, fallback);
  }

  for (const key of Object.keys(rawEvents || {})) {
    if (merged[key]) continue;
    const incoming = rawEvents[key] || {};
    const customBase = {
      key,
      module: incoming.module || 'GERAL',
      title: incoming.title || key,
      channel: 'WHATSAPP',
      active: true,
      dedupeHours: 24,
      template: incoming.template || '',
    };
    merged[key] = sanitizeEventConfig({ ...incoming, key }, customBase);
  }

  return merged;
}

function sortEvents(eventsMap) {
  return Object.values(eventsMap).sort((a, b) => {
    const moduleDiff = String(a.module || '').localeCompare(String(b.module || ''));
    if (moduleDiff !== 0) return moduleDiff;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

async function findOrCreateStorageRecord() {
  const existingByCode = await prisma.digitalAccount.findFirst({
    where: { code: STORAGE_CODE },
    orderBy: { updatedAt: 'desc' },
  });
  if (existingByCode) return existingByCode;

  const existingByLabel = await prisma.digitalAccount.findFirst({
    where: {
      platform: 'OTHER',
      label: STORAGE_LABEL,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (existingByLabel) return existingByLabel;

  const defaults = getDefaultEventsMap();
  const seedNotes = JSON.stringify({
    kind: 'notification_center',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    events: defaults,
  });

  return prisma.digitalAccount.create({
    data: {
      code: STORAGE_CODE,
      platform: 'OTHER',
      label: STORAGE_LABEL,
      status: 'ACTIVE',
      verified: true,
      active: true,
      notes: seedNotes,
    },
  });
}

async function loadNotificationCenter({ force = false } = {}) {
  const now = Date.now();
  if (!force && centerCache.value && centerCache.expiresAt > now) {
    return clone(centerCache.value);
  }

  const record = await findOrCreateStorageRecord();
  const notes = parseJson(record.notes) || {};
  const mergedEvents = mergeEventsWithDefaults(notes.events || {});

  const value = {
    accountId: record.id,
    updatedAt: notes.updatedAt || record.updatedAt?.toISOString() || null,
    updatedBy: notes.updatedBy || null,
    events: mergedEvents,
  };

  centerCache = {
    expiresAt: now + CACHE_TTL_MS,
    value,
  };

  return clone(value);
}

async function updateNotificationCenter({ events = [], updatedBy = 'system' } = {}) {
  const current = await loadNotificationCenter({ force: true });
  const nextEvents = { ...current.events };

  if (Array.isArray(events)) {
    for (const entry of events) {
      const key = toSafeString(entry?.key);
      if (!key) continue;
      const base = nextEvents[key] || getDefaultEventsMap()[key] || { key };
      nextEvents[key] = sanitizeEventConfig({ ...entry, key }, base);
    }
  } else if (events && typeof events === 'object') {
    for (const [key, entry] of Object.entries(events)) {
      const safeKey = toSafeString(key);
      if (!safeKey) continue;
      const base = nextEvents[safeKey] || getDefaultEventsMap()[safeKey] || { key: safeKey };
      nextEvents[safeKey] = sanitizeEventConfig({ ...(entry || {}), key: safeKey }, base);
    }
  }

  const notes = {
    kind: 'notification_center',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: toSafeString(updatedBy, 'system'),
    events: nextEvents,
  };

  const saved = await prisma.digitalAccount.update({
    where: { id: current.accountId },
    data: {
      notes: JSON.stringify(notes),
      active: true,
      status: 'ACTIVE',
      platform: 'OTHER',
      label: STORAGE_LABEL,
      code: STORAGE_CODE,
    },
  });

  centerCache = {
    expiresAt: 0,
    value: null,
  };

  const loaded = await loadNotificationCenter({ force: true });
  return {
    ...loaded,
    record: {
      id: saved.id,
      updatedAt: saved.updatedAt,
    },
  };
}

async function resolveNotificationPayload({
  eventKey,
  fallbackContent,
  variables = {},
  fallbackDedupeHours = 24,
} = {}) {
  const fallback = {
    enabled: true,
    eventKey: eventKey || null,
    content: String(fallbackContent || ''),
    dedupeHours: normalizeDedupeHours(fallbackDedupeHours, 24),
    reason: null,
    event: null,
  };

  const key = toSafeString(eventKey);
  if (!key) return fallback;

  const center = await loadNotificationCenter();
  const event = center.events[key];
  if (!event) return fallback;

  if (!event.active) {
    return {
      enabled: false,
      eventKey: key,
      content: '',
      dedupeHours: normalizeDedupeHours(event.dedupeHours, fallback.dedupeHours),
      reason: 'event_disabled',
      event,
    };
  }

  if (!ALLOWED_CHANNELS.has(event.channel)) {
    return {
      enabled: false,
      eventKey: key,
      content: '',
      dedupeHours: normalizeDedupeHours(event.dedupeHours, fallback.dedupeHours),
      reason: 'channel_not_supported',
      event,
    };
  }

  const rendered = renderTemplate(event.template || fallback.content, variables);
  const content = String(rendered || fallback.content).trim();
  if (!content) {
    return {
      enabled: false,
      eventKey: key,
      content: '',
      dedupeHours: normalizeDedupeHours(event.dedupeHours, fallback.dedupeHours),
      reason: 'empty_content',
      event,
    };
  }

  return {
    enabled: true,
    eventKey: key,
    content,
    dedupeHours: normalizeDedupeHours(event.dedupeHours, fallback.dedupeHours),
    reason: null,
    event,
  };
}

module.exports = {
  STORAGE_CODE,
  STORAGE_LABEL,
  DEFAULT_EVENTS,
  sortEvents,
  loadNotificationCenter,
  updateNotificationCenter,
  resolveNotificationPayload,
};




