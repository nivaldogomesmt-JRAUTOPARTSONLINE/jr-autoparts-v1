const prisma = require('../lib/prisma');
const {
  getAccessProfileForUser,
  saveAccessProfileForUser,
  getAccessProfileHistory,
  summarizeRolePermissions,
} = require('../services/accessProfileService');

function actorFromReq(req) {
  return req.user?.name || req.user?.email || 'system';
}

async function getTargetUser(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      permissions: {
        select: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
      },
    },
  });
}

const getUserAccessProfile = async (req, res) => {
  try {
    const user = await getTargetUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado.' });

    if (req.user.role !== 'ADMIN' && user.role === 'ADMIN') {
      return res.status(403).json({ error: 'Somente administrador pode visualizar perfil de acesso de administrador.' });
    }

    const profile = await getAccessProfileForUser(user);
    return res.json({
      userId: user.id,
      name: user.name,
      role: user.role,
      profile,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar perfil de acesso.' });
  }
};

const updateUserAccessProfile = async (req, res) => {
  try {
    const user = await getTargetUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado.' });

    if (req.user.role !== 'ADMIN' && user.role === 'ADMIN') {
      return res.status(403).json({ error: 'Somente administrador pode alterar perfil de acesso de administrador.' });
    }

    const reason = String(req.body?.reason || '').trim();
    const profile = await saveAccessProfileForUser(user, req.body || {}, actorFromReq(req), reason);

    const coarse = summarizeRolePermissions(profile);
    const canManageUsers = req.user.role === 'ADMIN' ? coarse.canManageUsers : false;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        permissions: {
          upsert: {
            create: {
              canAdd: coarse.canAdd,
              canEdit: coarse.canEdit,
              canDelete: coarse.canDelete,
              canManageUsers,
            },
            update: {
              canAdd: coarse.canAdd,
              canEdit: coarse.canEdit,
              canDelete: coarse.canDelete,
              canManageUsers,
            },
          },
        },
      },
    });

    return res.json({ message: 'Perfil de acesso atualizado com sucesso.', profile });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar perfil de acesso.' });
  }
};

const listUserAccessHistory = async (req, res) => {
  try {
    const user = await getTargetUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado.' });

    if (req.user.role !== 'ADMIN' && user.role === 'ADMIN') {
      return res.status(403).json({ error: 'Somente administrador pode visualizar historico de administrador.' });
    }

    const { page = 1, limit = 20 } = req.query;
    const history = await getAccessProfileHistory(user.id, page, limit);

    return res.json(history);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar historico de permissao.' });
  }
};

module.exports = {
  getUserAccessProfile,
  updateUserAccessProfile,
  listUserAccessHistory,
};
