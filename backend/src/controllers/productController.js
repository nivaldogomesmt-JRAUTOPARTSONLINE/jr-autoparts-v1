const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const prisma = require('../lib/prisma');

function normalizeBarcode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, '').toUpperCase();
}

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function getTagValue(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  return match ? String(match[1] || '').trim() : '';
}

function parseNfeProducts(xmlText) {
  const detBlocks = xmlText.match(/<det\b[\s\S]*?<\/det>/gi) || [];

  const items = detBlocks.map((det) => {
    const prodBlock = /<prod>([\s\S]*?)<\/prod>/i.exec(det);
    const prod = prodBlock ? prodBlock[1] : det;

    const code = getTagValue(prod, 'cProd');
    const name = getTagValue(prod, 'xProd');
    const barcode = normalizeBarcode(getTagValue(prod, 'cEANTrib') || getTagValue(prod, 'cEAN'));
    const unit = getTagValue(prod, 'uCom') || 'un';
    const quantity = toNumber(getTagValue(prod, 'qCom'), 0);
    const price = toNumber(getTagValue(prod, 'vUnCom'), 0);

    return { code, name, barcode, unit, quantity, price };
  }).filter((item) => item.name);

  return items;
}

// GET /api/products
const list = async (req, res) => {
  try {
    const { search, category, active, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {
      ...(active !== undefined && { active: active === 'true' }),
      ...(active === undefined && { active: true }),
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [products, total, categories] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip, take: parseInt(limit, 10) }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: { active: true },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
    ]);

    res.json({
      data: products,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
      categories: categories.map((c) => c.category).filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
};

// GET /api/products/:id
const get = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produto nao encontrado.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
};

// POST /api/products
const create = async (req, res) => {
  try {
    const { name, barcode, description, category, price, unit, stock } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Nome e preco sao obrigatorios.' });

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
        price: toNumber(price, 0),
        unit: unit || 'un',
        stock: toInt(stock, 0),
        photoUrl,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Codigo de barras ja cadastrado.' });
    res.status(500).json({ error: 'Erro ao criar produto.' });
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
        price: price !== undefined && price !== '' ? toNumber(price, 0) : undefined,
        unit,
        stock: stock !== undefined ? toInt(stock, 0) : undefined,
        active: active !== undefined ? active === 'true' || active === true : undefined,
      },
    });

    res.json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Codigo de barras ja cadastrado.' });
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
};

// POST /api/products/import/xml
const importXml = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo XML da NF-e.' });

    const xmlText = String(req.file.buffer || '').trim();
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
            where: { name: { equals: item.name } },
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

// DELETE /api/products/:id (toggle active)
const remove = async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Produto desativado.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar produto.' });
  }
};

module.exports = { list, get, create, update, importXml, remove };

