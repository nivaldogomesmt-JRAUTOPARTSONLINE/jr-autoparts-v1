import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../config/brand';

const API = import.meta.env.VITE_API_URL || '';

function StatCard({ label, value, sub, color, icon }) {
  const colors = {
    red:   { border: 'var(--danger)',  bg: 'var(--danger-light)',  text: '#991b1b' },
    yellow:{ border: 'var(--warning)', bg: 'var(--warning-light)', text: '#92400e' },
    green: { border: 'var(--success)', bg: 'var(--success-light)', text: '#15803d' },
    blue:  { border: 'var(--primary)', bg: 'var(--primary-light)', text: '#1d4ed8' },
    gray:  { border: 'var(--gray-300)',bg: 'var(--gray-50)',       text: 'var(--text-secondary)' },
  };
  const c = colors[color] || colors.gray;
  return (
    <div className="stat-card" style={{ borderLeft: `4px solid ${c.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-label">{label}</span>
        {icon && <span style={{ fontSize: 20, opacity: 0.6 }}>{icon}</span>}
      </div>
      <div className="stat-value" style={{ color: c.text }}>{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function OSRow({ os, onClick }) {
  const statusBadge = {
    'QUOTE':        'badge-gray',
    'APPROVED':     'badge-blue',
    'STARTED':      'badge-iniciado',
    'IN_PROGRESS':  'badge-andamento',
    'WAITING_PART': 'badge-yellow',
    'FINISHING':    'badge-andamento',
    'DONE':         'badge-pronto',
    'DELIVERED':    'badge-entregue',
  };
  const STATUS_LABEL = {
    'QUOTE': 'Orçamento', 'APPROVED': 'Aprovado', 'STARTED': 'Iniciado',
    'IN_PROGRESS': 'Em Andamento', 'WAITING_PART': 'Aguard. Peça',
    'FINISHING': 'Finalizando', 'DONE': 'Pronto', 'DELIVERED': 'Entregue',
  };
  const cls = statusBadge[os.status] || 'badge-gray';
  const clientName = os.client?.name || os.client_name || os.clients?.name || '—';
  const vehiclePlate = os.vehicle?.plate || os.vehicle_plate || os.vehicles?.plate || '—';
  const total = os.totalPrice ?? os.total;
  const updatedAt = os.updatedAt || os.updated_at;
  return (
    <tr onClick={onClick} style={{ cursor: 'pointer' }}>
      <td><strong style={{ color: 'var(--primary)' }}>#{os.number ?? os.id}</strong></td>
      <td>{clientName}</td>
      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{vehiclePlate}</span></td>
      <td><span className={`badge ${cls}`}>{STATUS_LABEL[os.status] || os.statusLabel || os.status}</span></td>
      <td className="text-right" style={{ fontWeight: 700 }}>
        {total != null ? `R$ ${Number(total).toFixed(2)}` : '—'}
      </td>
      <td className="text-muted text-sm">{updatedAt ? new Date(updatedAt).toLocaleDateString('pt-BR') : '—'}</td>
    </tr>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const r = await fetch(`${API}/api/dashboard`, {
          headers: { Authorization: 'Bearer ' + localStorage.getItem('jr_token') }
        });
        if (r.ok) setData(await r.json());
      } catch (e) { console.error('[Dashboard] error:', e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const d = data || {};
  // API returns: { stats, priorities, operation, recentOS, rankings, campaigns }
  const kpis = d.stats || d.kpis || {};
  const operation = d.operation || {};
  const osAndamento = operation.inProgress || d.os_em_andamento || [];
  const osProntas = operation.ready || d.os_prontas || [];
  const osAtrasadas = operation.stalled || d.os_atrasadas || [];
  const osPendentePeca = operation.waitingPart || d.os_aguardando_peca || [];
  const prioridades = d.prioridades_do_dia || [];
  const rankingClientes = d.ranking_clientes || [];
  const rankingVeiculos = (d.rankings?.topVehicles || d.ranking_veiculos || []).map(v => ({
    ...v, total_revenue: v.total_revenue ?? v.revenue,
    brand: v.brand || '', model: v.model || v.name || '',
  }));
  const metas = (d.campaigns || d.metas_campanhas || []).map(m => ({
    ...m,
    meta: m.meta ?? m.target,
    realizado: m.realizado ?? m.achieved,
    responsible: m.responsible ?? m.owner,
  }));
  const manutVencidas = d.manutencoes_vencidas || {
    total: kpis.maintenanceOverdue ?? 0,
    detalhe: `Óleo (${kpis.oilOverdue ?? 0}), correia (${kpis.beltOverdue ?? 0})`,
  };
  const manutAtencao = d.manutencoes_atencao || {
    total: kpis.maintenanceDueSoon ?? 0,
    detalhe: 'Próximos 30 dias',
  };

  return (
    <div>
      {/* Cabeçalho da página */}
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Dashboard Gerencial</h1>
          <p className="page-subtitle">Prioridades do dia, operação em andamento e desempenho</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/os/nova')}>
            + Nova OS
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/integracoes')}>
            Integrações
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* 1. KPIs PRINCIPAIS */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Indicadores do Mês</h2></div>
            <div className="grid-4">
              <StatCard label="Faturamento do Mês" value={(kpis.faturamento_mes ?? kpis.monthlyRevenue) != null ? `R$ ${Number(kpis.faturamento_mes ?? kpis.monthlyRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'} sub="Ordens entregues e finalizadas" color="blue" icon="💰" />
              <StatCard label="OS do Mês" value={kpis.os_mes ?? kpis.monthlyOS ?? 0} sub={`Ticket médio: R$ ${Number(kpis.ticket_medio ?? kpis.avgTicket ?? 0).toFixed(2)}`} color="blue" icon="📋" />
              <StatCard label="OS Atrasadas" value={osAtrasadas.length} sub="Aguardando resolução" color={osAtrasadas.length > 0 ? 'red' : 'green'} icon="⏰" />
              <StatCard label="Pedidos Pendentes" value={kpis.pedidos_pendentes ?? kpis.pendingDeliveries ?? 0} sub="Aguardando aprovação" color={(kpis.pedidos_pendentes ?? kpis.pendingDeliveries ?? 0) > 0 ? 'yellow' : 'green'} icon="📦" />
            </div>
          </div>

          {/* 2. MANUTENÇÕES */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Manutenções Preventivas</h2></div>
            <div className="grid-3">
              <StatCard label="Manutenções Vencidas" value={manutVencidas.total ?? 0} sub={manutVencidas.detalhe || 'Óleo e correia'} color={manutVencidas.total > 0 ? 'red' : 'green'} icon="🔴" />
              <StatCard label="Manutenções a Vencer" value={manutAtencao.total ?? 0} sub={manutAtencao.detalhe || 'Próximos 30 dias'} color={manutAtencao.total > 0 ? 'yellow' : 'green'} icon="🟡" />
              <StatCard label="Em Dia" value={(d.total_veiculos ?? kpis.totalVehicles ?? 0) - (manutVencidas.total ?? 0) - (manutAtencao.total ?? 0)} sub="Veículos sem pendência" color="green" icon="✅" />
            </div>
          </div>

          {/* 3. PRIORIDADES DO DIA */}
          {prioridades.length > 0 && (
            <div className="section">
              <div className="section-header"><h2 className="section-title">Prioridades do Dia</h2></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {prioridades.map((p, i) => (
               <div key={i} className="card card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderLeft: '3px solid var(--danger)', paddingLeft: 14 }}>
                    <div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                     <div style={{ fontWeight: 600, fontSize: 13 }}>{p.client_name || p.description}</div>
                     {p.status && <span className="badge badge-orange" style={{ fontSize: 10 }}>{p.status}</span>}
                   </div>
                      {p.vehicle_plate && <div className="text-muted text-sm">Placa: {p.vehicle_plate} · Últ. atualização: {p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-BR') : '—'}</div>}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/os/${p.id}`)}>
                      Abrir OS
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. OPERAÇÃO */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Operação em Andamento</h2>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/os')}>Ver todas</button>
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              {/* OS em andamento */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Em andamento ({osAndamento.length})
                </div>
                {osAndamento.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 16px' }}>
                    <div className="empty-state-icon">✅</div>
                    <div className="empty-state-text">Nenhuma OS em andamento</div>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>OS</th><th>Cliente</th><th>Placa</th><th>Status</th><th className="text-right">Total</th></tr></thead>
                      <tbody>
                        {osAndamento.slice(0, 5).map(os => (
                          <OSRow key={os.id} os={os} onClick={() => navigate(`/os/${os.id}`)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* OS prontas / aguardando */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Prontas / Aguardando ({osProntas.length + osPendentePeca.length})
                </div>
                {(osProntas.length + osPendentePeca.length) === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 16px' }}>
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-text">Nenhum registro</div>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>OS</th><th>Cliente</th><th>Placa</th><th>Status</th><th className="text-right">Total</th></tr></thead>
                      <tbody>
                        {[...osProntas, ...osPendentePeca].slice(0, 5).map(os => (
                          <OSRow key={os.id} os={os} onClick={() => navigate(`/os/${os.id}`)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. RANKINGS */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Rankings</h2></div>
            <div className="grid-2">
              {/* Ranking clientes */}
              <div className="card">
                <div className="card-title">Top Clientes por Receita</div>
                {rankingClientes.length === 0 ? (
                  <div className="text-muted text-sm">Sem dados disponíveis</div>
                ) : rankingClientes.slice(0, 5).map((c, i) => (
                  <div key={i} className="ranking-item" onClick={() => navigate(`/clientes/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <span className={`ranking-pos ranking-pos-${i + 1}`}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div className="text-muted text-sm">{c.os_count ?? 0} OS</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13, flexShrink: 0 }}>
                      R$ {Number(c.total_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Ranking veículos */}
              <div className="card">
                <div className="card-title">Top Veículos por Receita</div>
                {rankingVeiculos.length === 0 ? (
                  <div className="text-muted text-sm">Sem dados disponíveis</div>
                ) : rankingVeiculos.slice(0, 5).map((v, i) => (
                  <div key={i} className="ranking-item" onClick={v.id || v.vehicleId ? () => navigate(`/veiculos/${v.id || v.vehicleId}`) : undefined} style={{ cursor: v.id || v.vehicleId ? 'pointer' : 'default' }}>
                    <span className={`ranking-pos ranking-pos-${i + 1}`}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>{v.plate}</div>
                      <div className="text-muted text-sm">{v.brand} {v.model}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13, flexShrink: 0 }}>
                      R$ {Number(v.total_revenue || v.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. METAS E CAMPANHAS */}
          {metas.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Metas e Campanhas</h2>
              </div>
              <div className="grid-2">
                {metas.map((m, i) => {
                  const pct = m.meta > 0 ? Math.min(100, Math.round((m.realizado / m.meta) * 100)) : 0;
                  const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
                  return (
                    <div key={i} className="card card-sm">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</div>
                          <div className="text-muted text-sm">{m.objective}</div>
                          <div className="text-muted text-sm">{m.period} · Resp: {m.responsible}</div>
                        </div>
                        <span className="badge" style={{ background: color + '22', color }}>{m.status || 'ACOMPANHAR'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span>Meta: <strong>{m.meta}</strong></span>
                        <span>Realizado: <strong style={{ color }}>{m.realizado}</strong></span>
                        <span><strong style={{ color }}>{pct}%</strong></span>
                      </div>
                      <div style={{ background: 'var(--gray-100)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
