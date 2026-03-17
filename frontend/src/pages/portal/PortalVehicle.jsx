import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

const STATUS_BADGE = {
  'Iniciado':    { bg:'#eff6ff', color:'#1d4ed8' },
  'Em andamento':{ bg:'#fff7ed', color:'#c2410c' },
  'Pronto':      { bg:'#f0fdf4', color:'#15803d' },
  'Entregue':    { bg:'#f1f5f9', color:'#475569' },
  'Finalizado':  { bg:'#f1f5f9', color:'#475569' },
  'Cancelado':   { bg:'#fef2f2', color:'#991b1b' },
};

export default function PortalVehicle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [orders, setOrders] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackingDevices, setTrackingDevices] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/portal/vehicles/${id}`, {
          headers: { Authorization: 'Bearer ' + ptoken() }
        });
        if (r.status === 401) { navigate('/portal/login'); return; }
        if (r.ok) {
          const d = await r.json();
          setVehicle(d.vehicle || d);
          setOrders(d.orders || []);
          setMaintenance(d.maintenance || []);
          setTrackingDevices(d.trackingDevices || []);
        }
      } catch (e) { console.error('[PortalVehicle] error:', e); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const st = vehicle?.maintenance_status;
  const statusConf = {
    urgencia: { color: 'var(--danger)',  bg: '#fef2f2', label: 'ManutenÃ§Ã£o Vencida',  icon: 'ð´' },
    atencao:  { color: 'var(--warning)', bg: '#fffbeb', label: 'PrÃ³xima ManutenÃ§Ã£o',  icon: 'ð¡' },
    em_dia:   { color: 'var(--success)', bg: '#f0fdf4', label: 'Em Dia',               icon: 'â' },
  };
  const sc = statusConf[st] || statusConf.em_dia;

  const alerts = maintenance.filter(m => m.status === 'vencida' || m.status === 'atencao');
  const totalSpent = orders.reduce((s, o) => s + (o.total || 0), 0);
  const openOS = orders.filter(o => !['Entregue','Finalizado','Cancelado'].includes(o.status));
  const RASTREK_BASE_URL = 'https://painel.rastrek.com.br';
  const activeDevice = trackingDevices.find(d => d.status === 'ACTIVE') || null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/portal')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>
          â
        </button>
        {BRAND.logo && <img src={BRAND.logo} alt="" style={{ width: 28, height: 28, borderRadius: 5, background: '#fff', padding: 2 }} />}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Detalhe do VeÃ­culo</div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : !vehicle ? (
        <div className="empty-state"><div className="empty-state-text">VeÃ­culo nÃ£o encontrado</div></div>
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

          {/* Card principal do veÃ­culo */}
          <div className="card" style={{ marginBottom: 20, borderTop: `4px solid ${sc.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 900, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                  {vehicle.plate}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {vehicle.brand} {vehicle.model} {vehicle.year && `Â· ${vehicle.year}`}
                </div>
                {vehicle.color && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{vehicle.color}</div>}
              </div>
              <div style={{ background: sc.bg, color: sc.color, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {sc.icon} {sc.label}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>OS Abertas</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{openOS.length}</div>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Total OS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{orders.length}</div>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Gasto Total</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>
                  R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Alertas de manutenÃ§Ã£o */}
          {alerts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                â ï¸ AtenÃ§Ã£o neste veÃ­culo
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((m, i) => (
                  <div key={i} style={{
                    background: m.status === 'vencida' ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${m.status === 'vencida' ? '#fca5a5' : '#fcd34d'}`,
                    borderRadius: 10, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12
                  }}>
                    <span style={{ fontSize: 20 }}>{m.status === 'vencida' ? 'ð´' : 'ð¡'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: m.status === 'vencida' ? '#991b1b' : '#92400e' }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {m.status === 'vencida' ? `Vencida: ${m.due_date ? new Date(m.due_date).toLocaleDateString('pt-BR') : 'â'}` : `Previsto: ${m.due_date ? new Date(m.due_date).toLocaleDateString('pt-BR') : 'â'}`}
                      </div>
                    </div>
                    <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}?text=OlÃ¡! Preciso agendar manutenÃ§Ã£o do veÃ­culo ${vehicle.plate}: ${m.name}`}
                      target="_blank" rel="noreferrer"
                      style={{ background: '#16a34a', color: '#fff', padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                      Agendar
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AÃ§Ãµes rÃ¡pidas */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}?text=OlÃ¡! Preciso de um serviÃ§o para o veÃ­culo ${vehicle.plate}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', cursor: 'pointer', minWidth: 75 }}>
              <span style={{ fontSize: 20 }}>ð¬</span> WhatsApp
            </a>
            <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}?text=OlÃ¡! Gostaria de agendar revisÃ£o do veÃ­culo ${vehicle.plate}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', cursor: 'pointer', minWidth: 75 }}>
              <span style={{ fontSize: 20 }}>ð</span> Agendar
            </a>
          </div>

          {/* Rastreamento */}
          {activeDevice && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <span style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2, display: 'inline-block' }} />
                  Rastreamento
                </h2>
                <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  🟢 Ativo
                </span>
              </div>
              {activeDevice.model && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                  {activeDevice.model}
                  {activeDevice.installedAt && ` · instalado em ${new Date(activeDevice.installedAt).toLocaleDateString('pt-BR')}`}
                </div>
              )}
              <a
                href={`${RASTREK_BASE_URL}?q=${encodeURIComponent(vehicle?.plate || '')}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--primary)',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                🔗 Abrir rastreamento
              </a>
            </div>
          )}

          {/* HistÃ³rico de OS */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2, display: 'inline-block' }} />
              HistÃ³rico de Ordens de ServiÃ§o
            </h2>
            {orders.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 16px' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>ð</div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhuma OS encontrada</div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {orders.map((o, i) => {
                  const sb = STATUS_BADGE[o.status] || { bg: '#f1f5f9', color: '#475569' };
                  return (
                    <div key={o.id} onClick={() => navigate(`/portal/os/${o.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--primary)', flexShrink: 0 }}>
                        #{o.id}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>OS #{o.id}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : 'â'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: sb.color, background: sb.bg, padding: '2px 8px', borderRadius: 12, marginBottom: 4 }}>{o.status}</div>
                        {o.total != null && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>R$ {Number(o.total).toFixed(2)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
