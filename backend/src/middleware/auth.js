const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { safeCompare } = require('../utils/security');
const { getAccessProfileForUser } = require('../services/accessProfileService');

function hasActionPermission(user, action) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const permissions = user.permissions || {};
  const profileModules = user?.accessProfile?.modules;

  if (profileModules && typeof profileModules === 'object') {
    const rows = Object.values(profileModules);
    if (action === 'add') return rows.some((row) => !!row?.add);
    if (action === 'edit') return rows.some((row) => !!row?.edit || !!row?.changeStatus);
    if (action === 'delete') return rows.some((row) => !!row?.delete);
    if (action === 'print') return rows.some((row) => !!row?.print);
    if (action === 'export') return rows.some((row) => !!row?.export);
    if (action === 'approve') return rows.some((row) => !!row?.approve);
    return rows.some((row) => !!row?.view);
  }

  if (action === 'add') return !!permissions.canAdd;
  if (action === 'edit') return !!permissions.canEdit;
  if (action === 'delete') return !!permissions.canDelete;
  return true;
}

function hasModuleActionPermission(user, moduleKey, action = 'view') {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const row = user?.accessProfile?.modules?.[moduleKey];
  if (row && typeof row === 'object') {
    if (action === 'edit' || action === 'changeStatus') {
      return !!row.edit || !!row.changeStatus;
    }
    return !!row[action];
  }

  // Fallback para estrutura antiga de permissoes
  return hasActionPermission(user, action);
}

function canManageUsers(user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const sensitive = user?.accessProfile?.sensitive;
  if (sensitive && typeof sensitive === 'object' && sensitive.manageUsers !== undefined) {
    return !!sensitive.manageUsers;
  }

  return !!user?.permissions?.canManageUsers;
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

    let accessProfile = null;
    try {
      accessProfile = await getAccessProfileForUser(user);
    } catch {
      accessProfile = null;
    }

    req.user = {
      ...user,
      accessProfile,
    };

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
  if (canManageUsers(req.user)) return next();
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

const requireModuleAction = (moduleKey, action = 'view') => (req, res, next) => {
  if (!hasModuleActionPermission(req.user, moduleKey, action)) {
    const actionLabelMap = {
      view: 'visualizar',
      add: 'adicionar',
      edit: 'editar',
      delete: 'excluir',
      print: 'imprimir',
      export: 'exportar',
      approve: 'aprovar',
      changeStatus: 'alterar status',
    };

    const moduleLabelMap = {
      dashboard: 'dashboard',
      clients: 'clientes',
      vehicles: 'veiculos',
      products: 'produtos',
      services: 'servicos',
      serviceOrders: 'ordens de servico',
      deliveries: 'entregas',
      tracking: 'rastreamento',
      integrations: 'integracoes',
      collaborators: 'colaboradores',
      billing: 'cobrancas',
      olx: 'anuncios olx',
    };

    const actionLabel = actionLabelMap[action] || action;
    const moduleLabel = moduleLabelMap[moduleKey] || moduleKey;

    return res.status(403).json({ error: `Sem permissao para ${actionLabel} em ${moduleLabel}.` });
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
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const provided = String(
    req.headers['x-bot-token']
    || req.headers['x-api-key']
    || bearerToken
    || req.query.token
    || ''
  );
  const expected = String(process.env.BOT_SECRET_TOKEN || '');

  if (!expected || expected.length < 24) {
    return res.status(500).json({ error: 'BOT_SECRET_TOKEN nao configurado corretamente.' });
  }
  if (!provided || !safeCompare(provided, expected)) {
    return res.status(403).json({ error: 'Token do bot invalido.' });
  }

  return next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireManageUsers,
  requireEmployee,
  requireAction,
  requireModuleAction,
  authenticateClient,
  authenticateBot,
};
