const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { safeCompare } = require('../utils/security');

function hasActionPermission(user, action) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const permissions = user.permissions;
  if (!permissions) return true;

  if (action === 'add') return !!permissions.canAdd;
  if (action === 'edit') return !!permissions.canEdit;
  if (action === 'delete') return !!permissions.canDelete;
  return true;
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token nao fornecido.' });
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
        permissions: {
          select: {
            id: true,
            canAdd: true,
            canEdit: true,
            canDelete: true,
            canManageUsers: true,
          },
        },
      },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inativo ou nao encontrado.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
    }
    return res.status(401).json({ error: 'Token invalido.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  return next();
};

const requireManageUsers = (req, res, next) => {
  if (req.user?.role === 'ADMIN') return next();
  if (req.user?.role === 'EMPLOYEE' && req.user?.permissions?.canManageUsers) return next();
  return res.status(403).json({ error: 'Sem permissao para gerenciar colaboradores.' });
};

const requireEmployee = (req, res, next) => {
  if (!['ADMIN', 'EMPLOYEE'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso restrito a equipe interna.' });
  }
  return next();
};

const requireAction = (action) => (req, res, next) => {
  if (!hasActionPermission(req.user, action)) {
    return res.status(403).json({ error: `Sem permissao para ${action === 'add' ? 'adicionar' : action === 'edit' ? 'editar' : 'excluir'} registros.` });
  }
  return next();
};

const authenticateClient = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token nao fornecido.' });
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
      return res.status(401).json({ error: 'Cliente nao encontrado.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada.' });
    }

    req.user = user;
    req.client = user.client;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
};

const authenticateBot = (req, res, next) => {
  const provided = String(req.headers['x-bot-token'] || req.query.token || '');
  const expected = String(process.env.BOT_SECRET_TOKEN || '');

  if (!expected || expected.length < 24) {
    return res.status(500).json({ error: 'BOT_SECRET_TOKEN nao configurado corretamente.' });
  }
  if (!provided || !safeCompare(provided, expected)) {
    return res.status(403).json({ error: 'Token do bot invalido.' });
  }

  return next();
};

module.exports = { authenticate, requireAdmin, requireManageUsers, requireEmployee, requireAction, authenticateClient, authenticateBot };
