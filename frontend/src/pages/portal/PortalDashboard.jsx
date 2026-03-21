import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

const STATUS_LABELS_MAP = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em andamento',
  WAITING_PART: 'Aguardando peca',
  FINISHING: 'Finalizando',
  DONE: 'Pronto',
  DELIVERED: 'Entregue',
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const formatCurrency = (value) => (
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
);

const dueByLabel = {
  DATE: 'Por data',
  KM: 'Por km',
  DATE_OR_KM: 'Data ou km',
  NONE: '-',
};

const maintenanceStatusConfig = {
  urgencia: {
    color: '#b91c1c',
    bg: '#fef2f2',
    borderTop: '4px solid #dc2626',
    label: 'Urgente',
  },
  atencao: {
    color: '#a16207',
    bg: '#fffbeb',
    borderTop: '4px solid #f59e0b',
    label: 'Atencao',
  },
  em_dia: {
    color: '#166534',
    bg: '#f0fdf4',
    borderTop: '4px solid #16a34a',
    label: 'Em dia',
  },
};

const getStatusByCounts = (vehicle) => {
  if ((vehicle?.overdueCount || 0) > 0) return 'urgencia';
  if ((vehicle?.dueSoonCount || 0) > 0) return 'atencao';
  return 'em_dia';
};

const summaryItemStyle = {
  background: 'var(--gray-50)',
  borderRadius: 8,
  padding: '8px 10px',
};

function VehicleCard({ vehicle, onClick }) {
  const cfg = maintenanceStatusConfig[vehicle.maintenanceStatus] || maintenanceStatusConfig.em_dia;
  const oil = vehicle.nextOilChange;
  const belt = vehicle.nextBeltChange;

  return (
    <div
      onClick={onClick}
      className="card"
      style={{ cursor: 'pointer', borderTop: cfg.borderTop, transition: 'box-shadow 0.2s ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            {vehicle.plate}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {vehicle.brand} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
          </div>
        </div>
        <div style={{ background: cfg.bg, color: cfg.color, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
          {cfg.label}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={summaryItemStyle}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>OS abertas</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{vehicle.openOsCount}</div>
        </div>
        <div style={summaryItemStyle}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total de OS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{vehicle.totalOsCount}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>Prox. oleo:</strong> {formatDate(oil?.nextDate)} {oil?.nextKm ? `ou ${oil.nextKm} km` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>Prox. correia:</strong> {formatDate(belt?.nextDate)} {belt?.nextKm ? `ou ${belt.nextKm} km` : ''}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Criterio principal: {dueByLabel[vehicle.nextMaintenance?.dueBy] || '-'}
        </div>
      </div>

      <button
        type="button"
        style={{
          marginTop: 12,
          width: '100%',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: '#fff',
          padding: '8px 10px',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--primary)',
          cursor: 'pointer',
        }}
      >
        Ver detalhes do veiculo
      </button>
    </div>
  );
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API}/api/portal/me`, {
          headers: { Authorization: `Bearer ${ptoken()}` },
        });
        if (response.status === 401) {
          navigate('/portal/login');
          return;
        }
        if (response.ok) {
          setData(await response.json());
        }
      } catch (error) {
        console.error('[PortalDashboard] load error:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  const client = data?.client || {};

  const vehicles = useMemo(() => (
    (data?.vehicles || []).map((vehicle) => ({
      ...vehicle,
      maintenanceStatus: getStatusByCounts(vehicle),
      openOsCount: Number(vehicle.openOsCount ?? (vehicle.serviceOrders || []).filter((order) => (
        ['APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING'].includes(order.status)
      )).length),
      totalOsCount: Number(vehicle.totalOsCount ?? (vehicle.serviceOrders || []).length),
    }))
  ), [data]);

  const recentOrders = data?.recentOrders || [];
  const recentVehicleServices = data?.recentVehicleServices || [];
  const urgentVehicles = vehicles.filter((vehicle) => vehicle.maintenanceStatus === 'urgencia');
  const warningVehicles = vehicles.filter((vehicle) => vehicle.maintenanceStatus === 'atencao');
  const healthyVehicles = vehicles.filter((vehicle) => vehicle.maintenanceStatus === 'em_dia');

  const whatsappDigits = (BRAND.phone || '').replace(/\D/g, '');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {BRAND.logo ? <img src={BRAND.logo} alt={BRAND.name} style={{ width: 32, height: 32, borderRadius: 6, background: '#fff', padding: 2 }} /> : null}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{BRAND.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Portal do cliente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{client.name}</span>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('jr_portal_token');
              navigate('/portal/login');
            }}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
          >
            Sair
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Ola, {client.name?.split(' ')[0] || 'Cliente'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Veja as proximas manutencoes e o historico recente da sua frota.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#fef2f2', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid #dc2626' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#b91c1c' }}>Urgencia</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#b91c1c' }}>{urgentVehicles.length}</div>
              <div style={{ fontSize: 11, color: '#dc2626' }}>Manutencao vencida</div>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#a16207' }}>Atencao</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#a16207' }}>{warningVehicles.length}</div>
              <div style={{ fontSize: 11, color: '#d97706' }}>Proxima manutencao</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid #16a34a' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#166534' }}>Em dia</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#166534' }}>{healthyVehicles.length}</div>
              <div style={{ fontSize: 11, color: '#16a34a' }}>Sem pendencias</div>
            </div>
          </div>

          {urgentVehicles.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>Veiculos com atencao imediata</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {urgentVehicles.slice(0, 3).map((vehicle) => (
                  <div key={vehicle.id} style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{vehicle.plate}</strong> - {vehicle.brand} {vehicle.model}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/portal/veiculo/${vehicle.id}`)}
                      style={{ borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Ver veiculo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Minha frota ({vehicles.length})
            </h2>
            {vehicles.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhum veiculo cadastrado</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {vehicles.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} onClick={() => navigate(`/portal/veiculo/${vehicle.id}`)} />
                ))}
              </div>
            )}
          </div>

          {recentVehicleServices.length > 0 ? (
            <div style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                Veiculos recentemente atendidos
              </h2>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {recentVehicleServices.map((entry, idx) => (
                  <div
                    key={entry.id}
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: idx < recentVehicleServices.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                    onClick={() => navigate(`/portal/veiculo/${entry.id}`)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.plate} - {entry.brand} {entry.model}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        OS #{entry.lastServiceOrder?.id} em {formatDate(entry.lastServiceOrder?.updatedAt)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {formatCurrency(entry.lastServiceOrder?.totalPrice)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {recentOrders.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                Ordens de servico recentes
              </h2>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {recentOrders.slice(0, 6).map((order, index) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/portal/os/${order.id}`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: index < Math.min(recentOrders.length, 6) - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>OS #{order.id} - {order.vehicle?.plate || '-'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(order.updatedAt || order.updated_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {STATUS_LABELS_MAP[order.status] || order.status}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                        {formatCurrency(order.totalPrice ?? order.total)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ background: '#eff6ff', borderRadius: 12, padding: '18px 20px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Atualize seu WhatsApp</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Mantenha seu contato atualizado para receber avisos das suas OS.
              </div>
            </div>
            <a
              href={`https://wa.me/55${whatsappDigits}?text=Ola! Preciso atualizar meu WhatsApp.`}
              target="_blank"
              rel="noreferrer"
              style={{ background: '#16a34a', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
            >
              Atualizar
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
