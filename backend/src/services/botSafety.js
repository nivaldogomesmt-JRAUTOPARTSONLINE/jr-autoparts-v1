// src/services/botSafety.js
// Módulo central de salvaguardas anti-loop entre bots da JR Auto Parts.
// REGRA DE OURO: nenhum dos nossos números pode receber/responder mensagem de qualquer outro nosso número.

// Lista de TODOS os números próprios (bots da empresa). Em qualquer formato (com ou sem +55).
const BOT_PHONES = new Set([
  '5565998002000', // jr-rh-bot — interno equipe
  '5565996682001', // jr-financeiro-bot — financeiro/Patrícia
  '5565993471331', // jr-pessoal-junior — Junior pessoal
]);

// Mapa: instância → telefone (pra validar self-send)
const INSTANCE_TO_PHONE = {
  'jr-rh-bot':           '5565998002000',
  'jr-financeiro-bot':   '5565996682001',
  'jr-pessoal-junior':   '5565993471331',
};

// Whitelist: quais BOT_PHONES podem mandar consulta pra cada instância (admin/owner consultando)
// Junior, do número pessoal, pode consultar coisas pelo bot da equipe (filtros, estoque, etc).
// Os outros bots ficam isolados — Patrícia usa o 99281-2000 (oficial) pra consultar bot da equipe.
const ALLOWED_BOT_SENDERS = {
  'jr-rh-bot':         new Set(['5565993471331']), // Junior pode consultar pelo pessoal
  'jr-financeiro-bot': new Set([]),                // ninguém — financeiro só atende cliente externo
  'jr-pessoal-junior': new Set([]),                // ninguém — pessoal não recebe de outros bots
};

// Telefones pessoais dos colaboradores. Bot financeiro e pessoal NÃO atendem esses números
// (conversa interna entre Junior, Patrícia e equipe não passa por bot).
const EMPLOYEE_PHONES = new Set([
  '5565981231577', // Anderson (Estoquista)
  '5565992983003', // Jesus Rivas (Mecânico/Instalador)
  '5565996452797', // João Victor (Aux. Mecânico)
  '5565993197000', // Diane (Esposa)
  '5565992812000', // Loja Oficial / Geral
]);

// Quais bots devem ignorar mensagens vindas de colaboradores (conversa interna sem bot interferir)
const BOTS_THAT_IGNORE_EMPLOYEES = new Set(['jr-financeiro-bot', 'jr-pessoal-junior']);

// Grupos onde OCR de placa/IMEI está habilitado (apenas colaboradores podem disparar)
const OCR_ALLOWED_GROUPS = new Set([
  '120363023861358724@g.us', // RASTREAMENTO JR AUTO PART
]);

function normalizePhone(p) {
  let n = String(p || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55')) n = '55' + n;
  return n;
}

/** True se o número é de um dos nossos bots */
function isBotPhone(phone) {
  return BOT_PHONES.has(normalizePhone(phone));
}

/** True se a mensagem parece eco do próprio sistema (notify, alert, etc) */
function isEchoMessage(text) {
  if (!text) return false;
  const t = String(text).trim();
  // Prefixos típicos de mensagens automáticas do sistema
  const echoPrefixes = ['🔔', '🚨', '⚠️', '🔄 *Equivalentes', '🛢 *Consulta', '🔍 *Filtros', '🌡 Filtro', '❌ Código', '❌ Sem equivalência', '🤖 *JR Auto Parts'];
  for (const p of echoPrefixes) {
    if (t.startsWith(p)) return true;
  }
  // Marcadores explícitos
  if (/^\*?(DESTAQUE|ALERTA|SISTEMA|AVISO)\*?/i.test(t)) return true;
  if (/system_alert|notify.*junior/i.test(t.substring(0, 50))) return true;
  return false;
}

/**
 * Pode enviar mensagem?
 * REGRA: nenhum dos nossos números pode responder a/através de qualquer outro nosso bot.
 * EXCEÇÃO única: jr-rh-bot → 5565993471331 (Junior pessoal) é permitido pra notifyJunior.
 * Esse caso é seguro porque o webhook do jr-pessoal-junior bloqueia a recepção via preflightReceive.
 */
function canSend(toPhone, fromInstance) {
  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, reason: 'destino_vazio' };
  if (BOT_PHONES.has(to)) {
    // self-send sempre proibido
    if (INSTANCE_TO_PHONE[fromInstance] === to) return { ok: false, reason: 'self_send' };
    // Única exceção: jr-rh-bot → Junior pessoal (notifyJunior administrativo)
    if (fromInstance === 'jr-rh-bot' && to === '5565993471331') {
      return { ok: true, reason: 'notify_junior_admin' };
    }
    // Qualquer outro bot-to-bot é proibido
    return { ok: false, reason: 'cross_bot_blocked' };
  }
  return { ok: true };
}

// Rate limit em memória — Map<key, timestamp ms>
const lastSent = new Map();
const RATE_LIMIT_MS = 60 * 1000; // 1 msg/min por destinatário

/** Limpa entradas antigas pra não vazar memória */
function cleanRateLimit() {
  const now = Date.now();
  for (const [key, ts] of lastSent.entries()) {
    if (now - ts > 5 * RATE_LIMIT_MS) lastSent.delete(key);
  }
}
setInterval(cleanRateLimit, 5 * 60 * 1000); // a cada 5 min

function rateLimitKey(toPhone, fromInstance) {
  return `${normalizePhone(toPhone)}|${fromInstance || ''}`;
}

function rateLimitOk(toPhone, fromInstance) {
  const key = rateLimitKey(toPhone, fromInstance);
  const last = lastSent.get(key) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < RATE_LIMIT_MS) {
    return { ok: false, reason: 'rate_limited', elapsed_ms: elapsed };
  }
  return { ok: true };
}

function markSent(toPhone, fromInstance) {
  lastSent.set(rateLimitKey(toPhone, fromInstance), Date.now());
}

/**
 * Função-pedreiro: pre-check completo antes de enviar.
 * Use ANTES de qualquer sendText / sendMedia.
 * Retorna { ok, reason } — se ok=false, NÃO envia.
 */
function preflightSend(toPhone, fromInstance, _text) {
  // NOTA: NÃO checamos isEchoMessage no envio — notifyJunior usa 🔔 e PRECISA ser enviada.
  // O eco-check é exclusivo do RECEIVE (preflightReceive) pra fechar o loop.
  const can = canSend(toPhone, fromInstance);
  if (!can.ok) return can;
  const rate = rateLimitOk(toPhone, fromInstance);
  if (!rate.ok) return rate;
  return { ok: can.ok, reason: can.reason };
}

/**
 * Pre-check pra mensagem ENTRANDO (webhook).
 * Descarta se: sender é bot (exceto whitelist owner_consult), eco, ou repetição (3x).
 * Requer `receivingInstance` pra checar a whitelist de owners.
 */
function preflightReceive({ phone, messageContent, receivingInstance }) {
  // 1. Eco — sempre bloqueado
  if (isEchoMessage(messageContent)) {
    return { ok: false, reason: 'echo_message' };
  }
  const sender = normalizePhone(phone);
  // 2. Sender é bot?
  if (BOT_PHONES.has(sender)) {
    if (INSTANCE_TO_PHONE[receivingInstance] === sender) {
      return { ok: false, reason: 'self_msg' };
    }
    const allowed = ALLOWED_BOT_SENDERS[receivingInstance] || new Set();
    if (!allowed.has(sender)) {
      return { ok: false, reason: 'sender_is_bot' };
    }
    // Owner legítimo. Continua pros próximos checks.
  }
  // 3. Sender é colaborador? Bots financeiro/pessoal não atendem colaboradores
  if (EMPLOYEE_PHONES.has(sender) && BOTS_THAT_IGNORE_EMPLOYEES.has(receivingInstance)) {
    return { ok: false, reason: 'employee_internal_chat' };
  }
  // 4. Anti-repetição (3x mesma msg em sequência)
  const repeat = checkRepeat(sender, messageContent);
  if (!repeat.ok) return repeat;
  return { ok: true };
}

// ===== Camada 5: anti-repetição =====
// Map<senderPhone+receivingInstance, { last3: [], blockedUntil: ts }>
const repeatTracker = new Map();
const REPEAT_THRESHOLD = 3;
const REPEAT_BLOCK_MS = 10 * 60 * 1000; // 10 min de silêncio após detectar

function normalizeMessage(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 200);
}

function checkRepeat(sender, messageContent) {
  const key = sender || 'unknown';
  const norm = normalizeMessage(messageContent);
  if (!norm) return { ok: true };
  const entry = repeatTracker.get(key) || { last3: [], blockedUntil: 0 };
  const now = Date.now();
  // Se já bloqueado, e ainda dentro da janela
  if (entry.blockedUntil > now) {
    return { ok: false, reason: 'repeated_msg_blocked', blocked_until: entry.blockedUntil };
  }
  // Adiciona ao histórico
  entry.last3.push(norm);
  if (entry.last3.length > REPEAT_THRESHOLD) entry.last3.shift();
  // Verifica se as últimas 3 são idênticas
  if (entry.last3.length === REPEAT_THRESHOLD &&
      entry.last3[0] === entry.last3[1] &&
      entry.last3[1] === entry.last3[2]) {
    entry.blockedUntil = now + REPEAT_BLOCK_MS;
    repeatTracker.set(key, entry);
    return { ok: false, reason: 'repeated_msg_threshold', blocked_until: entry.blockedUntil };
  }
  repeatTracker.set(key, entry);
  return { ok: true };
}

function cleanRepeatTracker() {
  const now = Date.now();
  for (const [key, entry] of repeatTracker.entries()) {
    if (entry.blockedUntil < now - REPEAT_BLOCK_MS) repeatTracker.delete(key);
  }
}
setInterval(cleanRepeatTracker, 10 * 60 * 1000); // cleanup a cada 10min

module.exports = {
  BOT_PHONES,
  INSTANCE_TO_PHONE,
  ALLOWED_BOT_SENDERS,
  EMPLOYEE_PHONES,
  BOTS_THAT_IGNORE_EMPLOYEES,
  OCR_ALLOWED_GROUPS,
  normalizePhone,
  isBotPhone,
  isEchoMessage,
  canSend,
  rateLimitOk,
  markSent,
  checkRepeat,
  preflightSend,
  preflightReceive,
};
