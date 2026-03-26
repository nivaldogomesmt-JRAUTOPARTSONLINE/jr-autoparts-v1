/**
 * JR Auto Peças — Bot de Atendimento WhatsApp com IA (GPT-4o-mini)
 *
 * Fluxo:
 *   1. Webhook Evolution API recebe mensagem do cliente
 *   2. Carrega histórico da sessão (memória com TTL configurável)
 *   3. Busca contexto do cliente e peças relevantes no banco
 *   4. Chama OpenAI via axios com prompt personalizado JR Auto Peças
 *   5. Retorna resposta para envio via Evolution API
 *
 * Requer: OPENAI_API_KEY no .env do backend
 */

const axios = require('axios');
const prisma = require('../lib/prisma');

// ── Sessões em memória (histórico por telefone) ────────────────────────
const sessions = new Map();
const SESSION_TTL_MS = parseInt(process.env.BOT_SESSION_TTL_MINUTES || '30') * 60_000;

function getSession(phone) {
  const now = Date.now();
  let s = sessions.get(phone);
  if (!s || now - s.lastActivity > SESSION_TTL_MS) {
    s = { messages: [], lastActivity: now, handoff: false };
    sessions.set(phone, s);
  }
  s.lastActivity = now;
  return s;
}

// ── Busca cliente no banco ────────────────────────────────────
async function loadClientContext(phone) {
  try {
    return await prisma.client.findFirst({
      where: {
        OR: [{ phone: { contains: phone } }, { whatsapp: { contains: phone } }],
        active: true,
      },
      select: {
        id: true, name: true,
        vehicles: { take: 3, select: { brand: true, model: true, year: true, plate: true } },
        serviceOrders: {
          take: 3, orderBy: { createdAt: 'desc' },
          select: { status: true, description: true, totalPrice: true },
        },
      },
    });
  } catch { return null; }
}

// ── Busca peças no catálogo ───────────────────────────────────
async function searchParts(keyword) {
  if (!keyword) return [];
  try {
    return await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
        active: true,
      },
      take: 5,
      select: { name: true, code: true, salePrice: true, price: true, stock: true },
    });
  } catch { return []; }
}

// ── Regex para detectar peças na mensagem ─────────────────────────
const PARTS_RE = /\b(filtro|oleo|óleo|correia|freio|pastilha|amortecedor|vela|bateria|alternador|tensor|bomba|radiador|rolamento|cubo|pivô|barra|disco|tambor|coxim|embreagem|diferencial|injetor|bobina|sensor|manga|pneu|escapamento|platô|servo|relé|fusível|borracha|braço|pistão|biela|virabrequim)\b/i;

// ── System prompt com contexto dinâmico ───────────────────────────
function buildSystemPrompt(client, parts) {
  let ctx = '';
  if (client) {
    ctx += '\n\nCLIENTE: ' + client.name;
    if (client.vehicles?.length) {
      ctx += '\nVeículos: ' + client.vehicles.map(v => v.brand + ' ' + v.model + ' ' + (v.year || '') + ' - ' + v.plate).join('; ');
    }
    if (client.serviceOrders?.length) {
      ctx += '\nÚltimas OS: ' + client.serviceOrders.map(o => o.status + ': ' + (o.description || '').substring(0, 50)).join('; ');
    }
  }
  if (parts.length > 0) {
    const lista = parts.map(p => {
      const val = p.salePrice || p.price;
      return '- ' + p.name + ' | Cód: ' + (p.code || '-') + ' | ' + (val ? 'R$ ' + Number(val).toFixed(2) : 'consultar') + ' | Estoque: ' + (p.stock ?? '?');
    }).join('\n');
    ctx += '\n\nPEÇAS NO CATÁLOGO:\n' + lista;
  }
  return 'Você é o assistente virtual da JR Auto Peças, autopeças e oficina mecânica no Mato Grosso, Brasil. Nome: JR Assistente.\n\nEMPRESA:\n- Veículos leves e pesados\n- Serviços: troca de óleo, correia, suspensão, freios, elétrica, diagnóstico\n- WhatsApp: (65) 99281-2000\n- Horário: Seg-Sex 7h-18h | Sáb 7h-12h\n\nPAPEL:\n1. Saudar e entender a necessidade\n2. Identificar: compra de peça, orçamento, agendamento ou suporte\n3. Informar preço/disponibilidade das peças do catálogo\n4. Para serviços: estimar valor e coletar dados do veículo (marca/modelo/ano)\n5. Para agendamento: coletar nome, veículo e preferência de horário\n6. Se não souber ou cliente pedir humano: responder começando com [HANDOFF]\n\nREGRAS:\n- Português brasileiro informal e profissional\n- Máximo 200 palavras por resposta\n- 1-2 emojis por mensagem\n- NUNCA invente preços fora do catálogo\n- Se a peça não estiver no catálogo, diga que vai verificar com a equipe' + ctx;
}

// ── Chama OpenAI via axios ────────────────────────────────────────
async function callOpenAI(systemPrompt, messages) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 400,
      temperature: 0.65,
    },
    {
      headers: {
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return res.data.choices[0]?.message?.content?.trim() || null;
}

// ── Entry point chamado pelo evolutionWebhookController ──────────────
async function handleIncomingMessage(phone, content) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[ChatbotAI] OPENAI_API_KEY não configurada — chatbot desativado.');
    return null;
  }

  const session = getSession(phone);
  if (session.handoff) return null;  // já aguardando humano

  try {
    const keyword = (content.match(PARTS_RE) || [])[0];
    const [client, parts] = await Promise.all([
      loadClientContext(phone),
      keyword ? searchParts(keyword) : Promise.resolve([]),
    ]);

    session.messages.push({ role: 'user', content });
    if (session.messages.length > 12) session.messages = session.messages.slice(-12);

    let reply = await callOpenAI(buildSystemPrompt(client, parts), session.messages);
    if (!reply) return null;

    if (reply.startsWith('[HANDOFF]')) {
      session.handoff = true;
      reply = reply.replace('[HANDOFF]', '').trim();
      reply += '\n\n🔔 Um atendente da JR Auto Peças vai continuar em instantes!';
    }

    session.messages.push({ role: 'assistant', content: reply });
    return reply;

  } catch (err) {
    console.error('[ChatbotAI] Erro:', err.message);
    return '⚠️ Tive um probleminha técnico. Nossa equipe entra em contato pelo (65) 99281-2000!';
  }
}

module.exports = { handleIncomingMessage };
