import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { soAPI, clientsAPI, vehiclesAPI, productsAPI, servicesAPI } from '../../services/api';

export default function SOForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ clientId: '', vehicleId: '', entryKm: '', notes: '' });
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Carrega listas
  useEffect(() => {
    Promise.all([
      clientsAPI.list({ limit: 200 }),
      productsAPI.list({ limit: 500 }),
      servicesAPI.list(),
    ]).then(([c, p, s]) => {
      setClients(c.data.data);
      setProducts(p.data.data);
      setServices(s.data);
    });

    if (isEdit) {
      soAPI.get(id).then(res => {
        const os = res.data;
        setForm({ clientId: os.clientId, vehicleId: os.vehicleId, entryKm: os.entryKm || '', notes: os.notes || '' });
        setItems(os.items.map(i => ({
          type: i.type, itemId: i.productId || i.serviceId, itemName: i.itemName,
          quantity: parseFloat(i.quantity), unitPrice: parseFloat(i.unitPrice),
        })));
      });
    }
  }, [id]);

  // Carrega veículos ao selecionar cliente
  useEffect(() => {
    if (form.clientId) {
      vehiclesAPI.list({ clientId: form.clientId }).then(res => setVehicles(res.data.data));
    } else {
      setVehicles([]);
    }
  }, [form.clientId]);

  const addItem = (type, item) => {
    setItems(prev => [...prev, {
      type, itemId: item.id, itemName: item.name,
      quantity: 1, unitPrice: parseFloat(item.price),
    }]);
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const total = items.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId || !form.vehicleId) return setError('Selecione cliente e veículo.');
    setLoading(true); setError('');
    try {
      if (isEdit) {
        await soAPI.update(id, { ...form, items });
      } else {
        const res = await soAPI.create({ ...form, items });
        return navigate(`/os/${res.data.id}`);
      }
      navigate(`/os/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar OS.');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{isEdit ? 'Editar OS' : 'Nova Ordem de Serviço'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Cliente e veículo */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Dados do Cliente</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select
                className="form-control"
                value={form.clientId}
                onChange={e => setForm(f => ({ ...f, clientId: e.target.value, vehicleId: '' }))}
                required
              >
                <option value="">Selecione o cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Veículo</label>
              <select
                className="form-control"
                value={form.vehicleId}
                onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
                required
                disabled={!form.clientId}
              >
                <option value="">Selecione o veículo...</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">KM de Entrada</label>
              <input
                type="number" className="form-control" placeholder="Ex: 85000"
                value={form.entryKm}
                onChange={e => setForm(f => ({ ...f, entryKm: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea
              className="form-control" rows={3} placeholder="Descreva o problema relatado pelo cliente..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        {/* Itens */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Serviços e Peças</div>

          {/* Adicionar serviço */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Adicionar Serviço</label>
            <select className="form-control" onChange={e => {
              const s = services.find(x => x.id === e.target.value);
              if (s) addItem('SERVICE', s);
              e.target.value = '';
            }}>
              <option value="">Selecione um serviço...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — R$ {parseFloat(s.price).toFixed(2)}</option>)}
            </select>
          </div>

          {/* Adicionar produto */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Adicionar Peça / Produto</label>
            <select className="form-control" onChange={e => {
              const p = products.find(x => x.id === e.target.value);
              if (p) addItem('PRODUCT', p);
              e.target.value = '';
            }}>
              <option value="">Selecione um produto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — R$ {parseFloat(p.price).toFixed(2)}</option>)}
            </select>
          </div>

          {/* Lista de itens */}
          {items.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Item</th>
                  <th>Qtd</th>
                  <th>Preço Unit.</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td><span className={`badge ${item.type === 'SERVICE' ? 'badge-blue' : 'badge-gray'}`}>{item.type === 'SERVICE' ? 'Serviço' : 'Peça'}</span></td>
                    <td>{item.itemName}</td>
                    <td>
                      <input
                        type="number" min="0.01" step="0.01"
                        className="form-control" style={{ width: 70 }}
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01"
                        className="form-control" style={{ width: 100 }}
                        value={item.unitPrice}
                        onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                      />
                    </td>
                    <td><strong>R$ {(parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2).replace('.', ',')}</strong></td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                  <td style={{ fontWeight: 700, fontSize: 16, color: '#1A3C5E' }}>R$ {total.toFixed(2).replace('.', ',')}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar OS'}
          </button>
        </div>
      </form>
    </div>
  );
}
