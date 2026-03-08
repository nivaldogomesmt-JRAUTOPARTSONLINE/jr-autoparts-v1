const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

// GET /api/clients
const list = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cpfCnpj: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: { _count: { select: { vehicles: true, serviceOrders: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.client.count({ where }),
    ]);

    res.json({ data: clients, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
};

// GET /api/clients/:id
const get = async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        vehicles: { where: { active: true }, orderBy: { plate: 'asc' } },
        serviceOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { vehicle: true },
        },
        user: { select: { id: true, email: true, role: true } },
      },
    });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
};

// POST /api/clients
const create = async (req, res) => {
  try {
    const { name, cpfCnpj, phone, whatsapp, email, address, city, type, createPortalAccess, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const client = await prisma.client.create({
      data: { name, cpfCnpj, phone, whatsapp, email, address, city, type: type || 'PERSONAL' },
    });

    // Criar acesso ao portal se solicitado
    if (createPortalAccess && email && password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase().trim(),
          passwordHash,
          role: 'CLIENT',
          clientId: client.id,
        },
      });
    }

    res.status(201).json(client);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'CPF/CNPJ ou email já cadastrado.' });
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
};

// PUT /api/clients/:id
const update = async (req, res) => {
  try {
    const { name, cpfCnpj, phone, whatsapp, email, address, city, type } = req.body;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { name, cpfCnpj, phone, whatsapp, email, address, city, type },
    });
    res.json(client);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
};

// DELETE /api/clients/:id (soft delete)
const remove = async (req, res) => {
  try {
    await prisma.client.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Cliente desativado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar cliente.' });
  }
};

// POST /api/clients/:id/portal-access
const grantPortalAccess = async (req, res) => {
  try {
    const { password } = req.body;
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client || !client.email) {
      return res.status(400).json({ error: 'Cliente precisa ter email para acessar o portal.' });
    }

    const exists = await prisma.user.findFirst({ where: { clientId: client.id } });
    if (exists) return res.status(409).json({ error: 'Cliente já tem acesso ao portal.' });

    const passwordHash = await bcrypt.hash(password || 'JR@2024', 10);
    await prisma.user.create({
      data: {
        name: client.name,
        email: client.email.toLowerCase(),
        passwordHash,
        role: 'CLIENT',
        clientId: client.id,
      },
    });

    res.json({ message: 'Acesso ao portal criado com sucesso.', defaultPassword: !password ? 'JR@2024' : undefined });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar acesso ao portal.' });
  }
};

module.exports = { list, get, create, update, remove, grantPortalAccess };
