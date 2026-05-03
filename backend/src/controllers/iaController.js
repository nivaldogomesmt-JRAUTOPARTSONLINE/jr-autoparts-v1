const ia = require('../services/iaService');
const prisma = require('../lib/prisma');

async function loadProductData(req, channelDefault = '') {
  const { productId, name, description, price, category, brand, model } = req.body || {};
  let p = { name, description, price, category, brand, model };
  if (productId) {
    const prod = await prisma.product.findUnique({ where: { id: productId } });
    if (!prod) return { error: 'Produto não encontrado.' };
    p = {
      name: prod.name,
      description: prod.description,
      price: prod.price ? Number(prod.price) : null,
      category: prod.category,
    };
  }
  if (!p.name) return { error: 'Informe productId ou name.' };
  return { product: p };
}

async function generateOlxAd(req, res) {
  try {
    const { error, product } = await loadProductData(req);
    if (error) return res.status(400).json({ error });
    const result = await ia.generateOlxAd(product);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar anúncio OLX.', detail: err.message });
  }
}

async function generateInstagramAd(req, res) {
  try {
    const { error, product } = await loadProductData(req);
    if (error) return res.status(400).json({ error });
    const result = await ia.generateInstagramAd(product);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar anúncio Instagram.', detail: err.message });
  }
}

async function generateFacebookAd(req, res) {
  try {
    const { error, product } = await loadProductData(req);
    if (error) return res.status(400).json({ error });
    const result = await ia.generateFacebookAd(product);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar anúncio Facebook.', detail: err.message });
  }
}

async function generateWhatsappCatalogAd(req, res) {
  try {
    const { error, product } = await loadProductData(req);
    if (error) return res.status(400).json({ error });
    const result = await ia.generateWhatsappCatalogAd(product);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar anúncio WhatsApp Catalog.', detail: err.message });
  }
}

async function generateMultiChannel(req, res) {
  try {
    const { error, product } = await loadProductData(req);
    if (error) return res.status(400).json({ error });
    const result = await ia.generateMultiChannel(product);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar anúncios multi-canal.', detail: err.message });
  }
}

async function classifyCategory(req, res) {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Informe name.' });
    const cat = await ia.classifyOlxCategory(name);
    res.json({ category: cat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  generateOlxAd,
  generateInstagramAd,
  generateFacebookAd,
  generateWhatsappCatalogAd,
  generateMultiChannel,
  classifyCategory,
};
