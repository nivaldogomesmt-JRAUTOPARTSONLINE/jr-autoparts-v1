import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { vehiclesAPI, clientsAPI } from '../../services/api';

export default function VehicleForm() {
  const { id } = useParams(); const [sp] = useSearchParams(); const navigate = useNavigate(); const isEdit = Boolean(id);
  const [form, setForm] = useState({ clientId: sp.get('clientId') || '', plate: '', brand: '', model: '', year: '', color: '', fuel: '', currentKm: '', notes: '' });
  const [clients, setClients] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    clientsAPI.list({ limit: 200 }).then(r => setClients(r.data.data));
    if (isEdit) vehiclesAPI.get(id).then(r => { const v = r.data; setForm({ clientId: v.clientId, plate: v.plate, brand: v.brand, model: v.model, year: v.year || '', color: v.color || '', fuel: v.fuel || '', currentKm: v.currentKm || '', notes: v.notes || '' }); });
  }, [id]);
  const set = (k,v) => setForm(f => ({...f, [k]: v}));
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      if (isEdit) { await vehiclesAPI.update(id, form); navigate(`/veiculos/${id}`); }
      else { const r = await vehiclesAPI.create(form); navigate(`/veiculos/${r.data.id}`); }
    } catch (err) { setError(err.response?.data?.error || 'Erro ao salvar.'); } finally { setLoading(false); }
  };
  return (
    <div>
      <div className="page-header"><div className="page-title">{isEdit ? 'Editar Veículo' : 'Novo Veículo'}</div><button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button></div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">Cliente</label>
              <select className="form-control" value={form.clientId} onChange={e => set('clientId', e.target.value)} required>
                <option value="">Selecione...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label required">Placa</label><input className="form-control" value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} required placeholder="ABC1234" maxLength={8}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">Marca</label><input className="form-control" value={form.brand} onChange={e => set('brand', e.target.value)} required placeholder="Ex: Volkswagen"/></div>
            <div className="form-group"><label className="form-label required">Modelo</label><input className="form-control" value={form.model} onChange={e => set('model', e.target.value)} required placeholder="Ex: Gol"/></div>
            <div className="form-group"><label className="form-label">Ano</label><input type="number" className="form-control" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" min={1950} max={2030}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Cor</label><input className="form-control" value={form.color} onChange={e => set('color', e.target.value)} placeholder="Branco"/></div>
            <div className="form-group"><label className="form-label">Combustível</label>
              <select className="form-control" value={form.fuel} onChange={e => set('fuel', e.target.value)}>
                <option value="">Selecione...</option>
                {['Gasolina','Álcool','Flex','Diesel','GNV','Elétrico','Híbrido'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">KM Atual</label><input type="number" className="form-control" value={form.currentKm} onChange={e => set('currentKm', e.target.value)} placeholder="85000"/></div>
          </div>
          <div className="form-group"><label className="form-label">Observações</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informações relevantes sobre o veículo..."/></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar Veículo'}</button>
        </div>
      </form>
    </div>
  );
}
