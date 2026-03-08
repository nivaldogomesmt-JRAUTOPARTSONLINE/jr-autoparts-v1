import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { vehiclesAPI } from '../../services/api';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    vehiclesAPI.list({ search, page, limit: 20 }).then(r => { setVehicles(r.data.data); setTotal(r.data.total); }).finally(() => setLoading(false));
  }, [search, page]);
  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Veículos</div><div className="page-subtitle">{total} veículos</div></div>
        <Link to="/veiculos/novo" className="btn btn-primary">+ Novo Veículo</Link>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <input className="form-control" placeholder="🔍  Placa, modelo, marca ou cliente..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <div className="card">
        {loading ? <div className="loading"><div className="spinner"/></div> : vehicles.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🚗</div><div className="empty-state-text">Nenhum veículo encontrado</div></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Placa</th><th>Veículo</th><th>Ano</th><th>KM</th><th>Proprietário</th><th></th></tr></thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td><strong>{v.plate}</strong></td>
                    <td>{v.brand} {v.model}<div className="text-sm text-muted">{v.color}</div></td>
                    <td>{v.year || '—'}</td>
                    <td>{v.currentKm ? v.currentKm.toLocaleString('pt-BR') + ' km' : '—'}</td>
                    <td><Link to={`/clientes/${v.clientId}`}>{v.client?.name}</Link></td>
                    <td><Link to={`/veiculos/${v.id}`} className="btn btn-outline btn-sm">Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
