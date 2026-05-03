// src/services/metaWhatsappService.js — Envia mensagens via WhatsApp Cloud API (Meta direto).
//
// IMPORTANTE: nao substitui BotConversa. Funcao adicional pra envio de produtos do catalogo.
// BotConversa continua cuidando de cobranca e atendimento texto.

const axios = require('axios');
const { retailerIdFor } = require('./metaCatalogService');

const META_API = process.env.META_API_BASE || 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN || '';
const PHONE_ID = process.env.META_PHONE_NUMBER_ID || '';
const CATALOG_ID = process.env.META_CATALOG_ID || '';

function normalizePhone(phone) {
  // Remove tudo que nao for digito. Garante DDI 55 se for BR.
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 11 || p.length === 10) p = '55' + p;
  return p;
}

/** Envia 1 produto (card) na conversa do cliente. */
async function sendProductCard({ to, productId, body = '', footer = '' }) {
  if (!TOKEN || !PHONE_ID || !CATALOG_ID) {
    throw new Error('META_ACCESS_TOKEN/PHONE_NUMBER_ID/CATALOG_ID nao configurados');
  }
  if (!to || !productId) throw new Error('to e productId obrigatorios');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'interactive',
    interactive: {
      type: 'product',
      ...(body ? { body: { text: body.substring(0, 1024) } } : {}),
      ...(footer ? { footer: { text: footer.substring(0, 60) } } : {}),
      action: {
        catalog_id: CATALOG_ID,
        product_retailer_id: retailerIdFor(productId),
      },
    },
  };

  const r = await axios.post(
    `${META_API}/${PHONE_ID}/messages`,
    payload,
    {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    }
  );
  return r.data;
}

/** Envia uma LISTA de produtos (sections) — ate 30 itens em ate 10 sections. */
async function sendProductList({ to, headerText, bodyText, footerText = '', sections }) {
  if (!TOKEN || !PHONE_ID || !CATALOG_ID) {
    throw new Error('META credenciais nao configuradas');
  }
  if (!to || !sections?.length) throw new Error('to e sections obrigatorios');

  // sections: [{ title: 'Filtros', product_items: [{ product_retailer_id: 'JR-...' }, ...] }]
  // Aceita tambem sections com productIds: convertemos pra retailer_id automaticamente
  const cleanSections = sections.slice(0, 10).map((s) => ({
    title: (s.title || 'Produtos').substring(0, 24),
    product_items: (s.product_items || s.productIds || []).map((item) => {
      if (typeof item === 'string') return { product_retailer_id: retailerIdFor(item) };
      return { product_retailer_id: item.product_retailer_id || retailerIdFor(item.productId) };
    }).filter(Boolean).slice(0, 30),
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: (headerText || 'Catalogo').substring(0, 60) },
      body: { text: (bodyText || 'Veja nossos produtos:').substring(0, 1024) },
      ...(footerText ? { footer: { text: footerText.substring(0, 60) } } : {}),
      action: {
        catalog_id: CATALOG_ID,
        sections: cleanSections,
      },
    },
  };

  const r = await axios.post(
    `${META_API}/${PHONE_ID}/messages`,
    payload,
    {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    }
  );
  return r.data;
}

/** Envia mensagem de texto simples (util pra testes / acompanhamento). */
async function sendText({ to, text }) {
  if (!TOKEN || !PHONE_ID) throw new Error('META credenciais nao configuradas');
  const r = await axios.post(
    `${META_API}/${PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: String(text).substring(0, 4096) },
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );
  return r.data;
}

module.exports = {
  normalizePhone,
  sendProductCard,
  sendProductList,
  sendText,
};
