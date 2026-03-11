import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI, soAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const DELIVERY_LABELS = {
  AWAITING_DISPATCH: 'Pendente',
  OUT_FOR_DELIVERY: 'Em transporte',
  DELIVERED: 'Entregue',
  DELIVERY_FAILED: 'Atraso/Problema',
};

const ORDER_PHASE_LABELS = {
  CONFIRMED: 'Pedido confirmado',
  PAYMENT_APPROVED: 'Pagamento aprovado',
  IN_SEPARATION: 'Em separacao',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

const ORDER_PHASE_OPTIONS = [
  { value: 'CONFIRMED', label: ORDER_PHASE_LABELS.CONFIRMED },
  { value: 'PAYMENT_APPROVED', label: ORDER_PHASE_LABELS.PAYMENT_APPROVED },
  { value: 'IN_SEPARATION', label: ORDER_PHASE_LABELS.IN_SEPARATION },
  { value: 'SHIPPED', label: ORDER_PHASE_LABELS.SHIPPED },
  { value: 'DELIVERED', label: ORDER_PHASE_LABELS.DELIVERED },
  { value: 'CANCELED', label: ORDER_PHASE_LABELS.CANCELED },
];

const DELIVERY_STATUS_OPTIONS = [
  { value: 'AWAITING_DISPATCH', label: DELIVERY_LABELS.AWAITING_DISPATCH },
  { value: 'OUT_FOR_DELIVERY', label: DELIVERY_LABELS.OUT_FOR_DELIVERY },
  { value: 'DELIVERED', label: DELIVERY_LABELS.DELIVERED },
  { value: 'DELIVERY_FAILED', label: DELIVERY_LABELS.DELIVERY_FAILED },
];

const TRACKABLE_OS_STATUS = new Set([
  'QUOTE',
  'APPROVED',
  'STARTED',
  'IN_PROGRESS',
  'WAITING_PART',
  'FINISHING',
  'DONE',
  'DELIVERED',
  'CANCELED',
]);

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeCsv(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveDeliveryStatus(os) {
  const deliveryMeta = os.deliveryMeta || null;
  if (deliveryMeta?.status) return deliveryMeta.status;
  if (os.status === 'DELIVERED') return 'DELIVERED';
  return 'AWAITING_DISPATCH';
}

function resolveOrderPhase(os) {
  const deliveryMeta = os.deliveryMeta || null;
  if (deliveryMeta?.orderPhase) return deliveryMeta.orderPhase;

  if (os.status === 'CANCELED') return 'CANCELED';
  if (os.status === 'DELIVERED') return 'DELIVERED';
  if (os.status === 'DONE') return 'SHIPPED';
  if (['WAITING_PART', 'FINISHING'].includes(os.status)) return 'IN_SEPARATION';
  if (['STARTED', 'IN_PROGRESS'].includes(os.status)) return 'IN_SEPARATION';
  return 'CONFIRMED';
}

function resolveOrderPhaseLabel(orderPhase) {
  return ORDER_PHASE_LABELS[orderPhase] || orderPhase || '-';
}

function formatAddress(client) {
  const address = String(client?.address || '').trim();
  const city = String(client?.city || '').trim();
  if (address && city) return `${address} - ${city}`;
  return address || city || 'Endereco nao informado';
}

function getItemsPreview(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) {
    const count = Number(order?._count?.items || 0);
    return count > 0 ? `${count} item(ns)` : 'Sem itens';
  }

  const names = items
    .map((item) => String(item?.itemName || '').trim())
    .filter(Boolean);

  if (!names.length) {
    return `${items.length} item(ns)`;
  }

  const preview = names.slice(0, 2).join(' | ');
  const extra = names.length > 2 ? ` +${names.length - 2}` : '';
  return `${preview}${extra}`;
}

function getHistoryPreview(order, fallbackOrderPhaseLabel, fallbackDeliveryLabel) {
  const history = Array.isArray(order?.deliveryHistory) ? order.deliveryHistory : [];
  if (history.length) return history.slice(0, 3);

  return [{
    orderPhaseLabel: fallbackOrderPhaseLabel,
    statusLabel: fallbackDeliveryLabel,
    updatedAt: order?.deliveryMeta?.updatedAt || order?.updatedAt || null,
    note: order?.deliveryMeta?.note || null,
  }];
}

function exportOrdersCsv(orders) {
  const header = [
    'Pedido',
    'Cliente',
    'Placa',
    'Produtos',
    'Endereco',
    'Status pedido',
    'Status entrega',
    'Valor',
    'Ultima atualizacao',
  ];

  const rows = orders.map((os) => {
    const deliveryStatus = resolveDeliveryStatus(os);
    const orderPhase = resolveOrderPhase(os);
    const phaseLabel = resolveOrderPhaseLabel(orderPhase);
    const deliveryLabel = DELIVERY_LABELS[deliveryStatus] || deliveryStatus;

    return [
      `#${os.number}`,
      os.client?.name || '-',
      os.vehicle?.plate || '-',
      getItemsPreview(os),
      formatAddress(os.client),
      phaseLabel,
      deliveryLabel,
      formatCurrency(os.total),
      formatDateTime(os.deliveryMeta?.updatedAt || os.updatedAt),
    ];
  });

  const csv = [header, ...rows]
    .map((line) => line.map(escapeCsv).join(';'))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `entregas_filtradas_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printOrders(orders) {
  const rows = orders.map((os) => {
    const deliveryStatus = resolveDeliveryStatus(os);
    const orderPhase = resolveOrderPhase(os);
    const phaseLabel = resolveOrderPhaseLabel(orderPhase);
    const deliveryLabel = DELIVERY_LABELS[deliveryStatus] || deliveryStatus;

    return `
      <tr>
        <td>#${escapeHtml(os.number)}</td>
        <td>${escapeHtml(os.client?.name || '-')}</td>
        <td>${escapeHtml(os.vehicle?.plate || '-')}</td>
        <td>${escapeHtml(getItemsPreview(os))}</td>
        <td>${escapeHtml(phaseLabel)}</td>
        <td>${escapeHtml(deliveryLabel)}</td>
        <td>${escapeHtml(formatCurrency(os.total))}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Entregas filtradas</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          p { margin: 0 0 16px; color: #475569; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Entregas e Pedidos Online</h1>
        <p>Impressao filtrada em ${new Date().toLocaleString('pt-BR')}</p>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Placa</th>
              <th>Produtos</th>
              <th>Status pedido</th>
              <th>Status entrega</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7">Sem dados</td></tr>'}</tbody>
        </table>
      </body>
    </html>
  `;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=720');
  if (!w) {
    window.alert('Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-up.');
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export default function DeliveriesPage() {
  const [orders, setOrders] = useState([]);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [phaseFilter, setPhaseFilter] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [topProducts, setTopProducts] = useState([]);
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [soRes, dashRes] = await Promise.all([
        soAPI.list({
          search: debouncedSearch,
          sort: 'updated',
          limit: 250,
          includeDeliveryDetails: 'true',
          orderPhase: phaseFilter || undefined,
          deliveryStatus: deliveryFilter || undefined,
          dateFrom: periodFrom || undefined,
          dateTo: periodTo || undefined,
        }),
        dashboardAPI.get(),
      ]);

      const data = (soRes.data?.data || []).filter((os) => TRACKABLE_OS_STATUS.has(os.status) || os.deliveryMeta);
      setOrders(data);
      setTotalFound(Number(soRes.data?.total || data.length));
      setTopProducts(dashRes.data?.rankings?.topProducts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [debouncedSearch, phaseFilter, deliveryFilter, periodFrom, periodTo]);

  useEffect(() => {
    const nextDrafts = {};
    for (const os of orders) {
      nextDrafts[os.id] = {
        orderPhase: resolveOrderPhase(os),
        deliveryStatus: resolveDeliveryStatus(os),
      };
    }
    setDrafts(nextDrafts);
  }, [orders]);

  const filteredOrders = useMemo(() => orders, [orders]);

  const summary = useMemo(() => {
    const now = Date.now();
    const delayLimit = 2 * 24 * 60 * 60 * 1000;

    const acc = {
      pending: 0,
      paymentApproved: 0,
      separation: 0,
      sent: 0,
      transport: 0,
      delivered: 0,
      delayed: 0,
      canceled: 0,
    };

    for (const os of filteredOrders) {
      const deliveryStatus = resolveDeliveryStatus(os);
      const phase = resolveOrderPhase(os);
      const updatedAt = new Date(os.deliveryMeta?.updatedAt || os.updatedAt).getTime();

      if (phase === 'CANCELED') {
        acc.canceled += 1;
        continue;
      }

      if (phase === 'CONFIRMED') acc.pending += 1;
      if (phase === 'PAYMENT_APPROVED') acc.paymentApproved += 1;
      if (phase === 'IN_SEPARATION') acc.separation += 1;
      if (phase === 'SHIPPED') acc.sent += 1;
      if (deliveryStatus === 'OUT_FOR_DELIVERY') acc.transport += 1;
      if (phase === 'DELIVERED' || deliveryStatus === 'DELIVERED') acc.delivered += 1;

      const isFailed = deliveryStatus === 'DELIVERY_FAILED';
      const isStale = deliveryStatus !== 'DELIVERED' && Number.isFinite(updatedAt) && (now - updatedAt > delayLimit);
      if (isFailed || isStale) acc.delayed += 1;
    }

    return acc;
  }, [filteredOrders]);

  const setDraftField = (id, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const saveStatus = async (os) => {
    const draft = drafts[os.id] || {
      orderPhase: resolveOrderPhase(os),
      deliveryStatus: resolveDeliveryStatus(os),
    };

    setUpdatingId(os.id);
    try {
      await soAPI.updateDelivery(os.id, {
        orderPhase: draft.orderPhase,
        deliveryStatus: draft.deliveryStatus,
      });
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao atualizar entrega/pedido.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div className="page-title">Entregas e Pedidos Online</div>
          <div className="page-subtitle">Controle de pedido, entrega e historico de atualizacoes com WhatsApp automatico</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => exportOrdersCsv(filteredOrders)} disabled={!filteredOrders.length || loading}>
            Exportar filtrados
          </button>
          <button className="btn btn-outline" onClick={() => printOrders(filteredOrders)} disabled={!filteredOrders.length || loading}>
            Imprimir
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Pedido confirmado</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.pending}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Pagamento aprovado</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.paymentApproved}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Em separacao</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.separation}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Enviados</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.sent}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Em transporte</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.transport}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Entregues</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.delivered}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Atrasados</div><div style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c' }}>{summary.delayed}</div></div>
        <div className="card" style={{ padding: 12 }}><div className="text-sm text-muted">Cancelados</div><div style={{ fontSize: 22, fontWeight: 800 }}>{summary.canceled}</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Produtos mais vendidos online</div>
          {!topProducts.length ? (
            <div className="text-sm text-muted">Sem dados ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {topProducts.slice(0, 6).map((item) => (
                <div key={`prod-${item.rank}-${item.name}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{item.rank}. {item.name}</div>
                  <div className="text-sm text-muted">Qtd: {item.quantity} | Receita: {formatCurrency(item.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Busca de pedidos</div>
          <input
            className="form-control"
            placeholder="Buscar por OS, cliente ou placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}>
            <select className="form-control" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
              <option value="">Status pedido (todos)</option>
              {ORDER_PHASE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="form-control" value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)}>
              <option value="">Status entrega (todos)</option>
              {DELIVERY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input type="date" className="form-control" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            <input type="date" className="form-control" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 8 }}>
            Mostrando {filteredOrders.length} de {totalFound} pedido(s) conforme os filtros.
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 4 }}>
            Atualizacoes de pedido e entrega evitam duplicidade e ficam registradas no historico de cada pedido.
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">Entregas</div>
            <div className="empty-state-text">Nenhuma entrega encontrada</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Produtos</th>
                  <th>Endereco</th>
                  <th>Status do pedido</th>
                  <th>Status da entrega</th>
                  <th>Valor</th>
                  <th>Historico</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((os) => {
                  const deliveryStatus = resolveDeliveryStatus(os);
                  const orderPhase = resolveOrderPhase(os);
                  const phaseLabel = resolveOrderPhaseLabel(orderPhase);
                  const deliveryLabel = DELIVERY_LABELS[deliveryStatus] || deliveryStatus;
                  const historyRows = getHistoryPreview(os, phaseLabel, deliveryLabel);
                  const draft = drafts[os.id] || { orderPhase, deliveryStatus };

                  return (
                    <tr key={os.id}>
                      <td>
                        <strong>#{os.number}</strong>
                        <div className="text-sm text-muted">{os.vehicle?.plate || '-'}</div>
                      </td>
                      <td>{os.client?.name || '-'}</td>
                      <td className="text-sm">{getItemsPreview(os)}</td>
                      <td className="text-sm text-muted">{formatAddress(os.client)}</td>
                      <td><span className="badge badge-gray">{phaseLabel}</span></td>
                      <td><span className="badge badge-blue">{deliveryLabel}</span></td>
                      <td><strong>{formatCurrency(os.total)}</strong></td>
                      <td>
                        <div style={{ display: 'grid', gap: 4 }}>
                          {historyRows.map((h, idx) => (
                            <div key={`${os.id}-h-${idx}`} className="text-sm text-muted">
                              <strong style={{ color: '#0f172a' }}>{h.orderPhaseLabel || phaseLabel}</strong>
                              <span> | </span>
                              <strong style={{ color: '#0f172a' }}>{h.statusLabel || deliveryLabel}</strong>
                              <span> - {formatDateTime(h.updatedAt)}</span>
                              {h.note ? <span> ({h.note})</span> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                          <select
                            className="form-control"
                            value={draft.orderPhase}
                            onChange={(e) => setDraftField(os.id, 'orderPhase', e.target.value)}
                            disabled={!!updatingId}
                          >
                            {ORDER_PHASE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>

                          <select
                            className="form-control"
                            value={draft.deliveryStatus}
                            onChange={(e) => setDraftField(os.id, 'deliveryStatus', e.target.value)}
                            disabled={!!updatingId}
                          >
                            {DELIVERY_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>

                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => saveStatus(os)}
                              disabled={!!updatingId}
                            >
                              {updatingId === os.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <Link to={`/os/${os.id}`} className="btn btn-ghost btn-sm">Abrir</Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

