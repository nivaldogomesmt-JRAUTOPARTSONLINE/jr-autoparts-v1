const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { safeCompare } = require('../utils/security');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        clientId: true,
        mustChangePassword: true,
        lockedUntil: true,
      },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  return next();
};

const requireEmployee = (req, res, next) => {
  if (!['ADMIN', 'EMPLOYEE'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso restrito à equipe interna.' });
  }
  return next();
};

const authenticateClient = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Acesso permitido apenas para clientes.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { client: true },
    });

    if (!user || !user.active || !user.client) {
      return res.status(401).json({ error: 'Cliente não encontrado.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada.' });
    }

    req.user = user;
    req.client = user.client;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};

const authenticateBot = (req, res, next) => {
  const provided = String(req.headers['x-bot-token'] || req.query.token || '');
  const expected = String(process.env.BOT_SECRET_TOKEN || '');

  if (!expected || expected.length < 24) {
    return res.status(500).json({ error: 'BOT_SECRET_TOKEN não configurado corretamente.' });
  }
  if (!provided || !safeCompare(provided, expected)) {
    return res.status(403).json({ error: 'Token do bot inválido.' });
  }

  return next();
};

module.exports = { authenticate, requireAdmin, requireEmployee, authenticateClient, authenticateBot };
