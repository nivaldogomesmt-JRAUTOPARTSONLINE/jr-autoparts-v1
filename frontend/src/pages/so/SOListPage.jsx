import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('jr_token');

const STATUS_CONFIG = {
  'Iniciado':     { badge: 'badge-iniciado',  label: 'Iniciado' },
  'Em andamento': { badge: 'badge-andamento',  label: 'Em Andamento' },
  'Pronto':       { badge: 'badge-pronto',     label: 'Pronto' },
  'Aguardando peca': { badge: 'badge-yellow',  label: 'Aguard. Peça' },
  'Entregue':     { badge: 'badge-entregue',   label: 'Entregue' },
  'Finalizado':   { badge: 'badge-finalizado', label: 'Finalizado' },
  'Cancelado':    { badge: 'badge-cancelado',  label: 'Cancelado' },
};

const ALL_STATUS = Object.keys(STATUS_CONFIG);

export default function SOListPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(API + '/api/so', { headers: { Authorization: 'Bearer ' + token() } });
        if (r.ok) {
          const data = await r.json();
          setOrders(Array.isArray(data) ? data : data.orders || []);
          if (data.stats) setStats(data.stats);
        }
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const activeStatuses = ['Iniciado', 'Em andamento', 'Aguardando peca'];
  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      String(o.id).includes(search) ||
      o.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.vehicles?.plate?.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'active' ? activeStatuses.includes(o.status) :
      statusFilter === 'all' ? true :
      o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const countByStatus = (st) => orders.filter(o => o.status === st).length;
  const countActive = orders.filter(o => activeStatuses.includes(o.status)).length;

  return (
    <div>
      {/* Cabeçalho */}
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Ordens de Serviço</h1>
          <p className="page-subtitle">Painel gerencial por status, faturamento e operação</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/os/nova')}>+ Nova OS</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/integracoes')}>Exportar</button>
           <button className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Visão Geral</h2></div>
            <div className="grid-4">
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)', cursor:'pointer' }} onClick={() => setStatusFilter('active')}>
                <div className="stat-label">Em Andamento</div>
                <div className="stat-value" style={{ color: 'var(--primary)' }}>{countActive}</div>
                <div className="stat-sub">Iniciado + Andamento + Aguard.</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)', cursor:'pointer' }} onClick={() => setStatusFilter('Pronto')}>
                <div className="stat-label">Prontas</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{countByStatus('Pronto')}</div>
                <div className="stat-sub">Aguardando retirada</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)', cursor:'pointer' }} onClick={() => setStatusFilter('Aguardando peca')}>
                <div className="stat-label">Aguard. Peça</div>
                <div className="stat-value" style={{ color: 'var(--warning)' }}>{countByStatus('Aguardando peca')}</div>
                <div className="stat-sub">Bloqueadas por peça</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--gray-300)', cursor:'pointer' }} onClick={() => setStatusFilter('all')}>
                <div className="stat-label">Faturamento</div>
                <div className="stat-value" style={{ fontSize: 18 }}>
                  R$ {Number(stats.faturamento_periodo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="stat-sub">Total do período</div>
              </div>
            </div>
          </div>

          {/* Filtros por status */}
          <div className="filters-bar">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${statusFilter === 'active' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatusFilter('active')}>
                Ativos ({countActive})
              </button>
              <button className={`btn btn-sm ${statusFilter === 'Pronto' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatusFilter('Pronto')}>
                Prontos ({countByStatus('Pronto')})
              </button>
              <button className={`btn btn-sm ${statusFilter === 'Aguardando peca' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatusFilter('Aguardando peca')}>
                Aguard. Peça ({countByStatus('Aguardando peca')})
              </button>
              <button className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatusFilter('all')}>
                Todos ({orders.length})
              </button>
            </div>
            <div className="search-bar" style={{ flex: 1, maxWidth: 300 }}>
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="OS#, cliente, placa..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className="text-muted text-sm">{filtered.length} OS</span>
          </div>

          {/* Tabela */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">{search ? 'Nenhuma OS encontrada' : 'Nenhuma OS neste filtro'}</div>
              {!search && statusFilter !== 'all' && <button className="btn btn-outline btn-sm" style={{marginTop:12}} onClick={()=>setStatusFilter('all')}>Ver todas</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Cliente</th>
                    <th>Placa</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th>Atualizado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const s = STATUS_CONFIG[o.status] || { badge: 'badge-gray', label: o.status };
                    const isLate = o.is_late;
                    return (
                   <tr key={o.id} onClick={() => navigate(`/os/${o.id}`)} className={isLate ? 'tr-late' : ''} style={{ cursor: 'pointer' }}>
                        <td>
                          <strong style={{ color: 'var(--primary)' }}>#{o.id}</strong>
                   {isLate && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 10, verticalAlign: 'middle' }}>⚠ ATRASADA</span>}
                        </td>
                        <td style={{ fontWeight: 600 }}>{o.clients?.name || o.client_name || '—'}</td>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{o.vehicles?.plate || o.vehicle_plate || '—'}</span></td>
                        <td><span className={`badge ${s.badge}`}>{s.label}</span></td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {o.total != null ? `R$ ${Number(o.total).toFixed(2)}` : '—'}
                        </td>
                        <td className="text-muted text-sm">
                          {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();navigate(`/os/${o.id}`);}}>Ver →</button>
                        </td>
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
