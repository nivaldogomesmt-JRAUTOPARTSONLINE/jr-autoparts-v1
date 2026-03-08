const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { validatePasswordStrength, isValidEmail } = require('../utils/security');

const MAX_FAILED_LOGINS = parseInt(process.env.MAX_FAILED_LOGINS || '5', 10);
const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    mustChangePassword: !!user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
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
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { client: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada por tentativas inválidas. Tente novamente mais tarde.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      await registerFailedLogin(user.id);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = generateToken(user.id, user.role);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clientId: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
    });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senhas são obrigatórias.' });
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
    const { name, email, password, role = 'EMPLOYEE', clientId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        clientId: clientId || null,
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    return res.status(201).json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
};

const listUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        mustChangePassword: true,
        failedLoginCount: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
};

module.exports = { login, me, changePassword, createUser, listUsers };
