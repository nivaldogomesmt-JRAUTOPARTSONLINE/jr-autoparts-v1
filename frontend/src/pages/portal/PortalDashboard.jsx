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
  OVERDUE: { bg: '#fee2e2', color: '#b91c1c', label: 'Urgencia' },
  DUE_SOON: { bg: '#fef3c7', color: '#92400e', label: 'Atencao' },
  OK: { bg: '#dcfce7', color: '#166534', label: 'OK' },
};

const PRINT_THEMES = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'historico', label: 'Somente historico' },
  { value: 'completo', label: 'Completo' },
];

const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_portal_dashboard';

function getInitialPrintTheme() {
  if (typeof window === 'undefined') return 'resumo';
  try {
    const saved = window.localStorage.getItem(PRINT_THEME_STORAGE_KEY);
    const allowed = PRINT_THEMES.map((theme) => theme.value);
    return allowed.includes(saved) ? saved : 'resumo';
  } catch {
    return 'resumo';
  }
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatKm(value) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatRemainingCompact(maintenance) {
  if (!maintenance) return 'Sem previsao';

  const parts = [];
  const hasDays = maintenance.daysUntil !== null && maintenance.daysUntil !== undefined && Number.isFinite(Number(maintenance.daysUntil));
  const hasKm = maintenance.remainingKm !== null && maintenance.remainingKm !== undefined && Number.isFinite(Number(maintenance.remainingKm));

  if (hasDays) {
    const d = Number(maintenance.daysUntil);
    if (d < 0) parts.push(`${Math.abs(d)}d atraso`);
    else parts.push(`${d}d`);
  }

  if (hasKm) {
    const km = Math.round(Number(maintenance.remainingKm));
    if (km < 0) parts.push(`${Math.abs(km).toLocaleString('pt-BR')}km atraso`);
    else parts.push(`${km.toLocaleString('pt-BR')}km`);
  }

  return parts.length ? parts.join(' | ') : 'Sem previsao';
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function getMaintenancePriorityScore(maintenance) {
  if (maintenance?.alertLevel === 'OVERDUE') return 0;
  if (maintenance?.alertLevel === 'DUE_SOON') return 1;
  return 2;
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
  const style = LEVEL_STYLE[maintenance?.alertLevel || 'OK'] || LEVEL_STYLE.OK;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {title}
      </div>
      {maintenance ? (
        <>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
            {formatDate(maintenance.nextDate)} | {formatKm(maintenance.nextKm)}
          </div>
          <div style={{ fontSize: 11, color: style.color, marginTop: 2, fontWeight: 700 }}>
            {formatRemainingCompact(maintenance)}
          </div>
        </>
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
          <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
            Atualizado em: {formatDateTime(vehicle.latestActivityAt)}
          </div>

          <MaintenanceLine title="Prox. troca de oleo" maintenance={oil} />
          <MaintenanceLine title="Prox. troca correia" maintenance={timingBelt} />
        </div>
      </div>
    </Link>
  );
}

function toCsvCell(value) {
  const text = String(value ?? '');
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(text, filename, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([text], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function buildHistoryCsvRows({ recentOrders, filters }) {
  const rows = [];
  rows.push(['Secao', 'Campo', 'Valor']);
  rows.push(['Filtros', 'Busca', filters.search || '-']);
  rows.push(['Filtros', 'Status', filters.status || '-']);
  rows.push(['Filtros', 'Periodo de', filters.dateFrom || '-']);
  rows.push(['Filtros', 'Periodo ate', filters.dateTo || '-']);

  rows.push([]);
  rows.push(['Historico OS', 'OS', 'Detalhes']);

  (recentOrders || []).forEach((os) => {
    rows.push([
      'Historico OS',
      `#${os.number}`,
      `${SO_STATUS_LABEL[os.status] || os.status} | ${os.vehicle?.plate || '-'} | ${formatDateTime(os.updatedAt || os.createdAt)} | ${formatCurrency(os.totalPrice)}`,
    ]);
  });

  return rows;
}

export default function PortalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ whatsapp: '', phone: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    portalAPI.me().then((r) => {
      setData(r.data);
      setProfileForm({
        whatsapp: r.data?.client?.whatsapp || '',
        phone: r.data?.client?.phone || '',
        email: r.data?.client?.email || '',
      });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore storage errors
    }
  }, [printTheme]);

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage('');

    try {
      const res = await portalAPI.updateMe(profileForm);
      const updatedClient = res.data?.client || {};
      setData((prev) => ({
        ...(prev || {}),
        client: {
          ...(prev?.client || {}),
          ...updatedClient,
        },
      }));
      setProfileMessage('Dados atualizados com sucesso. Notificacoes usarão o WhatsApp atual.');
    } catch (err) {
      setProfileMessage(err?.response?.data?.error || 'Falha ao atualizar dados.');
    } finally {
      setSavingProfile(false);
    }
  };

  const overdueAlerts = useMemo(() => data?.maintenances?.filter((m) => m.alertLevel === 'OVERDUE') || [], [data]);
  const dueSoonAlerts = useMemo(() => data?.maintenances?.filter((m) => m.alertLevel === 'DUE_SOON') || [], [data]);

  const criticalPairs = useMemo(() => {
    const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];

    return vehicles
      .map((v) => {
        const oil = findMaintenanceByKeywords(v.maintenances, ['OLEO']);
        const belt = findMaintenanceByKeywords(v.maintenances, ['CORREIA', 'DENTADA']);

        const oilCritical = oil && ['OVERDUE', 'DUE_SOON'].includes(oil.alertLevel);
        const beltCritical = belt && ['OVERDUE', 'DUE_SOON'].includes(belt.alertLevel);

        if (!oilCritical || !beltCritical) return null;

        const hasOverdue = oil?.alertLevel === 'OVERDUE' || belt?.alertLevel === 'OVERDUE';

        return {
          vehicleId: v.id,
          plate: v.plate,
          model: `${v.brand || ''} ${v.model || ''}`.trim(),
          oil,
          belt,
          level: hasOverdue ? 'OVERDUE' : 'DUE_SOON',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'OVERDUE' ? -1 : 1;
        const ad = a.oil?.nextDate ? new Date(a.oil.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.oil?.nextDate ? new Date(b.oil.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      });
  }, [data]);

  const nextReview = useMemo(() => {
    const list = Array.isArray(data?.maintenances) ? [...data.maintenances] : [];
    if (!list.length) return null;

    list.sort((a, b) => {
      const pa = getMaintenancePriorityScore(a);
      const pb = getMaintenancePriorityScore(b);
      if (pa !== pb) return pa - pb;

      const ad = a?.nextDate ? new Date(a.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b?.nextDate ? new Date(b.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (ad !== bd) return ad - bd;

      const ak = a?.nextKm ?? Number.MAX_SAFE_INTEGER;
      const bk = b?.nextKm ?? Number.MAX_SAFE_INTEGER;
      return ak - bk;
    });

    return list[0] || null;
  }, [data]);

  const recentOrders = useMemo(() => (Array.isArray(data?.recentOrders) ? data.recentOrders : []), [data]);

  const orderStatusOptions = useMemo(() => {
    const set = new Set(recentOrders.map((os) => String(os.status || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [recentOrders]);

  const filteredRecentOrders = useMemo(() => {
    const search = String(orderSearch || '').trim().toLowerCase();
    const fromTs = orderDateFrom ? new Date(`${orderDateFrom}T00:00:00`).getTime() : null;
    const toTs = orderDateTo ? new Date(`${orderDateTo}T23:59:59.999`).getTime() : null;

    return recentOrders.filter((os) => {
      if (orderStatus && os.status !== orderStatus) return false;

      const refTs = new Date(os.updatedAt || os.createdAt).getTime();
      if (fromTs && Number.isFinite(refTs) && refTs < fromTs) return false;
      if (toTs && Number.isFinite(refTs) && refTs > toTs) return false;

      if (search) {
        const hay = [
          `#${os.number || ''}`,
          SO_STATUS_LABEL[os.status] || os.status || '',
          os.vehicle?.plate || '',
          os.vehicle?.brand || '',
          os.vehicle?.model || '',
        ].join(' ').toLowerCase();

        if (!hay.includes(search)) return false;
      }

      return true;
    });
  }, [recentOrders, orderSearch, orderStatus, orderDateFrom, orderDateTo]);

  const handlePrint = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'portal-dashboard');
    html.setAttribute('data-print-theme', printTheme);

    const clear = () => {
      html.removeAttribute('data-print-theme');
      html.removeAttribute('data-print-context');
      window.removeEventListener('afterprint', clear);
    };

    window.addEventListener('afterprint', clear);
    window.print();
    setTimeout(clear, 1200);
  };

  const handleExportHistoryCsv = () => {
    const rows = buildHistoryCsvRows({
      recentOrders: filteredRecentOrders,
      filters: {
        search: orderSearch,
        status: orderStatus,
        dateFrom: orderDateFrom,
        dateTo: orderDateTo,
      },
    });

    const csv = rows.map((row) => row.map(toCsvCell).join(';')).join('\n');
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(csv, `portal_historico_cliente_${dateTag}.csv`);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        .print-only { display: none; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }

          html[data-print-context='portal-dashboard'] .print-block {
            display: none !important;
          }

          html[data-print-context='portal-dashboard'][data-print-theme='resumo'] .print-block-resumo {
            display: block !important;
          }

          html[data-print-context='portal-dashboard'][data-print-theme='historico'] .print-block-historico {
            display: block !important;
          }

          html[data-print-context='portal-dashboard'][data-print-theme='completo'] .print-block-completo {
            display: block !important;
          }

          .card { break-inside: avoid; }
        }
      `}</style>

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
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8, fontWeight: 700 }}>Atividades recentes</div>
          {recentOrders.length ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {recentOrders.slice(0, 8).map((os) => (
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>Nenhuma atividade recente.</div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <select
            value={printTheme}
            onChange={(e) => setPrintTheme(e.target.value)}
            style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 180 }}
          >
            {PRINT_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
          <button className="btn btn-outline" type="button" onClick={handleExportHistoryCsv} disabled={!filteredRecentOrders.length}>Exportar historico CSV</button>
          <button className="btn btn-outline" type="button" onClick={handlePrint}>Imprimir</button>
        </div>

        <div className="print-only card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>Portal do Cliente - {data?.client?.name || 'Cliente'}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Emissao: {formatDateTime(new Date())}</div>
        </div>

        <div className="print-block print-block-resumo print-block-completo" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>
            Ola, {data?.client?.name?.split(' ')[0]}!
          </div>
          <div style={{ color: '#718096', fontSize: 14, lineHeight: 1.45 }}>
            Acompanhe sua frota, proximas trocas e ordens de servico em tempo real.
          </div>
        </div>

        <div className="grid-2 print-block print-block-resumo print-block-completo" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">Resumo da frota</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><div className="text-sm text-muted">Veiculos</div><div style={{ fontWeight: 800, fontSize: 18 }}>{data?.vehicles?.length || 0}</div></div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><div className="text-sm text-muted">Vencidas</div><div style={{ fontWeight: 800, fontSize: 18, color: '#b91c1c' }}>{overdueAlerts.length}</div></div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><div className="text-sm text-muted">A vencer</div><div style={{ fontWeight: 800, fontSize: 18, color: '#92400e' }}>{dueSoonAlerts.length}</div></div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><div className="text-sm text-muted">Proxima revisao</div><div style={{ fontWeight: 700, fontSize: 13 }}>{nextReview ? `${nextReview.vehicle?.plate || '-'} - ${formatDate(nextReview.nextDate)}` : '-'}</div></div>
            </div>
          </div>

          <div className="card no-print">
            <div className="card-title">Atualizar meus dados</div>
            <form onSubmit={handleProfileSubmit}>
              <div style={{ display: 'grid', gap: 8 }}>
                <input className="form-control" placeholder="WhatsApp" value={profileForm.whatsapp} onChange={(e) => setProfileForm((f) => ({ ...f, whatsapp: e.target.value }))} />
                <input className="form-control" placeholder="Telefone" value={profileForm.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} />
                <input className="form-control" placeholder="E-mail" value={profileForm.email} onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))} />
                <button className="btn btn-primary" type="submit" disabled={savingProfile}>{savingProfile ? 'Salvando...' : 'Salvar dados'}</button>
              </div>
            </form>
            {profileMessage ? <div className="text-sm" style={{ marginTop: 8, color: profileMessage.toLowerCase().includes('sucesso') ? '#166534' : '#b91c1c' }}>{profileMessage}</div> : null}
          </div>
        </div>

        {criticalPairs.length > 0 ? (
          <div
            className="card print-block print-block-resumo print-block-completo"
            style={{
              marginBottom: 16,
              border: criticalPairs[0].level === 'OVERDUE' ? '1px solid #fca5a5' : '1px solid #fde68a',
              background: criticalPairs[0].level === 'OVERDUE' ? '#fff5f5' : '#fffbeb',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: criticalPairs[0].level === 'OVERDUE' ? '#b91c1c' : '#92400e' }}>
              O que foi feito recentemente: itens criticos (oleo + correia)
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {criticalPairs.slice(0, 6).map((item) => (
                <Link key={item.vehicleId} to={`/portal/veiculo/${item.vehicleId}`} style={{ textDecoration: 'none', color: '#1f2937', fontSize: 13 }}>
                  <b>{item.plate}</b> - {item.model || 'Veiculo'} | Oleo: {formatDate(item.oil?.nextDate)} / {formatKm(item.oil?.nextKm)} | Correia: {formatDate(item.belt?.nextDate)} / {formatKm(item.belt?.nextKm)}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card print-block print-block-historico print-block-completo" style={{ marginBottom: 16 }}>
          <div className="card-title">Historico do cliente (OS)</div>

          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}>
            <input
              className="form-control"
              placeholder="Buscar por OS, placa, status"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
            <select className="form-control" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
              <option value="">Status (todos)</option>
              {orderStatusOptions.map((status) => (
                <option key={status} value={status}>{SO_STATUS_LABEL[status] || status}</option>
              ))}
            </select>
            <input type="date" className="form-control" value={orderDateFrom} onChange={(e) => setOrderDateFrom(e.target.value)} />
            <input type="date" className="form-control" value={orderDateTo} onChange={(e) => setOrderDateTo(e.target.value)} />
          </div>

          <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
            Mostrando {filteredRecentOrders.length} de {recentOrders.length} OS.
          </div>

          {!filteredRecentOrders.length ? (
            <div className="text-sm text-muted">Nenhuma OS para o filtro atual.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Veiculo</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Atualizacao</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecentOrders.map((os) => (
                    <tr key={os.id}>
                      <td><Link to={`/portal/os/${os.id}`}><strong>#{os.number}</strong></Link></td>
                      <td>{os.vehicle?.plate || '-'}{os.vehicle?.brand || os.vehicle?.model ? ` | ${os.vehicle?.brand || ''} ${os.vehicle?.model || ''}` : ''}</td>
                      <td>
                        <span style={{ background: `${SO_STATUS_COLOR[os.status] || '#718096'}20`, color: SO_STATUS_COLOR[os.status] || '#718096', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {SO_STATUS_LABEL[os.status] || os.status}
                        </span>
                      </td>
                      <td>{formatCurrency(os.totalPrice)}</td>
                      <td className="text-sm text-muted">{formatDateTime(os.updatedAt || os.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="print-block print-block-resumo print-block-completo" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>Minha Frota</div>
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