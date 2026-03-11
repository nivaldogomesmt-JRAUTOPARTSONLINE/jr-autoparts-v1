import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

const PRINT_THEMES = [
  { value: 'resumo', label: 'Resumo da OS' },
  { value: 'itens', label: 'Somente itens' },
  { value: 'financeiro', label: 'Somente financeiro' },
  { value: 'manutencao', label: 'Somente proximas trocas' },
  { value: 'completo', label: 'Completo' },
];

const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_portal_so_detail';

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
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'R$ 0,00';
  return `R$ ${amount.toFixed(2).replace('.', ',')}`;
}

function formatKm(value) {
  const km = Number(value);
  if (!Number.isFinite(km)) return '-';
  return `${km.toLocaleString('pt-BR')} km`;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getProjectionBadge(projection) {
  if (!projection || projection.source === 'NOT_AVAILABLE') {
    return { bg: '#e2e8f0', color: '#334155', label: 'Nao configurado' };
  }

  if (projection.source === 'PENDING_EXECUTION') {
    return { bg: '#fef3c7', color: '#92400e', label: 'Aguardando conclusao' };
  }

  if (projection.performedInThisOrder) {
    return { bg: '#dcfce7', color: '#166534', label: 'Calculado nesta OS' };
  }

  if (projection.source === 'CURRENT_PLAN') {
    return { bg: '#dbeafe', color: '#1d4ed8', label: 'Plano atual' };
  }

  return { bg: '#f1f5f9', color: '#334155', label: 'Previsao' };
}

function MaintenanceProjectionCard({ title, projection }) {
  const badge = getProjectionBadge(projection);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#1A3C5E' }}>{title}</div>
        <span style={{ background: badge.bg, color: badge.color, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
          {badge.label}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 4, fontSize: 13, color: '#334155' }}>
        <div>Proxima data: <b>{formatDate(projection?.nextDate)}</b></div>
        <div>Proximo KM: <b>{formatKm(projection?.nextKm)}</b></div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
        {projection?.performedInThisOrder
          ? 'Previsao calculada considerando esta manutencao como executada.'
          : (projection?.source === 'PENDING_EXECUTION'
            ? 'A previsao sera calculada quando a OS for finalizada ou entregue.'
            : (projection?.source === 'CURRENT_PLAN'
              ? 'Previsao baseada no plano preventivo atual do veiculo.'
              : 'Sem previsao configurada para este item.'))}
      </div>
    </div>
  );
}

function ItemRows({ rows }) {
  if (!rows.length) return <div className="text-sm text-muted">Sem itens nesta secao.</div>;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((item) => {
        const quantity = toNumber(item.quantityNumber, toNumber(item.quantity));
        const unitPrice = toNumber(item.unitPriceNumber, toNumber(item.unitPrice));
        const lineTotal = toNumber(item.lineTotal, quantity * unitPrice);

        return (
          <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.itemName || item.description || 'Item'}</div>
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
              Qtd: {quantity.toLocaleString('pt-BR')} | Unitario: {formatCurrency(unitPrice)}
            </div>
            <div style={{ marginTop: 4, fontWeight: 700, color: '#1A3C5E' }}>Total: {formatCurrency(lineTotal)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function PortalSODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());

  useEffect(() => {
    portalAPI.soDetail(id)
      .then((res) => setOrder(res.data))
      .catch(() => setError('Nao foi possivel carregar a OS.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore storage errors
    }
  }, [printTheme]);

  const serviceItems = useMemo(() => {
    if (!order) return [];
    if (Array.isArray(order.serviceItems) && order.serviceItems.length) return order.serviceItems;
    return (order.items || []).filter((item) => item.type === 'SERVICE');
  }, [order]);

  const productItems = useMemo(() => {
    if (!order) return [];
    if (Array.isArray(order.productItems) && order.productItems.length) return order.productItems;
    return (order.items || []).filter((item) => item.type === 'PRODUCT');
  }, [order]);

  const handlePrintDetails = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'portal-so-detail');
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 8 }}>Detalhe da OS</div>
          <div style={{ color: '#64748b', marginBottom: 12 }}>{error || 'OS nao encontrada.'}</div>
          <button className="btn btn-primary" onClick={() => navigate('/portal')}>Voltar ao portal</button>
        </div>
      </div>
    );
  }

  const statusColor = SO_STATUS_COLOR[order.status] || '#718096';
  const summary = order.financialSummary || {};

  const subtotalServices = toNumber(summary.subtotalServices);
  const subtotalProducts = toNumber(summary.subtotalProducts);
  const discount = toNumber(summary.discount);
  const additional = toNumber(summary.additional);
  const calculatedTotal = toNumber(summary.totalCalculated, toNumber(order.calculatedTotal));
  const totalFinal = toNumber(summary.totalFinal, toNumber(order.displayTotal, calculatedTotal));

  const oilProjection = order.maintenanceProjection?.oil || null;
  const beltProjection = order.maintenanceProjection?.belt || null;
  const orderPhaseLabel = order.deliveryMeta?.orderPhaseLabel || '-';
  const deliveryStatusLabel = order.deliveryMeta?.statusLabel || '-';
  const deliveryUpdatedAt = order.deliveryMeta?.updatedAt ? formatDateTime(order.deliveryMeta.updatedAt) : '-';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        .print-only { display: none; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }

          html[data-print-context='portal-so-detail'] .print-block {
            display: none !important;
          }

          html[data-print-context='portal-so-detail'][data-print-theme='resumo'] .print-block-resumo {
            display: block !important;
          }

          html[data-print-context='portal-so-detail'][data-print-theme='itens'] .print-block-itens {
            display: block !important;
          }

          html[data-print-context='portal-so-detail'][data-print-theme='financeiro'] .print-block-financeiro {
            display: block !important;
          }

          html[data-print-context='portal-so-detail'][data-print-theme='manutencao'] .print-block-manutencao {
            display: block !important;
          }

          html[data-print-context='portal-so-detail'][data-print-theme='completo'] .print-block-completo {
            display: block !important;
          }

          .card { break-inside: avoid; }
        }
      `}</style>

      <div style={{ background: '#1A3C5E', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/portal')}
            style={{ background: 'rgba(255,255,255,0.18)', border: 0, color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Voltar
          </button>
          <div style={{ fontWeight: 700 }}>Detalhe da OS #{order.number}</div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={printTheme}
            onChange={(e) => setPrintTheme(e.target.value)}
            style={{ borderRadius: 8, border: 0, padding: '6px 8px', minWidth: 190 }}
          >
            {PRINT_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={handlePrintDetails}>
            Imprimir
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px', display: 'grid', gap: 12 }}>
        <div className="print-only card" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>Ordem de Servico #{order.number}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Cliente: {order.client?.name || '-'} | Veiculo: {order.vehicle?.plate || '-'} | Emissao: {formatDateTime(new Date())}
          </div>
        </div>

        <div className="card print-block print-block-resumo print-block-completo">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>Ordem de Servico #{order.number}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{order.vehicle?.plate || '-'} | {order.vehicle?.brand || ''} {order.vehicle?.model || ''}</div>
            </div>
            <span style={{ background: `${statusColor}22`, color: statusColor, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {SO_STATUS_LABEL[order.status] || order.status}
            </span>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <div className="text-sm text-muted">Abertura</div>
              <div style={{ fontWeight: 700 }}>{formatDate(order.createdAt)}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Entrega</div>
              <div style={{ fontWeight: 700 }}>{formatDate(order.deliveryDate)}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Pedido online</div>
              <div style={{ fontWeight: 700 }}>{orderPhaseLabel}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Status da entrega</div>
              <div style={{ fontWeight: 700 }}>{deliveryStatusLabel}</div>
              <div className="text-sm text-muted">Atualizado: {deliveryUpdatedAt}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Total da OS</div>
              <div style={{ fontWeight: 800, color: '#166534', fontSize: 20 }}>{formatCurrency(totalFinal)}</div>
            </div>
          </div>
        </div>

        <div className="grid-2 print-block print-block-itens print-block-completo" style={{ gap: 12 }}>
          <div className="card">
            <div className="card-title">Servicos</div>
            <ItemRows rows={serviceItems} />
          </div>

          <div className="card">
            <div className="card-title">Pecas</div>
            <ItemRows rows={productItems} />
          </div>
        </div>

        <div className="card print-block print-block-resumo print-block-financeiro print-block-completo">
          <div className="card-title">Resumo financeiro</div>
          <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal servicos</span>
              <b>{formatCurrency(subtotalServices)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal pecas</span>
              <b>{formatCurrency(subtotalProducts)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Descontos</span>
              <b>{formatCurrency(discount)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Acrescimos</span>
              <b>{formatCurrency(additional)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total calculado dos itens</span>
              <b>{formatCurrency(calculatedTotal)}</b>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 18 }}>
              <span style={{ fontWeight: 700 }}>Total final</span>
              <span style={{ fontWeight: 800, color: '#1A3C5E' }}>{formatCurrency(totalFinal)}</span>
            </div>
          </div>
        </div>

        <div className="card print-block print-block-manutencao print-block-completo">
          <div style={{ fontWeight: 700, color: '#1A3C5E' }}>Proximas manutencoes</div>
          <div style={{ marginTop: 4, marginBottom: 12, fontSize: 12, color: '#64748b' }}>
            Previsao de quando sera a proxima troca apos a execucao desta OS.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            <MaintenanceProjectionCard title="Troca de Oleo" projection={oilProjection} />
            <MaintenanceProjectionCard title="Troca de Correia Dentada" projection={beltProjection} />
          </div>
        </div>
      </div>
    </div>
  );
}
