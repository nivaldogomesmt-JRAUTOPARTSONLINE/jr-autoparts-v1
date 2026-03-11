const prisma = require('../lib/prisma');

const STORAGE_CODE = 'ACCESS_PROFILES';
const STORAGE_LABEL = 'Perfis de Acesso';
const MAX_HISTORY = 1200;

const MODULE_KEYS = [
  'dashboard',
  'clients',
  'vehicles',
  'products',
  'services',
  'serviceOrders',
  'deliveries',
  'tracking',
  'integrations',
  'collaborators',
];

const ACTION_KEYS = ['view', 'add', 'edit', 'delete', 'print', 'export', 'approve', 'changeStatus'];

function parseMaybeJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return !!fallback;
  return !!value;
}

function sanitizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || String(fallback || '');
}

function buildDefaultModulePermissions(basePermissions = {}) {
  const canAdd = !!basePermissions.canAdd;
  const canEdit = !!basePermissions.canEdit;
  const canDelete = !!basePermissions.canDelete;

  const modulePermissions = {};
  for (const key of MODULE_KEYS) {
    modulePermissions[key] = {
      view: true,
      add: canAdd,
      edit: canEdit,
      delete: canDelete,
      print: true,
      export: true,
      approve: canEdit,
      changeStatus: canEdit,
    };
  }
  return modulePermissions;
}

function buildDefaultProfileFromUser(user = {}) {
  const isAdmin = user.role === 'ADMIN';
  const basePermissions = {
    canAdd: isAdmin ? true : !!user.permissions?.canAdd,
    canEdit: isAdmin ? true : !!user.permissions?.canEdit,
    canDelete: isAdmin ? true : !!user.permissions?.canDelete,
    canManageUsers: isAdmin ? true : !!user.permissions?.canManageUsers,
  };

  const defaultProfileKey = isAdmin ? 'ADMINISTRATOR' : 'CUSTOM';

  return {
    userId: user.id,
    accessProfile: defaultProfileKey,
    jobTitle: '',
    modules: buildDefaultModulePermissions(basePermissions),
    sensitive: {
      viewValues: true,
      viewCost: isAdmin,
      viewMargin: isAdmin,
      manageUsers: basePermissions.canManageUsers,
    },
    updatedAt: null,
    updatedBy: null,
  };
}

function sanitizeModules(modulesInput, fallbackModules) {
  const source = modulesInput && typeof modulesInput === 'object' ? modulesInput : {};
  const fallback = fallbackModules && typeof fallbackModules === 'object' ? fallbackModules : {};

  const modules = {};
  for (const moduleKey of MODULE_KEYS) {
    const sourceRow = source[moduleKey] && typeof source[moduleKey] === 'object' ? source[moduleKey] : {};
    const fallbackRow = fallback[moduleKey] && typeof fallback[moduleKey] === 'object' ? fallback[moduleKey] : {};

    const row = {};
    for (const actionKey of ACTION_KEYS) {
      row[actionKey] = toBool(sourceRow[actionKey], fallbackRow[actionKey]);
    }

    modules[moduleKey] = row;
  }

  return modules;
}

function sanitizeSensitive(sensitiveInput, fallbackSensitive = {}) {
  const source = sensitiveInput && typeof sensitiveInput === 'object' ? sensitiveInput : {};
  return {
    viewValues: toBool(source.viewValues, fallbackSensitive.viewValues),
    viewCost: toBool(source.viewCost, fallbackSensitive.viewCost),
    viewMargin: toBool(source.viewMargin, fallbackSensitive.viewMargin),
    manageUsers: toBool(source.manageUsers, fallbackSensitive.manageUsers),
  };
}

function sanitizeProfileInput(input = {}, fallbackProfile = {}, user = {}, actor = 'system') {
  const base = buildDefaultProfileFromUser(user);
  const fallback = { ...base, ...(fallbackProfile || {}) };

  const profile = {
    userId: user.id,
    accessProfile: sanitizeText(input.accessProfile, fallback.accessProfile || 'CUSTOM'),
    jobTitle: sanitizeText(input.jobTitle, fallback.jobTitle || ''),
    modules: sanitizeModules(input.modules, fallback.modules || base.modules),
    sensitive: sanitizeSensitive(input.sensitive, fallback.sensitive || base.sensitive),
    updatedAt: new Date().toISOString(),
    updatedBy: sanitizeText(actor, 'system'),
  };

  if (user.role === 'ADMIN') {
    profile.sensitive.manageUsers = true;
  }

  return profile;
}

function summarizeRolePermissions(profile = {}) {
  const modules = profile.modules || {};
  const rows = Object.values(modules);

  const canAdd = rows.some((row) => !!row.add);
  const canEdit = rows.some((row) => !!row.edit || !!row.changeStatus);
  const canDelete = rows.some((row) => !!row.delete);
  const canManageUsers = !!profile?.sensitive?.manageUsers;

  return { canAdd, canEdit, canDelete, canManageUsers };
}

async function findOrCreateStore() {
  const byCode = await prisma.digitalAccount.findFirst({
    where: { code: STORAGE_CODE },
    orderBy: { updatedAt: 'desc' },
  });
  if (byCode) return byCode;

  const byLabel = await prisma.digitalAccount.findFirst({
    where: { platform: 'OTHER', label: STORAGE_LABEL },
    orderBy: { updatedAt: 'desc' },
  });
  if (byLabel) return byLabel;

  const seed = {
    kind: 'access_profiles',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    profiles: {},
    history: [],
  };

  return prisma.digitalAccount.create({
    data: {
      code: STORAGE_CODE,
      platform: 'OTHER',
      label: STORAGE_LABEL,
      status: 'ACTIVE',
      verified: true,
      active: true,
      notes: JSON.stringify(seed),
    },
  });
}

async function getStorePayload() {
  const store = await findOrCreateStore();
  const notes = parseMaybeJson(store.notes) || {};

  return {
    store,
    payload: {
      kind: 'access_profiles',
      version: 1,
      updatedAt: notes.updatedAt || null,
      updatedBy: notes.updatedBy || null,
      profiles: notes.profiles && typeof notes.profiles === 'object' ? notes.profiles : {},
      history: Array.isArray(notes.history) ? notes.history : [],
    },
  };
}

async function getAccessProfileForUser(user) {
  if (!user?.id) throw new Error('UserId obrigatorio para perfil de acesso.');

  const { payload } = await getStorePayload();
  const existing = payload.profiles[user.id] || null;
  const base = buildDefaultProfileFromUser(user);

  if (!existing) return base;

  return sanitizeProfileInput(existing, existing, user, existing.updatedBy || 'system');
}

async function saveAccessProfileForUser(user, input, actor = 'system', reason = '') {
  if (!user?.id) throw new Error('UserId obrigatorio para salvar perfil de acesso.');

  const { store, payload } = await getStorePayload();
  const before = payload.profiles[user.id] || buildDefaultProfileFromUser(user);
  const after = sanitizeProfileInput(input, before, user, actor);

  payload.profiles[user.id] = after;
  payload.updatedAt = new Date().toISOString();
  payload.updatedBy = sanitizeText(actor, 'system');

  const historyEntry = {
    id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    when: new Date().toISOString(),
    actor: sanitizeText(actor, 'system'),
    userId: user.id,
    reason: sanitizeText(reason, '-'),
    before: {
      accessProfile: before.accessProfile,
      jobTitle: before.jobTitle,
      sensitive: before.sensitive,
    },
    after: {
      accessProfile: after.accessProfile,
      jobTitle: after.jobTitle,
      sensitive: after.sensitive,
    },
  };

  payload.history = [historyEntry, ...(payload.history || [])].slice(0, MAX_HISTORY);

  await prisma.digitalAccount.update({
    where: { id: store.id },
    data: {
      code: STORAGE_CODE,
      platform: 'OTHER',
      label: STORAGE_LABEL,
      status: 'ACTIVE',
      active: true,
      notes: JSON.stringify(payload),
    },
  });

  return after;
}

async function getAccessProfileHistory(userId, page = 1, limit = 20) {
  const safePage = Math.max(1, Number.parseInt(String(page || ''), 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit || ''), 10) || 20));

  const { payload } = await getStorePayload();
  const rows = (payload.history || []).filter((entry) => String(entry.userId) === String(userId));

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const offset = (safePage - 1) * safeLimit;

  return {
    data: rows.slice(offset, offset + safeLimit),
    total,
    page: safePage,
    pages,
  };
}

module.exports = {
  MODULE_KEYS,
  ACTION_KEYS,
  summarizeRolePermissions,
  buildDefaultProfileFromUser,
  getAccessProfileForUser,
  saveAccessProfileForUser,
  getAccessProfileHistory,
};
