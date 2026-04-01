import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

const STATUS_BADGE = {
  STARTED: { bg: '#eff6ff', color: '#1d4ed8', label: 'Iniciado' },
  IN_PROGRESS: { bg: '#fff7ed', color: '#c2410c', label: 'Em andamento' },
  FINISHING: { bg: '#fff7ed', color: '#c2410c', label: 'Finalizando' },
  WAITING_PART: { bg: '#fffbeb', color: '#d97706', label: 'Aguardando peca' },
  DONE: { bg: '#f0fdf4', color: '#15803d', label: 'Pronto' },
  DELIVERED: { bg: '#f1f5f9', color: '#475569', label: 'Entregue' },
  APPROVED: { bg: '#eff6ff', color: '#4f46e5', label: 'Aprovado' },
  QUOTE: { bg: '#f8fafc', color: '#64748b', label: 'Orcamento' },
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

const levelText = {
  OVERDUE: 'Vencida',
  DUE_SOON: 'Proxima',
  OK: 'Em dia',
};

const levelStyle = {
  OVERDUE: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  DUE_SOON: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  OK: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
};

const getStatusByCounts = (overdue, dueSoon) => {
  if (Number(overdue || 0) > 0) return 'OVERDUE';
  if (Number(dueSoon || 0) > 0) return 'DUE_SOON';
  return 'OK';
};

function MaintenanceCard({ title, item }) {
  const level = item?.alertLevel || 'OK';
  const style = levelStyle[level] || levelStyle.OK;
  return (
    <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: style.color }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <div><strong>Status:</strong> {levelText[level] || 'Em dia'}</div>
        <div><strong>Data:</strong> {formatDate(item?.nextDate)}</div>
        <div><strong>Km:</strong> {item?.nextKm || '-'}</div>
        <div><strong>Criterio:</strong> {dueByLabel[item?.dueBy] || '-'}</div>
      </div>
    </div>
  );
}

export default function PortalVehicle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [orders, setOrders] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [maintenanceSummary, setMaintenanceSummary] = useState(null);
  const [trackingDevices, setTrackingDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API}/api/portal/vehicles/${id}`, {
          headers: { Authorization: `Bearer ${ptoken()}` },
        });

        if (response.status === 401) {
          navigate('/portal/login');
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setVehicle(data.vehicle || null);
          setOrders(data.serviceOrders || data.orders || []);
          setMaintenance(data.maintenances || data.maintenance || []);
          setMaintenanceSummary(data.maintenanceSummary || null);
          setTrackingDevices(data.trackingDevices || []);
        }
      } catch (error) {
        console.error('[PortalVehicle] load error:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const overdueCount = maintenanceSummary?.overdueCount ?? maintenance.filter((item) => item.alertLevel === 'OVERDUE').length;
  const dueSoonCount = maintenanceSummary?.dueSoonCount ?? maintenance.filter((item) => item.alertLevel === 'DUE_SOON').length;
  const status = getStatusByCounts(overdueCount, dueSoonCount);
  const statusLabel = status === 'OVERDUE' ? 'Urgente' : status === 'DUE_SOON' ? 'Atencao' : 'Em dia';
  const statusColors = status === 'OVERDUE'
    ? { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' }
    : status === 'DUE_SOON'
      ? { bg: '#fffbeb', color: '#92400e', border: '#fde68a' }
      : { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };

  const openOrders = orders.filter((order) => !['DONE', 'DELIVERED'].includes(String(order.status || '').toUpperCase()));
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.displayTotal ?? order.totalPrice ?? order.total ?? 0), 0);
  const latestOrderDate = orders[0]?.updatedAt || orders[0]?.updated_at || null;
  const activeDevice = trackingDevices.find((device) => device.status === 'ACTIVE') || null;

  const maintenanceAlerts = useMemo(() => (
    maintenance.filter((item) => item.alertLevel === 'OVERDUE' || item.alertLevel === 'DUE_SOON')
  ), [maintenance]);

  const whatsappDigits = (BRAND.phone || '').replace(/\D/g, '');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate('/portal')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}
        >
          {'<'}
        </button>
        {BRAND.logo ? <img src={BRAND.logo} alt="" style={{ width: 28, height: 28, borderRadius: 5, background: '#fff', padding: 2 }} /> : null}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Detalhe do veiculo</div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : !vehicle ? (
        <div className="empty-state"><div className="empty-state-text">Veiculo nao encontrado</div></div>
      ) : (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
          <div className="card" style={{ marginBottom: 20, borderTop: `4px solid ${statusColors.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 900, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                  {vehicle.plate}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {vehicle.brand} {vehicle.model} {vehicle.year ? `- ${vehicle.year}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Km atual: {vehicle.currentKm || '-'} - Ultima atividade: {formatDate(latestOrderDate)}
                </div>
              </div>
              <div style={{ background: statusColors.bg, color: statusColors.color, borderRadius: 10, border: `1px solid ${statusColors.border}`, padding: '8px 14px', fontSize: 13, fontWeight: 700 }}>
                {statusLabel}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>OS abertas</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{openOrders.length}</div>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Total de OS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{orders.length}</div>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Total gasto</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>{formatCurrency(totalSpent)}</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Proximas trocas e revisoes</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <MaintenanceCard title="Troca de oleo" item={maintenanceSummary?.nextOilChange} />
              <MaintenanceCard title="Correia dentada" item={maintenanceSummary?.nextBeltChange} />
              <MaintenanceCard title="Manutencao mais proxima" item={maintenanceSummary?.nextMaintenance} />
            </div>
          </div>

          {maintenanceAlerts.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>Atencao neste veiculo</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {maintenanceAlerts.map((item, index) => (
                  <div key={`${item.type}-${index}`} style={{ background: item.alertLevel === 'OVERDUE' ? '#fef2f2' : '#fffbeb', border: `1px solid ${item.alertLevel === 'OVERDUE' ? '#fecaca' : '#fde68a'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label || item.type}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Previsto para {formatDate(item.nextDate)} {item.nextKm ? `ou ${item.nextKm} km` : ''}
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/55${whatsappDigits}?text=Ola! Quero agendar manutencao do veiculo ${vehicle.plate}.`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: '#16a34a', color: '#fff', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                    >
                      Agendar
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <a
              href={`https://wa.me/55${whatsappDigits}?text=Ola! Preciso de atendimento para o veiculo ${vehicle.plate}.`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', background: '#16a34a', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Falar no WhatsApp
            </a>
            <a
              href={`https://wa.me/55${whatsappDigits}?text=Ola! Quero agendar revisao do veiculo ${vehicle.plate}.`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', background: '#fff', color: 'var(--primary)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Agendar revisao
            </a>
          </div>

          {activeDevice ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Rastreamento</h2>
                <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  Ativo
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {activeDevice.model || 'Dispositivo'} {activeDevice.installedAt ? `- instalado em ${formatDate(activeDevice.installedAt)}` : ''}
              </div>
              <a
                href={`https://painel.rastrek.com.br?q=${encodeURIComponent(vehicle?.plate || '')}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                Abrir rastreamento
              </a>
            </div>
          ) : null}

          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
              Historico de ordens de servico
            </h2>
            {orders.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 16px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhuma OS encontrada</div>
              </div>
            ) : (
              <>
                {maintenance && maintenance.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: '10px', padding: '18px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Historico de manutencoes
                    </h3>
                    {maintenance.map((m, idx) => {
                      const hoje = new Date();
                      const prox = m.nextDueDate ? new Date(m.nextDueDate) : null;
                      const vencida = prox && prox < hoje;
                      const proximaBreve = prox && !vencida && (prox - hoje) / 86400000 <= 30;
                      const tipoLabel = m.type === 'OIL_CHANGE'
                        ? 'Troca de oleo'
                        : m.type === 'BELT_CHANGE'
                          ? 'Troca de correia'
                          : m.type === 'GENERAL'
                            ? 'Manutencao geral'
                            : (m.type || 'Manutencao');
                      return (
                        <div key={m.id || idx} style={{
                          padding: '12px',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          background: vencida ? '#fef2f2' : proximaBreve ? '#fffbeb' : '#f8fafc',
                          border: `1px solid ${vencida ? '#fecaca' : proximaBreve ? '#fde68a' : '#e2e8f0'}`,
                          borderLeft: `4px solid ${vencida ? '#dc2626' : proximaBreve ? '#f59e0b' : '#10b981'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: '0 0 4px', fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>{tipoLabel}</p>
                              {m.lastMaintenanceDate && (
                                <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#64748b' }}>
                                  Ultima: {formatDate(m.lastMaintenanceDate)}{m.lastMaintenanceKm ? ` · ${Number(m.lastMaintenanceKm).toLocaleString('pt-BR')} km` : ''}
                                </p>
                              )}
                              {m.nextDueDate && (
                                <p style={{ margin: 0, fontSize: '12px', color: vencida ? '#dc2626' : '#64748b', fontWeight: vencida ? '600' : '400' }}>
                                  Proxima: {formatDate(m.nextDueDate)}{m.nextDueKm ? ` · ${Number(m.nextDueKm).toLocaleString('pt-BR')} km` : ''}
                                </p>
                              )}
                            </div>
                            <span style={{
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              flexShrink: 0,
                              marginLeft: '10px',
                              background: vencida ? '#fef2f2' : proximaBreve ? '#fffbeb' : '#f0fdf4',
                              color: vencida ? '#dc2626' : proximaBreve ? '#d97706' : '#16a34a',
                              border: `1px solid ${vencida ? '#fecaca' : proximaBreve ? '#fde68a' : '#bbf7d0'}`
                            }}>
                              {vencida ? 'VENCIDA' : proximaBreve ? 'A VENCER' : 'EM DIA'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {orders.map((order, index) => {
                    const badge = STATUS_BADGE[order.status] || { bg: '#f1f5f9', color: '#475569', label: order.status };
                    return (
                      <div
                        key={order.id}
                        onClick={() => navigate(`/portal/os/${order.id}`)}
                        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: index < orders.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--primary)' }}>
                          #{order.id}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>OS #{order.id}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Atualizada em {formatDate(order.updatedAt || order.updated_at)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 12, marginBottom: 4 }}>
                            {order.statusLabel || badge.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                            {formatCurrency(order.displayTotal ?? order.totalPrice ?? order.total)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
