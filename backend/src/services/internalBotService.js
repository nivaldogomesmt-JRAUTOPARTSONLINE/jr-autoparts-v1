// src/services/internalBotService.js
// Bot Ollama no número 65 99800-2000 (jr-rh-bot)
// Atende COLABORADORES com comandos rápidos: estoque, OS, cliente, feedback
// Se cliente comum mandar mensagem, redireciona pra loja oficial 99281-2000

const axios = require('axios');
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const router = require('./messageRouterService');
const coaching = require('./coachingService');
const filters = require('./filterService');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const RH_INSTANCE = 'jr-rh-bot';
const SALES_PHONE = '(65) 99281-2000';

function normalizePhone(p) {
  let n = String(p || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55')) n = '55' + n;
  return n;
}

async function sendReply(phone, text) {
  return axios.post(`${EVO_URL}/message/sendText/${RH_INSTANCE}`,
    { number: phone, text },
    { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
  );
}

/** Identifica colaborador pelo phone */
async function findEmployee(phone) {
  const p = normalizePhone(phone);
  // users tem phone? Não — vamos comparar com clients que tem clientId/role
  // Por enquanto usa email no User pra mapear (futuro: campo phone em users)
  const last9 = p.slice(-9);
  const r = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.name, u.email, u.role
    FROM users u
    LEFT JOIN clients c ON c.id = u.client_id
    WHERE c.phone LIKE '%' || $1 || '%' OR c.whatsapp LIKE '%' || $1 || '%'
    LIMIT 1
  `, last9);
  return r && r.length > 0 && (r[0].role === 'EMPLOYEE' || r[0].role === 'ADMIN') ? r[0] : null;
}

/** Comando: estoque [produto] */
async function cmdEstoque(query) {
  if (!query) return `Use: *estoque [nome ou código do produto]*\nEx: estoque pneu xbri 175`;
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  const where = {
    AND: tokens.slice(0, 4).map(t => ({
      OR: [
        { name: { contains: t, mode: 'insensitive' } },
        { barcode: { contains: t } },
      ]
    }))
  };
  const products = await prisma.product.findMany({
    where, take: 5, orderBy: { stock: 'desc' },
    select: { name: true, stock: true, price: true, barcode: true },
  });
  if (!products.length) return `Não achei produto com "${query}". Verifica o nome.`;
  return `🔍 Encontrei ${products.length} produto(s):\n\n` +
    products.map((p, i) => {
      const valor = p.price ? 'R$ ' + (parseFloat(p.price.toString()) / 100).toFixed(2).replace('.', ',') : 'sem preço';
      return `${i+1}. *${p.name.slice(0, 60)}*\n   📦 Estoque: ${p.stock || 0}\n   💰 ${valor}\n   ${p.barcode ? '🏷️ ' + p.barcode : ''}`;
    }).join('\n\n');
}

/** Comando: os [número ou cliente] */
async function cmdOs(query) {
  if (!query) return `Use: *os [número da OS ou nome do cliente]*\nEx: os 1234 ou os joão silva`;
  const isNumber = /^\d+$/.test(query.trim());
  let where;
  if (isNumber) {
    where = { id: { contains: query } };  // tenta por ID
  } else {
    where = {
      client: {
        name: { contains: query, mode: 'insensitive' }
      }
    };
  }
  const orders = await prisma.serviceOrder.findMany({
    where, take: 5, orderBy: { createdAt: 'desc' },
    include: { client: { select: { name: true, phone: true } }, vehicle: { select: { plate: true } } },
  });
  if (!orders.length) return `Não achei OS com "${query}".`;
  return `🔧 ${orders.length} OS encontrada(s):\n\n` +
    orders.map((o, i) =>
      `${i+1}. *${o.client?.name || '?'}*\n   🚗 ${o.vehicle?.plate || 'sem placa'}\n   📊 Status: ${o.status}\n   📅 ${new Date(o.createdAt).toLocaleDateString('pt-BR')}\n   #${o.id.slice(0, 8)}`
    ).join('\n\n');
}

/** Comando: cliente [nome ou telefone] */
async function cmdCliente(query) {
  if (!query) return `Use: *cliente [nome ou telefone]*\nEx: cliente joão silva`;
  const numericQuery = query.replace(/\D/g, '');
  const where = numericQuery.length >= 8
    ? { OR: [
        { phone: { contains: numericQuery } },
        { whatsapp: { contains: numericQuery } },
        { cpfCnpj: { contains: numericQuery } },
      ]}
    : { name: { contains: query, mode: 'insensitive' } };
  const clients = await prisma.client.findMany({
    where, take: 5, orderBy: { updatedAt: 'desc' },
    select: { name: true, phone: true, whatsapp: true, cpfCnpj: true, city: true },
  });
  if (!clients.length) return `Não achei cliente com "${query}".`;
  return `👥 ${clients.length} cliente(s):\n\n` +
    clients.map((c, i) =>
      `${i+1}. *${c.name}*\n   📱 ${c.whatsapp || c.phone || '-'}\n   ${c.cpfCnpj ? '🆔 ' + c.cpfCnpj : ''}\n   ${c.city ? '📍 ' + c.city : ''}`
    ).join('\n\n');
}

/** Comando: feedback [texto] — registra reclamação interna privada (vai pro Junior pessoal) */
async function cmdFeedback(text, employee) {
  if (!text || text.length < 10) return `Manda mais detalhes do feedback. Use: *feedback [texto]*`;
  await prisma.$executeRawUnsafe(`
    INSERT INTO internal_alerts (alert_type, severity, title, message, source, metadata)
    VALUES ('internal_complaint', 'warning', $1, $2, 'internal-bot', $3)
  `,
    `Feedback de ${employee?.name || 'colaborador'}`,
    text.slice(0, 1000),
    JSON.stringify({ employeeId: employee?.id, employeeName: employee?.name })
  );

  // Notifica Junior pessoal
  try {
    await router.notifyJuniorInternalComplaint(
      `💬 *FEEDBACK INTERNO*\n\n` +
      `👤 ${employee?.name || 'Colaborador (não identificado)'}\n` +
      `📝 ${text.slice(0, 600)}\n\n` +
      `_Apenas você está vendo isto._`
    );
  } catch (e) {}

  return `📝 Recebido! Seu feedback foi registrado e enviado direto pro Junior. Obrigado pela colaboração! 🙌`;
}

/** Detecta comando numa mensagem */
function parseCommand(message) {
  const m = (message || '').trim();
  const lower = m.toLowerCase();
  if (lower.startsWith('estoque ')) return { cmd: 'estoque', arg: m.slice(8).trim() };
  if (lower.startsWith('os '))      return { cmd: 'os', arg: m.slice(3).trim() };
  if (lower.startsWith('cliente ')) return { cmd: 'cliente', arg: m.slice(8).trim() };
  if (lower.startsWith('feedback')) return { cmd: 'feedback', arg: m.replace(/^feedback:?\s*/i, '').trim() };
  if (lower === 'ajuda' || lower === 'help' || lower === '?') return { cmd: 'help', arg: '' };
  return null;
}

function helpText() {
  return `🤖 *JR Auto Parts — Bot Equipe*\n\n` +
    `Comandos disponíveis:\n\n` +
    `📦 *estoque [produto]*\n   Ex: estoque pneu xbri\n\n` +
    `🔧 *os [número ou nome]*\n   Ex: os 1234 ou os joão\n\n` +
    `👥 *cliente [nome ou tel]*\n   Ex: cliente maria\n\n` +
    `💬 *feedback [texto]*\n   Manda direto pro Junior (privado)\n\n` +
    `🔧 *Consulta de filtros (Wega):*\n   Ex: filtro onix 2018\n   Ex: FAP5303 (busca código)\n   Ex: posicao cabine AKX35141\n\n` +
    `Digite *ajuda* a qualquer momento.`;
}

/** Processa mensagem recebida no jr-rh-bot */
async function handleMessage({ phone, contactName, messageContent, messageId }) {
  // Tenta coaching primeiro (colaborador identificado por whatsapp_phone)
  try {
    const employee = await coaching.findEmployeeByPhone(phone);
    if (employee) {
      const r = await coaching.handleEmployeeMessage({ phone, contactName, messageContent });
      if (r) return { type: 'coaching', ...r };
    }
  } catch (e) { console.log('[coaching] err:', e.message); }

  // Original logic continua abaixo:
  if (!phone || !messageContent) return null;
  const p = normalizePhone(phone);

  const employee = await findEmployee(p);

  // Se não é colaborador conhecido — redireciona pra loja
  if (!employee) {
    const reply = `Olá! 👋\n\nEste número é interno da JR Auto Parts.\n\nPara peças, atendimento e vendas, fala com a gente:\n📱 ${SALES_PHONE}\n\nLá te respondemos rapidinho!`;
    try {
      await sendReply(p, reply);
    } catch (e) {}
    return { type: 'redirected_to_sales', reply };
  }

  // Colaborador identificado — processa comandos
  const parsed = parseCommand(messageContent);
  let reply;

  if (!parsed) {
    // Tenta consulta de filtros (Wega catalog: 9.474 aplicações)
    try {
      const filterReply = await filters.handleQuery(messageContent);
      if (filterReply) {
        reply = filterReply;
      } else {
        reply = `Não entendi o comando, ${employee.name?.split(' ')[0]}. Manda *ajuda* pra ver o que dá pra fazer.`;
      }
    } catch (e) {
      console.log('[internal-bot] filter err:', e.message);
      reply = `Não entendi o comando, ${employee.name?.split(' ')[0]}. Manda *ajuda* pra ver o que dá pra fazer.`;
    }
  } else {
    switch (parsed.cmd) {
      case 'estoque':  reply = await cmdEstoque(parsed.arg); break;
      case 'os':       reply = await cmdOs(parsed.arg); break;
      case 'cliente':  reply = await cmdCliente(parsed.arg); break;
      case 'feedback': reply = await cmdFeedback(parsed.arg, employee); break;
      case 'help':     reply = helpText(); break;
    }
  }

  if (reply) {
    try { await sendReply(p, reply); }
    catch (e) { console.log('[internal-bot] send err:', e.message); }
  }

  return { type: 'employee_command', cmd: parsed?.cmd, employeeId: employee.id, replied: !!reply };
}

module.exports = { handleMessage, parseCommand, helpText };
