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
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) foi iniciado. OS #{soNumber}. Acompanhe: {portalUrl}',
  },
  {
    key: 'OS_STATUS_IN_PROGRESS',
    module: 'OS',
    title: 'OS em andamento',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Seu {brand} {model} ({plate}) está em andamento. OS #{soNumber}.',
  },
  {
    key: 'OS_STATUS_WAITING_PART',
    module: 'OS',
    title: 'OS aguardando peça',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Seu {brand} {model} ({plate}) aguarda peça para continuar. OS #{soNumber}. Logo te avisamos.',
  },
  {
    key: 'OS_STATUS_FINISHING',
    module: 'OS',
    title: 'OS finalizando',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) está na fase final. Quase pronto! OS #{soNumber}.',
  },
  {
    key: 'OS_STATUS_DONE',
    module: 'OS',
    title: 'OS concluída',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! O serviço do seu {brand} {model} ({plate}) foi concluído. OS #{soNumber}. Em breve entramos em contato para combinar a entrega.',
  },
  {
    key: 'OS_STATUS_DELIVERED',
    module: 'OS',
    title: 'OS entregue',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 48,
    template: 'Olá, {clientName}! Seu {brand} {model} ({plate}) foi entregue com sucesso. Obrigado pela preferência! Acesse: {portalUrl}',
  },
  {
    key: 'DELIVERY_STATUS_AWAITING_DISPATCH',
    module: 'ENTREGA',
    title: 'Entrega aguardando envio',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Atualizacao de entrega da OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_OUT_FOR_DELIVERY',
    module: 'ENTREGA',
    title: 'Entrega saiu para entrega',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Atualizacao de entrega da OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_DELIVERED',
    module: 'ENTREGA',
    title: 'Entrega concluida',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Atualizacao de entrega da OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },
  {
    key: 'DELIVERY_STATUS_DELIVERY_FAILED',
    module: 'ENTREGA',
    title: 'Entrega com falha',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Atualizacao de entrega da OS #{soNumber} ({plate}): {deliveryStatusLabel}.{locationLine}{noteLine}',
  },  {
    key: 'ORDER_PHASE_CONFIRMED',
    module: 'ENTREGA',
    title: 'Pedido confirmado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pedido da OS #{soNumber} ({plate}) atualizado: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_PAYMENT_APPROVED',
    module: 'ENTREGA',
    title: 'Pagamento aprovado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pagamento do pedido da OS #{soNumber} ({plate}) foi aprovado. Status: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_IN_SEPARATION',
    module: 'ENTREGA',
    title: 'Pedido em separacao',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pedido da OS #{soNumber} ({plate}) esta em separacao. Status: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_SHIPPED',
    module: 'ENTREGA',
    title: 'Pedido enviado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pedido da OS #{soNumber} ({plate}) foi enviado. Status: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_DELIVERED',
    module: 'ENTREGA',
    title: 'Pedido entregue',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pedido da OS #{soNumber} ({plate}) foi entregue. Status: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'ORDER_PHASE_CANCELED',
    module: 'ENTREGA',
    title: 'Pedido cancelado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 24,
    template: 'Ola, {clientName}! Pedido da OS #{soNumber} ({plate}) foi cancelado. Status: {orderPhaseLabel}.{noteLine}',
  },
  {
    key: 'MAINTENANCE_DUE_SOON',
    module: 'MANUTENCAO',
    title: 'Manutenção próxima',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 72,
    template: 'Olá, {clientName}! A manutenção *{maintenanceLabel}* do veículo {plate} está próxima.\nNível: {alertLabel}.\nPrevisão: {nextDate} ou {nextKm}.\nAcompanhe: {portalUrl}',
  },
  {
    key: 'MAINTENANCE_OVERDUE',
    module: 'MANUTENCAO',
    title: 'Manutenção vencida',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 168,
    template: 'Olá, {clientName}! A manutenção *{maintenanceLabel}* do veículo {plate} está vencida.\nNível: {alertLabel}.\nPrevisão: {nextDate} ou {nextKm}.\nAgende agora: {portalUrl}',
  },
  {
    key: 'PROFILE_WHATSAPP_UPDATED',
    module: 'CADASTRO',
    title: 'WhatsApp atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Ola, {clientName}! Confirmamos a atualizacao do seu WhatsApp para {newWhatsapp}. Se voce nao reconhece esta alteracao, entre em contato com a JR Auto Parts.',
  },
  {
    key: 'PROFILE_EMAIL_UPDATED',
    module: 'CADASTRO',
    title: 'Email atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Ola, {clientName}! Confirmamos a atualizacao do seu email para {newEmail}. Se voce nao reconhece esta alteracao, entre em contato com a JR Auto Parts.',
  },
  {
    key: 'PROFILE_UPDATED',
    module: 'CADASTRO',
    title: 'Cadastro atualizado',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 12,
    template: 'Ola, {clientName}! Seu cadastro foi atualizado com sucesso na JR Auto Parts. Portal: {portalUrl}',
  },
  {
    key: 'TRACKING_BILLING_UPCOMING',
    module: 'RASTREAMENTO',
    title: 'Cobranca a vencer',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Ola, {clientName}. A mensalidade de rastreamento {referenceMonth} do veiculo {plate} vence em {dueDate}. Valor: R$ {amount}.',
  },
  {
    key: 'TRACKING_BILLING_LIGHT',
    module: 'RASTREAMENTO',
    title: 'Cobranca atrasada leve',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Ola, {clientName}. Mensalidade {referenceMonth} do veiculo {plate} esta em atraso ({daysOverdue} dia(s)). Valor: R$ {amount}. Vencimento: {dueDate}.',
  },
  {
    key: 'TRACKING_BILLING_INTENSIVE',
    module: 'RASTREAMENTO',
    title: 'Cobranca atrasada intensa',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Ola, {clientName}. Atencao: mensalidade {referenceMonth} do veiculo {plate} segue em aberto ({daysOverdue} dias). Valor: R$ {amount}. Regularize com a JR Auto Parts.',
  },
  {
    key: 'TRACKING_BILLING_CRITICAL',
    module: 'RASTREAMENTO',
    title: 'Cobranca critica',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Ola, {clientName}. Seu contrato de rastreamento do veiculo {plate} esta em atraso critico ({daysOverdue} dias). Valor pendente: R$ {amount}.',
  },
  {
    key: 'TRACKING_BILLING_RECOVERY',
    module: 'RASTREAMENTO',
    title: 'Cobranca recuperacao',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 20,
    template: 'Ola, {clientName}. Contrato de rastreamento do veiculo {plate} com atraso superior a 90 dias ({daysOverdue} dias). Entre em contato para evitar medidas de retirada do equipamento.',
  },
  {
    key: 'TRACKING_INSTALL_DONE',
    module: 'RASTREAMENTO',
    title: 'InstalaÃ§Ã£o concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'OlÃ¡ {clientName}, o rastreador foi instalado com sucesso no veÃ­culo {plate} (modelo {model}). Em caso de dÃºvidas, entre em contato conosco.',
  },
  {
    key: 'TRACKING_MAINTENANCE_DONE',
    module: 'RASTREAMENTO',
    title: 'ManutenÃ§Ã£o concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'OlÃ¡ {clientName}, a manutenÃ§Ã£o do rastreador do veÃ­culo {plate} (modelo {model}) foi concluÃ­da com sucesso.',
  },
  {
    key: 'TRACKING_REMOVAL_DONE',
    module: 'RASTREAMENTO',
    title: 'Retirada concluÃ­da',
    channel: 'WHATSAPP',
    active: true,
    dedupeHours: 1,
    template: 'OlÃ¡ {clientName}, o rastreador do veÃ­culo {plate} (modelo {model}) foi retirado. Em caso de dÃºvidas, estamos Ã  disposiÃ§Ã£o.',
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




