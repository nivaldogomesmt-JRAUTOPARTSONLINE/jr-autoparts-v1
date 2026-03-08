import { useState, useEffect } from 'react';
import { servicesAPI } from '../../services/api';

export default function ServicesPage() {
  const [services, setServices] = useState([]); const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', estimatedTime: '' });
  const [error, setError] = useState('');

  const load = () => { setLoading(true); servicesAPI.list({ active: 'true' }).then(r => setServices(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const openModal = (svc = null) => {
    setEditing(svc);
    setForm(svc ? { name: svc.name, description: svc.description || '', price: svc.price, estimatedTime: svc.estimatedTime || '' } : { name: '', description: '', price: '', estimatedTime: '' });
    setError(''); setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editing) await servicesAPI.update(editing.id, form);
      else await servicesAPI.create(form);
      setModal(false); load();
    } catch (err) { setError(err.response?.data?.error || 'Erro ao salvar.'); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Serviços</div><div className="page-subtitle">{services.length} serviços ativos</div></div>
        <button className="btn btn-primary" onClick={() => openModal()}>+ Novo Serviço</button>
      </div>
      <div className="card">
        {loading ? <div className="loading"><div className="spinner"/></div> : services.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🔧</div><div className="empty-state-text">Nenhum serviço cadastrado</div></div>
        ) : (
          <table className="table">
            <thead><tr><th>Serviço</th><th>Descrição</th><th>Preço</th><th>Tempo Est.</th><th></th></tr></thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="text-sm text-muted">{s.description}</td>
                  <td style={{ fontWeight: 700, color: '#1A3C5E' }}>R$ {parseFloat(s.price).toFixed(2).replace('.', ',')}</td>
                  <td className="text-sm">{s.estimatedTime ? `${s.estimatedTime} min` : '—'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => openModal(s)}>✏️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">{editing ? 'Editar Serviço' : 'Novo Serviço'}</div><button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button></div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group"><label className="form-label required">Nome do serviço</label><input className="form-control" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} required/></div>
                <div className="form-group"><label className="form-label">Descrição</label><textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))}/></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label required">Preço (R$)</label><input type="number" step="0.01" className="form-control" value={form.price} onChange={e => setForm(f=>({...f,price:e.target.value}))} required/></div>
                  <div className="form-group"><label className="form-label">Tempo estimado (min)</label><input type="number" className="form-control" value={form.estimatedTime} onChange={e => setForm(f=>({...f,estimatedTime:e.target.value}))} placeholder="60"/></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
