import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

const TRACKING_STATUS_LABEL = {
  ACTIVE: 'Ativo',
  STOCK: 'Estoque',
  MAINTENANCE: 'Manutencao',
  REMOVED: 'Retirado',
};

const LEVEL_STYLE = {
  OVERDUE: { bg: '#fee2e2', color: '#b91c1c', label: 'Vencido' },
  DUE_SOON: { bg: '#fef3c7', color: '#92400e', label: 'Atencao' },
  OK: { bg: '#dcfce7', color: '#166534', label: 'Em dia' },
};

const DUE_BY_LABEL = {
  DATE: 'Vence primeiro por data',
  KM: 'Vence primeiro por quilometragem',
  DATE_OR_KM: 'Vence por data e quilometragem',
  NONE: 'Sem previsao de vencimento',
};

const PRINT_THEMES = [
  { value: 'resumo', label: 'Resumo do veiculo' },
  { value: 'manutencoes', label: 'Somente manutencoes' },
  { value: 'historico', label: 'Somente historico' },
  { value: 'completo', label: 'Completo' },
];

const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_portal_vehicle_detail';

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
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    const pa = a?.alertLevel === 'OVERDUE' ? 0 : (a?.alertLevel === 'DUE_SOON' ? 1 : 2);
    const pb = b?.alertLevel === 'OVERDUE' ? 0 : (b?.alertLevel === 'DUE_SOON' ? 1 : 2);
    if (pa !== pb) return pa - pb;

    const ad = a?.nextDate ? new Date(a.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b?.nextDate ? new Date(b.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;

    const ak = a?.nextKm ?? Number.MAX_SAFE_INTEGER;
    const bk = b?.nextKm ?? Number.MAX_SAFE_INTEGER;
    return ak - bk;
  });

  return ranked.find((m) => {
    const text = `${normalizeLabel(m?.type)} ${normalizeLabel(m?.label)}`;
    return keywords.every((kw) => text.includes(kw));
  }) || null;
}

function summarizeAlert(maintenance) {
  const style = LEVEL_STYLE[maintenance?.alertLevel || 'OK'] || LEVEL_STYLE.OK;
  return {
    label: style.label,
    color: style.color,
    bg: style.bg,
  };
}

function MetricCard({ title, main, sub }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="text-sm text-muted">{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E', marginTop: 2 }}>{main}</div>
      {sub ? <div className="text-sm text-muted" style={{ marginTop: 4 }}>{sub}</div> : null}
    </div>
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

function buildVehicleCsvRows({ vehicle, maintenances, serviceOrders, filters }) {
  const rows = [];

  rows.push(['Secao', 'Campo', 'Valor']);
  rows.push(['Veiculo', 'Placa', vehicle?.plate || '-']);
  rows.push(['Veiculo', 'Marca/Modelo', `${vehicle?.brand || ''} ${vehicle?.model || ''}`.trim() || '-']);
  rows.push(['Veiculo', 'Ano', vehicle?.year || '-']);
  rows.push(['Veiculo', 'KM atual', vehicle?.currentKm ?? '-']);
  rows.push(['Veiculo', 'Ultima atualizacao', formatDateTime(vehicle?.updatedAt)]);

  rows.push([]);
  rows.push(['Filtros', 'Busca historico', filters.search || '-']);
  rows.push(['Filtros', 'Status OS', filters.status || '-']);
  rows.push(['Filtros', 'Periodo de', filters.dateFrom || '-']);
  rows.push(['Filtros', 'Periodo ate', filters.dateTo || '-']);

  rows.push([]);
  rows.push(['Manutencoes', 'Item', 'Status']);
  (maintenances || []).forEach((m) => {
    rows.push([
      'Manutencoes',
      `${m.label || m.type || '-'} | Prox: ${formatDate(m.nextDate)} | ${formatKm(m.nextKm)}`,
      m.statusLabel || '-'],
    );
  });

  rows.push([]);
  rows.push(['Historico OS', 'OS', 'Detalhe']);
  (serviceOrders || []).forEach((os) => {
    rows.push([
      'Historico OS',
      `#${os.number}`,
      `${SO_STATUS_LABEL[os.status] || os.status} | ${formatDateTime(os.updatedAt || os.createdAt)} | Total: ${formatCurrency(os.totalPrice)}`,
    ]);
  });

  return rows;
}

export default function PortalVehicle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());

  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  useEffect(() => {
    portalAPI.vehicleDetail(id)
      .then((r) => setData(r.data))
      .catch(() => setError('Veiculo nao encontrado.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore storage errors
    }
  }, [printTheme]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 36 }}>!</div>
        <div style={{ color: '#718096' }}>{error || 'Veiculo nao encontrado.'}</div>
        <button className="btn btn-primary" onClick={() => navigate('/portal')}>Voltar ao portal</button>
      </div>
    );
  }

  const { vehicle, maintenances = [], upcomingMaintenances = [], trackingDevices = [], serviceOrders = [] } = data;

  const nextReview = upcomingMaintenances[0] || null;
  const oil = findMaintenanceByKeywords(maintenances, ['OLEO']);
  const belt = findMaintenanceByKeywords(maintenances, ['CORREIA', 'DENTADA']);

  const inProgressOrders = serviceOrders.filter((os) => ['APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING'].includes(os.status));
  const finishedOrders = serviceOrders.filter((os) => ['DONE', 'DELIVERED'].includes(os.status));
  const lastMaintenanceOrder = finishedOrders[0] || null;

  const alerts = maintenances.filter((m) => ['OVERDUE', 'DUE_SOON'].includes(m.alertLevel));
  const globalAlert = summarizeAlert(nextReview);

  const historyStatusOptions = useMemo(() => {
    const set = new Set(serviceOrders.map((os) => String(os.status || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [serviceOrders]);

  const filteredServiceOrders = useMemo(() => {
    const fromTs = historyDateFrom ? new Date(`${historyDateFrom}T00:00:00`).getTime() : null;
    const toTs = historyDateTo ? new Date(`${historyDateTo}T23:59:59.999`).getTime() : null;
    const search = String(historySearch || '').trim().toLowerCase();

    return serviceOrders.filter((os) => {
      if (historyStatus && os.status !== historyStatus) return false;

      const refTs = new Date(os.updatedAt || os.createdAt).getTime();
      if (fromTs && Number.isFinite(refTs) && refTs < fromTs) return false;
      if (toTs && Number.isFinite(refTs) && refTs > toTs) return false;

      if (search) {
        const hay = [
          `#${os.number || ''}`,
          SO_STATUS_LABEL[os.status] || os.status || '',
          os.status || '',
          vehicle.plate || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }

      return true;
    });
  }, [serviceOrders, historyStatus, historyDateFrom, historyDateTo, historySearch, vehicle.plate]);

  const timelineRows = useMemo(
    () => [...filteredServiceOrders]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 12),
    [filteredServiceOrders],
  );

  const handlePrintDetails = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'portal-vehicle-detail');
    html.setAttribute('data-print-theme', printTheme);

    const clearPrintState = () => {
      html.removeAttribute('data-print-theme');
      html.removeAttribute('data-print-context');
      window.removeEventListener('afterprint', clearPrintState);
    };

    window.addEventListener('afterprint', clearPrintState);
    window.print();
    setTimeout(clearPrintState, 1200);
  };

  const handleExportCsv = () => {
    const rows = buildVehicleCsvRows({
      vehicle,
      maintenances,
      serviceOrders: filteredServiceOrders,
      filters: {
        search: historySearch,
        status: historyStatus,
        dateFrom: historyDateFrom,
        dateTo: historyDateTo,
      },
    });

    const csv = rows.map((row) => row.map(toCsvCell).join(';')).join('\n');
    const dateTag = new Date().toISOString().slice(0, 10);
    const plateTag = String(vehicle.plate || 'veiculo').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadTextFile(csv, `portal_veiculo_${plateTag}_${dateTag}.csv`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        .print-only { display: none; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }

          html[data-print-context='portal-vehicle-detail'] .print-block {
            display: none !important;
          }

          html[data-print-context='portal-vehicle-detail'][data-print-theme='resumo'] .print-block-resumo {
            display: block !important;
          }

          html[data-print-context='portal-vehicle-detail'][data-print-theme='manutencoes'] .print-block-manutencoes {
            display: block !important;
          }

          html[data-print-context='portal-vehicle-detail'][data-print-theme='historico'] .print-block-historico {
            display: block !important;
          }

          html[data-print-context='portal-vehicle-detail'][data-print-theme='completo'] .print-block-completo {
            display: block !important;
          }

          .card { break-inside: avoid; }
        }
      `}</style>

      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/portal')}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Voltar
          </button>
          <div>
            <div style={{ fontWeight: 700 }}>{vehicle.plate}</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>{vehicle.brand} {vehicle.model} {vehicle.year ? `- ${vehicle.year}` : ''}</div>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={printTheme}
            onChange={(e) => setPrintTheme(e.target.value)}
            style={{ borderRadius: 8, border: 0, padding: '6px 8px', minWidth: 190 }}
          >
            {PRINT_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={handleExportCsv}>Exportar CSV</button>
          <button className="btn btn-outline btn-sm" onClick={handlePrintDetails}>Imprimir</button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 16px', display: 'grid', gap: 12 }}>
        <div className="print-only card" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>Veiculo {vehicle.plate}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {vehicle.brand} {vehicle.model} {vehicle.year ? `- ${vehicle.year}` : ''} | Emissao: {formatDateTime(new Date())}
          </div>
        </div>

        <div className="card print-block print-block-resumo print-block-completo">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>{vehicle.plate}</div>
              <div style={{ color: '#4a5568', fontWeight: 600 }}>{vehicle.brand} {vehicle.model}</div>
            </div>
            <span style={{ background: globalAlert.bg, color: globalAlert.color, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Status geral: {globalAlert.label}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
            <div>
              <div className="text-sm text-muted">KM atual</div>
              <div style={{ fontWeight: 700 }}>{formatKm(vehicle.currentKm)}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Ultima atualizacao</div>
              <div style={{ fontWeight: 700 }}>{formatDateTime((serviceOrders[0]?.updatedAt || serviceOrders[0]?.createdAt || vehicle.updatedAt))}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Proxima revisao</div>
              <div style={{ fontWeight: 700 }}>{nextReview ? `${formatDate(nextReview.nextDate)} | ${formatKm(nextReview.nextKm)}` : 'Nao configurada'}</div>
            </div>
          </div>
        </div>

        <div className="print-block print-block-resumo print-block-completo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <MetricCard title="Prox. troca de oleo" main={oil ? formatDate(oil.nextDate) : 'Nao configurada'} sub={oil ? formatKm(oil.nextKm) : ''} />
          <MetricCard title="Prox. troca de correia" main={belt ? formatDate(belt.nextDate) : 'Nao configurada'} sub={belt ? formatKm(belt.nextKm) : ''} />
          <MetricCard title="Proxima revisao" main={nextReview ? formatDate(nextReview.nextDate) : 'Nao configurada'} sub={nextReview ? formatKm(nextReview.nextKm) : ''} />
          <MetricCard title="OS em andamento" main={inProgressOrders.length} sub="Ordens abertas" />
          <MetricCard title="Ultima manutencao" main={lastMaintenanceOrder ? `OS #${lastMaintenanceOrder.number}` : '-'} sub={lastMaintenanceOrder ? formatDate(lastMaintenanceOrder.updatedAt || lastMaintenanceOrder.createdAt) : 'Sem historico'} />
        </div>

        <div className="card print-block print-block-manutencoes print-block-completo">
          <div className="card-title">Atencao neste veiculo</div>
          {!alerts.length ? (
            <div className="text-sm text-muted">Nenhuma pendencia critica no momento.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {alerts.map((m) => {
                const style = summarizeAlert(m);
                return (
                  <div key={m.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{m.label}</div>
                      <div className="text-sm text-muted">{DUE_BY_LABEL[m.dueBy || 'NONE']}</div>
                      <div className="text-sm text-muted">Prox. data: {formatDate(m.nextDate)} | Prox. KM: {formatKm(m.nextKm)}</div>
                    </div>
                    <span style={{ background: style.bg, color: style.color, borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>{style.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card print-block print-block-manutencoes print-block-historico print-block-completo">
          <div className="card-title">Historico de manutencoes</div>
          {!maintenances.length ? (
            <div className="text-sm text-muted">Sem manutencoes cadastradas.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Ultima</th>
                    <th>Proxima</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenances.map((m) => {
                    const style = summarizeAlert(m);
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.label || m.type}</strong></td>
                        <td>{formatDate(m.lastDate)} | {formatKm(m.lastKm)}</td>
                        <td>{formatDate(m.nextDate)} | {formatKm(m.nextKm)}</td>
                        <td><span style={{ background: style.bg, color: style.color, borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>{style.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card no-print">
          <div className="card-title">Filtros do historico</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <input
              className="form-control"
              placeholder="Buscar por numero/status"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <select className="form-control" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
              <option value="">Status (todos)</option>
              {historyStatusOptions.map((status) => (
                <option key={status} value={status}>{SO_STATUS_LABEL[status] || status}</option>
              ))}
            </select>
            <input type="date" className="form-control" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} />
            <input type="date" className="form-control" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} />
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 8 }}>
            Mostrando {filteredServiceOrders.length} de {serviceOrders.length} OS.
          </div>
        </div>

        <div className="grid-2 print-block print-block-historico print-block-completo">
          <div className="card">
            <div className="card-title">Historico de OS</div>
            {!filteredServiceOrders.length ? (
              <div className="text-sm text-muted">Nenhuma OS registrada para este filtro.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {filteredServiceOrders.slice(0, 12).map((os) => (
                  <Link key={os.id} to={`/portal/os/${os.id}`} style={{ textDecoration: 'none', color: 'inherit', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>OS #{os.number}</div>
                      <span style={{ background: `${SO_STATUS_COLOR[os.status] || '#718096'}20`, color: SO_STATUS_COLOR[os.status] || '#718096', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                        {SO_STATUS_LABEL[os.status] || os.status}
                      </span>
                    </div>
                    <div className="text-sm text-muted">{formatDateTime(os.updatedAt || os.createdAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Linha do tempo</div>
            {!timelineRows.length ? (
              <div className="text-sm text-muted">Sem atividades para o filtro atual.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {timelineRows.map((row) => (
                  <div key={`timeline-${row.id}`} style={{ borderLeft: '3px solid #cbd5e1', paddingLeft: 10 }}>
                    <div style={{ fontWeight: 700 }}>OS #{row.number} - {SO_STATUS_LABEL[row.status] || row.status}</div>
                    <div className="text-sm text-muted">{formatDateTime(row.updatedAt || row.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid-2 print-block print-block-historico print-block-completo">
          <div className="card">
            <div className="card-title">Rastreadores vinculados</div>
            {!trackingDevices.length ? (
              <div className="text-sm text-muted">Nenhum rastreador vinculado.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {trackingDevices.map((d) => (
                  <div key={d.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{d.model}</div>
                    <div className="text-sm text-muted">IMEI: {d.imei}</div>
                    <div className="text-sm text-muted">Status: {TRACKING_STATUS_LABEL[d.status] || d.status} | Instalado em: {formatDate(d.installedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card no-print">
            <div className="card-title">Acoes rapidas</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              <Link to="/portal" className="btn btn-outline">Voltar para frota</Link>
              <Link to="/portal/rastreamento" className="btn btn-outline">Abrir rastreamento</Link>
              {serviceOrders[0] ? <Link to={`/portal/os/${serviceOrders[0].id}`} className="btn btn-outline">Ultima OS</Link> : <button className="btn btn-outline" disabled>Ultima OS</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}