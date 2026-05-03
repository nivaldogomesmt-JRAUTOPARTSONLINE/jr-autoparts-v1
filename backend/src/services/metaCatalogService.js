// src/services/metaCatalogService.js — Sincronizacao com Meta WhatsApp Catalog (Graph API)
//
// Mantem o catalogo Meta em dia com a tabela products do Postgres.
// Usa o endpoint batch (/{catalog_id}/batch) que aceita ate 5000 itens por chamada.
//
// Padrao de retailer_id: JR-<primeiros 8 chars do UUID> (ja estabelecido em sessao anterior)

const axios = require('axios');
const prisma = require('../lib/prisma');

const META_API = process.env.META_API_BASE || 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN || '';
const CATALOG_ID = process.env.META_CATALOG_ID || '';

const PUBLIC_PHOTOS_BASE = process.env.PUBLIC_PHOTOS_BASE || 'https://app.jrautopartsmt.com.br/api/products/foto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function retailerIdFor(productId) {
  if (!productId) return null;
  return 'JR-' + String(productId).substring(0, 8);
}

function priceToInteger(price) {
  // Meta espera preco em centavos (inteiro). Ex: R$ 45,00 -> 4500
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function availabilityFor(stock) {
  return Number(stock) > 0 ? 'in stock' : 'out of stock';
}

function imageUrlFor(product) {
  // Se photo_url ja eh URL completa, usa direto. Senao monta com PUBLIC_PHOTOS_BASE.
  const url = product.photo_url || product.photoUrl;
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Pode ser path tipo "uuid.jpg" — concatena
  const cleaned = url.startsWith('/') ? url : '/' + url;
  return PUBLIC_PHOTOS_BASE + cleaned;
}

function productToMetaPayload(product) {
  return {
    method: 'UPDATE',
    retailer_id: retailerIdFor(product.id),
    data: {
      availability: availabilityFor(product.stock),
      brand: 'JR Auto Parts',
      category: product.category || 'auto_parts',
      description: (product.description || product.name || '').substring(0, 9999),
      image_url: imageUrlFor(product),
      name: (product.name || '').substring(0, 199),
      price: priceToInteger(product.price),
      currency: 'BRL',
      condition: 'new',
      inventory: Number(product.stock) || 0,
    },
  };
}

// ─── Operacoes Graph API ──────────────────────────────────────────────────────

/** Lista produtos do catalogo Meta (paginado). Retorna [{id, retailer_id, name}]. */
async function listMetaProducts(limit = 100) {
  if (!TOKEN || !CATALOG_ID) throw new Error('META_ACCESS_TOKEN ou META_CATALOG_ID nao configurados');
  const all = [];
  let url = `${META_API}/${CATALOG_ID}/products?fields=id,retailer_id,name&limit=${limit}&access_token=${TOKEN}`;
  let pages = 0;
  while (url && pages < 50) {  // max 50 paginas (5000 produtos) por seguranca
    const r = await axios.get(url, { timeout: 30000 });
    const data = r.data?.data || [];
    all.push(...data);
    url = r.data?.paging?.next || null;
    pages++;
  }
  return all;
}

/** Sincroniza um lote de produtos (max 5000 por chamada Meta). */
async function syncBatch(products) {
  if (!products.length) return { sent: 0, results: [] };
  if (!TOKEN || !CATALOG_ID) throw new Error('META_ACCESS_TOKEN ou META_CATALOG_ID nao configurados');

  const requests = products.map(productToMetaPayload);

  // Filtra produtos sem foto (Meta exige image_url)
  const withImage = requests.filter((r) => r.data.image_url);
  const skipped = requests.length - withImage.length;

  if (!withImage.length) {
    return { sent: 0, skipped, error: 'todos sem image_url' };
  }

  const r = await axios.post(
    `${META_API}/${CATALOG_ID}/batch`,
    { requests: withImage, allow_upsert: true },
    {
      params: { access_token: TOKEN },
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    }
  );

  return {
    sent: withImage.length,
    skipped,
    handles: r.data?.handles || [],
    validation_status: r.data?.validation_status,
  };
}

/** Remove um produto do catalogo Meta pelo retailer_id. */
async function removeProduct(productId) {
  if (!TOKEN || !CATALOG_ID) throw new Error('META credenciais nao configuradas');
  const retailerId = retailerIdFor(productId);
  const r = await axios.post(
    `${META_API}/${CATALOG_ID}/batch`,
    {
      requests: [{ method: 'DELETE', retailer_id: retailerId }],
      allow_upsert: false,
    },
    {
      params: { access_token: TOKEN },
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return r.data;
}

/** Verifica status de um batch via handle (apos syncBatch). */
async function getBatchStatus(handle) {
  if (!TOKEN) throw new Error('META credenciais nao configuradas');
  const r = await axios.get(
    `${META_API}/${handle}?access_token=${TOKEN}`,
    { timeout: 15000 }
  );
  return r.data;
}

// ─── Sincronizacao completa ───────────────────────────────────────────────────

/** Pega produtos ATIVOS do Postgres. Aceita filtro de updated_at pra incremental. */
async function getLocalProducts(opts = {}) {
  const since = opts.since || null;
  let where = 'active = true';
  let params = [];
  if (since) {
    where += ' AND updated_at >= $1::timestamp';
    params.push(since);
  }
  const sql = `
    SELECT id, name, description, category, price, stock, photo_url, active, updated_at
    FROM products
    WHERE ${where}
    ORDER BY updated_at DESC
  `;
  return prisma.$queryRawUnsafe(sql, ...params);
}

/** Sincroniza TODOS os produtos ativos com o catalogo Meta.
 *  Quebra em lotes de 1000 pra ficar dentro dos limites e dar visibilidade.
 *  Retorna sumario.
 */
async function syncAll(opts = {}) {
  const t0 = Date.now();
  const since = opts.since || null;
  console.log(`[meta-catalog] sincronizacao iniciada${since ? ' (incremental desde ' + since + ')' : ' (completa)'}`);

  const local = await getLocalProducts({ since });
  console.log(`[meta-catalog] ${local.length} produtos locais a sincronizar`);

  const BATCH_SIZE = 1000;
  let totalSent = 0;
  let totalSkipped = 0;
  const errors = [];

  for (let i = 0; i < local.length; i += BATCH_SIZE) {
    const slice = local.slice(i, i + BATCH_SIZE);
    try {
      const r = await syncBatch(slice);
      totalSent += r.sent;
      totalSkipped += r.skipped || 0;
      console.log(`[meta-catalog] lote ${Math.floor(i / BATCH_SIZE) + 1}: enviados=${r.sent} skip=${r.skipped || 0}`);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message;
      errors.push({ batch_start: i, error: msg });
      console.log(`[meta-catalog] lote ${Math.floor(i / BATCH_SIZE) + 1} ERRO: ${msg}`);
    }
  }

  const elapsed = Date.now() - t0;
  const summary = {
    total_local: local.length,
    sent: totalSent,
    skipped_no_image: totalSkipped,
    errors: errors.length,
    error_details: errors,
    elapsed_ms: elapsed,
    since: since,
  };
  console.log(`[meta-catalog] concluido em ${(elapsed / 1000).toFixed(1)}s — enviados=${totalSent} skip=${totalSkipped} erros=${errors.length}`);
  return summary;
}

/** Sincronizacao incremental — pega produtos modificados nas ultimas X horas. */
async function syncIncremental(hoursBack = 2) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  return syncAll({ since });
}

module.exports = {
  // helpers expostos
  retailerIdFor,
  priceToInteger,
  productToMetaPayload,
  // operacoes
  listMetaProducts,
  syncBatch,
  removeProduct,
  getBatchStatus,
  // alto nivel
  getLocalProducts,
  syncAll,
  syncIncremental,
};
