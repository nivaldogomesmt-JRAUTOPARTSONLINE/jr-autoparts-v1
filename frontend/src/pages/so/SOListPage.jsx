import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import PaginationControls from '../../components/PaginationControls';
import { soAPI } from '../../services/api';

const PAGE_SIZE = 12;

const STATUS_CONFIG = {
  QUOTE: { badge: 'badge-gray', label: 'Orcamento' },
  APPROVED: { badge: 'badge-blue', label: 'Aprovado' },
  STARTED: { badge: 'badge-iniciado', label: 'Iniciado' },
  IN_PROGRESS: { badge: 'badge-andamento', label: 'Em andamento' },
  WAITING_PART: { badge: 'badge-yellow', label: 'Aguardando peca' },
  FINISHING: { badge: 'badge-andamento', label: 'Finalizando' },
  DONE: { badge: 'badge-pronto', label: 'Pronto' },
  DELIVERED: { badge: 'badge-entregue', label: 'Entregue' },
};

const STATUS_FILTERS = [
  { value: 'active', label: 'Ativas' },
  { value: 'WAITING_PART', label: 'Aguardando peca' },
  { value: 'DONE', label: 'Prontas' },
  { value: 'DELIVERED', label: 'Entregues' },
  { value: 'all', label: 'Todas' },
];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const KPI = memo(function KPI({ title, value, subtitle, color = 'var(--primary)', onClick }) {
  return (
    <button type="button" className="stat-card" onClick={onClick} disabled={!onClick} style={{ borderLeft: `4px solid ${color}`, textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }}>
      <div className="stat-label">{title}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-sub">{subtitle}</div>
    </button>
  );
});

const OrderRow = memo(function OrderRow({ order, onOpen }) {
  const statusMeta = STATUS_CONFIG[order.status] || { badge: 'badge-gray', label: order.status };
  return (
    <tr onClick={() => onOpen(order.id)} style={{ cursor: 'pointer' }}>
      <td><strong style={{ color: 'var(--primary)' }}>#{order.number}</strong></td>
      <td>{order.client?.name || '-'}</td>
      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{order.vehicle?.plate || '-'}</span></td>
      <td><span className={`badge ${statusMeta.badge}`}>{statusMeta.label}</span></td>
      <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(order.totalPrice ?? order.total)}</td>
      <td className="text-sm text-muted">{order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('pt-BR') : '-'}</td>
      <td>
        <button type="button" className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(order.id); }}>
          Ver →
        </button>
      </td>
    </tr>
  );
});

export default function SOListPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, overviewRes] = await Promise.all([
        soAPI.list({
          search: debouncedSearch || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          page,
          limit: PAGE_SIZE,
        }),
        soAPI.overview(),
      ]);

      setOrders(listRes.data?.data || []);
      setTotal(Number(listRes.data?.total || 0));
      setStats(overviewRes.data || {});
    } catch (err) {
      console.error('[SOListPage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const openOrder = useCallback((orderId) => navigate(`/os/${orderId}`), [navigate]);

  const kpis = useMemo(() => ({
    active: Number(stats?.osAndamento ?? stats?.em_andamento ?? 0),
    ready: Number(stats?.osProntas ?? stats?.prontas ?? 0),
    waitingPart: Number(stats?.osAguardandoPeca ?? stats?.aguardando_peca ?? 0),
    revenue: formatCurrency(stats?.faturamentoPeriodo ?? stats?.faturamento_periodo ?? 0),
  }), [stats]);

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Ordens de Servico</h1>
          <p className="page-subtitle">Lista paginada para atender mais rapido, sem carregar centenas de OS de uma vez.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/os/nova')}>+ Nova OS</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/entregas')}>Entregas</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          <div className="section">
            <div className="section-header"><h2 className="section-title">Painel rapido</h2></div>
            <div className="grid-4">
              <KPI title="Em andamento" value={kpis.active} subtitle="Atendimento e execucao" color="var(--primary)" onClick={() => setStatusFilter('active')} />
              <KPI title="Prontas" value={kpis.ready} subtitle="Aguardando retirada" color="var(--success)" onClick={() => setStatusFilter('DONE')} />
              <KPI title="Aguardando peca" value={kpis.waitingPart} subtitle="OS paradas por insumo" color="var(--warning)" onClick={() => setStatusFilter('WAITING_PART')} />
              <KPI title="Faturamento" value={kpis.revenue} subtitle="Visao geral do periodo" color="var(--gray-500)" onClick={() => setStatusFilter('all')} />
            </div>
          </div>

          <div className="filters-bar">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`btn btn-sm ${statusFilter === filter.value ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="search-bar" style={{ flex: 1, maxWidth: 340 }}>
              <span className="search-icon">🔎</span>
              <input type="text" placeholder="Buscar OS, cliente ou placa..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <span className="text-muted text-sm">{total} OS</span>
          </div>

          {!orders.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">{debouncedSearch ? 'Nenhuma OS encontrada para esta busca' : 'Nenhuma OS neste filtro'}</div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setStatusFilter('all')}>Ver todas</button>
            </div>
          ) : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>Cliente</th>
                      <th>Placa</th>
                      <th>Status</th>
                      <th className="text-right">Total</th>
                      <th>Atualizado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => <OrderRow key={order.id} order={order} onOpen={openOrder} />)}
                  </tbody>
                </table>
              </div>
              <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}
