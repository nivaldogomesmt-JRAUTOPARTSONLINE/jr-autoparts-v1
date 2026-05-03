// src/services/uploadService.js — armazenamento LOCAL na VPS (sem Cloudinary)
// Soberania: zero dependência de terceiros para fotos de produtos.
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const PHOTOS_DIR = process.env.PRODUCTS_PHOTOS_DIR || '/app/data/uploads/produtos';
const PUBLIC_BASE = process.env.PUBLIC_PHOTOS_BASE || 'https://app.jrautopartsmt.com.br/api/products/foto';

// Garante diretório
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// Multer em memória (não salva temporário; iremos escrever direto no destino final)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB por foto
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são permitidas.'), false);
    }
    cb(null, true);
  },
});

const bulkUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 200 }, // 50MB por arquivo, máx 200 arquivos
});

/** Detecta extensão a partir do mimetype, com fallback. */
function extFromMime(mimetype) {
  const m = String(mimetype || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  return 'jpg';
}

/**
 * Salva foto local com nome <productId>.<ext>.
 * Antes de salvar, remove qualquer foto antiga do mesmo id (com qualquer extensão).
 * Retorna URL pública servida pelo nginx-edge.
 */
async function savePhotoLocal(file, productId) {
  if (!file?.buffer) throw new Error('Arquivo inválido (sem buffer)');
  if (!productId) throw new Error('productId obrigatório');

  // Remove versões antigas
  for (const e of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const old = path.join(PHOTOS_DIR, `${productId}.${e}`);
    if (fs.existsSync(old)) {
      try { fs.unlinkSync(old); } catch {}
    }
  }

  const ext = extFromMime(file.mimetype);
  const filename = `${productId}.${ext}`;
  const filepath = path.join(PHOTOS_DIR, filename);
  fs.writeFileSync(filepath, file.buffer);
  return `${PUBLIC_BASE}/${filename}`;
}

/** Remove foto local pelo productId (qualquer extensão). */
async function deletePhotoLocal(productId) {
  if (!productId) return;
  for (const e of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const p = path.join(PHOTOS_DIR, `${productId}.${e}`);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

// ─── Compat com código antigo que usava Cloudinary ────────────────────────
// Estas funções aceitam a mesma interface mas fazem armazenamento local.
// Wrapper recebe (file, folder) — folder ignorado, sempre vai pra PHOTOS_DIR.
async function uploadToCloudinary(file, _folder = 'jr-autoparts/products') {
  // Compatibility wrapper: gera ID temporário se não tiver um produto associado
  // Quem chama o controller pode passar via file.productId (nosso campo custom)
  const tempId = file.productId || ('tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  return savePhotoLocal(file, tempId);
}

async function deleteFromCloudinary(publicIdOrUrl) {
  // Aceita publicId antigo (jr-autoparts/products/<id>) OU URL nova
  const m = String(publicIdOrUrl || '').match(/([a-f0-9-]{36}|tmp-[\w-]+)\.([a-z]+)/);
  if (m) {
    await deletePhotoLocal(m[1]);
  }
}

module.exports = {
  upload,
  bulkUpload,
  savePhotoLocal,
  deletePhotoLocal,
  uploadToCloudinary,    // legacy
  deleteFromCloudinary,  // legacy
  PHOTOS_DIR,
  PUBLIC_BASE,
};
