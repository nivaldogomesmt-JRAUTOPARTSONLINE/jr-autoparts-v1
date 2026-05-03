// src/services/leadService.js
// Captura estruturada de leads do atendimento WhatsApp/OLX/Instagram.
// Usa Ollama (qwen3:8b) pra extrair intenção da mensagem livre do cliente.
const prisma = require('../lib/prisma');
const ia = require('./iaService');

const STAGES = ['NEW', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST'];
const SOURCES = ['whatsapp', 'olx', 'instagram', 'indicacao', 'manual'];

/**
 * Extrai intenção estruturada da mensagem do cliente.
 * Usa Ollama, retorna JSON: {peca, modelo, ano, urgencia (1-3), valorEstimado, observacao}
 */
async function extractIntent(mensagem, contexto = {}) {
  if (!mensagem || mensagem.length < 5) return null;

  const prompt = `Você é especialista em vendas de auto peças. Extraia a INTENÇÃO de compra da mensagem do cliente.

MENSAGEM: "${mensagem}"
${contexto.nome ? 'CLIENTE: ' + contexto.nome : ''}

Retorne APENAS JSON com campos preenchidos quando identificáveis. Use null para campos não identificados.

{
  "peca": "nome do produto/peça em maiúsculas (ex: PNEU, FILTRO DE AR, PASTILHA FREIO)",
  "modelo": "modelo do veículo (ex: Onix, Civic, Hilux)",
  "ano": número (ex: 2018) ou null,
  "urgencia": 1=baixa, 2=média, 3=alta (urgente/precisa hoje),
  "valorEstimado": número em reais ou null,
  "observacao": "qualquer outra info útil em até 80 chars"
}

Apenas o JSON, sem texto adicional.`;

  try {
    const r = await ia.generate(prompt, { temperature: 0.3, maxTokens: 250, timeout: 60000 });
    const match = r.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed;
  } catch (e) {
    console.log('[lead] erro extract intent:', e.message);
    return null;
  }
}

/** Calcula score 1-10 do lead baseado em intenção, urgência, valor */
function calculateScore(intent, contexto = {}) {
  let score = 5;
  if (!intent) return score;

  // Urgência tem peso forte
  if (intent.urgencia === 3) score += 3;
  else if (intent.urgencia === 2) score += 1;
  else if (intent.urgencia === 1) score -= 1;

  // Tem peça específica identificada = mais qualificado
  if (intent.peca && intent.peca !== 'null') score += 1;
  // Tem modelo+ano = lead muito qualificado
  if (intent.modelo && intent.ano) score += 1;
  // Valor alto > R$ 500 = lead bom
  if (intent.valorEstimado && intent.valorEstimado > 500) score += 1;

  // Cliente recorrente
  if (contexto.totalPurchases && contexto.totalPurchases > 0) score += 2;

  return Math.max(1, Math.min(10, score));
}

/**
 * Captura ou atualiza lead a partir de uma mensagem do cliente.
 * Chamado pelo atendimentoService quando recebe mensagem nova.
 */
async function captureFromMessage({ phone, name, mensagem, source = 'whatsapp', conversationId }) {
  if (!phone || !mensagem) return null;

  // Busca lead ativo (stage != WON/LOST) pelo telefone
  let lead = await prisma.lead.findFirst({
    where: { phone, stage: { notIn: ['WON', 'LOST'] } },
    orderBy: { createdAt: 'desc' },
  });

  // Memory do cliente (pra ver se é recorrente)
  const memory = await prisma.customerMemory.findUnique({ where: { customerPhone: phone } });

  // Extrai intenção via IA (best effort, não trava se falhar)
  const intent = await extractIntent(mensagem, { nome: name, totalPurchases: memory?.totalPurchases });
  const score = calculateScore(intent, memory || {});

  if (lead) {
    // Lead existe → atualiza
    const data = {
      lastContact: new Date(),
      score,
      conversationId: conversationId || lead.conversationId,
      name: name || lead.name,
    };
    // Mescla intent (não sobrescreve se já tinha info)
    if (intent) {
      const existingIntent = lead.intentJson || {};
      data.intentJson = {
        peca:           intent.peca           || existingIntent.peca,
        modelo:         intent.modelo         || existingIntent.modelo,
        ano:            intent.ano            || existingIntent.ano,
        urgencia:       Math.max(intent.urgencia || 0, existingIntent.urgencia || 0) || null,
        valorEstimado:  intent.valorEstimado  || existingIntent.valorEstimado,
        observacao:     intent.observacao     || existingIntent.observacao,
      };
    }
    // Move pra QUALIFIED se ainda está em NEW e tem peça identificada
    if (lead.stage === 'NEW' && intent?.peca) {
      data.stage = 'QUALIFIED';
    }
    return prisma.lead.update({ where: { id: lead.id }, data });
  } else {
    // Lead novo
    return prisma.lead.create({
      data: {
        phone,
        name: name || null,
        source,
        stage: intent?.peca ? 'QUALIFIED' : 'NEW',
        intentJson: intent || null,
        score,
        lastContact: new Date(),
        conversationId: conversationId || null,
      },
    });
  }
}

/** Lista leads com filtros opcionais (kanban) */
async function listLeads({ stage, source, minScore, days, search } = {}) {
  const where = {};
  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (minScore) where.score = { gte: parseInt(minScore) };
  if (days) {
    const cutoff = new Date(Date.now() - parseInt(days) * 86400000);
    where.lastContact = { gte: cutoff };
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ score: 'desc' }, { lastContact: 'desc' }],
    take: 500,
  });
  return leads;
}

/** Resumo agrupado por stage (pra dashboard kanban) */
async function summary() {
  const all = await prisma.lead.findMany({
    where: { stage: { notIn: ['WON', 'LOST'] } },
    orderBy: [{ score: 'desc' }, { lastContact: 'desc' }],
  });

  const grouped = {};
  for (const stage of STAGES) grouped[stage] = [];
  for (const lead of all) {
    if (grouped[lead.stage]) grouped[lead.stage].push(lead);
  }

  // Stats
  const stats = {
    total: all.length,
    byStage: Object.fromEntries(STAGES.map(s => [s, grouped[s]?.length || 0])),
    avgScore: all.length ? (all.reduce((s, l) => s + l.score, 0) / all.length).toFixed(1) : 0,
    parados3plus: all.filter(l => l.lastContact && (Date.now() - new Date(l.lastContact)) > 3 * 86400000).length,
  };

  return { columns: grouped, stats };
}

/** Move lead de stage */
async function moveStage(id, stage, userId = 'sistema') {
  if (!STAGES.includes(stage)) throw new Error('Stage inválido');
  const data = { stage };
  if (stage === 'WON') data.wonAt = new Date();
  if (stage === 'LOST') data.lostAt = new Date();
  return prisma.lead.update({ where: { id }, data });
}

/** Atualizar campos do lead (anotações, valor estimado, próximo follow-up) */
async function update(id, fields) {
  const allowed = ['name', 'notes', 'estimatedValue', 'nextFollowup', 'lostReason'];
  const data = {};
  for (const k of allowed) if (fields[k] !== undefined) data[k] = fields[k];
  return prisma.lead.update({ where: { id }, data });
}

/** Pega lead pra cron de followup (parados há X dias sem contato) */
async function leadsParados(diasMinimos = 2) {
  const cutoff = new Date(Date.now() - diasMinimos * 86400000);
  return prisma.lead.findMany({
    where: {
      stage: { in: ['NEW', 'QUALIFIED', 'NEGOTIATING'] },
      lastContact: { lt: cutoff },
      OR: [
        { nextFollowup: { lt: new Date() } },
        { nextFollowup: null },
      ],
    },
    orderBy: { score: 'desc' },
    take: 50,
  });
}

module.exports = {
  STAGES,
  SOURCES,
  extractIntent,
  calculateScore,
  captureFromMessage,
  listLeads,
  summary,
  moveStage,
  update,
  leadsParados,
};
