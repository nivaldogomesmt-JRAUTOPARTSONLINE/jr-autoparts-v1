import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

const STATUS_LABELS = {
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em andamento',
  FINISHING: 'Finalizando',
  WAITING_PART: 'Aguardando peca',
  DONE: 'Pronto',
  DELIVERED: 'Entregue',
  APPROVED: 'Aprovado',
  QUOTE: 'Orcamento',
};

const STATUS_COLORS = {
  STARTED: { bg: '#eff6ff', color: '#1d4ed8' },
  IN_PROGRESS: { bg: '#fff7ed', color: '#c2410c' },
  FINISHING: { bg: '#fff7ed', color: '#c2410c' },
  WAITING_PART: { bg: '#fffbeb', color: '#d97706' },
  DONE: { bg: '#f0fdf4', color: '#15803d' },
  DELIVERED: { bg: '#f1f5f9', color: '#475569' },
  APPROVED: { bg: '#eff6ff', color: '#4f46e5' },
  QUOTE: { bg: '#f8fafc', color: '#64748b' },
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

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function PortalSODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API}/api/portal/so/${id}`, {
          headers: { Authorization: `Bearer ${ptoken()}` },
        });
        if (response.status === 401) {
          navigate('/portal/login');
          return;
        }
        if (response.ok) {
          setOrder(await response.json());
        }
      } catch (error) {
        console.error('[PortalSODetail] load error:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const serviceItems = order?.serviceItems || [];
  const productItems = order?.productItems || [];
  const financial = order?.financialSummary || {
    subtotalServices: serviceItems.reduce((sum, item) => sum + parseNumber(item.lineTotal), 0),
    subtotalProducts: productItems.reduce((sum, item) => sum + parseNumber(item.lineTotal), 0),
    discount: 0,
    additional: 0,
    totalFinal: parseNumber(order?.displayTotal ?? order?.totalPrice ?? order?.total),
  };

  const statusKey = String(order?.status || '');
  const statusLabel = order?.statusLabel || STATUS_LABELS[statusKey] || statusKey;
  const statusStyle = STATUS_COLORS[statusKey] || { bg: '#f1f5f9', color: '#475569' };

  const maintenanceProjectionRows = useMemo(() => {
    const projection = order?.maintenanceProjection || {};
    return Object.values(projection);
  }, [order]);

  const whatsappDigits = (BRAND.phone || '').replace(/\D/g, '');

  if (loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>OS nao encontrada</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="no-print" style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}
        >
          {'<'}
        </button>
        {BRAND.logo ? <img src={BRAND.logo} alt="" style={{ width: 28, height: 28, borderRadius: 5, background: '#fff', padding: 2 }} /> : null}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Ordem de servico #{order.id}</div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>OS #{order.id}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Abertura: {formatDate(order.createdAt || order.created_at)}
              </div>
            </div>
            <div style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
              {statusLabel}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Veiculo</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, marginTop: 2 }}>{order.vehicle?.plate || '-'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{order.vehicle?.brand || ''} {order.vehicle?.model || ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Atualizacao</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(order.updatedAt || order.updated_at)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Entrega: {formatDate(order.deliveryDate)}</div>
            </div>
          </div>

          {(order.notes || order.observations) ? (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong>Observacoes:</strong> {order.notes || order.observations}
            </div>
          ) : null}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Resumo financeiro</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal servicos</span><strong>{formatCurrency(financial.subtotalServices)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal pecas</span><strong>{formatCurrency(financial.subtotalProducts)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Descontos</span><strong>{formatCurrency(financial.discount)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Acrescimos</span><strong>{formatCurrency(financial.additional)}</strong></div>
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}><span style={{ fontWeight: 700 }}>Total final</span><strong style={{ color: 'var(--success)' }}>{formatCurrency(financial.totalFinal)}</strong></div>
          </div>
        </div>

        {serviceItems.length > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Servicos ({serviceItems.length})</div>
            {serviceItems.map((item, index) => (
              <div key={`s-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 0', borderBottom: index < serviceItems.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.itemName || item.name || '-'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qtd: {item.quantityNumber ?? item.quantity ?? 1} · Unitario: {formatCurrency(item.unitPriceNumber ?? item.unitPrice ?? item.price)}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{formatCurrency(item.lineTotal)}</div>
              </div>
            ))}
          </div>
        ) : null}

        {productItems.length > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Pecas e produtos ({productItems.length})</div>
            {productItems.map((item, index) => (
              <div key={`p-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 0', borderBottom: index < productItems.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.itemName || item.name || '-'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qtd: {item.quantityNumber ?? item.quantity ?? 1} · Unitario: {formatCurrency(item.unitPriceNumber ?? item.unitPrice ?? item.price)}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{formatCurrency(item.lineTotal)}</div>
              </div>
            ))}
          </div>
        ) : null}

        {maintenanceProjectionRows.length > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Proximas manutencoes</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {maintenanceProjectionRows.map((item, index) => (
                <div key={`${item.type}-${index}`} style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label || item.type}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Data: {formatDate(item.nextDate)} · Km: {item.nextKm || '-'} · Status: {item.statusLabel || '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={`https://wa.me/55${whatsappDigits}?text=Ola! Tenho uma duvida sobre a OS #${order.id}.`}
            target="_blank"
            rel="noreferrer"
            style={{ flex: 1, minWidth: 180, background: '#16a34a', color: '#fff', padding: '11px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}
          >
            Falar no WhatsApp
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ padding: '11px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
