// src/controllers/personalController.js
const svc = require('../services/personalBotService');
const prisma = require('../lib/prisma');

// Contatos pessoais (whitelist)
async function listContacts(_req, res) {
  try {
    const r = await prisma.$queryRawUnsafe(`
      SELECT * FROM personal_contacts WHERE active = true ORDER BY name, phone
    `);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function createContact(req, res) {
  try {
    const { phone, name, category = 'outro', notes } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
    const id = require('crypto').randomUUID();
    const normalized = String(phone).replace(/\D/g, '');
    const p = normalized.startsWith('55') ? normalized : '55' + normalized;
    await prisma.$executeRawUnsafe(`
      INSERT INTO personal_contacts (id, phone, name, category, source, notes)
      VALUES ($1, $2, $3, $4, 'manual', $5)
      ON CONFLICT (phone) DO UPDATE
        SET name = COALESCE(EXCLUDED.name, personal_contacts.name),
            category = EXCLUDED.category,
            notes = COALESCE(EXCLUDED.notes, personal_contacts.notes),
            active = true,
            updated_at = NOW()
    `, id, p, name || null, category, notes || null);
    const r = await prisma.$queryRawUnsafe(`SELECT * FROM personal_contacts WHERE phone = $1`, p);
    res.json(r[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function deleteContact(req, res) {
  try {
    await prisma.$executeRawUnsafe(`UPDATE personal_contacts SET active = false WHERE id = $1`, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Regras de resposta automática
async function listRules(_req, res) {
  try {
    const r = await prisma.$queryRawUnsafe(`SELECT * FROM personal_auto_responses ORDER BY topic`);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function updateRule(req, res) {
  try {
    const allowed = ['description', 'keywords', 'response_text', 'action', 'forward_to', 'active'];
    const sets = []; const vals = []; let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        vals.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nada pra atualizar' });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.topic);
    await prisma.$executeRawUnsafe(
      `UPDATE personal_auto_responses SET ${sets.join(', ')} WHERE topic = $${i}`,
      ...vals
    );
    const r = await prisma.$queryRawUnsafe(`SELECT * FROM personal_auto_responses WHERE topic = $1`, req.params.topic);
    res.json(r[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Mensagens (histórico)
async function listMessages(req, res) {
  try {
    const { highlighted, intent, days = 7 } = req.query;
    let sql = `SELECT * FROM personal_messages WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'`;
    const params = [];
    if (highlighted === 'true') sql += ` AND highlighted = true AND junior_answered = false`;
    if (intent) { sql += ` AND detected_intent = $${params.length + 1}`; params.push(intent); }
    sql += ` ORDER BY created_at DESC LIMIT 500`;
    const r = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function summary(_req, res) {
  try {
    const stats = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM personal_messages WHERE created_at > NOW() - INTERVAL '7 days') AS total_7d,
        (SELECT COUNT(*)::int FROM personal_messages WHERE highlighted = true AND junior_answered = false) AS pendentes,
        (SELECT COUNT(*)::int FROM personal_contacts WHERE active = true) AS contatos_pessoais,
        (SELECT COUNT(*)::int FROM personal_learning_examples) AS exemplos_aprendidos
    `);
    const byIntent = await prisma.$queryRawUnsafe(`
      SELECT detected_intent, COUNT(*)::int AS total
      FROM personal_messages
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY detected_intent
      ORDER BY total DESC
    `);
    res.json({ ...stats[0], byIntent });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Webhook do Evolution chamando o personalBotService
async function webhookEvolution(req, res) {
  try {
    const { event, data } = req.body || {};
    // event = 'messages.upsert', data tem informações da mensagem
    if (event !== 'messages.upsert') return res.json({ ignored: true });

    const msg = data?.messages?.[0] || data;
    if (!msg || msg.fromMe) return res.json({ ignored: 'fromMe ou vazio' });

    const phone = (msg.key?.remoteJid || '').split('@')[0];
    const messageContent = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || '';
    const messageId = msg.key?.id;
    const contactName = msg.pushName || null;

    if (!phone || !messageContent) return res.json({ ignored: 'sem phone/content' });

    const result = await svc.handleMessage({
      phone, contactName, messageContent, messageId,
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.log('[personal webhook] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listContacts, createContact, deleteContact,
  listRules, updateRule,
  listMessages, summary,
  webhookEvolution,
};
