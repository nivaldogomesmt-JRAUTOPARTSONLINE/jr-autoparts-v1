import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { clientsAPI } from '../../services/api';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientsAPI.list({ search, page, limit: 20 });
      setClients(res.data.data);
      setTotal(res.data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, page]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-subtitle">{total} clientes cadastrados</div>
        </div>
        <Link to="/clientes/novo" className="btn btn-primary">+ Novo Cliente</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="🔍  Buscar por nome, CPF/CNPJ ou telefone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">Nenhum cliente encontrado</div>
            <Link to="/clientes/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Cliente</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Veículos</th>
                  <th>OS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="text-sm text-muted">{c.email}</div>
                    </td>
                    <td className="text-sm">{c.cpfCnpj || '—'}</td>
                    <td className="text-sm">{c.phone || '—'}</td>
                    <td><span className="badge badge-blue">{c._count.vehicles}</span></td>
                    <td><span className="badge badge-gray">{c._count.serviceOrders}</span></td>
                    <td>
                      <Link to={`/clientes/${c.id}`} className="btn btn-outline btn-sm">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Anterior</button>
            <span style={{ padding: '5px 10px', fontSize: 13 }}>Página {page} de {Math.ceil(total/20)}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p+1)} disabled={clients.length < 20}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  );
}
