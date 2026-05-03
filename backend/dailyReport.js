// /app/dailyReport.js — gera e envia resumo diário pro Junior pessoal
// Roda via cron 8h Cuiabá (12h UTC): docker exec jr-backend node /app/dailyReport.js
const axios = require('axios');
const prisma = require('/app/src/lib/prisma');

const EVO_URL = process.env.EVOLUTION_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const JUNIOR_PHONE = '5565993471331';

// Calcula janela "ontem 00:00 → 23:59" em timezone Cuiabá (UTC-4)
function ontemRange() {
  const agora = new Date();
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const ano = ontem.getUTCFullYear();
  const mes = String(ontem.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(ontem.getUTCDate()).padStart(2, '0');
  // 00:00 Cuiabá = 04:00 UTC; 23:59 Cuiabá = 03:59 UTC do dia seguinte
  const inicio = new Date(`${ano}-${mes}-${dia}T04:00:00Z`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fim, label: `${dia}/${mes}/${ano}` };
}

async function safeQuery(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.log(`[daily] ${label} falhou: ${e.message.split('\n')[0]}`);
    return null;
  }
}

(async () => {
  const { inicio, fim, label } = ontemRange();
  const inicioStr = inicio.toISOString();
  const fimStr = fim.toISOString();
  console.log(`[daily] coletando dados de ${inicioStr} até ${fimStr}`);

  // ===== Leads novos =====
  const leadsCount = await safeQuery('leads', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM leads
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });
  const leadsPorOrigem = await safeQuery('leads-origem', async () => {
    return prisma.$queryRawUnsafe(
      `SELECT COALESCE(source, 'desconhecido') AS source, COUNT(*)::int AS total
       FROM leads
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
       GROUP BY source ORDER BY total DESC`,
      inicioStr, fimStr
    );
  });

  // ===== OLX leads =====
  const olxLeads = await safeQuery('olx-leads', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM olx_leads
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });

  // ===== OS (service_orders) — enum SoStatus: QUOTE, APPROVED, STARTED, IN_PROGRESS, WAITING_PART, FINISHING, DONE, DELIVERED
  const osNovas = await safeQuery('os-novas', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM service_orders
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });
  const osPorStatus = await safeQuery('os-status', async () => {
    return prisma.$queryRawUnsafe(
      `SELECT status::text AS status, COUNT(*)::int AS total
       FROM service_orders
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
       GROUP BY status ORDER BY total DESC`,
      inicioStr, fimStr
    );
  });
  const osTotalAbertas = await safeQuery('os-abertas', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM service_orders
       WHERE status NOT IN ('DONE','DELIVERED')`
    );
    return r[0]?.total || 0;
  });

  // ===== Cobranças (whatsapp_messages com tipo cobrança) =====
  // schema: status enum [PENDING, SENT, FAILED, RECEIVED]; sem instance_name, sem from_me
  const cobrancasEnviadas = await safeQuery('cobrancas', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM whatsapp_messages
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
         AND status = 'SENT'
         AND (LOWER(content) LIKE '%boleto%'
           OR LOWER(content) LIKE '%vencimento%'
           OR LOWER(content) LIKE '%pix%'
           OR LOWER(content) LIKE '%pagamento%')`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });

  // ===== Coaching =====
  const coachingCheckins = await safeQuery('coaching-checkins', async () => {
    return prisma.$queryRawUnsafe(
      `SELECT classification, COUNT(*)::int AS total
       FROM coaching_check_ins
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
       GROUP BY classification ORDER BY total DESC`,
      inicioStr, fimStr
    );
  });
  const coachingPorColaborador = await safeQuery('coaching-colab', async () => {
    return prisma.$queryRawUnsafe(
      `SELECT u.name, COUNT(c.*)::int AS checkins,
              COUNT(CASE WHEN c.classification = 'on_track' THEN 1 END)::int AS on_track,
              COUNT(CASE WHEN c.classification = 'off_topic' THEN 1 END)::int AS off_topic
       FROM coaching_check_ins c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.created_at >= $1::timestamp AND c.created_at < $2::timestamp
       GROUP BY u.name ORDER BY checkins DESC`,
      inicioStr, fimStr
    );
  });

  // ===== Alertas pendentes =====
  const alertasPendentes = await safeQuery('alertas', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM internal_alerts WHERE delivered = false`
    );
    return r[0]?.total || 0;
  });

  // ===== Conferência de estoque =====
  const inventorySessoes = await safeQuery('inventory', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM inventory_sessions
       WHERE started_at >= $1::timestamp AND started_at < $2::timestamp`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });

  // ===== Personal messages =====
  const destacadasPessoal = await safeQuery('destaques', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM personal_messages
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
         AND highlighted = true`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });
  const totalPessoal = await safeQuery('total-pessoal', async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM personal_messages
       WHERE created_at >= $1::timestamp AND created_at < $2::timestamp`,
      inicioStr, fimStr
    );
    return r[0]?.total || 0;
  });

  // ===== Monta mensagem =====
  let msg = `☀️ *Bom dia! Resumo de ontem (${label})*\n\n`;

  // Leads
  msg += `🎯 *Leads novos:* ${leadsCount ?? '?'}\n`;
  if (leadsPorOrigem && leadsPorOrigem.length) {
    leadsPorOrigem.slice(0, 4).forEach(l => {
      msg += `   • ${l.source}: ${l.total}\n`;
    });
  }
  if (olxLeads) msg += `   • OLX: ${olxLeads}\n`;
  msg += '\n';

  // OS
  msg += `🔧 *Ordens de Serviço:*\n`;
  msg += `   • Em aberto agora: ${osTotalAbertas ?? '?'}\n`;
  msg += `   • Criadas ontem: ${osNovas ?? 0}\n`;
  if (osPorStatus && osPorStatus.length) {
    osPorStatus.forEach(s => {
      msg += `   • ${s.status}: ${s.total}\n`;
    });
  }
  msg += '\n';

  // Cobranças
  msg += `💰 *Cobranças enviadas:* ${cobrancasEnviadas ?? 0}\n\n`;

  // Coaching
  if (coachingCheckins && coachingCheckins.length) {
    const totalCheckins = coachingCheckins.reduce((a,c) => a + c.total, 0);
    msg += `👥 *Coaching ontem (${totalCheckins} check-ins):*\n`;
    coachingCheckins.forEach(c => {
      const emoji = c.classification === 'on_track' ? '✅'
                  : c.classification === 'off_topic' ? '⚠️'
                  : c.classification === 'aggressive' ? '🚨'
                  : '⏸';
      msg += `   ${emoji} ${c.classification}: ${c.total}\n`;
    });
    if (coachingPorColaborador && coachingPorColaborador.length) {
      msg += `\n   *Por colaborador:*\n`;
      coachingPorColaborador.slice(0, 5).forEach(p => {
        msg += `   • ${p.name || 'sem nome'}: ${p.checkins} (${p.on_track} ok, ${p.off_topic} desvios)\n`;
      });
    }
    msg += '\n';
  }

  // Estoque
  if (inventorySessoes) {
    msg += `📦 *Conferências de estoque:* ${inventorySessoes}\n\n`;
  }

  // Pessoal Junior
  if (totalPessoal) {
    msg += `📱 *Seu pessoal:* ${totalPessoal} mensagens`;
    if (destacadasPessoal) msg += ` (${destacadasPessoal} marcadas)`;
    msg += '\n\n';
  }

  // Alertas pendentes
  if (alertasPendentes) {
    msg += `⚠️ *Alertas pendentes:* ${alertasPendentes}\n\n`;
  }

  msg += `_Sistema saudável. Tenha um bom dia, sócio. 🚀_`;

  console.log('--- MENSAGEM ---');
  console.log(msg);
  console.log('--- FIM ---');

  // ===== Envia =====
  if (process.argv.includes('--dry-run')) {
    console.log('[daily] DRY RUN — não enviou');
    process.exit(0);
  }

  try {
    await axios.post(`${EVO_URL}/message/sendText/jr-rh-bot`,
      { number: JUNIOR_PHONE, text: msg },
      { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    console.log('[daily] enviado pro Junior');
  } catch (e) {
    console.log('[daily] erro envio:', e.message);
  }

  await prisma.$disconnect();
})();
