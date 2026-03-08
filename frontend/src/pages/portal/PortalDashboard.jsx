import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { portalAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const SO_STATUS_LABEL = {
  QUOTE: 'Orçamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em Andamento',
  WAITING_PART: 'Aguardando Peça',
  FINISHING: 'Finalizando',
  DONE: 'Concluído',
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

const ALERT_ICON = { OVERDUE: '❗', DUE_SOON: '⚠️' };

export default function PortalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    portalAPI.me().then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => { logout(); navigate('/portal/login'); };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 40, height: 40 }}/>
    </div>
  );

  const overdueAlerts = data?.maintenances?.filter(m => m.alertLevel === 'OVERDUE') || [];
  const dueSoonAlerts = data?.maintenances?.filter(m => m.alertLevel === 'DUE_SOON') || [];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: '#F0A500', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔧</div>
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

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A3C5E' }}>
            Olá, {data?.client?.name?.split(' ')[0]}! 👋
          </div>
          <div style={{ color: '#718096', fontSize: 14 }}>Acompanhe seus veículos e serviços aqui.</div>
        </div>

        {/* Maintenance Alerts */}
        {(overdueAlerts.length > 0 || dueSoonAlerts.length > 0) && (
          <div style={{ background: overdueAlerts.length > 0 ? '#fff5f5' : '#fffbeb', border: `1px solid ${overdueAlerts.length > 0 ? '#fc8181' : '#f6e05e'}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: overdueAlerts.length > 0 ? '#c53030' : '#92400e' }}>
              {overdueAlerts.length > 0 ? '❗ Manutenções Vencidas' : '⚠️ Manutenções Próximas'}
            </div>
            {[...overdueAlerts, ...dueSoonAlerts].map((alert, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < overdueAlerts.length + dueSoonAlerts.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ALERT_ICON[alert.alertLevel]} {alert.label}</span>
                  <span style={{ color: '#718096', fontSize: 12, marginLeft: 8 }}>— {alert.vehicle?.plate} ({alert.vehicle?.brand} {alert.vehicle?.model})</span>
                </div>
                {alert.nextDate && (
                  <div style={{ fontSize: 12, color: '#718096' }}>
                    {new Date(alert.nextDate).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 13, color: '#718096' }}>
              Entre em contato: <a href="https://wa.me/5565992812000" style={{ color: '#1A3C5E', fontWeight: 600 }}>📱 (65) 99281-2000</a>
            </div>
          </div>
        )}

        {/* Vehicles */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Meus Veículos</div>
          {data?.vehicles?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: '#718096' }}>
              Nenhum veículo cadastrado.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {data?.vehicles?.map(v => (
                <Link key={v.id} to={`/portal/veiculo/${v.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'box-shadow 0.2s', padding: '16px 20px' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(26,60,94,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                    <div style={{ width: 48, height: 48, background: '#EBF4FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🚗</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 15 }}>{v.plate}</div>
                      <div style={{ color: '#718096', fontSize: 13 }}>{v.brand} {v.model} {v.year ? `· ${v.year}` : ''}</div>
                      {v.color && <div style={{ color: '#a0aec0', fontSize: 12 }}>{v.color}{v.fuel ? ` · ${v.fuel}` : ''}</div>}
                    </div>
                    {v.maintenances?.some(m => m.alertLevel) && (
                      <div style={{ fontSize: 18 }}>
                        {v.maintenances.some(m => m.alertLevel === 'OVERDUE') ? '❗' : '⚠️'}
                      </div>
                    )}
                    <div style={{ color: '#a0aec0', fontSize: 18 }}>›</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Service Orders */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Ordens de Serviço Recentes</div>
          {data?.recentOrders?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: '#718096' }}>
              Nenhuma ordem de serviço encontrada.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {data?.recentOrders?.map((os, i) => (
                <div key={os.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                  borderBottom: i < data.recentOrders.length - 1 ? '1px solid #f0f0f0' : 'none'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1A3C5E' }}>OS #{os.number}</div>
                    <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                      {os.vehicle?.plate} — {new Date(os.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div>
                    <span style={{
                      background: SO_STATUS_COLOR[os.status] + '20',
                      color: SO_STATUS_COLOR[os.status],
                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600
                    }}>
                      {SO_STATUS_LABEL[os.status]}
                    </span>
                  </div>
                  {os.total && (
                    <div style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 14, minWidth: 80, textAlign: 'right' }}>
                      R$ {parseFloat(os.total).toFixed(2).replace('.', ',')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: 'center', color: '#a0aec0', fontSize: 12 }}>
          <div>Precisa de ajuda?</div>
          <a href="https://wa.me/5565992812000" style={{ color: '#1A3C5E', fontWeight: 600, fontSize: 14 }}>
            📱 WhatsApp: (65) 99281-2000
          </a>
          <div style={{ marginTop: 8 }}>© 2024 JR Auto Parts · jrautopartsmt.com.br</div>
        </div>
      </div>
    </div>
  );
}
