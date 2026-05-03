// src/services/complaintClassifierService.js
// Classifica mensagens de clientes pra detectar reclamações usando Ollama.
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const messageRouter = require('./messageRouterService');

/** Detecta se mensagem é reclamação + sentimento + categoria + severidade */
async function classify(messageText, contexto = {}) {
  if (!messageText || messageText.length < 5) return null;

  const prompt = `Você é especialista em atendimento ao cliente. Analise a mensagem abaixo e classifique se é uma RECLAMAÇÃO de cliente.

MENSAGEM: "${messageText}"
${contexto.customerName ? 'CLIENTE: ' + contexto.customerName : ''}

Retorne APENAS JSON:
{
  "isComplaint": true ou false,
  "confidence": 0.0 a 1.0 (0=desconhecido, 1=certeza),
  "sentiment": -1.0 a 1.0 (-1=muito negativo, 0=neutro, 1=positivo),
  "category": "atendimento" ou "produto" ou "prazo" ou "qualidade" ou "financeiro" ou "outro" ou null,
  "severity": "low" ou "medium" ou "high" ou "critical",
  "summary": "resumo em até 100 chars do problema relatado"
}

Critérios:
- "atendimento": reclamou da forma que foi atendido, demora, descaso
- "produto": peça com defeito, errada, qualidade ruim
- "prazo": atraso na entrega/instalação
- "qualidade": não funciona, quebrou, durou pouco
- "financeiro": cobrança indevida, valor errado, dificuldade de pagamento
- severity "critical" se palavras tipo "Procon", "Reclame Aqui", "advogado", "denúncia"
- severity "high" se palavras tipo "absurdo", "péssimo", "nunca mais"
- severity "medium" pra reclamação comum
- severity "low" pra dúvida com tom levemente irritado

Apenas o JSON.`;

  try {
    const r = await ia.generate(prompt, { temperature: 0.2, maxTokens: 250, timeout: 60000 });
    const match = r.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.log('[complaint] erro classify:', e.message);
    return null;
  }
}

/**
 * Processa mensagem do cliente — se for reclamação, registra e notifica.
 * Chamado pelo atendimentoService quando recebe mensagem.
 */
async function processCustomerMessage({ phone, name, mensagem, conversationId, messageId }) {
  if (!phone || !mensagem) return null;

  const classification = await classify(mensagem, { customerName: name });
  if (!classification || !classification.isComplaint || classification.confidence < 0.6) {
    return null;
  }

  // É reclamação — registra
  const client = await prisma.client.findFirst({
    where: { OR: [{ phone }, { whatsapp: phone }] },
    select: { id: true, name: true },
  });

  const complaintId = require('crypto').randomUUID();
  await prisma.$executeRawUnsafe(`
    INSERT INTO customer_complaints (
      id, customer_phone, customer_name, client_id, conversation_id, message_id,
      message_content, category, severity, sentiment_score, ai_confidence, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'NEW')
  `,
    complaintId, phone, name || client?.name || null, client?.id || null,
    conversationId || null, messageId || null,
    mensagem.slice(0, 2000),
    classification.category || 'outro',
    classification.severity || 'medium',
    classification.sentiment || -0.5,
    classification.confidence || 0.7
  );

  // Monta texto pra grupo
  const sevEmoji = {
    critical: '🚨🚨', high: '🚨', medium: '⚠️', low: 'ℹ️'
  }[classification.severity] || '⚠️';

  const texto = `${sevEmoji} *RECLAMAÇÃO DE CLIENTE*

👤 ${name || client?.name || phone}
📱 ${phone}
🏷️ Categoria: ${classification.category || 'outro'}
⚡ Severidade: ${classification.severity}

📝 Mensagem:
${mensagem.slice(0, 500)}

📊 Resumo IA: ${classification.summary || '(sem resumo)'}

🔗 Painel: https://app.jrautopartsmt.com.br/pos-venda/${complaintId}`;

  // Notifica grupo + Junior
  try {
    await messageRouter.notifyTeamCustomerComplaint(texto);
    await prisma.$executeRawUnsafe(
      `UPDATE customer_complaints SET team_notified_at = NOW(), junior_notified_at = NOW() WHERE id = $1`,
      complaintId
    );
  } catch (e) {
    console.log('[complaint] erro notificar:', e.message);
  }

  return { complaintId, classification };
}

/** Lista reclamações pra dashboard */
async function listComplaints({ status, severity, days = 30 } = {}) {
  let sql = `SELECT * FROM customer_complaints WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'`;
  const params = [];
  if (status) { sql += ` AND status = $${params.length + 1}`; params.push(status); }
  if (severity) { sql += ` AND severity = $${params.length + 1}`; params.push(severity); }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  return prisma.$queryRawUnsafe(sql, ...params);
}

async function summary() {
  const data = await prisma.$queryRawUnsafe(`
    SELECT
      status,
      severity,
      COUNT(*)::int AS total
    FROM customer_complaints
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY status, severity
  `);
  const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM customer_complaints WHERE status NOT IN ('RESOLVED','DISMISSED')`);
  const recentes = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM customer_complaints WHERE created_at > NOW() - INTERVAL '24 hours'`);
  return { breakdown: data, abertas: total[0]?.c || 0, ultimas24h: recentes[0]?.c || 0 };
}

async function updateStatus(id, status, userId, notes = null) {
  const allowedStatuses = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];
  if (!allowedStatuses.includes(status)) throw new Error('status inválido');
  const sets = [`status = $1`, `updated_at = NOW()`];
  const vals = [status];
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    sets.push(`resolved_at = NOW()`);
    if (userId) { sets.push(`resolved_by = $${vals.length + 1}`); vals.push(userId); }
    if (notes) { sets.push(`resolution_notes = $${vals.length + 1}`); vals.push(notes); }
  }
  vals.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE customer_complaints SET ${sets.join(', ')} WHERE id = $${vals.length}`,
    ...vals
  );
  const r = await prisma.$queryRawUnsafe(`SELECT * FROM customer_complaints WHERE id = $1`, id);
  return r[0];
}

module.exports = {
  classify,
  processCustomerMessage,
  listComplaints,
  summary,
  updateStatus,
};
