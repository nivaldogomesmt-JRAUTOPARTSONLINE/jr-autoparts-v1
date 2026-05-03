// src/services/financeiroService.js - agrega dados de Efí + Cobranças + OS
const axios = require('axios');
const prisma = require('../lib/prisma');

const COBRANCA_URL = process.env.COBRANCA_WEBHOOK_URL || 'http://jr-rastrek-webhook:3000';
const COBRANCA_SECRET = process.env.COBRANCA_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

async function listarCobrancasAtivas() {
  try {
    const { data } = await axios.get(`${COBRANCA_URL}/api/cobranca/listar`, {
      headers: { 'X-Webhook-Secret': COBRANCA_SECRET },
      timeout: 10000,
    });
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function overview() {
  const [cobs, osStats] = await Promise.all([
    listarCobrancasAtivas(),
    prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','DONE'))::int AS os_abertas,
        COUNT(*) FILTER (WHERE status = 'DONE')::int AS os_concluidas,
        COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS os_entregues,
        COALESCE(SUM(total_price) FILTER (WHERE status NOT IN ('DELIVERED','DONE','QUOTE')), 0) AS valor_os_aberto,
        COALESCE(SUM(total_price) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS valor_os_30d
      FROM service_orders
    `).catch(() => [{}]),
  ]);

  const stats = osStats[0] || {};

  // Cobranças por status
  const totaisCobranca = { pendente: 0, enviada: 0, lida: 0, respondida: 0, paga: 0, negociada: 0 };
  const valorCobranca = { pendente: 0, enviada: 0, lida: 0, respondida: 0, paga: 0, negociada: 0 };
  const hoje = new Date();
  let atrasadasQtde = 0, atrasadasValor = 0;
  for (const c of cobs) {
    const k = (c.status || '').toLowerCase();
    if (k in totaisCobranca) { totaisCobranca[k]++; valorCobranca[k] += Number(c.valor || 0); }
    if (c.vencimento && c.status !== 'PAGA' && c.status !== 'CANCELADA') {
      const m = c.vencimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const venc = new Date(`${m[3]}-${m[2]}-${m[1]}`);
        if (venc < hoje) { atrasadasQtde++; atrasadasValor += Number(c.valor || 0); }
      }
    }
  }

  // Top 5 clientes em aberto
  const clientesMap = new Map();
  for (const c of cobs) {
    if (c.status === 'PAGA' || c.status === 'CANCELADA') continue;
    const k = c.cliente || '?';
    const e = clientesMap.get(k) || { cliente: k, telefone: c.telefone_limpo, qtde: 0, valor: 0 };
    e.qtde += 1; e.valor += Number(c.valor || 0);
    clientesMap.set(k, e);
  }
  const topClientes = Array.from(clientesMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 10);

  // Recebido no mes (cobranças PAGAS)
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const pagasMes = cobs.filter(c => c.status === 'PAGA' && c.pago_em && c.pago_em.slice(0, 10) >= inicioMes);
  const valorRecebidoMes = pagasMes.reduce((s, c) => s + Number(c.valor || 0), 0);

  return {
    timestamp: new Date().toISOString(),
    cobrancas: {
      por_status: totaisCobranca,
      valor_por_status: valorCobranca,
      total_em_aberto: cobs.filter(c => !['PAGA','CANCELADA'].includes(c.status)).reduce((s,c)=>s+Number(c.valor||0),0),
      atrasadas_qtde: atrasadasQtde,
      atrasadas_valor: atrasadasValor,
      recebido_mes: valorRecebidoMes,
      qtde_pago_mes: pagasMes.length,
    },
    os: {
      abertas: stats.os_abertas || 0,
      concluidas: stats.os_concluidas || 0,
      entregues: stats.os_entregues || 0,
      valor_aberto: Number(stats.valor_os_aberto || 0),
      valor_30d: Number(stats.valor_os_30d || 0),
    },
    top_clientes: topClientes,
  };
}

module.exports = { overview, listarCobrancasAtivas };
