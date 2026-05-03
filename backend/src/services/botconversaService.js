/**
 * BotConversa Integration Service
 * Wrapper para a API do BotConversa (WhatsApp bot/CRM)
 *
 * Base URL: https://backend.botconversa.com.br/api/v1/webhook
 * Auth: header API-KEY
 * Rate limit: 600 RPM
 *
 * Todas as funcoes sao fire-and-forget (nunca comprometem o fluxo principal).
 * Se BOTCONVERSA_API_KEY nao estiver configurada, o servico fica desativado silenciosamente.
 */

const prisma = require('../lib/prisma');

const BASE_URL = 'https://backend.botconversa.com.br/api/v1/webhook';

// ─── Config helpers ─────────────────────────────────────────────────────────

function isEnabled() {
  return Boolean(process.env.BOTCONVERSA_API_KEY);
}

function headers() {
  return {
    'API-KEY': process.env.BOTCONVERSA_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

function envInt(key) {
  const val = parseInt(process.env[key] || '', 10);
  return Number.isFinite(val) ? val : null;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`BotConversa GET ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`BotConversa POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function apiDelete(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`BotConversa DELETE ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return true;
}

// ─── Phone normalizer ────────────────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  // Remove tudo exceto digitos
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Garante prefixo 55 (Brasil)
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return null;
}

// ─── Subscriber ID cache (banco de dados) ────────────────────────────────────

async function getCachedSubscriberId(clientId) {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { botconversaSubscriberId: true },
    });
    return client?.botconversaSubscriberId || null;
  } catch {
    return null;
  }
}

async function setCachedSubscriberId(clientId, subscriberId) {
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { botconversaSubscriberId: String(subscriberId) },
    });
  } catch (err) {
    console.warn('[BotConversa] Nao foi possivel salvar subscriber_id no banco:', err.message);
  }
}

// ─── Core: Find or create subscriber ─────────────────────────────────────────

/**
 * Busca ou cria um assinante no BotConversa pelo telefone.
 * Armazena o ID no banco para evitar lookups futuros.
 * Retorna o subscriber_id (number) ou null em caso de falha.
 */
async function findOrCreateSubscriber({ clientId, phone, firstName, lastName }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    console.warn('[BotConversa] Telefone invalido para cliente', clientId);
    return null;
  }

  // 1. Checar cache no banco
  if (clientId) {
    const cached = await getCachedSubscriberId(clientId);
    if (cached) return parseInt(cached, 10);
  }

  // 2. Buscar na API pelo telefone
  try {
    const found = await apiGet(`/subscriber/get_by_phone/${normalizedPhone}/`);
    if (found && found.id) {
      if (clientId) await setCachedSubscriberId(clientId, found.id);
      return found.id;
    }
  } catch (err) {
    // 404 = nao encontrado, continuar para criacao
    if (!err.message.includes('404')) {
      console.error('[BotConversa] Erro ao buscar subscriber:', err.message);
      return null;
    }
  }

  // 3. Criar novo subscriber
  try {
    const nameParts = String(firstName || '').trim().split(' ');
    const first = nameParts[0] || firstName || '';
    const last = lastName || nameParts.slice(1).join(' ') || '';

    await apiPost('/subscriber/', {
      phone: normalizedPhone,
      first_name: first,
      last_name: last,
      has_opt_in_whatsapp: true,
    });

    // Buscar imediatamente para obter o ID
    const created = await apiGet(`/subscriber/get_by_phone/${normalizedPhone}/`);
    if (created && created.id) {
      if (clientId) await setCachedSubscriberId(clientId, created.id);
      return created.id;
    }
  } catch (err) {
    // 401 = subscriber already exists (BotConversa retorna 401 para duplicado)
    if (err.message.includes('401') || err.message.includes('already exist')) {
      try {
        const existing = await apiGet(`/subscriber/get_by_phone/${normalizedPhone}/`);
        if (existing && existing.id) {
          if (clientId) await setCachedSubscriberId(clientId, existing.id);
          return existing.id;
        }
      } catch {
        return null;
      }
    }
    console.error('[BotConversa] Erro ao criar subscriber:', err.message);
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Envia mensagem de texto simples para um cliente.
 */
async function sendMessage({ clientId, phone, firstName, lastName, message }) {
  if (!isEnabled() || !message) return;
  try {
    const subscriberId = await findOrCreateSubscriber({ clientId, phone, firstName, lastName });
    if (!subscriberId) return;
    await apiPost(`/subscriber/${subscriberId}/send_message/`, { type: 'text', value: message });
    console.info(`[BotConversa] Mensagem enviada para subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] sendMessage error:', err.message);
  }
}

/**
 * Dispara um fluxo (flow) para um cliente.
 * @param {number} flowId - ID do fluxo no BotConversa
 */
async function sendFlow({ clientId, phone, firstName, lastName, flowId }) {
  if (!isEnabled() || !flowId) return;
  try {
    const subscriberId = await findOrCreateSubscriber({ clientId, phone, firstName, lastName });
    if (!subscriberId) return;
    await apiPost(`/subscriber/${subscriberId}/send_flow/`, { flow: flowId });
    console.info(`[BotConversa] Flow ${flowId} disparado para subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] sendFlow error:', err.message);
  }
}

/**
 * Adiciona uma tag a um cliente.
 * @param {number} tagId - ID da tag no BotConversa
 */
async function addTag({ clientId, phone, firstName, lastName, tagId }) {
  if (!isEnabled() || !tagId) return;
  try {
    const subscriberId = await findOrCreateSubscriber({ clientId, phone, firstName, lastName });
    if (!subscriberId) return;
    await apiPost(`/subscriber/${subscriberId}/tags/${tagId}/`, {});
    console.info(`[BotConversa] Tag ${tagId} adicionada ao subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] addTag error:', err.message);
  }
}

/**
 * Remove uma tag de um cliente.
 */
async function removeTag({ clientId, phone, tagId }) {
  if (!isEnabled() || !tagId) return;
  try {
    const subscriberId = await getCachedSubscriberId(clientId);
    if (!subscriberId) return;
    await apiDelete(`/subscriber/${subscriberId}/tags/${tagId}/`);
    console.info(`[BotConversa] Tag ${tagId} removida do subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] removeTag error:', err.message);
  }
}

/**
 * Define o valor de um campo customizado para um cliente.
 * @param {number} customFieldId - ID do campo no BotConversa
 * @param {string} value - Valor (string, numero, data dd.mm.yyyy, datetime dd.mm.yyyy HH:MM:SS)
 */
async function setCustomField({ clientId, phone, firstName, lastName, customFieldId, value }) {
  if (!isEnabled() || !customFieldId || value === undefined || value === null) return;
  try {
    const subscriberId = await findOrCreateSubscriber({ clientId, phone, firstName, lastName });
    if (!subscriberId) return;
    await apiPost(`/subscriber/${subscriberId}/custom_fields/${customFieldId}/`, { value: String(value) });
    console.info(`[BotConversa] Custom field ${customFieldId} definido para subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] setCustomField error:', err.message);
  }
}

/**
 * Inscreve um cliente em uma sequencia (drip).
 * @param {number} sequenceId - ID da sequencia no BotConversa
 */
async function addToSequence({ clientId, phone, firstName, lastName, sequenceId }) {
  if (!isEnabled() || !sequenceId) return;
  try {
    const subscriberId = await findOrCreateSubscriber({ clientId, phone, firstName, lastName });
    if (!subscriberId) return;
    await apiPost(`/subscriber/${subscriberId}/sequences/${sequenceId}/`, {});
    console.info(`[BotConversa] Subscriber ${subscriberId} inscrito na sequencia ${sequenceId}`);
  } catch (err) {
    console.error('[BotConversa] addToSequence error:', err.message);
  }
}

/**
 * Remove cliente de uma sequencia.
 */
async function removeFromSequence({ clientId, sequenceId }) {
  if (!isEnabled() || !sequenceId) return;
  try {
    const subscriberId = await getCachedSubscriberId(clientId);
    if (!subscriberId) return;
    await apiDelete(`/subscriber/${subscriberId}/sequences/${sequenceId}/`);
    console.info(`[BotConversa] Subscriber ${subscriberId} removido da sequencia ${sequenceId}`);
  } catch (err) {
    console.error('[BotConversa] removeFromSequence error:', err.message);
  }
}

/**
 * Abre ou fecha a conversa com um cliente no live chat.
 * @param {boolean} open - true = abrir, false = fechar
 * @param {number|null} managerId - ID do atendente para atribuir (opcional)
 */
async function changeConversationStatus({ clientId, phone, open, managerId = null }) {
  if (!isEnabled()) return;
  try {
    const subscriberId = await getCachedSubscriberId(clientId);
    if (!subscriberId) return;
    const body = { open_conversation: open };
    if (managerId) body.manager = managerId;
    await apiPost(`/subscriber/${subscriberId}/change_conversation_status/`, body);
    console.info(`[BotConversa] Conversa ${open ? 'aberta' : 'fechada'} para subscriber ${subscriberId}`);
  } catch (err) {
    console.error('[BotConversa] changeConversationStatus error:', err.message);
  }
}

// ─── High-level business events ──────────────────────────────────────────────

/**
 * Notifica cliente sobre mudanca de status da OS.
 * Usa flow se configurado, senao envia texto direto.
 */
async function notifyOSStatusChange({ client, vehicle, status, soNumber, portalUrl }) {
  if (!isEnabled()) return;

  const phone = client?.whatsapp || client?.phone;
  if (!phone) return;

  const STATUS_FLOW_ENV = {
    STARTED:      'BOTCONVERSA_FLOW_OS_STARTED',
    IN_PROGRESS:  'BOTCONVERSA_FLOW_OS_IN_PROGRESS',
    WAITING_PART: 'BOTCONVERSA_FLOW_OS_WAITING_PART',
    FINISHING:    'BOTCONVERSA_FLOW_OS_FINISHING',
    DONE:         'BOTCONVERSA_FLOW_OS_DONE',
    DELIVERED:    'BOTCONVERSA_FLOW_OS_DELIVERED',
  };

  const STATUS_MESSAGES = {
    STARTED:      `Ola ${client.name}! Sua OS #${soNumber} foi iniciada. Seu veiculo ${vehicle?.plate || ''} esta em atendimento na JR Auto Parts.`,
    IN_PROGRESS:  `Ola ${client.name}! Sua OS #${soNumber} esta em execucao. Estamos trabalhando no seu veiculo ${vehicle?.plate || ''}.`,
    WAITING_PART: `Ola ${client.name}! Sua OS #${soNumber} esta aguardando peca. Assim que chegar, continuamos o servico.`,
    FINISHING:    `Ola ${client.name}! Sua OS #${soNumber} esta na fase de finalizacao. Em breve seu veiculo ${vehicle?.plate || ''} ficara pronto!`,
    DONE:         `Ola ${client.name}! Sua OS #${soNumber} esta PRONTA! Seu veiculo ${vehicle?.plate || ''} pode ser retirado na JR Auto Parts. Acesse o portal: ${portalUrl || ''}`,
    DELIVERED:    `Ola ${client.name}! OS #${soNumber} entregue com sucesso. Obrigado pela confianca na JR Auto Parts! Ate logo.`,
  };

  const flowEnvKey = STATUS_FLOW_ENV[status];
  const flowId = flowEnvKey ? envInt(flowEnvKey) : null;

  const firstName = (client.name || '').split(' ')[0];
  const args = { clientId: client.id, phone, firstName, lastName: '' };

  if (flowId) {
    await sendFlow({ ...args, flowId });
  } else if (STATUS_MESSAGES[status]) {
    await sendMessage({ ...args, message: STATUS_MESSAGES[status] });
  }
}

/**
 * Notifica cliente ao receber acesso ao portal.
 */
async function notifyPortalAccessGranted({ client, password, portalUrl }) {
  if (!isEnabled()) return;

  const phone = client?.whatsapp || client?.phone;
  if (!phone) return;

  const flowId = envInt('BOTCONVERSA_FLOW_PORTAL_ACCESS');
  const firstName = (client.name || '').split(' ')[0];
  const args = { clientId: client.id, phone, firstName, lastName: '' };

  if (flowId) {
    await sendFlow({ ...args, flowId });
  } else {
    const msg = `Ola ${client.name}! Seu acesso ao Portal JR Auto Parts foi criado.\n\nEmail: ${client.email}\nSenha: ${password || 'JR@2026'}\n\nAcesse: ${portalUrl || 'https://app.jrautopartsmt.com.br/portal/login'}\n\nGuarde estas informacoes!`;
    await sendMessage({ ...args, message: msg });
  }

  // Tag "cliente-portal"
  const tagPortal = envInt('BOTCONVERSA_TAG_CLIENT_PORTAL');
  if (tagPortal) await addTag({ ...args, tagId: tagPortal });
}

/**
 * Cria/atualiza assinante no BotConversa ao criar cliente no sistema.
 */
async function syncClientOnCreate({ client }) {
  if (!isEnabled()) return;

  const phone = client?.whatsapp || client?.phone;
  if (!phone) return;

  const nameParts = (client.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  await findOrCreateSubscriber({
    clientId: client.id,
    phone,
    firstName,
    lastName,
  });
}

/**
 * Notifica alerta de manutencao (DUE_SOON ou OVERDUE).
 */
async function notifyMaintenanceAlert({ client, vehicle, maintenanceLabel, alertLevel }) {
  if (!isEnabled()) return;

  const phone = client?.whatsapp || client?.phone;
  if (!phone) return;

  const flowId = envInt('BOTCONVERSA_FLOW_MAINTENANCE_ALERT');
  const firstName = (client.name || '').split(' ')[0];
  const args = { clientId: client.id, phone, firstName, lastName: '' };

  if (flowId) {
    await sendFlow({ ...args, flowId });
  } else {
    const urgency = alertLevel === 'OVERDUE' ? 'VENCIDA' : 'PROXIMA';
    const msg = `Ola ${client.name}! Lembrete de manutencao do seu veiculo ${vehicle?.plate || ''}:\n\n${maintenanceLabel} - ${urgency}\n\nAgende seu servico na JR Auto Parts: 65 99281-2000`;
    await sendMessage({ ...args, message: msg });
  }

  // Tag de manutencao vencida
  if (alertLevel === 'OVERDUE') {
    const tagOverdue = envInt('BOTCONVERSA_TAG_MAINTENANCE_OVERDUE');
    if (tagOverdue) await addTag({ ...args, tagId: tagOverdue });
  }

  // Sequencia de lembretes
  const seqMaintenance = envInt('BOTCONVERSA_SEQUENCE_MAINTENANCE');
  if (seqMaintenance) await addToSequence({ ...args, sequenceId: seqMaintenance });
}

/**
 * Sequencia de pos-servico (inscreve cliente apos DELIVERED).
 */
async function startPostServiceSequence({ client, vehicle }) {
  if (!isEnabled()) return;

  const phone = client?.whatsapp || client?.phone;
  if (!phone) return;

  const seqId = envInt('BOTCONVERSA_SEQUENCE_POST_SERVICE');
  if (!seqId) return;

  const firstName = (client.name || '').split(' ')[0];
  await addToSequence({ clientId: client.id, phone, firstName, lastName: '', sequenceId: seqId });
}

// ─── Admin/Test helpers ───────────────────────────────────────────────────────

/**
 * Testa a conexao com a API e retorna dados da conta.
 */
async function testConnection() {
  if (!isEnabled()) {
    return { ok: false, reason: 'BOTCONVERSA_API_KEY nao configurada.' };
  }
  try {
    const flows = await apiGet('/flows/');
    const tags = await apiGet('/tags/');
    const sequences = await apiGet('/sequences/');
    const customFields = await apiGet('/custom_fields/');
    return {
      ok: true,
      flows: Array.isArray(flows) ? flows : [],
      tags: Array.isArray(tags) ? tags : [],
      sequences: Array.isArray(sequences) ? sequences : [],
      customFields: Array.isArray(customFields) ? customFields : [],
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Sincroniza todos os clientes ativos para o BotConversa (operacao em massa).
 * Retorna contagem de sucesso/falha.
 */
async function syncAllClients() {
  if (!isEnabled()) return { ok: false, reason: 'BOTCONVERSA_API_KEY nao configurada.' };

  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true, phone: true, whatsapp: true },
  });

  let success = 0;
  let failed = 0;

  for (const client of clients) {
    const phone = client.whatsapp || client.phone;
    if (!phone) { failed++; continue; }
    try {
      const nameParts = (client.name || '').split(' ');
      await findOrCreateSubscriber({
        clientId: client.id,
        phone,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
      });
      success++;
      // Pequena pausa para respeitar rate limit (600 RPM = 10/s)
      await new Promise((r) => setTimeout(r, 110));
    } catch {
      failed++;
    }
  }

  return { ok: true, total: clients.length, success, failed };
}

module.exports = {
  isEnabled,
  testConnection,
  syncAllClients,
  findOrCreateSubscriber,
  sendMessage,
  sendFlow,
  addTag,
  removeTag,
  setCustomField,
  addToSequence,
  removeFromSequence,
  changeConversationStatus,
  // Business events
  notifyOSStatusChange,
  notifyPortalAccessGranted,
  syncClientOnCreate,
  notifyMaintenanceAlert,
  startPostServiceSequence,
};
