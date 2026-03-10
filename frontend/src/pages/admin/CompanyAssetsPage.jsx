import { useEffect, useState } from 'react';
import { companyAssetsAPI } from '../../services/api';

const CATEGORIES = ['TOW_TRUCK', 'CAR', 'MOTORCYCLE', 'EQUIPMENT', 'DEVICE', 'OTHER'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FOR_SALE', 'FOR_RENT'];

const statusLabel = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  MAINTENANCE: 'Manutencao',
  FOR_SALE: 'Venda',
  FOR_RENT: 'Locacao',
};

export default function CompanyAssetsPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');

  const [form, setForm] = useState({
    code: '',
    name: '',
    category: 'OTHER',
    plate: '',
    identifier: '',
    intendedUse: '',
    description: '',
    status: 'ACTIVE',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await companyAssetsAPI.list({ search, category, status, page: 1, limit: 100 });
      setItems(res.data.data || []);
      setTotal(res.data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, category, status]);

  const clearForm = () => {
    setEditingId('');
    setForm({
      code: '',
      name: '',
      category: 'OTHER',
      plate: '',
      identifier: '',
      intendedUse: '',
      description: '',
      status: 'ACTIVE',
      notes: '',
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.category) {
      alert('Nome e categoria sao obrigatorios.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await companyAssetsAPI.update(editingId, form);
      } else {
        await companyAssetsAPI.create(form);
      }
      clearForm();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar ativo.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      code: item.code || '',
      name: item.name || '',
      category: item.category || 'OTHER',
      plate: item.plate || '',
      identifier: item.identifier || '',
      intendedUse: item.intendedUse || '',
      description: item.description || '',
      status: item.status || 'ACTIVE',
      notes: item.notes || '',
    });
  };

  const remove = async (id) => {
    if (!confirm('Desativar este ativo?')) return;
    await companyAssetsAPI.remove(id);
    await load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ativos da Empresa</div>
          <div className="page-subtitle">{total} ativos cadastrados</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <input className="form-control" placeholder="Codigo" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input className="form-control" placeholder="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="form-control" placeholder="Placa" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
            <input className="form-control" placeholder="Identificador" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            <input className="form-control" placeholder="Uso previsto" value={form.intendedUse} onChange={(e) => setForm({ ...form, intendedUse: e.target.value })} />
            <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s] || s}</option>)}
            </select>
            <input className="form-control" placeholder="Descricao" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="form-control" placeholder="Observacoes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}</button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={clearForm}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por nome, placa, identificador..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-control" style={{ width: 180 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <div className="empty-state"><div className="empty-state-text">Nenhum ativo encontrado</div></div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>Categoria</th><th>Placa</th><th>Uso</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="text-sm"><strong>{item.name}</strong><div className="text-muted">{item.code || '-'}</div></td>
                  <td className="text-sm">{item.category}</td>
                  <td className="text-sm">{item.plate || '-'}</td>
                  <td className="text-sm">{item.intendedUse || '-'}</td>
                  <td className="text-sm">{statusLabel[item.status] || item.status}</td>
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
