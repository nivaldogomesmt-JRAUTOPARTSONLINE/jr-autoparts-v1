// src/controllers/olxController.js
const prisma = require('../lib/prisma');
const olx = require('../services/olxService');

/** GET /api/olx/status - se está configurado e conectado */
async function status(req, res) {
  res.json({
    configured: olx.isConfigured(),
    callbackUrl: 'https://webhook.jrautopartsmt.com.br/api/olx/oauth/callback',
    webhookUrl: 'https://webhook.jrautopartsmt.com.br/api/olx/webhook',
    message: olx.isConfigured()
      ? 'OLX configurado e pronto pra publicar.'
      : 'Aguardando credenciais (client_id + client_secret) da OLX.',
  });
}

/** GET /api/olx/ads - lista anúncios do banco (vinculados a Product) */
async function listAds(req, res) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const ads = await prisma.olxAd.findMany({
      where,
      include: { product: { select: { id: true, name: true, price: true, photoUrl: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar anúncios.', detail: err.message });
  }
}

/** GET /api/olx/ads/:productId - detalhe de um anúncio por produto */
async function getAd(req, res) {
  try {
    const ad = await prisma.olxAd.findUnique({
      where: { productId: req.params.productId },
      include: { product: true },
    });
    if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado.' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar.', detail: err.message });
  }
}

/** POST /api/olx/ads/:productId/publish - publica/atualiza na OLX */
async function publishAd(req, res) {
  try {
    if (!olx.isConfigured()) {
      return res.status(503).json({ error: 'OLX ainda não configurado. Aguardando credenciais.' });
    }
    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    const existing = await prisma.olxAd.findUnique({ where: { productId: product.id } });
    const payload = olx.productToOlxPayload(product, { adId: existing?.olxAdId });
    const result = await olx.importAd(payload);

    const ad = await prisma.olxAd.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        olxAdId: payload.id,
        status: 'PENDING_MODERATION',
        title: payload.title,
        price: payload.price,
        lastPublishedAt: new Date(),
      },
      update: {
        olxAdId: payload.id,
        status: 'PENDING_MODERATION',
        title: payload.title,
        price: payload.price,
        lastPublishedAt: new Date(),
      },
    });
    res.json({ ok: true, ad, olxResponse: result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao publicar.', detail: err?.response?.data || err.message });
  }
}

/** DELETE /api/olx/ads/:productId - remove da OLX */
async function unpublishAd(req, res) {
  try {
    if (!olx.isConfigured()) {
      return res.status(503).json({ error: 'OLX ainda não configurado.' });
    }
    const ad = await prisma.olxAd.findUnique({ where: { productId: req.params.productId } });
    if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado.' });

    await olx.deleteAd(ad.olxAdId);
    await prisma.olxAd.update({
      where: { id: ad.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover.', detail: err.message });
  }
}

/** POST /api/olx/ads/:productId/renew - renova o anúncio */
async function renewAd(req, res) {
  try {
    if (!olx.isConfigured()) {
      return res.status(503).json({ error: 'OLX ainda não configurado.' });
    }
    const ad = await prisma.olxAd.findUnique({ where: { productId: req.params.productId } });
    if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado.' });

    const result = await olx.renewAd(ad.olxAdId);
    await prisma.olxAd.update({
      where: { id: ad.id },
      data: { lastRenewedAt: new Date() },
    });
    res.json({ ok: true, olxResponse: result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao renovar.', detail: err.message });
  }
}

/** GET /api/olx/leads - lista leads recebidos via webhook */
async function listLeads(req, res) {
  try {
    const leads = await prisma.olxLead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { ad: { include: { product: true } } },
    });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  status,
  listAds,
  getAd,
  publishAd,
  unpublishAd,
  renewAd,
  listLeads,
};
