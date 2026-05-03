// src/services/coachingService.js
// IA acompanha trabalho dos colaboradores via WhatsApp
// Manda check-ins proativos + classifica respostas + reporta desvios pro Junior

const axios = require('axios');
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const router = require('./messageRouterService');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const RH_INSTANCE = 'jr-rh-bot';

function normalizePhone(p) {
  let n = String(p || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55')) n = '55' + n;
  return n;
}

async function sendToEmployee(phone, text) {
  return axios.post(`${EVO_URL}/message/sendText/${RH_INSTANCE}`,
    { number: phone, text },
    { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
  );
}

/** Identifica colaborador pelo phone */
async function findEmployeeByPhone(phone) {
  const p = normalizePhone(phone);
  const r = await prisma.$queryRawUnsafe(`
    SELECT id, name, email, role, whatsapp_phone
    FROM users
    WHERE whatsapp_phone = $1 AND active = true AND role IN ('EMPLOYEE','ADMIN')
    LIMIT 1
  `, p);
  return r && r.length > 0 ? r[0] : null;
}

/** Tarefa ativa do colaborador */
async function getActiveTask(userId) {
  const r = await prisma.$queryRawUnsafe(`
    SELECT * FROM coaching_tasks
    WHERE user_id = $1 AND status IN ('ASSIGNED', 'IN_PROGRESS')
    ORDER BY priority DESC, created_at DESC LIMIT 1
  `, userId);
  return r && r.length > 0 ? r[0] : null;
}

/** Mede progresso do colaborador na tarefa atual */
async function measureProgress(userId, task) {
  if (!task) return { progress: 0, today: 0, total: 0 };

  if (task.focus_area === 'inventory_negative' || task.focus_area?.startsWith('inventory_')) {
    // Conta itens conferidos hoje pelas inventory_session_items
    const r = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT i.product_id)::int AS today
      FROM inventory_session_items i
      JOIN inventory_sessions s ON s.id = i.session_id
      WHERE s.started_by = (SELECT email FROM users WHERE id = $1)
        AND i.created_at::date = CURRENT_DATE
    `, userId);
    return { today: r[0]?.today || 0, goal: task.daily_goal };
  }

  return { today: 0, goal: task.daily_goal || 0 };
}

/** Classifica resposta do colaborador via Ollama */
async function classifyResponse(messageText, taskContext) {
  const prompt = `Você é o supervisor de um colaborador chamado Anderson, estoquista da JR Auto Parts.
A tarefa atual dele é: "${taskContext?.title || 'Conferência de Estoque'}".

Classifique a mensagem do colaborador em UMA dessas categorias (apenas a palavra-chave):

- on_track: respondeu sobre o trabalho, fez pergunta válida, atualização de progresso
- on_break: pausa legítima (almoço, banheiro, café, alguma necessidade)
- off_topic: assunto totalmente fora do trabalho (futebol, política, fofoca, qualquer coisa não relacionada à tarefa)
- complaint: reclamação INTERNA válida (falta de iluminação, equipamento quebrado, dificuldade real)
- aggressive: tom agressivo, palavrão, desrespeito, recusa em fazer trabalho

REGRAS IMPORTANTES:
- Conversa sobre clima, esporte, política, religião, fofocas, brincadeiras = off_topic
- Resposta com palavrão, ironia, recusa = aggressive
- "tô parando pra almoçar", "vou no banheiro" = on_break
- "como faço X?", "achei produto Y", "terminei N produtos" = on_track
- "o leitor não funciona", "tá faltando luz aqui" = complaint

MENSAGEM DO COLABORADOR: "${messageText}"

Responda APENAS um JSON: {"classification": "<categoria>", "reasoning": "<motivo curto>"}`;

  try {
    const r = await ia.generate(prompt, { temperature: 0.2, maxTokens: 150, timeout: 45000 });
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return { classification: 'on_track', reasoning: 'falha classificação' };
    return JSON.parse(m[0]);
  } catch (e) {
    return { classification: 'on_track', reasoning: 'erro: ' + e.message };
  }
}

/** Gera resposta contextualizada da IA pro colaborador */
async function generateAIReply(messageText, employee, task, classification) {
  // Respostas pré-definidas pra casos comuns (mais rápido que IA)
  if (classification === 'on_break') {
    const replies = [
      'Tranquilo, volta quando puder! 👍',
      'Beleza, te aguardo!',
      'Pode pausar sim. Quando voltar a gente continua.',
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (classification === 'aggressive') {
    return null; // não responde — só reporta
  }

  if (classification === 'off_topic') {
    return `${employee.name?.split(' ')[0] || ''}, vamos focar no trabalho? Sua meta hoje é ${task?.daily_goal || '?'} produtos conferidos. Como tá indo?`;
  }

  // Para on_track e complaint, gera resposta natural
  const prompt = `Você é assistente IA do estoquista ${employee.name}, da JR Auto Parts.
Tarefa atual: "${task?.title || 'Conferência'}".
Meta diária: ${task?.daily_goal || '?'} produtos.

Responda a mensagem do colaborador em até 2 frases, tom amigável e profissional, em português brasileiro.
Se for dúvida operacional sobre conferência, ajude.
Se for reclamação válida, mostre que vai reportar pro Junior.

Mensagem: "${messageText}"

Responda APENAS o texto da mensagem, sem JSON, sem aspas.`;

  try {
    const r = await ia.generate(prompt, { temperature: 0.7, maxTokens: 200, timeout: 30000 });
    return r.text.trim().slice(0, 500);
  } catch (e) {
    return `Recebi! Vou te acompanhar. Qualquer coisa, manda mensagem.`;
  }
}

/** Reporta evento ao Junior via WhatsApp pessoal */
async function reportToJunior(employee, classification, message, reasoning) {
  const sevEmoji = {
    aggressive: '🚨🚨',
    off_topic: '⚠️',
    complaint: '📢',
  }[classification] || 'ℹ️';

  const text = `${sevEmoji} *Coaching IA — Anderson*\n\n` +
    `👤 ${employee.name}\n` +
    `📂 Categoria: *${classification}*\n` +
    `💭 Mensagem: "${message.slice(0, 300)}"\n\n` +
    `🤖 Análise IA: ${reasoning}\n\n` +
    `Painel: https://app.jrautopartsmt.com.br/coaching`;

  try {
    await router.notifyJunior(text, classification === 'aggressive' ? 'critical' : 'warning');
  } catch (e) {
    console.log('[coaching] notifyJunior err:', e.message);
  }
}

/** Processa mensagem recebida do colaborador no jr-rh-bot */
async function handleEmployeeMessage({ phone, contactName, messageContent }) {
  const employee = await findEmployeeByPhone(phone);
  if (!employee) return null;  // Não é colaborador conhecido

  const task = await getActiveTask(employee.id);
  const classified = await classifyResponse(messageContent, task);
  const cls = classified.classification || 'on_track';

  // Gera resposta apropriada
  const aiReply = await generateAIReply(messageContent, employee, task, cls);
  if (aiReply) {
    try {
      await sendToEmployee(phone, aiReply);
    } catch (e) {
      console.log('[coaching] reply send err:', e.message);
    }
  }

  // Reporta pro Junior se for desvio
  const isDeviation = ['off_topic', 'aggressive', 'complaint'].includes(cls);
  if (isDeviation) {
    await reportToJunior(employee, cls, messageContent, classified.reasoning);
  }

  // Registra check-in
  await prisma.$executeRawUnsafe(`
    INSERT INTO coaching_check_ins (
      user_id, task_id, check_type, ai_message, user_message,
      classification, ai_confidence, ai_reasoning, reported_to_junior
    ) VALUES ($1, $2, 'response', $3, $4, $5, $6, $7, $8)
  `,
    employee.id, task?.id || null, aiReply || null, messageContent.slice(0, 1000),
    cls, classified.confidence || 0.8, classified.reasoning || null, isDeviation
  );

  return { classified: cls, replied: !!aiReply, reported: isDeviation };
}

/** Cron — manda check-in proativo aos colaboradores ativos */
async function runProactiveCheckIns() {
  const now = new Date();
  const hour = (now.getUTCHours() - 4 + 24) % 24;  // Cuiabá UTC-4
  // Só roda 8h-18h
  if (hour < 8 || hour > 18) return;

  // Pega colaboradores com tarefa ativa
  const employees = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.name, u.email, u.whatsapp_phone, ct.id AS task_id, ct.title, ct.daily_goal, ct.priority
    FROM users u
    JOIN coaching_tasks ct ON ct.user_id = u.id
    WHERE u.active = true
      AND u.whatsapp_phone IS NOT NULL
      AND ct.status IN ('ASSIGNED', 'IN_PROGRESS')
  `);

  for (const emp of employees) {
    // Verifica último check-in
    const last = await prisma.$queryRawUnsafe(`
      SELECT created_at FROM coaching_check_ins
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
    `, emp.id);
    const lastTime = last[0]?.created_at ? new Date(last[0].created_at) : null;
    const minSinceLast = lastTime ? (Date.now() - lastTime.getTime()) / 60000 : 999;

    // Não manda check-in se < 30 min do último
    if (minSinceLast < 30) continue;

    // Mede progresso
    const progress = await measureProgress(emp.id, { focus_area: 'inventory_', daily_goal: emp.daily_goal });
    const pct = emp.daily_goal ? Math.round((progress.today / emp.daily_goal) * 100) : 0;

    let message;
    if (progress.today === 0 && minSinceLast > 60) {
      // Nada feito + 1h sem mensagem
      message = `${emp.name?.split(' ')[0]}, tudo bem? Vi que ainda não conferiu nenhum produto hoje. Tá tendo alguma dificuldade? Posso ajudar?`;
    } else if (pct >= 100) {
      // Bateu a meta
      message = `🎯 ${emp.name?.split(' ')[0]}, parabéns! Você bateu a meta de ${emp.daily_goal} produtos hoje! 🚀\n\nPode fechar o dia tranquilo (a menos que queira continuar).`;
    } else if (pct >= 50) {
      message = `${emp.name?.split(' ')[0]}, ${progress.today}/${emp.daily_goal} produtos! Tá no ritmo (${pct}%). Continua firme!`;
    } else if (minSinceLast > 60) {
      message = `Olá ${emp.name?.split(' ')[0]}! Você conferiu ${progress.today} produtos. Meta hoje: ${emp.daily_goal}. Como tá indo?`;
    } else {
      continue; // não manda
    }

    try {
      await sendToEmployee(emp.whatsapp_phone, message);
      await prisma.$executeRawUnsafe(`
        INSERT INTO coaching_check_ins (user_id, task_id, check_type, ai_message, progress_data)
        VALUES ($1, $2, 'proactive', $3, $4)
      `, emp.id, emp.task_id, message, JSON.stringify(progress));
      console.log('[coaching] check-in enviado pra', emp.name);
    } catch (e) {
      console.log('[coaching] err send:', e.message);
    }
  }
}

let cronStarted = false;
function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(() => runProactiveCheckIns().catch(e => console.error('[coaching cron]', e.message)), 30 * 60 * 1000);
  console.log('[coaching] cron iniciado (a cada 30min, 8h-18h Cuiabá)');
}

/** Mensagem de boas-vindas pra novo colaborador */
async function sendWelcome(userId, customMessage) {
  const u = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = $1`, userId);
  if (!u || !u.length || !u[0].whatsapp_phone) throw new Error('Colaborador sem WhatsApp');
  const user = u[0];
  const task = await getActiveTask(userId);

  const text = customMessage || `Olá ${user.name?.split(' ')[0]}! 👋

Sou o assistente IA da *JR Auto Parts*. A partir de hoje vou te ajudar no controle do estoque.

🎯 *Sua tarefa:*
${task?.title || 'Aguardando atribuição'}

📊 *Meta hoje:* ${task?.daily_goal || '?'} produtos conferidos

🌐 *Acesse o sistema:*
https://app.jrautopartsmt.com.br
📧 ${user.email}

Vai em *📋 Conferência Estoque* — pode bipar código de barras ou digitar nome.

💬 *Manda mensagem aqui se:*
- Tiver dúvida operacional
- Algum equipamento não funcionar
- Quiser pausar pra almoço
- Bateu a meta

Vou te acompanhar durante o expediente. Foco e bons resultados! 💪

_Junior tá no controle, qualquer coisa fora do foco ele é avisado._`;

  await sendToEmployee(user.whatsapp_phone, text);

  await prisma.$executeRawUnsafe(`
    INSERT INTO coaching_check_ins (user_id, task_id, check_type, ai_message)
    VALUES ($1, $2, 'proactive', $3)
  `, userId, task?.id || null, text);

  return { sent: true, to: user.whatsapp_phone };
}

module.exports = {
  findEmployeeByPhone,
  getActiveTask,
  measureProgress,
  classifyResponse,
  generateAIReply,
  reportToJunior,
  handleEmployeeMessage,
  runProactiveCheckIns,
  startCron,
  sendWelcome,
};
