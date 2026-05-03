const prisma = require('../lib/prisma');

const list = async (req, res) => {
  try {
    const { search = '', category, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = {
      active: true,
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { plate: { contains: search, mode: 'insensitive' } },
              { identifier: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.companyAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit, 10) }),
      prisma.companyAsset.count({ where }),
    ]);

    return res.json({ data: items, total, page: parseInt(page, 10), pages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar ativos.' });
  }
};

const get = async (req, res) => {
  try {
    const item = await prisma.companyAsset.findUnique({ where: { id: req.params.id } });
    if (!item || !item.active) return res.status(404).json({ error: 'Ativo não encontrado.' });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar ativo.' });
  }
};

const create = async (req, res) => {
  try {
    const { code, name, category, plate, identifier, intendedUse, description, status, notes } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Campos obrigatórios: name e category.' });
    }

    const created = await prisma.companyAsset.create({
      data: {
        code: code || null,
        name,
        category,
        plate: plate || null,
        identifier: identifier || null,
        intendedUse: intendedUse || null,
        description: description || null,
        status: status || 'ACTIVE',
        notes: notes || null,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Código ou placa já cadastrado.' });
    return res.status(500).json({ error: 'Erro ao criar ativo.' });
  }
};

const update = async (req, res) => {
  try {
    const { code, name, category, plate, identifier, intendedUse, description, status, notes, active } = req.body;
    const updated = await prisma.companyAsset.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        category,
        plate,
        identifier,
        intendedUse,
        description,
        status,
        notes,
        active,
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ativo não encontrado.' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Código ou placa já cadastrado.' });
    return res.status(500).json({ error: 'Erro ao atualizar ativo.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.companyAsset.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ message: 'Ativo desativado com sucesso.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ativo não encontrado.' });
    return res.status(500).json({ error: 'Erro ao desativar ativo.' });
  }
};

module.exports = { list, get, create, update, remove };
