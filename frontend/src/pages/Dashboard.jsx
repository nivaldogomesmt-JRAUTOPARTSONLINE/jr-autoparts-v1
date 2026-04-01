import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

function StatCard({ label, value, sub, color = 'gray', icon, onClick, cta }) {
  const colors = {
    red: { border: 'var(--danger)', text: '#991b1b', glow: 'rgba(220,38,38,0.08)' },
    yellow: { border: 'var(--warning)', text: '#92400e', glow: 'rgba(217,119,6,0.08)' },
    green: { border: 'var(--success)', text: '#15803d', glow: 'rgba(22,163,74,0.08)' },
    blue: { border: 'var(--primary)', text: '#1d4ed8', glow: 'rgba(37,99,235,0.08)' },
    gray: { border: 'var(--gray-300)', text: 'var(--text-primary)', glow: 'rgba(148,163,184,0.08)' },
  };

  const palette = colors[color] || colors.gray;
  const clickable = typeof onClick === 'function';

  return (
    <button
      type="button"
      className="stat-card"
      onClick={clickable ? onClick : undefined}
      style={{
        borderLeft: `4px solid ${palette.border}`,
        textAlign: 'left',
        cursor: clickable ? 'pointer' : 'default',
        boxShadow: clickable ? `0 10px 24px ${palette.glow}` : undefined,
      }}
      disabled={!clickable}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-label">{label}</span>
        {icon && <span style={{ fontSize: 20, opacity: 0.75 }}>{icon}</span>}
      </div>
      <div className="stat-value" style={{ color: palette.text }}>{value ?? '—'}</div>
      {sub && <div className="stat-sub" style={{ marginTop: 8 }}>{sub}</div>}
      {clickable && <div className="text-sm" style={{ marginTop: 12, color: 'var(--primary)', fontWeight: 700 }}>{cta || 'Abrir'} →</div>}
    </button>
  );
}

function QuickAction({ label, sub, onClick, icon }) {
  return (
    <button
      type="button"
      className="quick-action-btn"
      onClick={onClick}
      style={{ alignItems: 'flex-start', minHeight: 108, textAlign: 'left', padding: '16px 18px' }}
    >
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
      <div className="text-sm text-muted">{sub}</div>
    </button>
  );
}

function SectionAction({ label, onClick }) {
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={onClick}>
      {label}
    </button>
  );
}

function OSRow({ os, onClick }) {
  const statusBadge = {
    QUOTE: 'badge-gray',
    APPROVED: 'badge-blue',
    STARTED: 'badge-iniciado',
    IN_PROGRESS: 'badge-andamento',
    WAITING_PART: 'badge-yellow',
    FINISHING: 'badge-andamento',
    DONE: 'badge-pronto',
    DELIVERED: 'badge-entregue',
  };

  const statusLabel = {
    QUOTE: 'Orcamento',
    APPROVED: 'Aprovado',
    STARTED: 'Iniciado',
    IN_PROGRESS: 'Em andamento',
    WAITING_PART: 'Aguardando peca',
    FINISHING: 'Finalizando',
    DONE: 'Pronto',
    DELIVERED: 'Entregue',
  };

  const clientName = os.client?.name || os.client_name || os.clients?.name || '—';
  const vehiclePlate = os.vehicle?.plate || os.vehicle_plate || os.vehicles?.plate || '—';
  const total = os.totalPrice ?? os.total;
  const updatedAt = os.updatedAt || os.updated_at;

  return (
    <tr onClick={onClick} style={{ cursor: 'pointer' }}>
      <td><strong style={{ color: 'var(--primary)' }}>#{os.number ?? os.id}</strong></td>
      <td>{clientName}</td>
      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{vehiclePlate}</span></td>
      <td><span className={`badge ${statusBadge[os.status] || 'badge-gray'}`}>{statusLabel[os.status] || os.statusLabel || os.status}</span></td>
      <td className="text-right" style={{ fontWeight: 700 }}>{total != null ? `R$ ${Number(total).toFixed(2)}` : '—'}</td>
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
        const response = await fetch(`${API}/api/dashboard`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('jr_token')}` },
        });
        if (response.ok) {
          setData(await response.json());
        }
      } catch (error) {
        console.error('[Dashboard] error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const d = data || {};
  const kpis = d.stats || d.kpis || {};
  const operation = d.operation || {};
  const osAndamento = operation.inProgress || d.os_em_andamento || [];
  const osProntas = operation.ready || d.os_prontas || [];
  const osAtrasadas = operation.stalled || d.os_atrasadas || [];
  const osAguardandoPeca = operation.waitingPart || d.os_aguardando_peca || [];
  const prioridades = d.prioridades_do_dia || [];
  const rankingClientes = d.ranking_clientes || [];
  const rankingVeiculos = (d.rankings?.topVehicles || d.ranking_veiculos || []).map((vehicle) => ({
    ...vehicle,
    total_revenue: vehicle.total_revenue ?? vehicle.revenue,
    brand: vehicle.brand || '',
    model: vehicle.model || vehicle.name || '',
  }));
  const metas = (d.campaigns || d.metas_campanhas || []).map((meta) => ({
    ...meta,
    meta: meta.meta ?? meta.target,
    realizado: meta.realizado ?? meta.achieved,
    responsible: meta.responsible ?? meta.owner,
  }));

  const manutVencidas = d.manutencoes_vencidas || {
    total: kpis.maintenanceOverdue ?? 0,
    detalhe: `Oleo (${kpis.oilOverdue ?? 0}), correia (${kpis.beltOverdue ?? 0})`,
  };

  const manutAtencao = d.manutencoes_atencao || {
    total: kpis.maintenanceDueSoon ?? 0,
    detalhe: 'Proximos 30 dias',
  };

  const vehiclesOk = Math.max(0, (d.total_veiculos ?? kpis.totalVehicles ?? 0) - (manutVencidas.total ?? 0) - (manutAtencao.total ?? 0));
  const pendingDeliveries = kpis.pedidos_pendentes ?? kpis.pendingDeliveries ?? 0;
  const hasIndicatorData = Boolean(
    Number(kpis.faturamento_mes ?? kpis.monthlyRevenue ?? 0)
    || Number(kpis.os_mes ?? kpis.monthlyOS ?? 0)
    || osAtrasadas.length
    || pendingDeliveries
    || Number(manutVencidas.total ?? 0)
    || Number(manutAtencao.total ?? 0)
    || Number(d.total_veiculos ?? kpis.totalVehicles ?? 0)
  );
  const hasRankingData = rankingClientes.length > 0 || rankingVeiculos.length > 0;

  const quickActions = useMemo(() => ([
    { label: 'Abrir nova OS', sub: 'Comecar atendimento mais rapido', icon: '🛠️', action: () => navigate('/os/nova') },
    { label: 'Ver OS em andamento', sub: `${osAndamento.length} em aberto agora`, icon: '📋', action: () => navigate('/os') },
    { label: 'Ir para manutencao', sub: `${manutVencidas.total ?? 0} vencidas e ${manutAtencao.total ?? 0} a vencer`, icon: '🔧', action: () => navigate('/manutencao') },
    { label: 'Pedidos e entregas', sub: `${pendingDeliveries} pendentes`, icon: '📦', action: () => navigate('/entregas') },
    { label: 'Consultar clientes', sub: `${rankingClientes.length} com dados gerenciais`, icon: '👥', action: () => navigate('/clientes') },
    { label: 'Consultar veiculos', sub: `${rankingVeiculos.length || d.total_veiculos || 0} com atividade`, icon: '🚗', action: () => navigate('/veiculos') },
  ]), [navigate, osAndamento.length, manutVencidas.total, manutAtencao.total, pendingDeliveries, rankingClientes.length, rankingVeiculos.length, d.total_veiculos]);

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Dashboard Gerencial</h1>
          <p className="page-subtitle">Atalhos operacionais, prioridades do dia e desempenho real da oficina.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/os/nova')}>+ Nova OS</button>
          <button className="btn btn-outline" onClick={() => navigate('/integracoes')}>Integracoes</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Acoes Rapidas</h2>
            </div>
            <div className="grid-3">
              {quickActions.map((action) => (
                <QuickAction key={action.label} label={action.label} sub={action.sub} icon={action.icon} onClick={action.action} />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Indicadores do Mes</h2>
            </div>
            {hasIndicatorData ? (
              <div className="grid-4">
                <StatCard
                  label="Faturamento do mes"
                  value={`R$ ${Number(kpis.faturamento_mes ?? kpis.monthlyRevenue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  sub="Abrir relatorios gerenciais"
                  color="blue"
                  icon="💰"
                  cta="Ir para relatorios"
                  onClick={() => navigate('/relatorios')}
                />
                <StatCard
                  label="OS do mes"
                  value={kpis.os_mes ?? kpis.monthlyOS ?? 0}
                  sub={`Ticket medio: R$ ${Number(kpis.ticket_medio ?? kpis.avgTicket ?? 0).toFixed(2)}`}
                  color="blue"
                  icon="📋"
                  cta="Abrir lista de OS"
                  onClick={() => navigate('/os')}
                />
                <StatCard
                  label="OS atrasadas"
                  value={osAtrasadas.length}
                  sub="Cobrar resolucao agora"
                  color={osAtrasadas.length > 0 ? 'red' : 'green'}
                  icon="⏰"
                  cta="Abrir OS atrasadas"
                  onClick={() => navigate('/os')}
                />
                <StatCard
                  label="Pedidos pendentes"
                  value={pendingDeliveries}
                  sub="Separacao, aprovacao e entrega"
                  color={pendingDeliveries > 0 ? 'yellow' : 'green'}
                  icon="📦"
                  cta="Abrir entregas"
                  onClick={() => navigate('/entregas')}
                />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-text">Sem dados gerenciais para exibir neste periodo.</div>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Manutencoes Preventivas</h2>
              <SectionAction label="Abrir manutencao" onClick={() => navigate('/manutencao')} />
            </div>
            <div className="grid-3">
              <StatCard
                label="Manutencoes vencidas"
                value={manutVencidas.total ?? 0}
                sub={manutVencidas.detalhe || 'Oleo e correia'}
                color={(manutVencidas.total ?? 0) > 0 ? 'red' : 'green'}
                icon="🔴"
                cta="Ver pendencias"
                onClick={() => navigate('/manutencao')}
              />
              <StatCard
                label="Manutencoes a vencer"
                value={manutAtencao.total ?? 0}
                sub={manutAtencao.detalhe || 'Proximos 30 dias'}
                color={(manutAtencao.total ?? 0) > 0 ? 'yellow' : 'green'}
                icon="🟡"
                cta="Planejar agenda"
                onClick={() => navigate('/manutencao')}
              />
              <StatCard
                label="Em dia"
                value={vehiclesOk}
                sub="Veiculos sem pendencia"
                color="green"
                icon="✅"
                cta="Abrir veiculos"
                onClick={() => navigate('/veiculos')}
              />
            </div>
          </div>

          {prioridades.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Prioridades do Dia</h2>
                <SectionAction label="Abrir OS" onClick={() => navigate('/os')} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {prioridades.map((priority, index) => (
                  <button
                    key={index}
                    type="button"
                    className="card card-sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderLeft: '3px solid var(--danger)', paddingLeft: 14, textAlign: 'left' }}
                    onClick={() => navigate(priority.id ? `/os/${priority.id}` : '/os')}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{priority.client_name || priority.description || 'Prioridade operacional'}</div>
                        {priority.status && <span className="badge badge-orange" style={{ fontSize: 10 }}>{priority.status}</span>}
                      </div>
                      <div className="text-muted text-sm">
                        {priority.vehicle_plate ? `Placa: ${priority.vehicle_plate} · ` : ''}
                        Ultima atualizacao: {priority.updated_at ? new Date(priority.updated_at).toLocaleDateString('pt-BR') : '—'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Abrir →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Operacao em Andamento</h2>
              <SectionAction label="Ver todas" onClick={() => navigate('/os')} />
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
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
                      <thead><tr><th>OS</th><th>Cliente</th><th>Placa</th><th>Status</th><th className="text-right">Total</th><th>Atualizada</th></tr></thead>
                      <tbody>
                        {osAndamento.slice(0, 5).map((os) => <OSRow key={os.id} os={os} onClick={() => navigate(`/os/${os.id}`)} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Prontas e aguardando ({osProntas.length + osAguardandoPeca.length})
                </div>
                {(osProntas.length + osAguardandoPeca.length) === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 16px' }}>
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-text">Nenhum registro</div>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>OS</th><th>Cliente</th><th>Placa</th><th>Status</th><th className="text-right">Total</th><th>Atualizada</th></tr></thead>
                      <tbody>
                        {[...osProntas, ...osAguardandoPeca].slice(0, 5).map((os) => <OSRow key={os.id} os={os} onClick={() => navigate(`/os/${os.id}`)} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasRankingData && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Rankings</h2>
                <div className="page-actions">
                  <SectionAction label="Clientes" onClick={() => navigate('/clientes')} />
                  <SectionAction label="Veiculos" onClick={() => navigate('/veiculos')} />
                </div>
              </div>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">Top clientes por receita</div>
                  {rankingClientes.length === 0 ? (
                    <div className="text-muted text-sm">Sem dados disponiveis</div>
                  ) : rankingClientes.slice(0, 5).map((client, index) => (
                    <button
                      key={index}
                      type="button"
                      className="ranking-item"
                      onClick={() => navigate(`/clientes/${client.id}`)}
                      style={{ width: '100%', textAlign: 'left', background: 'transparent' }}
                    >
                      <span className={`ranking-pos ranking-pos-${index + 1}`}>{index + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                        <div className="text-muted text-sm">{client.os_count ?? 0} OS</div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13, flexShrink: 0 }}>
                        R$ {Number(client.total_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="card">
                  <div className="card-title">Top veiculos por receita</div>
                  {rankingVeiculos.length === 0 ? (
                    <div className="text-muted text-sm">Sem dados disponiveis</div>
                  ) : rankingVeiculos.slice(0, 5).map((vehicle, index) => {
                    const id = vehicle.id || vehicle.vehicleId;
                    return (
                      <button
                        key={index}
                        type="button"
                        className="ranking-item"
                        onClick={id ? () => navigate(`/veiculos/${id}`) : undefined}
                        style={{ width: '100%', textAlign: 'left', background: 'transparent', cursor: id ? 'pointer' : 'default' }}
                      >
                        <span className={`ranking-pos ranking-pos-${index + 1}`}>{index + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>{vehicle.plate || 'Sem placa'}</div>
                          <div className="text-muted text-sm">{`${vehicle.brand} ${vehicle.model}`.trim() || 'Sem descricao'}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13, flexShrink: 0 }}>
                          R$ {Number(vehicle.total_revenue || vehicle.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {metas.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Metas e Campanhas</h2>
              </div>
              <div className="grid-2">
                {metas.map((meta, index) => {
                  const pct = meta.meta > 0 ? Math.min(100, Math.round((meta.realizado / meta.meta) * 100)) : 0;
                  const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';

                  return (
                    <div key={index} className="card card-sm">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.name}</div>
                          <div className="text-muted text-sm">{meta.objective}</div>
                          <div className="text-muted text-sm">{meta.period} · Resp: {meta.responsible}</div>
                        </div>
                        <span className="badge" style={{ background: `${color}22`, color }}>{meta.status || 'ACOMPANHAR'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span>Meta: <strong>{meta.meta}</strong></span>
                        <span>Realizado: <strong style={{ color }}>{meta.realizado}</strong></span>
                        <span><strong style={{ color }}>{pct}%</strong></span>
                      </div>
                      <div style={{ background: 'var(--gray-100)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
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
