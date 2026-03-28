import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = () => localStorage.getItem('jr_token');
        const [rc, rr] = await Promise.all([
          fetch(API + '/api/clients?limit=5000', { headers: { Authorization: 'Bearer ' + token() } }),
          fetch(API + '/api/dashboard/ranking-clientes', { headers: { Authorization: 'Bearer ' + token() } }),
        ]);
        if (rc.ok) {
          const raw = await rc.json();
          setClients(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
        }
        if (rr.ok) {
          const raw = await rr.json();
          setRanking(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
        }
      } catch (e) {
        console.error('[ClientsPage] load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const normalizedSearch = search.toLowerCase();
  const filtered = clients.filter((c) => (
    !search
    || c.name?.toLowerCase().includes(normalizedSearch)
    || c.cpf_cnpj?.includes(search)
    || c.phone?.includes(search)
    || c.email?.toLowerCase().includes(normalizedSearch)
  ));

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{clients.length} cliente{clients.length !== 1 ? 's' : ''} cadastrado{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/clientes/novo')}>+ Novo Cliente</button>
          <button className="btn btn-outline" onClick={() => navigate('/integracoes')}>Exportar</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {ranking.length > 0 && (
            <div className="section">
              <div className="section-header"><h2 className="section-title">Top Clientes por Faturamento</h2></div>
              <div className="grid-3">
                {ranking.slice(0, 3).map((c, i) => (
                  <div
                    key={i}
                    className="card card-sm"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <span className={`ranking-pos ranking-pos-${i + 1}`} style={{ width: 32, height: 32, fontSize: 13 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div className="text-muted text-sm">{c.os_count ?? 0} OS · {c.vehicles_count ?? 0} veic.</div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: 14, flexShrink: 0 }}>
                      R$ {Number(c.total_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nome, CPF/CNPJ, telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="text-muted text-sm">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-text">{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</div>
              <div className="empty-state-sub">{search ? 'Tente outro termo' : 'Clique em "+ Novo Cliente" para comecar'}</div>
              {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/clientes/novo')}>+ Novo Cliente</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF / CNPJ</th>
                    <th>Telefone</th>
                    <th>Email</th>
                    <th>OS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.company_name && <div className="text-muted text-sm">{c.company_name}</div>}
                      </td>
                      <td className="text-sm">{c.cpf_cnpj || '—'}</td>
                      <td className="text-sm">{c.phone || '—'}</td>
                      <td className="text-sm text-muted">{c.email || '—'}</td>
                      <td>
                        <span className="badge badge-blue">{c.os_count ?? 0}</span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/clientes/${c.id}`); }}>
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
