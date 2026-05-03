const axios = require('axios');
const prisma = require('../lib/prisma');

// ── Sessões em memória ──────────────────────────────────────────────────────
const sessions = new Map();
const SESSION_TTL_MS = parseInt(process.env.BOT_SESSION_TTL_MINUTES || '30') * 60_000;

function getSession(phone) {
  const now = Date.now();
  if (!sessions.has(phone) || now - sessions.get(phone).lastAt > SESSION_TTL_MS) {
    sessions.set(phone, { messages: [], handoff: false, lastAt: now });
  }
  const s = sessions.get(phone);
  s.lastAt = now;
  return s;
}

// ── Contexto do cliente (opcional — enriquece se ele já for cadastrado) ──────
async function loadClientContext(phone) {
  try {
    const digits = phone.replace(/\D/g, '').slice(-11);
    const client = await prisma.client.findFirst({
      where: { phone: { contains: digits } },
      include: {
        vehicles: true,
        serviceOrders: { orderBy: { createdAt: 'desc' }, take: 3 }
      }
    });
    return client;
  } catch { return null; }
}

// ── Busca de peças no catálogo ───────────────────────────────────────────────
const PARTS_RE = /\b(filtro|vela|pastilha|disco|correia|amortecedor|radiador|bomba|rolamento|óleo|bateria|pneu|freio|embreagem|alternador|injetor|bobina|cubo|pivô|terminal|bieleta|barra|coxim)\b/i;

async function searchParts(keyword) {
  try {
    return await prisma.product.findMany({
      where: { name: { contains: keyword, mode: 'insensitive' } },
      take: 5,
      select: { name: true, price: true, stock: true, code: true }
    });
  } catch { return []; }
}

// ── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(client, parts) {
  const now = new Date();
  const hour = now.getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  let ctx = '';
  if (client) {
    ctx += `\nCLIENTE IDENTIFICADO: ${client.name}`;
    if (client.vehicles?.length) {
      ctx += `\nVeículos: ${client.vehicles.map(v => v.plate + ' ' + v.model).join(', ')}`;
    }
    if (client.serviceOrders?.length) {
      ctx += `\nÚltimas OS: ${client.serviceOrders.map(o => o.status + ' - ' + o.description?.substring(0, 40)).join(' | ')}`;
    }
  }

  if (parts?.length) {
    ctx += `\n\nPEÇAS ENCONTRADAS NO CATÁLOGO:\n` +
      parts.map(p => `- ${p.name} | Cód: ${p.code} | R$ ${p.price?.toFixed(2)} | Estoque: ${p.stock}`).join('\n');
  }

  return `Você é o assistente virtual da JR Auto Parts, loja especializada em peças automotivas em Cuiabá-MT.
Seu nome é JR. Você atende pelo WhatsApp com linguagem amigável, natural e profissional.

REGRAS IMPORTANTES:
- Sempre comece com "${saudacao}! 😊" quando for a primeira mensagem
- NUNCA peça CPF ou placa logo de cara — primeiro entenda o que o cliente precisa
- Converse naturalmente: pergunte o que o cliente está buscando, o problema do veículo, etc
- Só peça placa ou CPF quando for REALMENTE necessário (ex: cliente quer saber status de pedido específico)
- Se o cliente perguntar sobre peças, informe disponibilidade e preço se tiver no catálogo
- Se o cliente quiser agendar, informe que pode marcar via link ou pelo próprio chat
- Se o cliente pedir orçamento, colete as informações necessárias (modelo do carro, ano, peça) antes de dar valor
- Seja empático — se o carro quebrou, mostre que entende a situação antes de oferecer solução
- Se não souber a resposta, diga que vai verificar e um atendente entrará em contato
- Para atendimento humano, use [HANDOFF] no início da resposta

SOBRE A JR AUTO PARTS:
- Loja de peças automotivas em Cuiabá-MT
- Atende todos os tipos de veículos (carros, motos, caminhões)
- Serviços: venda de peças, troca de óleo, revisão, diagnóstico
- Formas de pagamento: PIX, cartão, boleto
- WhatsApp: 65 99281-2000
${ctx}`;
}

// ── Chamada OpenAI ─────────────────────────────────────────────────────────────
async function callOpenAI(systemPrompt, messages) {
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 400,
      temperature: 0.7
    },
    { headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return resp.data.choices[0].message.content.trim();
}

function isOpenAIQuotaError(err) {
  return err?.response?.status === 429
    && String(err?.response?.data?.error?.code || '').toLowerCase() === 'insufficient_quota';
}

// ── Handler principal ──────────────────────────────────────────────────────────
async function handleIncomingMessage(phone, content) {
  if (!process.env.OPENAI_API_KEY) return null;

  const session = getSession(phone);
  if (session.handoff) return null;

  // Busca peças se palavra-chave detectada
  const keyword = (content.match(PARTS_RE) || [])[0];

  // Carrega contexto do cliente em paralelo com busca de peças
  const [client, parts] = await Promise.all([
    loadClientContext(phone),
    keyword ? searchParts(keyword) : Promise.resolve([])
  ]);

  // Adiciona mensagem do usuário ao histórico
  session.messages.push({ role: 'user', content });
  if (session.messages.length > 14) {
    session.messages = session.messages.slice(-14);
  }

  let reply;
  try {
    reply = await callOpenAI(buildSystemPrompt(client, parts), session.messages);
  } catch (err) {
    if (isOpenAIQuotaError(err)) {
      console.error('[Chatbot] OpenAI quota exhausted:', err?.response?.data?.error?.message || err.message);
      return 'Olá! 😊 No momento nosso atendimento automático está temporariamente indisponível. Um atendente vai continuar por aqui em instantes.';
    }

    console.error('[Chatbot] OpenAI error:', err.message);
    return 'Olá! 😊 Tivemos uma instabilidade agora. Um atendente vai te responder em instantes!';
  }

  // Verifica handoff
  if (reply.startsWith('[HANDOFF]')) {
    session.handoff = true;
    reply = reply.replace('[HANDOFF]', '').trim() + '\n\n🔔 Um de nossos atendentes vai continuar o atendimento em breve!';
  }

  session.messages.push({ role: 'assistant', content: reply });
  return reply;
}

module.exports = { handleIncomingMessage };
