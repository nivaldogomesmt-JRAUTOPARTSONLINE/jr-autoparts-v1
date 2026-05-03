// src/services/filterService.js — busca de filtros automotivos
const prisma = require('../lib/prisma');

function normalize(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Aliases comuns: marca informada pelo cliente → marca no catálogo Wega
const BRAND_ALIASES = {
  'chevrolet': 'general motors', 'chevy': 'general motors', 'gm': 'general motors',
  'vw': 'volkswagen', 'mb': 'mercedes benz', 'mercedes': 'mercedes benz',
  'benz': 'mercedes benz', 'merc': 'mercedes benz',
  'hyundai': 'hyundai', 'kia': 'kia', 'fiat': 'fiat', 'ford': 'ford',
  'toyota': 'toyota', 'honda': 'honda', 'nissan': 'nissan', 'renault': 'renault',
  'peugeot': 'peugeot', 'citroen': 'citröen', 'audi': 'audi', 'bmw': 'bmw',
  'volvo': 'volvo', 'mitsu': 'mitsubishi', 'subaru': 'subaru', 'jeep': 'jeep',
};
function expandToken(tok) {
  const n = normalize(tok);
  return BRAND_ALIASES[n] || n;
}

// Compara ano do catálogo (ex "2012 ‐‐>", "95 ‐‐ 98") com ano alvo
function yearMatches(yearStr, targetYear) {
  if (!yearStr || !targetYear) return true;
  const t = parseInt(targetYear);
  if (isNaN(t)) return true;
  const s = String(yearStr).trim();
  // "2012 ‐‐>" → de 2012 em diante
  const fromMatch = s.match(/(\d{2,4})\s*[‐\-]+\s*>/);
  if (fromMatch) {
    let y = parseInt(fromMatch[1]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return t >= y;
  }
  // "95 ‐‐ 98" / "1996 ‐‐ 2000" → range
  const rangeMatch = s.match(/(\d{2,4})\s*[‐\-]{1,3}\s*(\d{2,4})/);
  if (rangeMatch) {
    let from = parseInt(rangeMatch[1]);
    let to = parseInt(rangeMatch[2]);
    if (from < 100) from += from > 50 ? 1900 : 2000;
    if (to < 100) to += to > 50 ? 1900 : 2000;
    return t >= from && t <= to;
  }
  // Ano único
  const single = s.match(/\b(\d{4})\b/);
  if (single) return t === parseInt(single[1]);
  return false;
}

// Busca por tokens livres (cada token aparece em montadora OU modelo OU classificacao)
// Aplica BRAND_ALIASES e filtra ano via range matching em JS (não SQL)
async function lookupByVehicle({ tokens, ano }) {
  const params = [];
  const conds = [];
  let i = 1;

  (tokens || []).filter(Boolean).forEach(tok => {
    const expanded = expandToken(tok);
    if (expanded.length < 2) return;
    conds.push(`(norm_montadora ILIKE $${i} OR norm_modelo ILIKE $${i} OR LOWER(classificacao) ILIKE $${i})`);
    params.push(`%${expanded}%`);
    i++;
  });

  if (!conds.length) return [];
  const where = conds.join(' AND ');
  const sql = `
    SELECT id, source, montadora, modelo, classificacao, ano,
      filtro_ar, filtro_oleo, filtro_combustivel,
      filtro_cabine, posicao_cabine,
      filtro_ar_secundario, filtro_separador,
      filtro_hidraulico, filtro_arla, pagina
    FROM filter_catalog WHERE ${where}
    ORDER BY montadora, modelo, classificacao
    LIMIT 100
  `;
  let rows = await prisma.$queryRawUnsafe(sql, ...params);
  if (ano) {
    rows = rows.filter(r => yearMatches(r.ano, ano));
  }
  return rows.slice(0, 30);
}

// Busca por código de filtro (FAP5303, WO170, etc) — aceita variações com/sem hífen
async function lookupByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c || c.length < 3) return [];
  const cNorm = c.replace(/[\-_\s]/g, '');
  const cols = ['filtro_ar', 'filtro_oleo', 'filtro_oleo_opt', 'filtro_combustivel', 'filtro_combustivel_opt',
                'filtro_cabine', 'filtro_cabine_carvao', 'filtro_ar_secundario', 'filtro_separador',
                'filtro_hidraulico', 'filtro_arla'];
  const conds = cols.map(col =>
    `(UPPER(${col}) = $1 OR REPLACE(REPLACE(UPPER(${col}), '-', ''), ' ', '') = $2)`
  ).join(' OR ');
  const sql = `
    SELECT id, source, montadora, modelo, classificacao, ano,
      filtro_ar, filtro_oleo, filtro_combustivel,
      filtro_cabine, posicao_cabine, pagina
    FROM filter_catalog WHERE ${conds}
    ORDER BY montadora, modelo LIMIT 50
  `;
  return prisma.$queryRawUnsafe(sql, c, cNorm);
}

// Cross-reference: busca código em qualquer marca e retorna todas equivalências
// Aceita variações: "WO-120", "WO 120", "wo120" — todas batem com o mesmo registro
async function lookupCrossRef(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c || c.length < 3) return [];
  const cNorm = c.replace(/[\-_\s]/g, ''); // remove separadores
  const cols = ['authomix','wega','tecfil','mahle','mann','mann_old','fram','bosch','vox','delphi','wix','fleetguard'];
  const conds = cols.map(col =>
    `(UPPER(${col}) = $1 OR REPLACE(REPLACE(UPPER(${col}), '-', ''), ' ', '') = $2)`
  ).join(' OR ');
  const sql = `SELECT * FROM filter_cross_ref WHERE ${conds} LIMIT 20`;
  return prisma.$queryRawUnsafe(sql, c, cNorm);
}

// Formata cross-ref pro WhatsApp
function formatCrossRefForWhatsApp(rows, query) {
  if (!rows || !rows.length) return null;
  const labels = {
    wega: '🟢 Wega', tecfil: '🔵 Tecfil', mahle: '🟡 Mahle', mann: '⚪ Mann',
    mann_old: '⚫ Mann (antigo)', fram: '🟠 Fram', bosch: '🔴 Bosch',
    vox: '🟣 Vox', authomix: '🟤 Authomix', delphi: '🩵 Delphi',
    wix: '🩶 Wix', fleetguard: '🩷 Fleetguard',
  };
  // Consolida: pega só os códigos que aparecem em qualquer linha
  const consolidated = {};
  rows.forEach(r => {
    Object.keys(labels).forEach(k => {
      if (r[k] && !consolidated[k]) consolidated[k] = new Set();
      if (r[k]) consolidated[k].add(r[k]);
    });
  });
  let msg = `🔄 *Equivalentes para ${query}:*\n\n`;
  Object.keys(labels).forEach(k => {
    if (consolidated[k] && consolidated[k].size) {
      const codes = [...consolidated[k]].join(', ');
      msg += `${labels[k]}: \`${codes}\`\n`;
    }
  });
  msg += `\n_Fonte: catálogos MANN-FILTER + Authomix._`;
  return msg.trim();
}

// Retorna posição de cabine pelo código de filtro de cabine (busca aplicação que usa, pega letra)
async function findCabinPosition(filterCode) {
  const c = String(filterCode || '').trim().toUpperCase();
  if (!c) return null;
  const cNorm = c.replace(/[\-_\s]/g, '');
  const sql = `
    SELECT DISTINCT posicao_cabine, COUNT(*)::int as freq
    FROM filter_catalog
    WHERE ((UPPER(filtro_cabine) = $1 OR REPLACE(REPLACE(UPPER(filtro_cabine), '-', ''), ' ', '') = $2)
        OR (UPPER(filtro_cabine_carvao) = $1 OR REPLACE(REPLACE(UPPER(filtro_cabine_carvao), '-', ''), ' ', '') = $2))
      AND posicao_cabine IS NOT NULL AND posicao_cabine != ''
    GROUP BY posicao_cabine
    ORDER BY freq DESC LIMIT 5
  `;
  return prisma.$queryRawUnsafe(sql, c, cNorm);
}

// Formata resposta amigável pro WhatsApp
function formatResultsForWhatsApp(rows, query) {
  if (!rows || !rows.length) return `❌ Nenhum filtro encontrado para "${query}".`;

  if (rows.length > 8) {
    // Resumo: agrupa por montadora+modelo
    const groups = {};
    rows.forEach(r => {
      const k = `${r.montadora} ${r.modelo}`;
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    let msg = `🔍 *${rows.length} resultados para "${query}":*\n\n`;
    Object.keys(groups).slice(0, 6).forEach(k => {
      msg += `*${k}* (${groups[k].length} variações)\n`;
    });
    msg += `\n_Refine: "filtro onix 2018 1.4 flex"_`;
    return msg;
  }

  let msg = `🔍 *Filtros para "${query}":*\n\n`;
  rows.forEach((r, idx) => {
    msg += `${idx + 1}. *${r.montadora} ${r.modelo}*`;
    if (r.classificacao) msg += ` ${r.classificacao}`;
    if (r.ano) msg += ` ${r.ano}`;
    msg += '\n';
    if (r.filtro_ar) msg += `   🌬 Ar: \`${r.filtro_ar}\`\n`;
    if (r.filtro_oleo) msg += `   🛢 Óleo: \`${r.filtro_oleo}\`\n`;
    if (r.filtro_combustivel) msg += `   ⛽ Comb: \`${r.filtro_combustivel}\`\n`;
    if (r.filtro_cabine) {
      msg += `   🌡 Cabine: \`${r.filtro_cabine}\``;
      if (r.posicao_cabine) msg += ` (pos. *${r.posicao_cabine}*)`;
      msg += '\n';
    }
    if (r.filtro_ar_secundario) msg += `   🌬 Ar 2º: \`${r.filtro_ar_secundario}\`\n`;
    if (r.filtro_separador) msg += `   💧 Separador: \`${r.filtro_separador}\`\n`;
    if (r.filtro_hidraulico) msg += `   🛠 Hidráulico: \`${r.filtro_hidraulico}\`\n`;
    if (r.filtro_arla) msg += `   🟦 Arla: \`${r.filtro_arla}\`\n`;
    msg += '\n';
  });
  return msg.trim();
}

// Tenta detectar intenção da mensagem
function parseQuery(text) {
  let t = String(text || '').trim();
  if (!t) return null;
  // Normaliza só se mensagem é curta E não tem palavras de "filtro/peça/modelo de carro"
  // (pra não estragar "filtro onix 2018" → "filtro onix2018")
  if (t.length < 20 && !/\b(filtro|peca|peça|óleo|oleo|onix|hilux|corolla|civic|gol|palio|uno|fiesta|focus|kwid|s10|hb20|ka)\b/i.test(t)) {
    t = t.replace(/([A-Z]{1,6})[\s\-_]+(\d{2,6})/gi, '$1$2');
  }
  const lower = t.toLowerCase();

  // PRIMEIRO: posição cabine (antes de detectar código solto)
  if (/posi[çc][ãa]o|onde fica/i.test(t) && /cabine/i.test(t)) {
    const codeM = t.match(/\b([A-Z]{2,5}[\-]?\d{2,6}[A-Z]?)\b/i);
    if (codeM) return { type: 'cabin_position', code: codeM[1].toUpperCase() };
    return { type: 'cabin_help' };
  }

  // Regex de código: ≥2 letras com ≥2 dígitos (ex: PSL55), OU ≥1 letra com ≥3 dígitos (ex: W6100)
  // Evita falsos positivos como "M3" (1+1) e "X5" (1+1)
  const codeRegex = /\b([A-Z]{2,6}[\-\s]?\d{2,6}[A-Z]?|[A-Z][\-\s]?\d{3,6}[A-Z]?)\b/i;

  // Equivalente / cross-reference (palavras-chave + código)
  if (/equival|cross|altern|substitu|igual\s+ao/i.test(t)) {
    const codeM = t.match(codeRegex);
    if (codeM) return { type: 'crossref', code: codeM[1].replace(/[\s\-]/g, '').toUpperCase() };
  }

  // Código solto, msg curta sem palavras de "filtro"
  const codeMatch = t.match(codeRegex);
  if (codeMatch && t.length < 25 && !/filtro|peca|peça/i.test(t)) {
    return { type: 'code', value: codeMatch[1].replace(/[\s\-]/g, '').toUpperCase() };
  }

  // "filtro X Y Z" → busca por veículo
  if (lower.includes('filtro') || lower.includes('peca') || lower.includes('peça')) {
    const cleaned = lower.replace(/filtro|filtros|peca|peça|pecas|peças|do|da|dos|das|para|pra/gi, ' ').trim();
    const tokens = cleaned.split(/\s+/).filter(tk => tk.length >= 2 && tk !== 'de');
    if (tokens.length === 0) return null;
    const yearTok = tokens.find(tk => /^(19|20)\d{2}$/.test(tk));
    const others = tokens.filter(tk => tk !== yearTok);
    return {
      type: 'vehicle',
      tokens: others,
      ano: yearTok || null,
      raw: t,
    };
  }

  return null;
}

// Handler completo: recebe texto, devolve resposta formatada (ou null se não for consulta)
async function handleQuery(text) {
  // Antes de detectar filtro, testa se é consulta de óleo (knowledge base + LLM)
  try {
    const oilService = require('./oilService');
    if (oilService.isOilQuery(text)) {
      const oilReply = await oilService.handleQuery(text);
      if (oilReply) return oilReply;
    }
  } catch (e) { /* serviço não disponível, segue */ }

  const parsed = parseQuery(text);
  if (!parsed) return null;

  if (parsed.type === 'code') {
    // 1) Busca aplicações diretamente (caso o código seja Wega)
    let apps = await lookupByCode(parsed.value);

    // 2) Busca equivalências em todas as marcas
    const xref = await lookupCrossRef(parsed.value);

    // 3) Se não achou aplicações DIRETAS mas tem cross-ref → busca aplicações
    //    via cada código Wega das equivalências (lookup transitivo)
    if (!apps.length && xref.length) {
      const wegaCodes = new Set();
      xref.forEach(r => { if (r.wega) wegaCodes.add(r.wega); });
      for (const w of wegaCodes) {
        const a = await lookupByCode(w);
        a.forEach(x => apps.push(x));
      }
      // Dedup por id
      const seen = new Set();
      apps = apps.filter(x => seen.has(x.id) ? false : (seen.add(x.id), true));
    }

    // 4) Monta resposta combinada
    const parts = [];
    if (apps.length) {
      parts.push('🚗 *Carros compatíveis:*\n\n' + formatResultsForWhatsApp(apps, parsed.value).replace(/^🔍 \*Filtros para .*?\*[:\n]+/, '').replace(/^🔍 \*\d+ resultados.*?\*[:\n]+/, ''));
    }
    if (xref.length) {
      const xrefMsg = formatCrossRefForWhatsApp(xref, parsed.value);
      if (xrefMsg) parts.push(xrefMsg);
    }
    if (parts.length) return parts.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');

    return `❌ Código *${parsed.value}* não encontrado em nenhuma marca (Wega, Tecfil, Mahle, Mann, Fram, Bosch, Authomix, Vox, Delphi, Wix, Fleetguard).`;
  }

  if (parsed.type === 'crossref') {
    const xref = await lookupCrossRef(parsed.code);
    const xrefMsg = formatCrossRefForWhatsApp(xref, parsed.code);
    if (xrefMsg) return xrefMsg;
    return `❌ Sem equivalência cadastrada para *${parsed.code}*.\n\nMarcas conhecidas: Wega, Tecfil, Mahle, Mann, Fram, Bosch, Authomix, Vox, Delphi, Wix, Fleetguard.`;
  }

  if (parsed.type === 'vehicle') {
    const rows = await lookupByVehicle({ tokens: parsed.tokens, ano: parsed.ano });
    return formatResultsForWhatsApp(rows, parsed.raw);
  }

  if (parsed.type === 'cabin_position') {
    const positions = await findCabinPosition(parsed.code);
    if (!positions.length) return `❌ Filtro de cabine *${parsed.code}* não localizado.`;
    const top = positions[0];
    return `🌡 Filtro de cabine *${parsed.code}* fica na *posição ${top.posicao_cabine}* (${top.freq} aplicações encontradas).\n\n_Consulte o catálogo Wega Posições de Cabine pra ver onde a letra ${top.posicao_cabine} fica fisicamente no veículo._`;
  }

  if (parsed.type === 'cabin_help') {
    return `Pra consultar posição de cabine, mande o código do filtro. Ex: "posição cabine AKX35141"`;
  }

  return null;
}

module.exports = {
  lookupByVehicle, lookupByCode, lookupCrossRef, findCabinPosition,
  formatResultsForWhatsApp, formatCrossRefForWhatsApp,
  parseQuery, handleQuery,
};
