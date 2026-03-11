const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const prisma = require('../lib/prisma');
const { normalizeSearchToken, normalizedSqlExpr } = require('../utils/search');
const XLSX = require('xlsx');
const { appendIntegrationLog } = require('../services/integrationLogService');

function normalizeBarcode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, '').toUpperCase();
}

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toMoney(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;

  const raw = String(value).trim();
  if (!raw) return fallback;

  let normalized = raw.replace(/\s+/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  } else if (!hasDot && /^\d{4,}$/.test(normalized)) {
    // Entrada comum em centavos (ex: 2198 -> 21.98)
    return Number(normalized) / 100;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function getTagValue(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  return match ? String(match[1] || '').trim() : '';
}

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildProductSearchWhere(search) {
  const tokens = parseSearchTokens(search);
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { barcode: { contains: token, mode: 'insensitive' } },
        { description: { contains: token, mode: 'insensitive' } },
        { category: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

async function findProductIdsByAccentSearch(search) {
  const tokens = parseSearchTokens(search)
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  if (!tokens.length) return null;

  const fields = [
    normalizedSqlExpr('p.name'),
    normalizedSqlExpr('p.barcode'),
    normalizedSqlExpr('p.description'),
    normalizedSqlExpr('p.category'),
  ];

  const params = tokens.map((token) => `%${token}%`);
  const conditions = tokens
    .map((_, idx) => `(${fields.map((field) => `${field} LIKE $${idx + 1}`).join(' OR ')})`)
    .join(' AND ');

  const sql = `
    SELECT p.id
    FROM products p
    WHERE ${conditions}
    LIMIT 12000
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function parseNfeProducts(xmlText) {
  const detBlocks = xmlText.match(/<det\b[\s\S]*?<\/det>/gi) || [];

  const items = detBlocks.map((det) => {
    const prodBlock = /<prod>([\s\S]*?)<\/prod>/i.exec(det);
    const prod = prodBlock ? prodBlock[1] : det;

    const code = getTagValue(prod, 'cProd');
    const name = getTagValue(prod, 'xProd');
    const barcode = normalizeBarcode(getTagValue(prod, 'cEANTrib') || getTagValue(prod, 'cEAN'));
    const unit = getTagValue(prod, 'uCom') || getTagValue(prod, 'uTrib') || 'un';

    const quantity = toMoney(getTagValue(prod, 'qCom') || getTagValue(prod, 'qTrib'), 0);

    const unitPriceDirect = toMoney(getTagValue(prod, 'vUnCom') || getTagValue(prod, 'vUnTrib'), 0);
    const totalValue = toMoney(getTagValue(prod, 'vProd'), 0);
    const unitPrice = unitPriceDirect > 0
      ? unitPriceDirect
      : (quantity > 0 ? totalValue / quantity : 0);

    return { code, name, barcode, unit, quantity, price: unitPrice };
  }).filter((item) => item.name);

  return items;
}

async function safeLogIntegration(entry, actor = 'Sistema') {
  try {
    await appendIntegrationLog(entry, actor);
  } catch {
    // nao bloqueia o fluxo principal
  }
}

function aggregateTopProducts(items, mode = 'revenue', limit = 8) {
  const map = new Map();

  for (const item of items) {
    const key = item.productId || String(item.itemName || '').trim();
    if (!key) continue;

    const name = String(item.itemName || '').trim() || 'Produto';
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const revenue = qty * unitPrice;

    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        quantity: 0,
        revenue: 0,
        count: 0,
      });
    }

    const row = map.get(key);
    row.quantity += qty;
    row.revenue += revenue;
    row.count += 1;
  }

  const sorted = [...map.values()].sort((a, b) => {
    if (mode === 'quantity') {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    }
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return b.quantity - a.quantity;
  });

  return sorted.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    id: row.key,
    name: row.name,
    quantity: Number(row.quantity.toFixed(3)),
    revenue: Number(row.revenue.toFixed(2)),
    count: row.count,
  }));
}

// GET /api/products
const list = async (req, res) => {
  try {
    const { search, category, active, page = 1, limit = 30 } = req.query;
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 500);
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pageNumber - 1) * limitNumber;

    const accentIds = await findProductIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      return res.json({ data: [], total: 0, page: pageNumber, pages: 0, categories: [] });
    }

    const where = {
      ...(active !== undefined && { active: active === 'true' }),
      ...(active === undefined && { active: true }),
      ...(category && { category }),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildProductSearchWhere(search)),
    };

    const [products, total, categories] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip, take: limitNumber }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: { active: true },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
    ]);

    return res.json({
      data: products,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
      categories: categories.map((c) => c.category).filter(Boolean),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
};

const overview = async (req, res) => {
  try {
    const completedStatus = ['DONE', 'DELIVERED'];

    const [activeProducts, soldItems] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        select: { id: true, name: true, stock: true, price: true },
        orderBy: { name: 'asc' },
      }),
      prisma.soItem.findMany({
        where: {
          type: 'PRODUCT',
          serviceOrder: { status: { in: completedStatus } },
        },
        select: {
          itemName: true,
          quantity: true,
          unitPrice: true,
          productId: true,
        },
      }),
    ]);

    const soldProductIds = new Set(soldItems.map((item) => item.productId).filter(Boolean));

    const lowStockRows = activeProducts
      .filter((p) => Number(p.stock || 0) <= 2)
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: Number(p.stock || 0),
      }));

    const withoutSaleRows = activeProducts
      .filter((p) => !soldProductIds.has(p.id))
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.name,
      }));

    const withoutPriceRows = activeProducts
      .filter((p) => Number(p.price || 0) <= 0)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.name,
      }));

    return res.json({
      totals: {
        products: activeProducts.length,
        lowStock: activeProducts.filter((p) => Number(p.stock || 0) <= 2).length,
        withoutSale: activeProducts.filter((p) => !soldProductIds.has(p.id)).length,
        withoutPrice: activeProducts.filter((p) => Number(p.price || 0) <= 0).length,
      },
      rankings: {
        topByRevenue: aggregateTopProducts(soldItems, 'revenue', 8),
        topByQuantity: aggregateTopProducts(soldItems, 'quantity', 8),
      },
      lowStockRows,
      withoutSaleRows,
      withoutPriceRows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar painel de produtos.' });
  }
};

// GET /api/products/:id
const get = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produto nao encontrado.' });
    return res.json(product);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
};

// POST /api/products
const create = async (req, res) => {
  try {
    const { name, barcode, description, category, price, unit, stock } = req.body;
    if (!name || (price === null || price === undefined || price === '')) {
      return res.status(400).json({ error: 'Nome e preco sao obrigatorios.' });
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadToCloudinary(req.file, 'jr-autoparts/products');
    }

    const product = await prisma.product.create({
      data: {
        name,
        barcode: normalizeBarcode(barcode),
        description,
        category,
        price: toMoney(price, 0),
        unit: unit || 'un',
        stock: toInt(stock, 0),
        photoUrl,
      },
    });

    return res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Codigo de barras ja cadastrado.' });
    return res.status(500).json({ error: 'Erro ao criar produto.' });
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  try {
    const { name, barcode, description, category, price, unit, stock, active } = req.body;
    const current = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Produto nao encontrado.' });

    let photoUrl = current.photoUrl;
    if (req.file) {
      if (current.photoUrl) {
        const publicId = current.photoUrl.split('/').pop().split('.')[0];
        await deleteFromCloudinary(`jr-autoparts/products/${publicId}`).catch(() => {});
      }
      photoUrl = await uploadToCloudinary(req.file, 'jr-autoparts/products');
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        barcode: barcode !== undefined ? normalizeBarcode(barcode) : undefined,
        description,
        category,
        photoUrl,
        price: price !== undefined && price !== '' ? toMoney(price, 0) : undefined,
        unit,
        stock: stock !== undefined ? toInt(stock, 0) : undefined,
        active: active !== undefined ? active === 'true' || active === true : undefined,
      },
    });

    return res.json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Codigo de barras ja cadastrado.' });
    return res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
};

// POST /api/products/import/xml
const importXml = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo XML da NF-e.' });

    const xmlText = String(req.file.buffer || '').replace(/^\uFEFF/, '').trim();
    if (!xmlText) {
      return res.status(400).json({ error: 'Arquivo XML vazio.' });
    }

    if (!xmlText.includes('<det')) {
      return res.status(400).json({ error: 'XML invalido: nenhum item <det> encontrado.' });
    }

    const parsed = parseNfeProducts(xmlText);
    if (!parsed.length) {
      return res.status(400).json({ error: 'Nenhum item de produto encontrado no XML.' });
    }

    const result = { created: 0, updated: 0, ignored: 0, items: [] };

    await prisma.$transaction(async (tx) => {
      for (const item of parsed) {
        const qty = Math.max(0, Math.round(item.quantity || 0));
        const normalizedBarcode = normalizeBarcode(item.barcode);

        let existing = null;
        if (normalizedBarcode) {
          existing = await tx.product.findUnique({ where: { barcode: normalizedBarcode } });
        }

        if (!existing) {
          existing = await tx.product.findFirst({
            where: { name: { equals: item.name, mode: 'insensitive' } },
          });
        }

        if (!existing) {
          await tx.product.create({
            data: {
              name: item.name,
              barcode: normalizedBarcode,
              category: 'Nota Fiscal XML',
              description: item.code ? `Cod. NF-e: ${item.code}` : null,
              unit: item.unit || 'un',
              price: item.price || 0,
              stock: qty,
              active: true,
            },
          });
          result.created += 1;
          result.items.push({ name: item.name, action: 'CREATED', quantity: qty });
          continue;
        }

        await tx.product.update({
          where: { id: existing.id },
          data: {
            barcode: existing.barcode || normalizedBarcode,
            unit: existing.unit || item.unit || 'un',
            price: item.price > 0 ? item.price : existing.price,
            stock: toInt(existing.stock, 0) + qty,
            active: true,
          },
        });

        result.updated += 1;
        result.items.push({ name: existing.name, action: 'UPDATED', quantity: qty });
      }
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao importar XML de nota fiscal.' });
  }
};

// GET /api/products/export
const exportProducts = async (req, res) => {
  try {
    const { search, category, active } = req.query;
    const accentIds = await findProductIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([], {
        header: ['name', 'barcode', 'description', 'category', 'unit', 'price', 'stock', 'active', 'updatedAt'],
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const now = new Date().toISOString().slice(0, 10);
      const filename = `produtos_export_${now}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    const where = {
      ...(active !== undefined && { active: active === 'true' }),
      ...(active === undefined && { active: true }),
      ...(category && { category }),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildProductSearchWhere(search)),
    };

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        name: true,
        barcode: true,
        description: true,
        category: true,
        unit: true,
        price: true,
        stock: true,
        active: true,
        updatedAt: true,
      },
    });

    const rows = products.map((p) => ({
      name: p.name || '',
      barcode: p.barcode || '',
      description: p.description || '',
      category: p.category || '',
      unit: p.unit || '',
      price: Number(p.price || 0),
      stock: Number(p.stock || 0),
      active: p.active !== false,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : '',
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['name', 'barcode', 'description', 'category', 'unit', 'price', 'stock', 'active', 'updatedAt'],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date().toISOString().slice(0, 10);
    const filename = `produtos_export_${now}.xlsx`;

    await safeLogIntegration({
      area: 'Exportacao Produtos',
      user: req.user?.name || 'Operacao Manual',
      quantity: rows.length,
      failures: 0,
      reason: '-',
      meta: {
        search: search || '',
        category: category || '',
        active: active !== undefined ? String(active) : 'true',
        filename,
      },
    }, req.user?.name || req.user?.email || 'Sistema');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    await safeLogIntegration({
      area: 'Exportacao Produtos',
      user: req.user?.name || 'Operacao Manual',
      quantity: 0,
      failures: 1,
      reason: err?.message || 'Falha ao exportar produtos.',
    }, req.user?.name || req.user?.email || 'Sistema');
    return res.status(500).json({ error: 'Erro ao exportar produtos.' });
  }
};
// DELETE /api/products/:id (toggle active)
const remove = async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({ message: 'Produto desativado.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao desativar produto.' });
  }
};

module.exports = { list, overview, get, create, update, importXml, exportProducts, remove };
