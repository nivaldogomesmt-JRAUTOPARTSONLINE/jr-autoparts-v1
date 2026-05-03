// src/services/adTemplateService.js
const prisma = require('../lib/prisma');

function normalize(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokens(s, minLen = 3) {
  const stop = new Set(['de','da','do','dos','das','para','par','no','na','em','com','por','um','uma','o','a','e','que','se']);
  return normalize(s).split(' ').filter(t => t.length >= minLen && !stop.has(t));
}

/** Busca templates similares ao termo (nome do produto). */
async function findSimilar(query, limit = 5) {
  const tks = tokens(query);
  if (!tks.length) return [];
  const norm = normalize(query);

  // Match exato primeiro
  const exact = await prisma.productAdTemplate.findMany({
    where: { titleNorm: { equals: norm } },
    take: limit,
  });
  if (exact.length >= limit) return exact;

  // Busca por tokens (cada token deve aparecer)
  const where = { AND: tks.slice(0, 5).map(t => ({ titleNorm: { contains: t } })) };
  const partial = await prisma.productAdTemplate.findMany({
    where,
    take: limit - exact.length,
  });

  // Concatena e dedup
  const seen = new Set(exact.map(e => e.id));
  const result = [...exact];
  for (const p of partial) {
    if (!seen.has(p.id)) {
      result.push(p);
      seen.add(p.id);
    }
  }
  return result.slice(0, limit);
}

async function getById(id) {
  return prisma.productAdTemplate.findUnique({ where: { id } });
}

async function listByBrand(brand, limit = 50) {
  return prisma.productAdTemplate.findMany({
    where: { brand: { equals: brand, mode: 'insensitive' } },
    take: limit,
    orderBy: { title: 'asc' },
  });
}

async function categories() {
  return prisma.$queryRawUnsafe(`
    SELECT brand, category, count(*)::int AS qtde
    FROM product_ad_templates
    GROUP BY brand, category
    ORDER BY brand, category
  `);
}

module.exports = { findSimilar, getById, listByBrand, categories };
