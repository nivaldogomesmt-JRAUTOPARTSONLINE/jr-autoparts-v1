import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { soAPI } from '../../services/api';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'QUOTE', label: 'Orçamento' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'STARTED', label: 'Iniciado' },
  { value: 'IN_PROGRESS', label: 'Em Execução' },
  { value: 'WAITING_PART', label: 'Aguardando Peça' },
  { value: 'FINISHING', label: 'Finalizando' },
  { value: 'DONE', label: 'Finalizado' },
  { value: 'DELIVERED', label: 'Entregue' },
];

const BADGE = {
  QUOTE: 'badge-gray', APPROVED: 'badge-blue', STARTED: 'badge-purple',
  IN_PROGRESS: 'badge-purple', WAITING_PART: 'badge-orange',
  FINISHING: 'badge-yellow', DONE: 'badge-green', DELIVERED: 'badge-green',
};

export default function SOListPage() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await soAPI.list({ search, status, page, limit: 20 });
      setOrders(res.data.data);
      setTotal(res.data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, status, page]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ordens de Serviço</div>
          <div className="page-subtitle">{total} OS encontradas</div>
        </div>
        <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              className="form-control"
              placeholder="🔍  Buscar por nº, cliente ou placa..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 200 }}
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">Nenhuma OS encontrada</div>
            <Link to="/os/nova" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Nova OS</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Veículo / Placa</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(os => (
                  <tr key={os.id}>
                    <td><strong>#{os.number}</strong></td>
                    <td>{os.client.name}</td>
                    <td>
                      <strong>{os.vehicle.plate}</strong>
                      <div className="text-sm text-muted">{os.vehicle.brand} {os.vehicle.model}</div>
                    </td>
                    <td>
                      <span className={`badge ${BADGE[os.status] || 'badge-gray'}`}>
                        {STATUS_OPTIONS.find(s => s.value === os.status)?.label || os.status}
                      </span>
                    </td>
                    <td>R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}</td>
                    <td className="text-sm text-muted">
                      {new Date(os.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <Link to={`/os/${os.id}`} className="btn btn-outline btn-sm">Abrir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Anterior</button>
            <span style={{ padding: '5px 10px', fontSize: 13 }}>Página {page}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p+1)} disabled={orders.length < 20}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  );
}
