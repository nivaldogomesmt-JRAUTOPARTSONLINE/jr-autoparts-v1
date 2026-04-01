import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function VehiclesPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState({ urgencia: 0, atencao: 0, em_dia: 0 });
  const [rankings, setRankings] = useState({ veiculos: [], servicos: [], pecas: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  // Carga inicial: todos os veículos sem filtro de busca
  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('jr_token');
        const rv = await fetch(API + '/api/vehicles?limit=500', {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (rv.ok) {
          const data = await rv.json();
          setVehicles(Array.isArray(data) ? data : data.data || []);
          if (data.stats) setStats(data.stats);
          if (data.rankings) setRankings(data.rankings);
        }
      } catch (e) { console.error('[VehiclesPage] load error:', e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Busca server-side com debounce de 350 ms — garante que nomes de clientes
  // em páginas além da 1ª também sejam encontrados
  const fetchSearch = useCallback(async (term) => {
    if (!term.trim()) return;
    setSearchLoading(true);
    try {
      const token = localStorage.getItem('jr_token');
      const params = new URLSearchParams({ search: term, limit: 200 });
      const rv = await fetch(API + '/api/vehicles?' + params, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (rv.ok) {
        const data = await rv.json();
        setVehicles(Array.isArray(data) ? data : data.data || []);
      }
    } catch (e) { console.error('[VehiclesPage] search error:', e); }
    finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      // Ao limpar a busca, recarrega lista completa
      const token = localStorage.getItem('jr_token');
      fetch(API + '/api/vehicles?limit=500', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setVehicles(Array.isArray(data) ? data : data.data || []); })
        .catch(() => {});
      return;
    }
    const timer = setTimeout(() => fetchSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search, fetchSearch]);

  // Filtro local como segurança adicional (cobre campos que o servidor pode não indexar)
  const filtered = vehicles.filter(v =>
    !search ||
    v.plate?.toLowerCase().includes(search.toLowerCase()) ||
    v.brand?.toLowerCase().includes(search.toLowerCase()) ||
    v.model?.toLowerCase().includes(search.toLowerCase()) ||
    v.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
    v.client?.phone?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = { urgencia: 'red', atencao: 'yellow', em_dia: 'green' };

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Veículos</h1>
          <p className="page-subtitle">Frota cadastrada com visão de manutenção e faturamento</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/veiculos/novo')}>+ Novo Veículo</button>
          <button className="btn btn-outline" onClick={() => navigate('/integracoes')}>Exportar</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* Status da frota */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Status da Frota</h2></div>
            <div className="grid-3">
              <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
                <div className="stat-label">Urgência</div>
                <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.urgencia ?? 0}</div>
                <div className="stat-sub">Manutenção vencida</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                <div className="stat-label">Atenção</div>
                <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.atencao ?? 0}</div>
                <div className="stat-sub">Próxima manutenção</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                <div className="stat-label">Em Dia</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.em_dia ?? 0}</div>
                <div className="stat-sub">Sem pendências</div>
              </div>
            </div>
          </div>

          {/* Rankings */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Rankings de Faturamento</h2></div>
            <div className="grid-3">
              <div className="card">
                <div className="card-title">Top Veículos (Receita)</div>
                {(rankings.veiculos || []).slice(0, 5).map((v, i) => (
                  <div key={i} className="ranking-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/veiculos/${v.id}`)}>
                    <span className={`ranking-pos ranking-pos-${i+1}`}>{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>{v.plate}</div>
                      <div className="text-muted text-sm">{v.brand} {v.model}</div>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>
                      R$ {Number(v.total_revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </span>
                  </div>
                ))}
                {!rankings.veiculos?.length && <div className="text-muted text-sm">Sem dados</div>}
              </div>
              <div className="card">
                <div className="card-title">Top Peças Vendidas</div>
                {(rankings.pecas || []).slice(0, 5).map((p, i) => (
                  <div key={i} className="ranking-item">
                    <span className={`ranking-pos ranking-pos-${i+1}`}>{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div className="text-muted text-sm">{p.qty ?? 0} vendidos</div>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>
                      R$ {Number(p.revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </span>
                  </div>
                ))}
                {!rankings.pecas?.length && <div className="text-muted text-sm">Sem dados</div>}
              </div>
              <div className="card">
                <div className="card-title">Top Serviços</div>
                {(rankings.servicos || []).slice(0, 5).map((s, i) => (
                  <div key={i} className="ranking-item">
                    <span className={`ranking-pos ranking-pos-${i+1}`}>{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div className="text-muted text-sm">{s.qty ?? 0} execuções</div>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>
                      R$ {Number(s.revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </span>
                  </div>
                ))}
                {!rankings.servicos?.length && <div className="text-muted text-sm">Sem dados</div>}
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Placa, modelo, marca ou nome do cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {searchLoading
              ? <span className="text-muted text-sm">Buscando...</span>
              : <span className="text-muted text-sm">{filtered.length} veículo{filtered.length !== 1 ? 's' : ''}</span>
            }
          </div>

          {/* Listagem */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚗</div>
              <div className="empty-state-text">{search ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'}</div>
              {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/veiculos/novo')}>+ Novo Veículo</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Placa</th><th>Veículo</th><th>Proprietário</th><th>Ano</th><th>OS</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const st = v.maintenanceStatus;
                    const badge = st === 'urgencia' ? 'badge-red' : st === 'atencao' ? 'badge-yellow' : 'badge-green';
                    const label = st === 'urgencia' ? 'Urgência' : st === 'atencao' ? 'Atenção' : 'Em dia';
                    return (
                      <tr key={v.id} onClick={() => navigate(`/veiculos/${v.id}`)} style={{ cursor: 'pointer' }}>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>{v.plate}</span></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{v.brand} {v.model}</div>
                          {v.color && <div className="text-muted text-sm">{v.color}</div>}
                        </td>
                        <td>{v.client?.name || '—'}</td>
                        <td>{v.year || '—'}</td>
                        <td><span className="badge badge-blue">{v._count?.serviceOrders ?? 0}</span></td>
                        <td><span className={`badge ${badge}`}>{label}</span></td>
                        <td><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); navigate(`/veiculos/${v.id}`); }}>Ver →</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
