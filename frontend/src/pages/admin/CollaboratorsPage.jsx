import { useEffect, useMemo, useState } from 'react';
import { authAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const PROFILE_PRESETS = {
  ADMINISTRATOR: {
    label: 'Administrador',
    permissions: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
  },
  MANAGER: {
    label: 'Gestor',
    permissions: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
  },
  FINANCIAL: {
    label: 'Financeiro',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  SELLER: {
    label: 'Vendedor',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  MECHANIC: {
    label: 'Mecanico',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  STOCK_KEEPER: {
    label: 'Estoquista',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  INSTALLER: {
    label: 'Instalador',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  DRIVER: {
    label: 'Motorista / Entregador',
    permissions: { canAdd: true, canEdit: false, canDelete: false, canManageUsers: false },
  },
  SERVICE_DESK: {
    label: 'Atendimento',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  TRACKING: {
    label: 'Rastreamento',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  RENTAL: {
    label: 'Locacao',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  CUSTOM: {
    label: 'Personalizado',
    permissions: null,
  },
};

const ACCESS_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clients', label: 'Clientes' },
  { key: 'vehicles', label: 'Veiculos' },
  { key: 'products', label: 'Produtos' },
  { key: 'services', label: 'Servicos' },
  { key: 'serviceOrders', label: 'Ordens de Servico' },
  { key: 'deliveries', label: 'Entregas/Pedidos' },
  { key: 'tracking', label: 'Rastreamento' },
  { key: 'integrations', label: 'Integracoes' },
  { key: 'collaborators', label: 'Colaboradores' },
];

const ACCESS_ACTIONS = [
  { key: 'view', label: 'Visualizar' },
  { key: 'add', label: 'Cadastrar' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
  { key: 'print', label: 'Imprimir' },
  { key: 'export', label: 'Exportar' },
  { key: 'approve', label: 'Aprovar' },
  { key: 'changeStatus', label: 'Alterar status' },
];

const DEFAULT_CREATE = {
  name: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
  accessProfile: 'SELLER',
  canAdd: true,
  canEdit: true,
  canDelete: false,
  canManageUsers: false,
};

const DEFAULT_EDIT = {
  name: '',
  role: 'EMPLOYEE',
  active: true,
  accessProfile: 'CUSTOM',
  canAdd: true,
  canEdit: true,
  canDelete: false,
  canManageUsers: false,
};

function toRoleLabel(role) {
  if (role === 'ADMIN') return 'Administrador';
  if (role === 'EMPLOYEE') return 'Colaborador';
  return role;
}

function profileFromPermissions(perms = {}) {
  const keys = ['canAdd', 'canEdit', 'canDelete', 'canManageUsers'];
  for (const [profileKey, profile] of Object.entries(PROFILE_PRESETS)) {
    if (!profile.permissions) continue;
    const same = keys.every((k) => !!profile.permissions[k] === !!perms[k]);
    if (same) return profileKey;
  }
  return 'CUSTOM';
}

function applyPreset(form, profileKey, canCreateAdmin) {
  const preset = PROFILE_PRESETS[profileKey];
  if (!preset || !preset.permissions) {
    return { ...form, accessProfile: 'CUSTOM' };
  }

  const next = {
    ...form,
    accessProfile: profileKey,
    canAdd: !!preset.permissions.canAdd,
    canEdit: !!preset.permissions.canEdit,
    canDelete: !!preset.permissions.canDelete,
    canManageUsers: canCreateAdmin ? !!preset.permissions.canManageUsers : false,
  };

  return next;
}

function permissionsLabel(item) {
  return `${item.permissions?.canAdd ? 'A' : '-'} / ${item.permissions?.canEdit ? 'E' : '-'} / ${item.permissions?.canDelete ? 'D' : '-'} / ${item.permissions?.canManageUsers ? 'U' : '-'}`;
}

function buildAccessModulesFromBase(perms = {}) {
  const canAdd = !!perms.canAdd;
  const canEdit = !!perms.canEdit;
  const canDelete = !!perms.canDelete;

  const matrix = {};
  for (const module of ACCESS_MODULES) {
    matrix[module.key] = {
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

  return matrix;
}

function normalizeAccessProfile(profile = {}, fallbackPerms = {}, role = 'EMPLOYEE') {
  const defaultModules = buildAccessModulesFromBase(fallbackPerms);
  const modulesInput = profile.modules && typeof profile.modules === 'object' ? profile.modules : {};

  const modules = {};
  for (const module of ACCESS_MODULES) {
    const source = modulesInput[module.key] && typeof modulesInput[module.key] === 'object' ? modulesInput[module.key] : {};
    modules[module.key] = {};
    for (const action of ACCESS_ACTIONS) {
      const fallback = defaultModules[module.key][action.key];
      modules[module.key][action.key] = source[action.key] !== undefined ? !!source[action.key] : !!fallback;
    }
  }

  const sensitive = profile.sensitive && typeof profile.sensitive === 'object' ? profile.sensitive : {};

  return {
    accessProfile: String(profile.accessProfile || profileFromPermissions(fallbackPerms) || 'CUSTOM'),
    jobTitle: String(profile.jobTitle || ''),
    modules,
    sensitive: {
      viewValues: sensitive.viewValues !== undefined ? !!sensitive.viewValues : true,
      viewCost: sensitive.viewCost !== undefined ? !!sensitive.viewCost : role === 'ADMIN',
      viewMargin: sensitive.viewMargin !== undefined ? !!sensitive.viewMargin : role === 'ADMIN',
      manageUsers: sensitive.manageUsers !== undefined ? !!sensitive.manageUsers : !!fallbackPerms.canManageUsers,
    },
    updatedAt: profile.updatedAt || null,
    updatedBy: profile.updatedBy || null,
  };
}

function toDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CollaboratorsPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE);
  const [editForm, setEditForm] = useState(DEFAULT_EDIT);

  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessTarget, setAccessTarget] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessHistory, setAccessHistory] = useState([]);
  const [accessReason, setAccessReason] = useState('');
  const [accessForm, setAccessForm] = useState(() => normalizeAccessProfile({}, { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false }));

  const canCreateAdmin = isAdmin();

  const roleOptions = useMemo(() => {
    if (canCreateAdmin) {
      return [
        { value: 'EMPLOYEE', label: 'Colaborador' },
        { value: 'ADMIN', label: 'Administrador' },
      ];
    }

    return [{ value: 'EMPLOYEE', label: 'Colaborador' }];
  }, [canCreateAdmin]);

  const profileOptions = useMemo(
    () => Object.entries(PROFILE_PRESETS).map(([value, cfg]) => ({ value, label: cfg.label })),
    []
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAPI.listUsers();
      setItems(res.data || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao listar colaboradores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearCreate = () => setCreateForm(DEFAULT_CREATE);

  const handleCreateProfileChange = (profileKey) => {
    setCreateForm((prev) => applyPreset(prev, profileKey, canCreateAdmin));
  };

  const handleEditProfileChange = (profileKey) => {
    setEditForm((prev) => applyPreset(prev, profileKey, canCreateAdmin));
  };

  const submitCreate = async (e) => {
    e.preventDefault();

    if (!createForm.name || !createForm.email || !createForm.password) {
      alert('Preencha nome, email e senha.');
      return;
    }

    setSavingCreate(true);
    try {
      await authAPI.createUser({
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
        role: createForm.role,
        permissions: {
          canAdd: createForm.canAdd,
          canEdit: createForm.canEdit,
          canDelete: createForm.canDelete,
          canManageUsers: canCreateAdmin ? createForm.canManageUsers : false,
        },
      });

      clearCreate();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cadastrar colaborador.');
    } finally {
      setSavingCreate(false);
    }
  };

  const startEdit = (item) => {
    const inferredProfile = profileFromPermissions(item.permissions || {});
    setEditingId(item.id);
    setEditForm({
      name: item.name || '',
      role: item.role || 'EMPLOYEE',
      active: item.active !== false,
      accessProfile: inferredProfile,
      canAdd: item.permissions?.canAdd ?? true,
      canEdit: item.permissions?.canEdit ?? true,
      canDelete: item.permissions?.canDelete ?? false,
      canManageUsers: item.permissions?.canManageUsers ?? false,
    });
  };

  const cancelEdit = () => {
    setEditingId('');
    setEditForm(DEFAULT_EDIT);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;

    setSavingEdit(true);
    try {
      await authAPI.updateUser(editingId, {
        name: editForm.name.trim(),
        role: editForm.role,
        active: editForm.active,
        permissions: {
          canAdd: editForm.canAdd,
          canEdit: editForm.canEdit,
          canDelete: editForm.canDelete,
          canManageUsers: canCreateAdmin ? editForm.canManageUsers : false,
        },
      });

      cancelEdit();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar colaborador.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deactivate = async (item) => {
    if (!window.confirm(`Desativar colaborador ${item.name}?`)) return;

    try {
      await authAPI.removeUser(item.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desativar colaborador.');
    }
  };

  const closeAccessModal = () => {
    setAccessModalOpen(false);
    setAccessTarget(null);
    setAccessHistory([]);
    setAccessReason('');
    setAccessLoading(false);
    setAccessSaving(false);
  };

  const openAccessModal = async (item) => {
    setAccessTarget(item);
    setAccessModalOpen(true);
    setAccessLoading(true);
    setAccessHistory([]);
    setAccessReason('');

    try {
      const [profileRes, historyRes] = await Promise.all([
        authAPI.getAccessProfile(item.id),
        authAPI.listAccessHistory(item.id, { page: 1, limit: 20 }),
      ]);

      const profile = normalizeAccessProfile(profileRes.data?.profile || {}, item.permissions || {}, item.role);
      setAccessForm(profile);
      setAccessHistory(Array.isArray(historyRes.data?.data) ? historyRes.data.data : []);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao carregar perfil detalhado de acesso.');
      closeAccessModal();
    } finally {
      setAccessLoading(false);
    }
  };

  const setAccessModuleField = (moduleKey, actionKey, checked) => {
    setAccessForm((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [moduleKey]: {
          ...prev.modules[moduleKey],
          [actionKey]: checked,
        },
      },
    }));
  };

  const applyAccessPreset = (profileKey) => {
    const preset = PROFILE_PRESETS[profileKey];
    if (!preset || !preset.permissions) {
      setAccessForm((prev) => ({ ...prev, accessProfile: 'CUSTOM' }));
      return;
    }

    const modules = buildAccessModulesFromBase({
      canAdd: preset.permissions.canAdd,
      canEdit: preset.permissions.canEdit,
      canDelete: preset.permissions.canDelete,
      canManageUsers: canCreateAdmin ? preset.permissions.canManageUsers : false,
    });

    setAccessForm((prev) => ({
      ...prev,
      accessProfile: profileKey,
      modules,
      sensitive: {
        ...prev.sensitive,
        manageUsers: canCreateAdmin ? !!preset.permissions.canManageUsers : false,
      },
    }));
  };

  const saveAccessProfile = async () => {
    if (!accessTarget?.id) return;

    setAccessSaving(true);
    try {
      await authAPI.saveAccessProfile(accessTarget.id, {
        accessProfile: accessForm.accessProfile,
        jobTitle: accessForm.jobTitle,
        modules: accessForm.modules,
        sensitive: accessForm.sensitive,
        reason: accessReason,
      });

      const [profileRes, historyRes] = await Promise.all([
        authAPI.getAccessProfile(accessTarget.id),
        authAPI.listAccessHistory(accessTarget.id, { page: 1, limit: 20 }),
      ]);

      setAccessForm(normalizeAccessProfile(profileRes.data?.profile || {}, accessTarget.permissions || {}, accessTarget.role));
      setAccessHistory(Array.isArray(historyRes.data?.data) ? historyRes.data.data : []);
      setAccessReason('');

      await load();
      alert('Perfil detalhado de acesso salvo com sucesso.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar perfil detalhado de acesso.');
    } finally {
      setAccessSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Colaboradores e Permissoes</div>
          <div className="page-subtitle">Função/cargo, perfil de acesso, permissões detalhadas por módulo e histórico de alterações</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>Novo colaborador</h3>
        <form onSubmit={submitCreate}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <input
              className="form-control"
              placeholder="Nome completo"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
            <input
              className="form-control"
              placeholder="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
            <input
              className="form-control"
              placeholder="Senha inicial"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
            />
            <select
              className="form-control"
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              className="form-control"
              value={createForm.accessProfile}
              onChange={(e) => handleCreateProfileChange(e.target.value)}
            >
              {profileOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <label><input type="checkbox" checked={createForm.canAdd} onChange={(e) => setCreateForm({ ...createForm, accessProfile: 'CUSTOM', canAdd: e.target.checked })} /> Adicionar</label>
            <label><input type="checkbox" checked={createForm.canEdit} onChange={(e) => setCreateForm({ ...createForm, accessProfile: 'CUSTOM', canEdit: e.target.checked })} /> Editar</label>
            <label><input type="checkbox" checked={createForm.canDelete} onChange={(e) => setCreateForm({ ...createForm, accessProfile: 'CUSTOM', canDelete: e.target.checked })} /> Excluir</label>
            <label><input type="checkbox" checked={createForm.canManageUsers} disabled={!canCreateAdmin} onChange={(e) => setCreateForm({ ...createForm, accessProfile: 'CUSTOM', canManageUsers: e.target.checked })} /> Gerenciar usuarios</label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" disabled={savingCreate}>{savingCreate ? 'Salvando...' : 'Cadastrar colaborador'}</button>
            <button type="button" className="btn btn-ghost" onClick={clearCreate}>Limpar</button>
          </div>
        </form>
      </div>

      {editingId && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Editar colaborador</h3>
          <form onSubmit={submitEdit}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <input
                className="form-control"
                placeholder="Nome completo"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
              <select
                className="form-control"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                className="form-control"
                value={editForm.accessProfile}
                onChange={(e) => handleEditProfileChange(e.target.value)}
              >
                {profileOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                />
                Conta ativa
              </label>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <label><input type="checkbox" checked={editForm.canAdd} onChange={(e) => setEditForm({ ...editForm, accessProfile: 'CUSTOM', canAdd: e.target.checked })} /> Adicionar</label>
              <label><input type="checkbox" checked={editForm.canEdit} onChange={(e) => setEditForm({ ...editForm, accessProfile: 'CUSTOM', canEdit: e.target.checked })} /> Editar</label>
              <label><input type="checkbox" checked={editForm.canDelete} onChange={(e) => setEditForm({ ...editForm, accessProfile: 'CUSTOM', canDelete: e.target.checked })} /> Excluir</label>
              <label><input type="checkbox" checked={editForm.canManageUsers} disabled={!canCreateAdmin} onChange={(e) => setEditForm({ ...editForm, accessProfile: 'CUSTOM', canManageUsers: e.target.checked })} /> Gerenciar usuarios</label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar alteracoes'}</button>
              <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">Nenhum colaborador encontrado</div></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Permissoes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="text-sm">
                    <strong>{item.name}</strong>
                    <div className="text-muted">{item.email}</div>
                  </td>
                  <td className="text-sm">{toRoleLabel(item.role)}</td>
                  <td className="text-sm">{item.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="text-sm">{permissionsLabel(item)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Editar</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openAccessModal(item)}>Acessos</button>
                      {item.id !== user?.id && item.active && (
                        <button className="btn btn-ghost btn-sm" onClick={() => deactivate(item)}>Desativar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {accessModalOpen && accessTarget ? (
        <div className="modal-overlay" onClick={closeAccessModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100, width: '98%' }}>
            <div className="modal-header">
              <div className="modal-title">Permissoes detalhadas: {accessTarget.name}</div>
              <button className="btn btn-ghost btn-sm" onClick={closeAccessModal}>Fechar</button>
            </div>

            <div className="modal-body">
              {accessLoading ? (
                <div className="loading"><div className="spinner" /></div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
                    <div>
                      <label className="form-label">Funcao/Cargo</label>
                      <input
                        className="form-control"
                        value={accessForm.jobTitle}
                        onChange={(e) => setAccessForm((prev) => ({ ...prev, jobTitle: e.target.value }))}
                        placeholder="Ex.: Consultor tecnico"
                      />
                    </div>

                    <div>
                      <label className="form-label">Perfil de acesso</label>
                      <select
                        className="form-control"
                        value={accessForm.accessProfile}
                        onChange={(e) => applyAccessPreset(e.target.value)}
                      >
                        {profileOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissoes sensiveis</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <label><input type="checkbox" checked={!!accessForm.sensitive?.viewValues} onChange={(e) => setAccessForm((prev) => ({ ...prev, sensitive: { ...prev.sensitive, viewValues: e.target.checked }, accessProfile: 'CUSTOM' }))} /> Ver valores</label>
                      <label><input type="checkbox" checked={!!accessForm.sensitive?.viewCost} onChange={(e) => setAccessForm((prev) => ({ ...prev, sensitive: { ...prev.sensitive, viewCost: e.target.checked }, accessProfile: 'CUSTOM' }))} /> Ver custo</label>
                      <label><input type="checkbox" checked={!!accessForm.sensitive?.viewMargin} onChange={(e) => setAccessForm((prev) => ({ ...prev, sensitive: { ...prev.sensitive, viewMargin: e.target.checked }, accessProfile: 'CUSTOM' }))} /> Ver margem</label>
                      <label><input type="checkbox" checked={!!accessForm.sensitive?.manageUsers} disabled={!canCreateAdmin} onChange={(e) => setAccessForm((prev) => ({ ...prev, sensitive: { ...prev.sensitive, manageUsers: e.target.checked }, accessProfile: 'CUSTOM' }))} /> Gerenciar usuarios</label>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissoes por modulo e acao</div>
                    <div className="table-container" style={{ maxHeight: 340, overflowY: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Modulo</th>
                            {ACCESS_ACTIONS.map((action) => <th key={action.key}>{action.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {ACCESS_MODULES.map((module) => (
                            <tr key={module.key}>
                              <td style={{ fontWeight: 700 }}>{module.label}</td>
                              {ACCESS_ACTIONS.map((action) => (
                                <td key={`${module.key}-${action.key}`}>
                                  <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!accessForm.modules?.[module.key]?.[action.key]}
                                      onChange={(e) => {
                                        setAccessModuleField(module.key, action.key, e.target.checked);
                                        setAccessForm((prev) => ({ ...prev, accessProfile: 'CUSTOM' }));
                                      }}
                                    />
                                  </label>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                    <label className="form-label">Motivo da alteracao (opcional)</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={accessReason}
                      onChange={(e) => setAccessReason(e.target.value)}
                      placeholder="Ex.: ajuste de acesso para novo processo de atendimento"
                    />
                  </div>

                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Historico de alteracoes</div>
                    {!accessHistory.length ? (
                      <div className="text-sm text-muted">Sem alteracoes registradas para este colaborador.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                        {accessHistory.map((entry) => (
                          <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                              <b>{entry.actor || '-'}</b>
                              <span className="text-sm text-muted">{toDateTime(entry.when)}</span>
                            </div>
                            <div className="text-sm text-muted">Motivo: {entry.reason || '-'}</div>
                            <div className="text-sm">Perfil: <b>{entry.after?.accessProfile || '-'}</b> | Cargo: <b>{entry.after?.jobTitle || '-'}</b></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeAccessModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAccessProfile} disabled={accessLoading || accessSaving}>
                {accessSaving ? 'Salvando...' : 'Salvar perfil detalhado'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
