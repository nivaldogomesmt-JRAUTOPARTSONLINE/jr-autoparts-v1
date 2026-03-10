import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { portalAPI } from '../../services/api';

const SO_STATUS_LABEL = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em Andamento',
  WAITING_PART: 'Aguardando Peca',
  FINISHING: 'Finalizando',
  DONE: 'Concluido',
  DELIVERED: 'Entregue',
};

const SO_STATUS_COLOR = {
  QUOTE: '#718096',
  APPROVED: '#3182ce',
  STARTED: '#F0A500',
  IN_PROGRESS: '#F0A500',
  WAITING_PART: '#e53e3e',
  FINISHING: '#805ad5',
  DONE: '#38a169',
  DELIVERED: '#38a169',
};

const LEVEL_STYLE = {
  OVERDUE: { bg: '#fee2e2', color: '#b91c1c', label: 'Vencido' },
  DUE_SOON: { bg: '#fef3c7', color: '#92400e', label: 'Proximo' },
  OK: { bg: '#dcfce7', color: '#166534', label: 'Em dia' },
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatKm(value) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

export default function PortalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    portalAPI.me().then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const overdueAlerts = useMemo(() => data?.maintenances?.filter((m) => m.alertLevel === 'OVERDUE') || [], [data]);
  const dueSoonAlerts = useMemo(() => data?.maintenances?.filter((m) => m.alertLevel === 'DUE_SOON') || [], [data]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: '#F0A500', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>JR</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>JR Auto Parts</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Portal do Cliente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{data?.client?.name}</div>
            <div style={{ opacity: 0.7, fontSize: 11 }}>Cliente</div>
          </div>
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A3C5E' }}>
            Ola, {data?.client?.name?.split(' ')[0]}!
          </div>
          <div style={{ color: '#718096', fontSize: 14 }}>Acompanhe seus veiculos, servicos e proximas revisoes.</div>
        </div>

        {(overdueAlerts.length > 0 || dueSoonAlerts.length > 0) ? (
          <div style={{ background: overdueAlerts.length > 0 ? '#fff5f5' : '#fffbeb', border: `1px solid ${overdueAlerts.length > 0 ? '#fc8181' : '#f6e05e'}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: overdueAlerts.length > 0 ? '#c53030' : '#92400e' }}>
              {overdueAlerts.length > 0 ? 'Manutencoes vencidas' : 'Manutencoes proximas'}
            </div>
            {[...overdueAlerts, ...dueSoonAlerts].slice(0, 8).map((alert) => (
              <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 13 }}>
                  <b>{alert.label}</b> - {alert.vehicle?.plate}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{formatDate(alert.nextDate)}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Meus Veiculos</div>
          {data?.vehicles?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: '#718096' }}>Nenhum veiculo cadastrado.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {data.vehicles.map((v) => {
                const next = v.nextMaintenance;
                const level = next?.alertLevel || 'OK';
                const style = LEVEL_STYLE[level] || LEVEL_STYLE.OK;

                return (
                  <Link key={v.id} to={`/portal/veiculo/${v.id}`} style={{ textDecoration: 'none' }}>
                    <div className="card" style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 15 }}>{v.plate}</div>
                          <div style={{ color: '#718096', fontSize: 13 }}>{v.brand} {v.model} {v.year ? `- ${v.year}` : ''}</div>
                          <div style={{ color: '#94a3b8', fontSize: 12 }}>
                            {v.color || '-'} {v.fuel ? `- ${v.fuel}` : ''}
                          </div>
                        </div>

                        <div style={{ minWidth: 260 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Proximo servico</div>
                            <span style={{ background: style.bg, color: style.color, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                              {style.label}
                            </span>
                          </div>

                          {next ? (
                            <>
                              <div style={{ fontWeight: 700, color: style.color, fontSize: 13 }}>{next.label}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>
                                Data: {formatDate(next.nextDate)} | KM: {formatKm(next.nextKm)}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Sem previsoes cadastradas.</div>
                          )}

                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                            Itens vencidos: <b>{v.overdueCount || 0}</b> | proximos: <b>{v.dueSoonCount || 0}</b>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Ordens de Servico Recentes</div>
          {data?.recentOrders?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: '#718096' }}>Nenhuma ordem de servico encontrada.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {data.recentOrders.map((os, i) => (
                <div key={os.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: i < data.recentOrders.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1A3C5E' }}>OS #{os.number}</div>
                    <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{os.vehicle?.plate} - {new Date(os.createdAt).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <span style={{ background: `${SO_STATUS_COLOR[os.status] || '#718096'}20`, color: SO_STATUS_COLOR[os.status] || '#718096', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                    {SO_STATUS_LABEL[os.status] || os.status}
                  </span>
                  {os.total ? <div style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 14, minWidth: 80, textAlign: 'right' }}>R$ {parseFloat(os.total).toFixed(2).replace('.', ',')}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
