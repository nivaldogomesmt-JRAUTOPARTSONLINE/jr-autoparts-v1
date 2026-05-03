// src/controllers/productPhotoController.js
// Endpoints específicos pra upload de fotos de produtos (single + bulk + serve).
const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../lib/prisma');
const { savePhotoLocal, deletePhotoLocal, PHOTOS_DIR } = require('../services/uploadService');

/** GET /api/products/foto/:filename — serve foto pública (caso nginx não pegue) */
async function servePhoto(req, res) {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(PHOTOS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).send('Foto não encontrada.');
    res.set('Cache-Control', 'public, max-age=604800');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(filepath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/products/:id/photo — upload single (substitui a foto atual) */
async function uploadSingle(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem no campo "photo"' });
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    const photoUrl = await savePhotoLocal(req.file, product.id);
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { photoUrl },
    });
    res.json({ ok: true, photoUrl, product: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/products/:id/photo — remove foto */
async function removeSingle(req, res) {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    await deletePhotoLocal(product.id);
    await prisma.product.update({ where: { id: product.id }, data: { photoUrl: null } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Normaliza nome do arquivo pra fazer match com produto. */
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.\w+$/, '')         // remove extensão
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * POST /api/products/bulk-photo-upload
 * Aceita múltiplos arquivos. Para cada um:
 *  1. Tenta achar produto pelo barcode (se nome do arquivo é só numérico/EAN-like)
 *  2. Senão tenta achar pelo SKU (nome normalizado)
 *  3. Senão pelo nome do produto (busca aproximada)
 *
 * Retorna relatório: {matched, unmatched, errors, total}
 */
async function bulkPhotoUpload(req, res) {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'Envie uma ou mais imagens (campo "photos").' });
    }

    const result = {
      total: req.files.length,
      matched: [],
      unmatched: [],
      errors: [],
    };

    // Cache de produtos pra busca rápida
    const allProducts = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, barcode: true },
    });
    const byBarcode = new Map();
    const byNormName = new Map();
    for (const p of allProducts) {
      if (p.barcode) byBarcode.set(p.barcode, p);
      const k = normalizeKey(p.name);
      if (k) {
        if (!byNormName.has(k)) byNormName.set(k, p);
      }
    }

    for (const file of req.files) {
      try {
        const original = file.originalname || '';
        const baseName = original.replace(/\.\w+$/, '');
        const numericOnly = baseName.replace(/\D/g, '');
        const normKey = normalizeKey(baseName);

        // 1) Busca por barcode exato
        let product = numericOnly && byBarcode.get(numericOnly);
        // 2) Busca por nome normalizado exato
        if (!product) product = byNormName.get(normKey);
        // 3) Busca aproximada: contém o nome
        if (!product) {
          for (const p of allProducts) {
            const k = normalizeKey(p.name);
            if (k && (k.includes(normKey) || normKey.includes(k))) {
              product = p;
              break;
            }
          }
        }

        if (!product) {
          result.unmatched.push({ filename: original });
          continue;
        }

        const photoUrl = await savePhotoLocal(file, product.id);
        await prisma.product.update({ where: { id: product.id }, data: { photoUrl } });

        result.matched.push({
          filename: original,
          productId: product.id,
          productName: product.name,
          photoUrl,
        });
      } catch (e) {
        result.errors.push({
          filename: file.originalname || '?',
          error: e.message,
        });
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { servePhoto, uploadSingle, removeSingle, bulkPhotoUpload };
