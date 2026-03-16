import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function ServicesPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = () => localStorage.getItem('jr_token');
        const r = await fetch(API + '/api/services', { headers: { Authorization: 'Bearer ' + token() } });
        if (r.ok) {
          const data = await r.json();
          setServices(Array.isArray(data) ? data : data.services || []);
          if (data.stats) setStats(data.stats);
        }
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = services.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">ServiÃ§os</h1>
          <p className="page-subtitle">Gerencial de execuÃ§Ã£o, receita e eficiÃªncia</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/servicos/novo')}>+ Novo ServiÃ§o</button>
          <button className="btn btn-outline" onClick={() => navigate('/integracoes')}>Exportar</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Indicadores</h2></div>
            <div className="grid-4">
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="stat-label">ServiÃ§os Ativos</div>
                <div className="stat-value">{stats.active_count ?? services.length}</div>
                <div className="stat-sub">DisponÃ­veis para OS</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                <div className="stat-label">Maior Receita</div>
                <div className="stat-value" style={{ fontSize: 14, color: 'var(--success)' }}>{stats.most_revenue?.name || 'â'}</div>
                {stats.most_revenue && <div className="stat-sub">R$ {Number(stats.most_revenue.revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>}
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="stat-label">Mais Executado</div>
                <div className="stat-value" style={{ fontSize: 14, color: 'var(--primary)' }}>{stats.most_executed?.name || 'â'}</div>
                {stats.most_executed && <div className="stat-sub">{stats.most_executed.qty} execuÃ§Ãµes</div>}
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--gray-300)' }}>
                <div className="stat-label">Pouca SaÃ­da</div>
                <div className="stat-value">{stats.low_execution_count ?? 0}</div>
                <div className="stat-sub">Menos de 2 execuÃ§Ãµes</div>
              </div>
            </div>
          </div>

          {/* Ranking */}
          {stats.ranking && stats.ranking.length > 0 && (
            <div className="section">
              <div className="section-header"><h2 className="section-title">Ranking por Receita</h2></div>
              <div className="card" style={{ padding: '4px 0' }}>
                {stats.ranking.slice(0, 8).map((s, i) => (
                  <div key={i} className="ranking-item" style={{ padding: '10px 20px' }}>
                    <span className={`ranking-pos ranking-pos-${i+1}`}>{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="text-muted text-sm">
                        {s.qty ?? 0} execuÃ§Ãµes Â· PreÃ§o mÃ©dio: R$ {Number(s.avg_price||0).toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                        R$ {Number(s.revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 320 }}>
              <span className="search-icon">ð</span>
              <input type="text" placeholder="Buscar serviÃ§o ou categoria..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className="text-muted text-sm">{filtered.length} serviÃ§o{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">ð§</div>
              <div className="empty-state-text">{search ? 'Nenhum serviÃ§o encontrado' : 'Nenhum serviÃ§o cadastrado'}</div>
              {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/servicos/novo')}>+ Novo ServiÃ§o</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>ServiÃ§o</th><th>Categoria</th><th className="text-right">PreÃ§o</th><th className="text-right">Executado</th><th className="text-right">Receita Total</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} onClick={() => navigate(`/servicos/${s.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        {s.description && <div className="text-muted text-sm truncate" style={{ maxWidth: 280 }}>{s.description}</div>}
                      </td>
                      <td className="text-sm text-muted">{s.category || 'â'}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>
                        {s.price ? `R$ ${Number(s.price).toFixed(2)}` : 'â'}
                      </td>
                      <td className="text-right"><span className="badge badge-blue">{s.execution_count ?? 0}x</span></td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--success)' }}>
                        {s.total_revenue ? `R$ ${Number(s.total_revenue).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : 'â'}
                      </td>
                      <td><button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();navigate(`/servicos/${s.id}`);}}>Ver â</button></td>
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
