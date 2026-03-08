const prisma = require('../lib/prisma');
const { normalizeDigits, normalizePlate } = require('../utils/security');

const searchProducts = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '5', 10), 10);
    if (!search) return res.status(400).json({ error: 'Parâmetro search é obrigatório.' });

    const products = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, description: true, price: true, photoUrl: true, unit: true, category: true },
      take: limit,
      orderBy: { name: 'asc' },
    });

    const formatted = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: `R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}`,
      priceRaw: parseFloat(p.price),
      photoUrl: p.photoUrl,
      unit: p.unit,
      category: p.category,
      portalUrl: `${process.env.FRONTEND_URL}/portal`,
    }));

    return res.json({ found: products.length > 0, results: formatted, total: products.length });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
};

const checkSO = async (req, res) => {
  try {
    const plate = normalizePlate(req.query.plate || '');
    const cpf = normalizeDigits(req.query.cpf || '');
    const phone = normalizeDigits(req.query.phone || '');

    let client = null;
    if (cpf) {
      client = await prisma.client.findFirst({ where: { cpfCnpj: { contains: cpf } } });
    }
    if (!client && phone) {
      client = await prisma.client.findFirst({
        where: {
          OR: [
            { phone: { contains: phone } },
            { whatsapp: { contains: phone } },
          ],
        },
      });
    }

    const orders = await prisma.serviceOrder.findMany({
      where: {
        ...(client ? { clientId: client.id } : {}),
        ...(plate ? { vehicle: { plate: { contains: plate } } } : {}),
        status: { not: 'DELIVERED' },
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    });

    const STATUS_LABELS = {
      QUOTE: 'Orçamento', APPROVED: 'Aprovado', STARTED: 'Iniciado',
      IN_PROGRESS: 'Em Execução', WAITING_PART: 'Aguardando Peça',
      FINISHING: 'Finalizando', DONE: 'Finalizado', DELIVERED: 'Entregue',
    };

    const formatted = orders.map((o) => ({
      number: o.number,
      status: STATUS_LABELS[o.status],
      client: o.client.name,
      vehicle: `${o.vehicle.brand} ${o.vehicle.model} (${o.vehicle.plate})`,
      total: `R$ ${parseFloat(o.totalPrice).toFixed(2).replace('.', ',')}`,
      portalUrl: `${process.env.FRONTEND_URL}/portal`,
    }));

    return res.json({ found: orders.length > 0, results: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar OS.' });
  }
};

const clientPortalLink = async (req, res) => {
  try {
    const phone = normalizeDigits(req.query.phone || '');
    const portalUrl = `${process.env.FRONTEND_URL}/portal`;
    if (!phone) return res.json({ portalUrl });

    const client = await prisma.client.findFirst({
      where: { OR: [{ phone: { contains: phone } }, { whatsapp: { contains: phone } }] },
      include: { user: { select: { email: true } } },
    });

    if (!client) {
      return res.json({ found: false, portalUrl, message: 'Cliente não encontrado no sistema.' });
    }

    const hasAccess = !!client.user;
    return res.json({
      found: true,
      clientName: client.name,
      hasPortalAccess: hasAccess,
      loginEmail: hasAccess ? client.user.email : null,
      portalUrl,
      message: hasAccess
        ? `Olá ${client.name}! Acesse seu portal em: ${portalUrl}`
        : `Olá ${client.name}! Entre em contato para ativar seu acesso ao portal.`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
};

module.exports = { searchProducts, checkSO, clientPortalLink };
