import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

function VehicleCard({ vehicle, onClick }) {
  const st = vehicle.maintenance_status;
  const config = {
    urgencia: { color: 'var(--danger)',  bg: '#fef2f2', label: 'Manutenção Vencida',  icon: '🔴', borderTop: '4px solid var(--danger)' },
    atencao:  { color: 'var(--warning)', bg: '#fffbeb', label: 'Próxima Manutenção',  icon: '🟡', borderTop: '4px solid var(--warning)' },
    em_dia:   { color: 'var(--success)', bg: '#f0fdf4', label: 'Em Dia',               icon: '✅', borderTop: '4px solid var(--success)' },
  };
  const c = config[st] || config.em_dia;

  return (
    <div onClick={onClick} className="card" style={{ cursor: 'pointer', borderTop: c.borderTop, transition: 'box-shadow 0.2s' }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            {vehicle.plate}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {vehicle.brand} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
          </div>
          {vehicle.color && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{vehicle.color}</div>}
        </div>
        <div style={{ background: c.bg, color: c.color, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          {c.icon} {c.label}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>OS Abertas</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{vehicle.open_os_count ?? 0}</div>
        </div>
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total OS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{vehicle.total_os_count ?? 0}</div>
        </div>
      </div>

      {vehicle.last_service && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          Último serviço: <strong>{new Date(vehicle.last_service).toLocaleDateString('pt-BR')}</strong>
        </div>
      )}
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
        const r = await fetch(API + '/api/portal/dashboard', {
          headers: { Authorization: 'Bearer ' + ptoken() }
        });
        if (r.status === 401) { navigate('/portal/login'); return; }
        if (r.ok) setData(await r.json());
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const client = data?.client || {};
  const vehicles = data?.vehicles || [];
  const recentOS = data?.recent_os || [];

  const urgencia = vehicles.filter(v => v.maintenance_status === 'urgencia').length;
  const atencao  = vehicles.filter(v => v.maintenance_status === 'atencao').length;
  const emDia    = vehicles.filter(v => v.maintenance_status === 'em_dia').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header do portal */}
      <header style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {BRAND.logo && <img src={BRAND.logo} alt={BRAND.name} style={{ width: 32, height: 32, borderRadius: 6, background: '#fff', padding: 2 }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{BRAND.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Portal do Cliente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{client.name}</span>
          <button onClick={() => { localStorage.removeItem('jr_portal_token'); navigate('/portal/login'); }}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
          {/* Boas-vindas */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Olá, {client.name?.split(' ')[0] || 'Cliente'}! 👋
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Aqui está o resumo da sua frota.
            </p>
          </div>

          {/* Status da frota */}
          {vehicles.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div style={{ background: '#fef2f2', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid var(--danger)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#dc2626' }}>Urgência</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{urgencia}</div>
                <div style={{ fontSize: 11, color: '#ef4444' }}>Manutenção vencida</div>
              </div>
              <div style={{ background: '#fffbeb', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid var(--warning)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#d97706' }}>Atenção</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{atencao}</div>
                <div style={{ fontSize: 11, color: '#f59e0b' }}>Próxima manutenção</div>
              </div>
              <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid var(--success)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a' }}>Em Dia</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{emDia}</div>
                <div style={{ fontSize: 11, color: '#22c55e' }}>Sem pendências</div>
              </div>
            </div>
          )}

          {/* Meus Veículos */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2, display: 'inline-block' }} />
                Minha Frota ({vehicles.length})
              </h2>
            </div>
            {vehicles.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🚗</div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhum veículo cadastrado</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {vehicles.map(v => (
                  <VehicleCard key={v.id} vehicle={v} onClick={() => navigate(`/portal/veiculo/${v.id}`)} />
                ))}
              </div>
            )}
          </div>

          {/* Atividades Recentes */}
          {recentOS.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2, display: 'inline-block' }} />
                O que foi feito recentemente
              </h2>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {recentOS.slice(0, 5).map((os, i) => {
                  const statusColors = { 'Entregue': '#15803d', 'Finalizado': '#475569', 'Pronto': '#16a34a', 'Em andamento': '#c2410c', 'Iniciado': '#1d4ed8' };
                  const color = statusColors[os.status] || '#475569';
                  return (
                    <div key={os.id} onClick={() => navigate(`/portal/os/${os.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: i < recentOS.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        🔧
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>OS #{os.id} · {os.vehicles?.plate}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {os.updated_at ? new Date(os.updated_at).toLocaleDateString('pt-BR') : '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color, background: color + '15', padding: '2px 8px', borderRadius: 12 }}>{os.status}</div>
                        {os.total && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>R$ {Number(os.total).toFixed(2)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Atualizar dados */}
          <div style={{ background: '#eff6ff', borderRadius: 12, padding: '18px 20px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 28 }}>📱</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Deseja atualizar seu WhatsApp?</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Mantenha seu contato atualizado para receber notificações das suas OS.
              </div>
            </div>
            <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}?text=Olá! Preciso atualizar meu WhatsApp.`}
              target="_blank" rel="noreferrer"
              style={{ background: '#16a34a', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
              Atualizar
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
