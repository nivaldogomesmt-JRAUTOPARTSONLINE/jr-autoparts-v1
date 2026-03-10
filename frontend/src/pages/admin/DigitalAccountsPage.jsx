import { useEffect, useState } from 'react';
import { digitalAccountsAPI } from '../../services/api';

const PLATFORMS = [
  'WHATSAPP_BUSINESS',
  'OLX',
  'BOTCONVERSA',
  'INSTAGRAM',
  'FACEBOOK',
  'CHATGPT',
  'CLAUDE',
  'MAKE',
  'GMAIL_WORKSPACE',
  'OTHER',
];

const STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING'];

const statusLabel = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  PENDING: 'Pendente',
};

export default function DigitalAccountsPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');

  const [form, setForm] = useState({
    code: '',
    platform: 'OTHER',
    label: '',
    contact: '',
    plan: '',
    status: 'ACTIVE',
    verified: false,
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await digitalAccountsAPI.list({ search, platform, status, page: 1, limit: 100 });
      setItems(res.data.data || []);
      setTotal(res.data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, platform, status]);

  const clearForm = () => {
    setEditingId('');
    setForm({
      code: '',
      platform: 'OTHER',
      label: '',
      contact: '',
      plan: '',
      status: 'ACTIVE',
      verified: false,
      notes: '',
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.platform || !form.label) {
      alert('Plataforma e nome sao obrigatorios.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await digitalAccountsAPI.update(editingId, form);
      } else {
        await digitalAccountsAPI.create(form);
      }
      clearForm();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar conta digital.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      code: item.code || '',
      platform: item.platform || 'OTHER',
      label: item.label || '',
      contact: item.contact || '',
      plan: item.plan || '',
      status: item.status || 'ACTIVE',
      verified: Boolean(item.verified),
      notes: item.notes || '',
    });
  };

  const remove = async (id) => {
    if (!confirm('Desativar esta conta digital?')) return;
    await digitalAccountsAPI.remove(id);
    await load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contas Digitais</div>
          <div className="page-subtitle">{total} contas/canais cadastrados</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <input className="form-control" placeholder="Codigo" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <select className="form-control" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="form-control" placeholder="Nome da conta *" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            <input className="form-control" placeholder="Contato/usuario" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className="form-control" placeholder="Plano" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
            <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s] || s}</option>)}
            </select>
            <input className="form-control" placeholder="Observacoes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} />
              Verificada
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}</button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={clearForm}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por nome, contato..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-control" style={{ width: 220 }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Todas plataformas</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="form-control" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s] || s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">Nenhuma conta digital encontrada</div></div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Conta</th><th>Plataforma</th><th>Contato</th><th>Plano</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="text-sm"><strong>{item.label}</strong><div className="text-muted">{item.code || '-'}</div></td>
                  <td className="text-sm">{item.platform}</td>
                  <td className="text-sm">{item.contact || '-'}</td>
                  <td className="text-sm">{item.plan || '-'}</td>
                  <td className="text-sm">{statusLabel[item.status] || item.status}{item.verified ? ' / verificada' : ''}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Editar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(item.id)}>Desativar</button>
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
