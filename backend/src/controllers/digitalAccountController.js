const prisma = require('../lib/prisma');

const list = async (req, res) => {
  try {
    const { search = '', platform, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = {
      active: true,
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { label: { contains: search, mode: 'insensitive' } },
              { contact: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.digitalAccount.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit, 10) }),
      prisma.digitalAccount.count({ where }),
    ]);

    return res.json({ data: items, total, page: parseInt(page, 10), pages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar contas digitais.' });
  }
};

const get = async (req, res) => {
  try {
    const item = await prisma.digitalAccount.findUnique({ where: { id: req.params.id } });
    if (!item || !item.active) return res.status(404).json({ error: 'Conta digital não encontrada.' });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar conta digital.' });
  }
};

const create = async (req, res) => {
  try {
    const { code, platform, label, contact, plan, status, verified, notes } = req.body;
    if (!platform || !label) {
      return res.status(400).json({ error: 'Campos obrigatórios: platform e label.' });
    }

    const created = await prisma.digitalAccount.create({
      data: {
        code: code || null,
        platform,
        label,
        contact: contact || null,
        plan: plan || null,
        status: status || 'ACTIVE',
        verified: Boolean(verified),
        notes: notes || null,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Código já cadastrado.' });
    return res.status(500).json({ error: 'Erro ao criar conta digital.' });
  }
};

const update = async (req, res) => {
  try {
    const { code, platform, label, contact, plan, status, verified, notes, active } = req.body;
    const updated = await prisma.digitalAccount.update({
      where: { id: req.params.id },
      data: {
        code,
        platform,
        label,
        contact,
        plan,
        status,
        verified,
        notes,
        active,
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Conta digital não encontrada.' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Código já cadastrado.' });
    return res.status(500).json({ error: 'Erro ao atualizar conta digital.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.digitalAccount.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ message: 'Conta digital desativada com sucesso.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Conta digital não encontrada.' });
    return res.status(500).json({ error: 'Erro ao desativar conta digital.' });
  }
};

module.exports = { list, get, create, update, remove };
