const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { validatePasswordStrength, isValidEmail } = require('../utils/security');
const { getAccessProfileForUser } = require('../services/accessProfileService');

const MAX_FAILED_LOGINS = parseInt(process.env.MAX_FAILED_LOGINS || '5', 10);
const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

function normalizePermissionsByRole(role, input = {}) {
  if (role === 'ADMIN') {
    return { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true };
  }

  if (role !== 'EMPLOYEE') {
    return { canAdd: false, canEdit: false, canDelete: false, canManageUsers: false };
  }

  return {
    canAdd: input.canAdd !== undefined ? !!input.canAdd : true,
    canEdit: input.canEdit !== undefined ? !!input.canEdit : true,
    canDelete: input.canDelete !== undefined ? !!input.canDelete : false,
    canManageUsers: input.canManageUsers !== undefined ? !!input.canManageUsers : false,
  };
}

function toPublicPermissions(permissions) {
  if (!permissions) return null;

  return {
    canAdd: !!permissions.canAdd,
    canEdit: !!permissions.canEdit,
    canDelete: !!permissions.canDelete,
    canManageUsers: !!permissions.canManageUsers,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    clientId: user.clientId,
    mustChangePassword: !!user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    permissions: toPublicPermissions(user.permissions),
  };
}

async function registerFailedLogin(userId) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { failedLoginCount: true } });
  const failedLoginCount = (existing?.failedLoginCount || 0) + 1;
  const data = { failedLoginCount };
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    data.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  }
  await prisma.user.update({ where: { id: userId }, data });
}

const login = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalido.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { client: true, permissions: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada por tentativas invalidas. Tente novamente mais tarde.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      await registerFailedLogin(user.id);
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    const token = generateToken(user.id, user.role);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
      include: { permissions: true },
    });

    return res.json({ token, user: publicUser(updatedUser) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao fazer login.' });
  }
};

const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        permissions: {
          select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    const accessProfile = await getAccessProfileForUser(user);
    return res.json({
      ...publicUser(user),
      accessProfile,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar usuario.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senhas sao obrigatorias.' });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'EMPLOYEE', permissions = {} } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha sao obrigatorios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalido.' });
    }

    if (!['ADMIN', 'EMPLOYEE'].includes(role)) {
      return res.status(400).json({ error: 'Colaboradores devem ter perfil ADMIN ou EMPLOYEE.' });
    }

    if (req.user.role !== 'ADMIN' && role === 'ADMIN') {
      return res.status(403).json({ error: 'Somente administrador pode criar outro administrador.' });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res.status(409).json({ error: 'Email ja cadastrado.' });
    }

    const permissionData = normalizePermissionsByRole(role, permissions);
    if (req.user.role !== 'ADMIN') {
      permissionData.canManageUsers = false;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        clientId: null,
        mustChangePassword: true,
        permissions: { create: permissionData },
      },
      include: {
        permissions: {
          select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
        },
      },
    });

    return res.status(201).json(publicUser(user));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar usuario.' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, role, active, permissions = {} } = req.body;

    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        permissions: {
          select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
        },
      },
    });

    if (!existing) return res.status(404).json({ error: 'Colaborador nao encontrado.' });

    const nextRole = role || existing.role;
    if (!['ADMIN', 'EMPLOYEE'].includes(nextRole)) {
      return res.status(400).json({ error: 'Colaboradores devem ter perfil ADMIN ou EMPLOYEE.' });
    }

    if (req.user.role !== 'ADMIN') {
      if (existing.role === 'ADMIN' || nextRole === 'ADMIN') {
        return res.status(403).json({ error: 'Somente administrador pode alterar dados de administrador.' });
      }
    }

    if (req.user.id === existing.id && active === false) {
      return res.status(400).json({ error: 'Voce nao pode desativar sua propria conta.' });
    }

    const permissionData = normalizePermissionsByRole(nextRole, permissions);
    if (req.user.role !== 'ADMIN') {
      permissionData.canManageUsers = false;
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? String(name).trim() : undefined,
        role: nextRole,
        active: active !== undefined ? !!active : undefined,
        permissions: {
          upsert: {
            create: permissionData,
            update: permissionData,
          },
        },
      },
      include: {
        permissions: {
          select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
        },
      },
    });

    return res.json(publicUser(updated));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar colaborador.' });
  }
};

const removeUser = async (req, res) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Colaborador nao encontrado.' });

    if (req.user.id === existing.id) {
      return res.status(400).json({ error: 'Voce nao pode desativar sua propria conta.' });
    }

    if (existing.role === 'ADMIN') {
      return res.status(403).json({ error: 'Nao e permitido desativar administrador por esta rota.' });
    }

    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ message: 'Colaborador desativado com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir colaborador.' });
  }
};

const listUsers = async (req, res) => {
  try {
    const includeClients = String(req.query?.includeClients || 'false') === 'true';

    const where = includeClients
      ? undefined
      : { role: { in: ['ADMIN', 'EMPLOYEE'] } };

    const users = await prisma.user.findMany({
      where,
      include: {
        permissions: {
          select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return res.json(users.map(publicUser));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar usuarios.' });
  }
};

module.exports = { login, me, changePassword, createUser, updateUser, removeUser, listUsers };

