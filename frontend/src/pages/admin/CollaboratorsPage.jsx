import { useEffect, useMemo, useState } from 'react';
import { authAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const PROFILE_PRESETS = {
  SELLER: {
    label: 'Vendedor',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  MECHANIC: {
    label: 'Mecanico',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  FINANCIAL: {
    label: 'Financeiro',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  DRIVER: {
    label: 'Entregador / Motorista',
    permissions: { canAdd: true, canEdit: false, canDelete: false, canManageUsers: false },
  },
  RENTAL: {
    label: 'Locacao',
    permissions: { canAdd: true, canEdit: true, canDelete: false, canManageUsers: false },
  },
  MANAGER: {
    label: 'Gestor',
    permissions: { canAdd: true, canEdit: true, canDelete: true, canManageUsers: true },
  },
  CUSTOM: {
    label: 'Personalizado',
    permissions: null,
  },
};

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

export default function CollaboratorsPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE);
  const [editForm, setEditForm] = useState(DEFAULT_EDIT);

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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Colaboradores e Permissoes</div>
          <div className="page-subtitle">Perfis sugeridos: vendedor, mecanico, financeiro, entregador/motorista, locacao e gestor</div>
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
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Editar</button>
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
    </div>
  );
}
