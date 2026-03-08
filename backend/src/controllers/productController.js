const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const prisma = require('../lib/prisma');

// GET /api/products
const list = async (req, res) => {
  try {
    const { search, category, active, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      ...(active !== undefined && { active: active === 'true' }),
      ...(active === undefined && { active: true }),
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [products, total, categories] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip, take: parseInt(limit) }),
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
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      categories: categories.map(c => c.category).filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
};

// GET /api/products/:id
const get = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
};

// POST /api/products
const create = async (req, res) => {
  try {
    const { name, description, category, price, unit, stock } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });

    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadToCloudinary(req.file, 'jr-autoparts/products');
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        category,
        price: parseFloat(price),
        unit: unit || 'un',
        stock: stock ? parseInt(stock) : 0,
        photoUrl,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar produto.' });
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  try {
    const { name, description, category, price, unit, stock, active } = req.body;
    const current = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Produto não encontrado.' });

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
        name, description, category, photoUrl,
        price: price ? parseFloat(price) : undefined,
        unit,
        stock: stock !== undefined ? parseInt(stock) : undefined,
        active: active !== undefined ? active === 'true' || active === true : undefined,
      },
    });

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
};

// DELETE /api/products/:id (toggle active)
const remove = async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Produto desativado.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar produto.' });
  }
};

module.exports = { list, get, create, update, remove };
