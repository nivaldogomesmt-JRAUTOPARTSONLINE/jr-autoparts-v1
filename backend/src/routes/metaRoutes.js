// src/routes/metaRoutes.js — Endpoints Meta WhatsApp Catalog + Cloud API
//
// Sob /api/meta/...
//   POST /api/meta/catalog/sync-all       — sincroniza todos os produtos ativos
//   POST /api/meta/catalog/sync-incremental — sincroniza so modificados nas ultimas 2h
//   GET  /api/meta/catalog/status         — quantos produtos no catalogo Meta vs local
//   GET  /api/meta/catalog/list           — lista produtos no catalogo Meta
//   DELETE /api/meta/catalog/:productId   — remove 1 produto do catalogo Meta
//   POST /api/meta/whatsapp/send-product  — envia card de produto na conversa
//   POST /api/meta/whatsapp/send-list     — envia lista de produtos na conversa
//   POST /api/meta/whatsapp/send-text     — envia texto simples (uso interno/teste)

const express = require('express');
const router = express.Router();
const catalog = require('../services/metaCatalogService');
const wa = require('../services/metaWhatsappService');
const prisma = require('../lib/prisma');

// ─── CATALOGO ─────────────────────────────────────────────────────────────────

router.post('/catalog/sync-all', async (req, res) => {
  try {
    const r = await catalog.syncAll();
    res.json({ ok: true, summary: r });
  } catch (e) {
    console.log('[meta-routes] sync-all err:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/catalog/sync-incremental', async (req, res) => {
  try {
    const hoursBack = Number(req.body?.hours) || 2;
    const r = await catalog.syncIncremental(hoursBack);
    res.json({ ok: true, summary: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/catalog/status', async (req, res) => {
  try {
    const [localTotal, metaProds] = await Promise.all([
      prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS t FROM products WHERE active = true'),
      catalog.listMetaProducts(100).catch(() => []),
    ]);
    res.json({
      ok: true,
      local_active: localTotal[0]?.t || 0,
      meta_total_listed_first_5000: metaProds.length,
      meta_sample: metaProds.slice(0, 5).map((p) => ({ retailer_id: p.retailer_id, name: p.name })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/catalog/list', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const items = await catalog.listMetaProducts(limit);
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete('/catalog/:productId', async (req, res) => {
  try {
    const r = await catalog.removeProduct(req.params.productId);
    res.json({ ok: true, result: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── WHATSAPP CLOUD API ────────────────────────────────────────────────────────

router.post('/whatsapp/send-product', async (req, res) => {
  try {
    const { to, productId, body, footer } = req.body || {};
    if (!to || !productId) return res.status(400).json({ ok: false, error: 'to e productId obrigatorios' });
    const r = await wa.sendProductCard({ to, productId, body, footer });
    res.json({ ok: true, result: r });
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    res.status(500).json({ ok: false, error: detail });
  }
});

router.post('/whatsapp/send-list', async (req, res) => {
  try {
    const { to, headerText, bodyText, footerText, sections } = req.body || {};
    if (!to || !sections?.length) return res.status(400).json({ ok: false, error: 'to e sections obrigatorios' });
    const r = await wa.sendProductList({ to, headerText, bodyText, footerText, sections });
    res.json({ ok: true, result: r });
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    res.status(500).json({ ok: false, error: detail });
  }
});

router.post('/whatsapp/send-text', async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ ok: false, error: 'to e text obrigatorios' });
    const r = await wa.sendText({ to, text });
    res.json({ ok: true, result: r });
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    res.status(500).json({ ok: false, error: detail });
  }
});

module.exports = router;
