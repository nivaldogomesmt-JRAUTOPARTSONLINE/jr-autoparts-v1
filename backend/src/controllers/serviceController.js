const prisma = require('../lib/prisma');

const list = async (req, res) => {
  try {
    const { search, active } = req.query;
    const where = {
      ...(active !== undefined ? { active: active === 'true' } : { active: true }),
      ...(search && { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const services = await prisma.service.findMany({ where, orderBy: { name: 'asc' } });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar serviços.' });
  }
};

const get = async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar serviço.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, price, estimatedTime } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
    const service = await prisma.service.create({
      data: { name, description, price: parseFloat(price), estimatedTime: estimatedTime ? parseInt(estimatedTime) : null },
    });
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar serviço.' });
  }
};

const update = async (req, res) => {
  try {
    const { name, description, price, estimatedTime, active } = req.body;
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        name, description,
        price: price ? parseFloat(price) : undefined,
        estimatedTime: estimatedTime ? parseInt(estimatedTime) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
    });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar serviço.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.service.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Serviço desativado.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar serviço.' });
  }
};

module.exports = { list, get, create, update, remove };
