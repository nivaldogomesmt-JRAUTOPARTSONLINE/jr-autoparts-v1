import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { portalAPI } from '../../services/api';

const SO_STATUS_LABEL = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em andamento',
  WAITING_PART: 'Aguardando peca',
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

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function findMaintenanceByKeywords(maintenances, keywords) {
  if (!Array.isArray(maintenances)) return null;

  const ranked = [...maintenances].sort((a, b) => {
    const ad = a?.nextDate ? new Date(a.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b?.nextDate ? new Date(b.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
    const ak = a?.nextKm || Number.MAX_SAFE_INTEGER;
    const bk = b?.nextKm || Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return ak - bk;
  });

  return ranked.find((m) => {
    const text = `${normalizeLabel(m?.type)} ${normalizeLabel(m?.label)}`;
    return keywords.every((kw) => text.includes(kw));
  }) || null;
}

function MaintenanceLine({ title, maintenance }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {title}
      </div>
      {maintenance ? (
        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
          {formatDate(maintenance.nextDate)} | {formatKm(maintenance.nextKm)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Nao configurado</div>
      )}
    </div>
  );
}

function PlateVehicleCard({ vehicle }) {
  const oil = findMaintenanceByKeywords(vehicle.maintenances, ['OLEO']);
  const timingBelt = findMaintenanceByKeywords(vehicle.maintenances, ['CORREIA', 'DENTADA']);

  const level = vehicle.nextMaintenance?.alertLevel || 'OK';
  const levelStyle = LEVEL_STYLE[level] || LEVEL_STYLE.OK;

  return (
    <Link to={`/portal/veiculo/${vehicle.id}`} style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid #dbe4f0',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        }}
      >
        <div style={{ background: '#1A3C5E', color: '#fff', padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Brasil
        </div>

        <div style={{ padding: '12px 12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: 1.8, lineHeight: 1 }}>
              {vehicle.plate}
            </div>
            <span
              style={{
                background: levelStyle.bg,
                color: levelStyle.color,
                padding: '3px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {levelStyle.label}
            </span>
          </div>

          <div style={{ marginTop: 6, fontSize: 12, color: '#475569', fontWeight: 600 }}>
            {(vehicle.brand || 'Marca')}{' '}{(vehicle.model || 'Modelo')}{vehicle.year ? ` ${vehicle.year}` : ''}
          </div>

          <MaintenanceLine title="Prox. troca de oleo" maintenance={oil} />
          <MaintenanceLine title="Prox. troca correia" maintenance={timingBelt} />
        </div>
      </div>
    </Link>
  );
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
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: '#F0A500', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>JR</div>
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

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8, fontWeight: 700 }}>Ordens de Servico Recentes</div>
          {data?.recentOrders?.length ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {data.recentOrders.slice(0, 8).map((os) => (
                <Link
                  key={os.id}
                  to={`/portal/os/${os.id}`}
                  style={{
                    minWidth: 180,
                    textDecoration: 'none',
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    color: '#fff',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800 }}>OS #{os.number}</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{os.vehicle?.plate || '-'}</div>
                  <div style={{ marginTop: 6, display: 'inline-flex', padding: '2px 7px', borderRadius: 999, background: `${SO_STATUS_COLOR[os.status] || '#718096'}33`, color: SO_STATUS_COLOR[os.status] || '#fff', fontSize: 10, fontWeight: 700 }}>
                    {SO_STATUS_LABEL[os.status] || os.status}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.75 }}>Nenhuma OS recente.</div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>
            Ola, {data?.client?.name?.split(' ')[0]}!
          </div>
          <div style={{ color: '#718096', fontSize: 14, lineHeight: 1.45 }}>
            Veja suas placas e acompanhe as proximas trocas com rapidez.
          </div>
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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Minhas Placas</div>
          {data?.vehicles?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: '#718096' }}>Nenhum veiculo cadastrado.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
              {data.vehicles.map((v) => <PlateVehicleCard key={v.id} vehicle={v} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
