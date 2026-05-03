// src/services/financialBotService.js
// Bot Ollama no número 65 99668-2001 (jr-financeiro-bot)
// SOMENTE financeiro/cobrança/2ª via/negociação. Tudo mais → encaminha.

const axios = require('axios');
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const router = require('./messageRouterService');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const FIN_INSTANCE = 'jr-financeiro-bot';
const SALES_PHONE = '(65) 99281-2000';
const TECH_PHONE  = '(65) 99298-3003'; // Jesus Rivas — instalador rastreador
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL || 'https://webhook.jrautopartsmt.com.br';

function normalizePhone(p) {
  let n = String(p || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55')) n = '55' + n;
  return n;
}

async function sendReply(phone, text) {
  return axios.post(`${EVO_URL}/message/sendText/${FIN_INSTANCE}`,
    { number: phone, text },
    { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
  );
}

async function findClient(phone) {
  const p = normalizePhone(phone);
  return prisma.client.findFirst({
    where: { OR: [{ phone: { contains: p.slice(-9) } }, { whatsapp: { contains: p.slice(-9) } }] },
    select: { id: true, name: true, cpfCnpj: true, phone: true, whatsapp: true },
  });
}

/**
 * Classifica intenção via heurística + Ollama fallback.
 * Categorias: segunda_via, vencimento, comprovante, negociacao, saudacao,
 *             pecas_acessorios, guincho, rastreamento, suporte_tecnico, outro
 */
async function classifyIntent(message) {
  const t = String(message || '').toLowerCase();

  // === Heurística determinística primeiro (rápida, 0 dependência de Ollama) ===
  // Financeiro
  if (/\b(2.?\s*via|segunda\s*via|novo\s*boleto|linha\s*digitavel|pix\s*do\s*boleto|copia\s*do\s*boleto)\b/.test(t)) return 'segunda_via';
  if (/\b(vencimento|vence|venceu|venceram|vence\s*hoje|venceu\s*ontem|qual\s*o\s*valor)\b/.test(t)) return 'vencimento';
  if (/\b(comprovante|paguei|fiz\s*o\s*pix|pagamento\s*efetuado|baixar\s*minha\s*conta)\b/.test(t)) return 'comprovante';
  if (/\b(parcela|negocia|desconto|prazo|acordo|rever\s*divida)\b/.test(t)) return 'negociacao';

  // Encaminhamento
  if (/\b(rastreador|rastreamento|alerta\s*virtual|positron|globalstar|cruzeiro\s*do\s*sul|tracker)\b/.test(t)) return 'rastreamento';
  if (/\b(suporte\s*tecnico|nao\s*funciona|defeito|instalar|instala[çc][ãa]o|nao\s*liga|nao\s*conecta)\b/.test(t)) return 'suporte_tecnico';
  if (/\b(guincho|reboque|trator|carro\s*quebrou|preciso\s*de\s*guincho)\b/.test(t)) return 'guincho';
  if (/\b(pe[çc]a|filtro|oleo|pastilha|vela|correia|pneu|amortecedor|acessori)\b/.test(t)) return 'pecas_acessorios';

  // Saudação curta
  if (t.length < 25 && /\b(oi|bom\s*dia|boa\s*tarde|boa\s*noite|ola|tudo\s*bem|td\s*bem)\b/.test(t)) return 'saudacao';

  // === Fallback Ollama (apenas se heurística não bateu) ===
  // Se Ollama falhar/timeout, retorna 'outro' (resposta segura: encaminhar pra loja)
  const prompt = `Classifique a mensagem do cliente como UMA destas categorias (apenas a palavra-chave):
- segunda_via, vencimento, comprovante, negociacao, saudacao
- pecas_acessorios (peças, filtros, óleo, pastilhas)
- guincho (guincho, reboque)
- rastreamento (rastreador veicular)
- suporte_tecnico (não funciona, instalação)
- outro (qualquer outro assunto)

MENSAGEM: "${message}"

Responda apenas a palavra-chave.`;
  try {
    const r = await ia.generate(prompt, { temperature: 0.2, maxTokens: 30, timeout: 15000 });
    const intent = r.text.trim().toLowerCase().split(/\s|\n/)[0].replace(/[^a-z_]/g, '');
    return intent || 'outro';
  } catch (e) {
    return 'outro';
  }
}

async function handleSegundaVia(phone, client) {
  if (!client?.cpfCnpj) {
    return `Pra enviar a 2ª via, preciso do seu *CPF ou CNPJ* cadastrado. Pode me mandar só os números, por favor.`;
  }
  try {
    const r = await axios.post(`${WEBHOOK_BASE}/api/boleto`,
      { documento: client.cpfCnpj, protocolo: `BOT-${Date.now()}` },
      { headers: { 'X-Webhook-Secret': process.env.WEBHOOK_SECRET || '' }, timeout: 30000 }
    );
    if (r.data?.encontrado) return r.data.mensagem || 'Aqui está sua 2ª via!';
    return r.data?.mensagem || 'Não encontrei boletos em aberto. Pode estar tudo pago. Qualquer dúvida, manda detalhes.';
  } catch (e) {
    console.log('[fin-bot] segunda_via err:', e.message);
    return `Tive um problema técnico ao buscar seu boleto. Tenta de novo em alguns minutos ou fala direto com a Patrícia: ${SALES_PHONE}`;
  }
}

async function handleNegociacao(phone, client, message) {
  // Cria internal_alert pra Patrícia/Junior tratarem
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO internal_alerts (alert_type, severity, title, message, delivered, delivered_at)
      VALUES ($1, 'info', $2, $3, false, NULL)`,
      'negociacao_request', `Negociação solicitada: ${client?.name || phone}`, message
    );
  } catch (e) { console.log('[fin-bot] alert save err:', e.message); }
  return `Recebi sua solicitação de negociação. Vou encaminhar pra Patrícia avaliar e te retorno em breve com as opções.`;
}

/** Encaminha pra loja oficial */
function replyForwardSales(reason) {
  return `Esse assunto (${reason}) é tratado pela nossa loja oficial:\n\n📱 *${SALES_PHONE}*\n\nPode mandar mensagem por lá que te atendem rapidinho!`;
}

/** Encaminha pra suporte técnico (Jesus) */
function replyForwardTech(reason) {
  return `Pra ${reason}, fala direto com nosso técnico:\n\n📱 *${TECH_PHONE}* (Jesus Rivas)\n\nEle resolve melhor pessoalmente.`;
}

/** Notifica Junior pessoal sobre demanda guincho/rastreamento */
async function notifyAdminGuinchoRastreio(intent, phone, client, message) {
  try {
    const who = client?.name ? `${client.name} (${phone})` : phone;
    const tipo = intent === 'guincho' ? 'GUINCHO' : (intent === 'rastreamento' ? 'RASTREAMENTO' : 'SUPORTE TÉCNICO');
    await router.notifyJunior(
      `🔔 *Demanda ${tipo}* (via 99668-2001)\n\n` +
      `📱 De: ${who}\n` +
      `📝 Mensagem: ${String(message).slice(0, 250)}`,
      'info'
    );
  } catch (e) { console.log('[fin-bot] notify admin err:', e.message); }
}

async function handleMessage({ phone, contactName, messageContent, messageId }) {
  if (!phone || !messageContent) return null;
  const p = normalizePhone(phone);
  const client = await findClient(p);
  const intent = await classifyIntent(messageContent);
  let reply = null;

  switch (intent) {
    case 'segunda_via':
    case 'vencimento':
      reply = await handleSegundaVia(p, client);
      break;
    case 'negociacao':
      reply = await handleNegociacao(p, client, messageContent);
      break;
    case 'comprovante':
      reply = `Recebi! Vou registrar seu pagamento. Em até 1 dia útil seu boleto fica como pago no nosso sistema. Qualquer dúvida, manda mensagem.`;
      break;
    case 'saudacao':
      reply = `Olá ${client?.name?.split(' ')[0] || ''}! 👋\n\nAqui é o financeiro da JR Auto Parts. Posso te ajudar com:\n\n💰 2ª via de boleto\n📅 Consulta de vencimento\n💸 Negociação de débito\n📑 Confirmação de pagamento\n\nO que você precisa?`;
      break;
    case 'pecas_acessorios':
      reply = replyForwardSales('peças e acessórios');
      break;
    case 'guincho':
      reply = replyForwardSales('guincho');
      await notifyAdminGuinchoRastreio('guincho', p, client, messageContent);
      break;
    case 'rastreamento':
      reply = replyForwardTech('rastreamento veicular');
      await notifyAdminGuinchoRastreio('rastreamento', p, client, messageContent);
      break;
    case 'suporte_tecnico':
      reply = replyForwardTech('suporte técnico');
      await notifyAdminGuinchoRastreio('suporte_tecnico', p, client, messageContent);
      break;
    case 'outro':
    default:
      reply = `Aqui é o *financeiro* da JR Auto Parts (boletos, pagamentos).\n\nPra outros assuntos, fala com nossa loja oficial:\n📱 *${SALES_PHONE}*`;
      break;
  }

  if (reply) {
    try { await sendReply(p, reply); } catch (e) { console.log('[fin-bot] send err:', e.message); }
  }
  return { intent, replied: !!reply, clientId: client?.id };
}

module.exports = { handleMessage, classifyIntent, findClient };
