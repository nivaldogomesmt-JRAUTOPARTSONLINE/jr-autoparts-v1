const fs = require('node:fs');
const path = require('node:path');
const svc = require('../services/brandService');

const BRAND_DIR = process.env.BRAND_DIR || '/app/data/brand';
fs.mkdirSync(BRAND_DIR, { recursive: true });

function get(_req, res) {
  res.json(svc.read());
}

async function update(req, res) {
  try {
    const { name, phone, primaryColor, logoUrl } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).slice(0, 80);
    if (phone !== undefined) data.phone = String(phone).slice(0, 30);
    if (primaryColor !== undefined) data.primaryColor = String(primaryColor).slice(0, 20);
    if (logoUrl !== undefined) data.logoUrl = String(logoUrl).slice(0, 500);
    res.json(svc.write(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function uploadLogo(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem.' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Arquivo precisa ser uma imagem.' });
    }
    // Detecta extensão
    const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg').slice(0, 4);
    const filename = `logo-${Date.now()}.${ext}`;
    const filepath = path.join(BRAND_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    // URL servida via /api/brand/logo-file/<filename>
    const logoUrl = `/api/brand/logo-file/${filename}`;
    const updated = svc.write({ logoUrl });
    res.json({ logoUrl, brand: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function serveLogo(req, res) {
  try {
    const filename = path.basename(req.params.filename); // anti path traversal
    const filepath = path.join(BRAND_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).send('Logo não encontrada.');
    res.sendFile(filepath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { get, update, uploadLogo, serveLogo };
