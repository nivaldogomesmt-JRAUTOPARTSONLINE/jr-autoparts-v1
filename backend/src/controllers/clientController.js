const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const XLSX = require('xlsx');
const { normalizeSearchToken, normalizedSqlExpr } = require('../utils/search');
const { sendWhatsAppMessageWithDedupe } = require('../services/whatsappService');
const { appendIntegrationLog } = require('../services/integrationLogService');

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildClientSearchWhere(search) {
  const tokens = parseSearchTokens(search);
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { cpfCnpj: { contains: token } },
        { phone: { contains: token } },
        { whatsapp: { contains: token } },
        { email: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

async function findClientIdsByAccentSearch(search) {
  const tokens = parseSearchTokens(search)
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  if (!tokens.length) return null;

  const fields = [
    normalizedSqlExpr('c.name'),
    normalizedSqlExpr('c.cpf_cnpj'),
    normalizedSqlExpr('c.phone'),
    normalizedSqlExpr('c.whatsapp'),
    normalizedSqlExpr('c.email'),
  ];

  const params = tokens.map((token) => `%${token}%`);
  const conditions = tokens
    .map((_, idx) => `(${fields.map((field) => `${field} LIKE $${idx + 1}`).join(' OR ')})`)
    .join(' AND ');

  const sql = `
    SELECT c.id
    FROM clients c
    WHERE c.active = true
      AND ${conditions}
    LIMIT 10000
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function pickNotificationPhone(client) {
  return String(client?.whatsapp || client?.phone || '').trim();
}

async function notifyClientProfileChange({ before, after }) {
  const phone = pickNotificationPhone(after);
  if (!phone || !after?.id) return;

  const clientName = after?.name || before?.name || 'Cliente';
  const portalUrl = `${process.env.FRONTEND_URL || ''}/portal`;

  const whatsappChanged = String(before?.whatsapp || '') !== String(after?.whatsapp || '');
  const emailChanged = String(before?.email || '') !== String(after?.email || '');

  if (whatsappChanged && String(after?.whatsapp || '').trim()) {
    const msg = `Ola, ${clientName}! Confirmamos a atualizacao do seu WhatsApp para ${after.whatsapp}. Se voce nao reconhece esta alteracao, entre em contato com a JR Auto Parts.`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_WHATSAPP_UPDATED',
      templateVariables: {
        clientName,
        newWhatsapp: after.whatsapp,
        portalUrl,
      },
    }).catch(() => {});
  }

  if (emailChanged && String(after?.email || '').trim()) {
    const msg = `Ola, ${clientName}! Confirmamos a atualizacao do seu email para ${after.email}. Se voce nao reconhece esta alteracao, entre em contato com a JR Auto Parts.`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_EMAIL_UPDATED',
      templateVariables: {
        clientName,
        newEmail: after.email,
        portalUrl,
      },
    }).catch(() => {});
  }

  if (!whatsappChanged && !emailChanged) {
    const msg = `Ola, ${clientName}! Seu cadastro foi atualizado com sucesso na JR Auto Parts. Portal: ${portalUrl}`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_UPDATED',
      templateVariables: {
        clientName,
        portalUrl,
      },
    }).catch(() => {});
  }
}

async function safeLogIntegration(entry, actor = 'Sistema') {
  try {
    await appendIntegrationLog(entry, actor);
  } catch {
    // nao bloqueia fluxo principal
  }
}

// GET /api/clients
const list = async (req, res) => {
  try {
    const { search } = req.query;
    const pageNumber = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 50000);
    const skip = (pageNumber - 1) * limitNumber;
    const accentIds = await findClientIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      return res.json({ data: [], total: 0, page: pageNumber, pages: 0 });
    }

    const where = {
      active: true,
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildClientSearchWhere(search)),
    };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: { _count: { select: { vehicles: true, serviceOrders: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limitNumber,
      }),
      prisma.client.count({ where }),
    ]);

    res.json({ data: clients, total, page: pageNumber, pages: Math.ceil(total / limitNumber) });
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
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
};

// POST /api/clients
const create = async (req, res) => {
  try {
    const { name, cpfCnpj, phone, whatsapp, email, address, city, type, createPortalAccess, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome e obrigatorio.' });

    const client = await prisma.client.create({
      data: { name, cpfCnpj, phone, whatsapp, email, address, city, type: type || 'PERSONAL' },
    });

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
    if (err.code === 'P2002') return res.status(409).json({ error: 'CPF/CNPJ ou email ja cadastrado.' });
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
};

// PUT /api/clients/:id
const update = async (req, res) => {
  try {
    const { name, cpfCnpj, phone, whatsapp, email, address, city, type } = req.body;

    const before = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, phone: true, whatsapp: true },
    });
    if (!before) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { name, cpfCnpj, phone, whatsapp, email, address, city, type },
    });

    await notifyClientProfileChange({ before, after: client });

    res.json(client);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente nao encontrado.' });
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
};

// DELETE /api/clients/:id
const remove = async (req, res) => {
  try {
    const hardDelete = String(req.query.hard || '').toLowerCase() === 'true';

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            vehicles: true,
            serviceOrders: true,
            trackingContracts: true,
          },
        },
      },
    });

    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    if (!hardDelete) {
      await prisma.client.update({ where: { id: req.params.id }, data: { active: false } });
      return res.json({ message: 'Cliente desativado com sucesso.' });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Exclusao definitiva permitida apenas para ADMIN.' });
    }

    if (client._count.vehicles > 0 || client._count.serviceOrders > 0 || client._count.trackingContracts > 0) {
      return res.status(409).json({
        error: 'Cliente possui vinculos (veiculos/OS/contratos). Remova os vinculos antes da exclusao definitiva.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.whatsappMessage.deleteMany({ where: { clientId: client.id, soId: null } });
      await tx.user.deleteMany({ where: { clientId: client.id } });
      await tx.client.delete({ where: { id: client.id } });
    });

    return res.json({ message: 'Cliente excluido definitivamente.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir cliente.' });
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
    if (exists) return res.status(409).json({ error: 'Cliente ja tem acesso ao portal.' });

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

// GET /api/clients/export
const exportClients = async (req, res) => {
  try {
    const { search } = req.query;
    const accentIds = await findClientIdsByAccentSearch(search);
    const where = {
      active: true,
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildClientSearchWhere(search)),
    };

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    const rows = clients.map((c) => ({
      name: c.name || '',
      cpfCnpj: c.cpfCnpj || '',
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      address: c.address || '',
      city: c.city || '',
      type: c.type || 'PERSONAL',
      active: c.active !== false,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['name', 'cpfCnpj', 'phone', 'whatsapp', 'email', 'address', 'city', 'type', 'active'],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes_Importar');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date().toISOString().slice(0, 10);
    const filename = `clientes_export_${now}.xlsx`;

    await safeLogIntegration({
      area: 'Exportacao Clientes',
      user: req.user?.name || 'Operacao Manual',
      quantity: rows.length,
      failures: 0,
      reason: '-',
      meta: { search: search || '', filename },
    }, req.user?.name || req.user?.email || 'Sistema');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    await safeLogIntegration({
      area: 'Exportacao Clientes',
      user: req.user?.name || 'Operacao Manual',
      quantity: 0,
      failures: 1,
      reason: err?.message || 'Falha ao exportar clientes.',
    }, req.user?.name || req.user?.email || 'Sistema');
    return res.status(500).json({ error: 'Erro ao exportar clientes.' });
  }
};

// GET /api/clients/export/consolidated
const exportClientsConsolidated = async (req, res) => {
  try {
    const { search } = req.query;
    const accentIds = await findClientIdsByAccentSearch(search);
    const where = {
      active: true,
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildClientSearchWhere(search)),
    };

    const clients = await prisma.client.findMany({
      where,
      include: {
        vehicles: {
          where: { active: true },
          orderBy: { plate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows = clients.map((c) => {
      const vehiclePlates = c.vehicles.map((v) => v.plate).filter(Boolean);
      return {
        name: c.name || '',
        cpfCnpj: c.cpfCnpj || '',
        phone: c.phone || '',
        whatsapp: c.whatsapp || '',
        email: c.email || '',
        city: c.city || '',
        totalVehicles: vehiclePlates.length,
        plates: vehiclePlates.join(', '),
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['name', 'cpfCnpj', 'phone', 'whatsapp', 'email', 'city', 'totalVehicles', 'plates'],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes_Placas');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date().toISOString().slice(0, 10);
    const filename = `clientes_placas_consolidado_${now}.xlsx`;

    await safeLogIntegration({
      area: 'Exportacao Consolidada',
      user: req.user?.name || 'Operacao Manual',
      quantity: rows.length,
      failures: 0,
      reason: '-',
      meta: { search: search || '', filename },
    }, req.user?.name || req.user?.email || 'Sistema');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    await safeLogIntegration({
      area: 'Exportacao Consolidada',
      user: req.user?.name || 'Operacao Manual',
      quantity: 0,
      failures: 1,
      reason: err?.message || 'Falha ao exportar consolidado.',
    }, req.user?.name || req.user?.email || 'Sistema');
    return res.status(500).json({ error: 'Erro ao exportar clientes consolidados.' });
  }
};

module.exports = { list, get, create, update, remove, grantPortalAccess, exportClients, exportClientsConsolidated };
