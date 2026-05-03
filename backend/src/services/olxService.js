// src/services/olxService.js - integração com OLX (autoupload + webhooks + chat)
const axios = require('axios');
const prisma = require('../lib/prisma');

const OLX_BASE_URL = process.env.OLX_BASE_URL || 'https://apps.olx.com.br';
const OLX_CLIENT_ID = process.env.OLX_CLIENT_ID || '';
const OLX_CLIENT_SECRET = process.env.OLX_CLIENT_SECRET || '';
const OLX_ACCESS_TOKEN = process.env.OLX_ACCESS_TOKEN || ''; // gerado via OAuth

let cachedToken = { token: null, expiresAt: 0 };

function isConfigured() {
  return !!(OLX_CLIENT_ID && OLX_CLIENT_SECRET) || !!OLX_ACCESS_TOKEN;
}

async function getAccessToken() {
  // Se temos token estático no env, usa ele
  if (OLX_ACCESS_TOKEN) return OLX_ACCESS_TOKEN;
  // Senão, faz OAuth client_credentials (requer credenciais)
  if (!OLX_CLIENT_ID || !OLX_CLIENT_SECRET) {
    throw new Error('OLX nao configurado: OLX_CLIENT_ID/OLX_CLIENT_SECRET ausentes.');
  }
  if (cachedToken.token && cachedToken.expiresAt - 30_000 > Date.now()) {
    return cachedToken.token;
  }
  const { data } = await axios.post(
    `${OLX_BASE_URL}/oauth/token`,
    {
      grant_type: 'client_credentials',
      client_id: OLX_CLIENT_ID,
      client_secret: OLX_CLIENT_SECRET,
      scope: 'autoupload',
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
  };
  return cachedToken.token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Importa (cria/edita) um anúncio na OLX via autoupload. */
async function importAd(adPayload) {
  if (!isConfigured()) throw new Error('OLX nao configurado');
  const token = await getAccessToken();
  const url = `${OLX_BASE_URL}/autoupload/import/${token}`;
  const body = { ad: [adPayload] };
  const { data } = await axios.post(url, body, { headers: authHeaders(token), timeout: 30000 });
  return data;
}

/** Remove um anúncio (mesmo endpoint, op="delete"). */
async function deleteAd(adId) {
  if (!isConfigured()) throw new Error('OLX nao configurado');
  const token = await getAccessToken();
  const url = `${OLX_BASE_URL}/autoupload/import/${token}`;
  const body = { ad: [{ id: adId, operation: 'delete' }] };
  const { data } = await axios.post(url, body, { headers: authHeaders(token), timeout: 30000 });
  return data;
}

/** Lista anúncios publicados na conta. */
async function listPublished({ limit = 50, offset = 0 } = {}) {
  if (!isConfigured()) throw new Error('OLX nao configurado');
  const token = await getAccessToken();
  const url = `${OLX_BASE_URL}/oauth/api/published_ads`;
  const { data } = await axios.get(url, {
    headers: authHeaders(token),
    params: { limit, offset },
    timeout: 20000,
  });
  return data;
}

/** Renova um anúncio (sobe de novo na lista). */
async function renewAd(adId) {
  if (!isConfigured()) throw new Error('OLX nao configurado');
  const token = await getAccessToken();
  const url = `${OLX_BASE_URL}/oauth/api/ads/${adId}/renew`;
  const { data } = await axios.post(url, {}, { headers: authHeaders(token), timeout: 20000 });
  return data;
}

/** Mapeia Product (Prisma) → payload OLX. */
function productToOlxPayload(product, opts = {}) {
  return {
    id: opts.adId || `JR-${product.id}`,
    operation: 'insert',
    title: product.name?.slice(0, 100) || 'Auto peça',
    body: product.description || `${product.name} - JR Auto Parts.`,
    price: Number(product.price || 0),
    category: opts.olxCategory || 6010, // 6010 = Auto Peças e Acessórios (subcategoria)
    images: (product.imageUrls || []).slice(0, 8).map(url => ({ url })),
    seller: {
      name: 'JR Auto Parts',
      phone: process.env.OLX_SELLER_PHONE || '5565992812000',
      email: process.env.OLX_SELLER_EMAIL || 'jrautoparts@jrautopartsonline.com',
    },
    location: {
      city: 'Cuiabá',
      state: 'MT',
    },
  };
}

module.exports = {
  isConfigured,
  importAd,
  deleteAd,
  listPublished,
  renewAd,
  productToOlxPayload,
};
