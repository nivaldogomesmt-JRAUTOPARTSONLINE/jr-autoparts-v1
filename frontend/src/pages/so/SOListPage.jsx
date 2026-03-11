import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { soAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'QUOTE', label: 'Orcamento' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'STARTED', label: 'Iniciado' },
  { value: 'IN_PROGRESS', label: 'Em Execucao' },
  { value: 'WAITING_PART', label: 'Aguardando Peca' },
  { value: 'FINISHING', label: 'Finalizando' },
  { value: 'DONE', label: 'Finalizado' },
  { value: 'DELIVERED', label: 'Entregue' },
];

const BADGE = {
  QUOTE: 'badge-gray',
  APPROVED: 'badge-blue',
  STARTED: 'badge-purple',
  IN_PROGRESS: 'badge-purple',
  WAITING_PART: 'badge-orange',
  FINISHING: 'badge-yellow',
  DONE: 'badge-green',
  DELIVERED: 'badge-green',
};

const ORDER_PHASE_LABELS = {
  CONFIRMED: 'Pedido confirmado',
  PAYMENT_APPROVED: 'Pagamento aprovado',
  IN_SEPARATION: 'Em separacao',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

const DELIVERY_STATUS_LABELS = {
  AWAITING_DISPATCH: 'Aguardando envio',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  DELIVERY_FAILED: 'Tentativa sem sucesso',
};

const ORDER_PHASE_OPTIONS = [
  { value: '', label: 'Fase do pedido (todas)' },
  { value: 'CONFIRMED', label: ORDER_PHASE_LABELS.CONFIRMED },
  { value: 'PAYMENT_APPROVED', label: ORDER_PHASE_LABELS.PAYMENT_APPROVED },
  { value: 'IN_SEPARATION', label: ORDER_PHASE_LABELS.IN_SEPARATION },
  { value: 'SHIPPED', label: ORDER_PHASE_LABELS.SHIPPED },
  { value: 'DELIVERED', label: ORDER_PHASE_LABELS.DELIVERED },
  { value: 'CANCELED', label: ORDER_PHASE_LABELS.CANCELED },
];

const DELIVERY_STATUS_OPTIONS = [
  { value: '', label: 'Status entrega (todos)' },
  { value: 'AWAITING_DISPATCH', label: DELIVERY_STATUS_LABELS.AWAITING_DISPATCH },
  { value: 'OUT_FOR_DELIVERY', label: DELIVERY_STATUS_LABELS.OUT_FOR_DELIVERY },
  { value: 'DELIVERED', label: DELIVERY_STATUS_LABELS.DELIVERED },
  { value: 'DELIVERY_FAILED', label: DELIVERY_STATUS_LABELS.DELIVERY_FAILED },
];

const PRINT_THEMES = [
  { value: 'resumo', label: 'Resumo executivo' },
  { value: 'lista', label: 'Lista detalhada' },
  { value: 'financeiro', label: 'Financeiro' },
];
const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_so_list';

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

function toStatusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
}

function formatMoney(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function getDeliveryStatus(order) {
  if (order?.deliveryMeta?.status) return order.deliveryMeta.status;
  if (order?.status === 'DELIVERED') return 'DELIVERED';
  return 'AWAITING_DISPATCH';
}

function getOrderPhase(order) {
  if (order?.deliveryMeta?.orderPhase) return order.deliveryMeta.orderPhase;
  if (order?.status === 'CANCELED') return 'CANCELED';
  if (order?.status === 'DELIVERED') return 'DELIVERED';
  if (order?.status === 'DONE') return 'SHIPPED';
  if (['WAITING_PART', 'FINISHING', 'STARTED', 'IN_PROGRESS'].includes(order?.status)) return 'IN_SEPARATION';
  return 'CONFIRMED';
}

function getOrderPhaseLabel(value) {
  return ORDER_PHASE_LABELS[value] || value || '-';
}

function getDeliveryStatusLabel(value) {
  return DELIVERY_STATUS_LABELS[value] || value || '-';
}

function resolveFilename(headers, fallbackName) {
  const disposition = headers?.['content-disposition'] || headers?.['Content-Disposition'] || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]).replace(/["']/g, '');

  const basicMatch = disposition.match(/filename="?([^\"]+)"?/i);
  if (basicMatch?.[1]) return basicMatch[1].trim();

  return fallbackName;
}

function MiniRanking({ title, rows = [], showValues = true }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 8 }}>{title}</div>
      {!rows.length ? (
        <div className="text-sm text-muted">Sem registros.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.slice(0, 6).map((row) => (
            <Link key={row.id} to={`/os/${row.id}`} style={{ textDecoration: 'none', color: 'inherit', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>OS #{row.number} - {row.vehicle?.plate || '-'}</div>
              <div className="text-sm text-muted">{row.client?.name || '-'} | {showValues ? formatMoney(row.totalPrice) : 'Restrito'} | {toStatusLabel(row.status)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SOListPage() {
  const { can } = useAuth();
  const canViewValues = can('sensitive:viewValues');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orderPhase, setOrderPhase] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());

  const currentFilters = useMemo(
    () => ({ search: debouncedSearch, status, dateFrom, dateTo, orderPhase, deliveryStatus }),
    [debouncedSearch, status, dateFrom, dateTo, orderPhase, deliveryStatus]
  );

  const load = async () => {
    setLoading(true);
    try {
      const listRes = await soAPI.list({ ...currentFilters, page, limit: 20 });
      setOrders(listRes.data.data || []);
      setTotal(listRes.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await soAPI.overview({ dateFrom, dateTo });
      setOverview(res.data || null);
    } catch (err) {
      console.error(err);
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentFilters, page]);

  useEffect(() => {
    loadOverview();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore storage errors
    }
  }, [printTheme]);

  const removeOrder = async (id) => {
    if (!can('delete')) return;
    if (!window.confirm('Excluir esta OS/Orcamento definitivamente?')) return;

    try {
      await soAPI.remove(id);
      await load();
      await loadOverview();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao excluir OS.');
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((os) => {
      if (orderPhase && getOrderPhase(os) !== orderPhase) return false;
      if (deliveryStatus && getDeliveryStatus(os) !== deliveryStatus) return false;
      return true;
    });
  }, [orders, orderPhase, deliveryStatus]);

  const handleExportFiltered = async () => {
    setExporting(true);
    try {
      const res = await soAPI.exportFile({
        search: String(currentFilters.search || '').trim() || undefined,
        status: status || undefined,
        orderPhase: orderPhase || undefined,
        deliveryStatus: deliveryStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      const today = new Date().toISOString().slice(0, 10);
      const filename = resolveFilename(res.headers, `os_export_${today}.xlsx`);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Nao foi possivel exportar as ordens filtradas.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintList = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'so-list');
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

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .table { font-size: 12px; }
          body { background: #fff !important; }

          html[data-print-context='so-list'] .print-block {
            display: none !important;
          }

          html[data-print-context='so-list'][data-print-theme='resumo'] .print-block-resumo {
            display: block !important;
          }

          html[data-print-context='so-list'][data-print-theme='lista'] .print-block-lista {
            display: block !important;
          }

          html[data-print-context='so-list'][data-print-theme='financeiro'] .print-block-financeiro {
            display: block !important;
          }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Ordens de ServiÃ§o</div>
          <div className="page-subtitle">Painel gerencial por status, faturamento e operaÃ§Ã£o</div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <details style={{ position: 'relative' }}>
            <summary className="btn btn-outline" style={{ listStyle: 'none', cursor: 'pointer' }}>AÃ§Ãµes</summary>
            <div style={{ position: 'absolute', right: 0, top: 38, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, minWidth: 260, zIndex: 10, boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)' }}>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Tema de impressÃ£o</div>
              <select className="form-control" value={printTheme} onChange={(e) => setPrintTheme(e.target.value)} style={{ marginBottom: 8 }}>
                {PRINT_THEMES.map((theme) => (
                  <option key={theme.value} value={theme.value}>{theme.label}</option>
                ))}
              </select>
              <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={handlePrintList}>Imprimir lista</button>
              <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={handleExportFiltered} disabled={exporting}>{exporting ? 'Exportando...' : 'Exportar XLSX filtrado'}</button>
            </div>
          </details>
          <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
        </div>
      </div>

      <div className="print-block print-block-resumo print-block-financeiro" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Total no perÃ­odo</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>{overviewLoading ? '...' : Number(overview?.totals?.totalOrders || 0)}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Faturamento</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>{overviewLoading ? '...' : (canViewValues ? formatMoney(overview?.totals?.revenue || 0) : 'Restrito')}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Ticket mÃ©dio</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{overviewLoading ? '...' : (canViewValues ? formatMoney(overview?.totals?.avgTicket || 0) : 'Restrito')}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">OS atrasadas</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c' }}>{overviewLoading ? '...' : Number(overview?.totals?.overdueCount || 0)}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <MiniRanking title="OS em andamento" rows={overview?.rankings?.inProgress || []} showValues={canViewValues} />
        <MiniRanking title="Aguardando peÃ§a" rows={overview?.rankings?.waitingPart || []} showValues={canViewValues} />
        <MiniRanking title="OS prontas" rows={overview?.rankings?.ready || []} showValues={canViewValues} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <MiniRanking title="Maiores receitas" rows={overview?.rankings?.topRevenue || []} showValues={canViewValues} />
        <MiniRanking title="OS paradas hÃ¡ mais tempo" rows={overview?.rankings?.stalled || []} showValues={canViewValues} />
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <input
            className="form-control"
            placeholder="Buscar por nÃºmero, cliente ou placa..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="form-control"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value || 'all'} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="date"
            className="form-control"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <input
            type="date"
            className="form-control"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="form-control"
            value={orderPhase}
            onChange={(e) => {
              setOrderPhase(e.target.value);
              setPage(1);
            }}
          >
            {ORDER_PHASE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className="form-control"
            value={deliveryStatus}
            onChange={(e) => {
              setDeliveryStatus(e.target.value);
              setPage(1);
            }}
          >
            {DELIVERY_STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-muted" style={{ marginTop: 8 }}>
          Mostrando {filteredOrders.length} OS nesta página. Total encontrado com os filtros: {total}.
        </div>
      </div>

      <div className="card print-block print-block-lista print-block-financeiro">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Nenhuma OS encontrada</div>
            <Link to="/os/nova" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Nova OS</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Cliente</th>
                  <th>VeÃ­culo / Placa</th>
                  <th>Status</th>
                  <th>Fase pedido</th>
                  <th>Entrega</th>
                  <th>{canViewValues ? 'Total' : 'Financeiro'}</th>
                  <th>Data</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((os) => (
                  <tr key={os.id}>
                    <td><strong>#{os.number}</strong></td>
                    <td>{os.client?.name || '-'}</td>
                    <td>
                      <strong>{os.vehicle?.plate || '-'}</strong>
                      <div className="text-sm text-muted">{os.vehicle?.brand || '-'} {os.vehicle?.model || ''}</div>
                    </td>
                    <td>
                      <span className={`badge ${BADGE[os.status] || 'badge-gray'}`}>
                        {toStatusLabel(os.status)}
                      </span>
                    </td>
                    <td className="text-sm">{getOrderPhaseLabel(getOrderPhase(os))}</td>
                    <td className="text-sm">{getDeliveryStatusLabel(getDeliveryStatus(os))}</td>
                    <td>{canViewValues ? formatMoney(os.totalPrice) : 'Restrito'}</td>
                    <td className="text-sm text-muted">{new Date(os.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link to={`/os/${os.id}`} className="btn btn-outline btn-sm">Abrir</Link>
                        {can('delete') ? (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeOrder(os.id)}>Excluir</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 20 ? (
          <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
            <span style={{ padding: '5px 10px', fontSize: 13 }}>PÃ¡gina {page}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={orders.length < 20}>PrÃ³xima</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


