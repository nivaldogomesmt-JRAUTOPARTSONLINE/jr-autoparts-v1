import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import PaginationControls from '../../components/PaginationControls';
import { dashboardAPI, maintenanceAPI, vehiclesAPI } from '../../services/api';

const PAGE_SIZE = 12;

function StatCard({ title, value, subtitle, color = 'var(--primary)', onClick }) {
  return (
    <button
      type="button"
      className="stat-card"
      onClick={onClick}
      style={{ borderLeft: `4px solid ${color}`, textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }}
      disabled={!onClick}
    >
      <div className="stat-label">{title}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-sub">{subtitle}</div>
    </button>
  );
}

const RankingList = memo(function RankingList({ title, items, emptyLabel, onSelect, valueFormatter }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {!items.length ? (
        <div className="text-muted text-sm">{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <button
              key={item.id || `${title}-${index}`}
              type="button"
              className="ranking-item"
              onClick={() => onSelect?.(item)}
              style={{ cursor: onSelect ? 'pointer' : 'default', textAlign: 'left', border: 'none', background: 'transparent' }}
            >
              <span className={`ranking-pos ranking-pos-${index + 1}`}>{index + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.name || item.plate || '-'}</div>
                <div className="text-muted text-sm">{item.subtitle || item.brandModel || '-'}</div>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>{valueFormatter(item)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const VehicleRow = memo(function VehicleRow({ vehicle, onOpen }) {
  const badge = vehicle.maintenanceStatus === 'urgencia'
    ? 'badge-red'
    : vehicle.maintenanceStatus === 'atencao'
      ? 'badge-yellow'
      : 'badge-green';

  const label = vehicle.maintenanceStatus === 'urgencia'
    ? 'Urgencia'
    : vehicle.maintenanceStatus === 'atencao'
      ? 'Atencao'
      : 'Em dia';

  return (
    <tr onClick={() => onOpen(vehicle.id)} style={{ cursor: 'pointer' }}>
      <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>{vehicle.plate}</span></td>
      <td>
        <div style={{ fontWeight: 700 }}>{vehicle.brand} {vehicle.model}</div>
        <div className="text-sm text-muted">{vehicle.color || 'Sem cor informada'}</div>
      </td>
      <td>{vehicle.client?.name || 'Sem proprietario'}</td>
      <td>{vehicle.year || '-'}</td>
      <td><span className="badge badge-blue">{vehicle._count?.serviceOrders ?? 0}</span></td>
      <td><span className={`badge ${badge}`}>{label}</span></td>
      <td>
        <button type="button" className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(vehicle.id); }}>
          Ver ?
        </button>
      </td>
    </tr>
  );
});

export default function VehiclesPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [rankings, setRankings] = useState({ vehicles: [], services: [], parts: [] });

  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, alertsRes, dashboardRes] = await Promise.all([
        vehiclesAPI.list({ search: debouncedSearch || undefined, page, limit: PAGE_SIZE }),
        maintenanceAPI.alerts(),
        dashboardAPI.get(),
      ]);

      setVehicles(vehiclesRes.data?.data || []);
      setTotal(Number(vehiclesRes.data?.total || 0));
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      setRankings({
        vehicles: (dashboardRes.data?.rankings?.topVehicles || []).map((item) => ({
          ...item,
          subtitle: `${item.brand || '-'} ${item.model || ''}`.trim(),
        })),
        parts: (dashboardRes.data?.rankings?.topProducts || []).map((item) => ({
          ...item,
          subtitle: `${item.qty || 0} vendidos`,
          name: item.name || 'Produto',
        })),
        services: (dashboardRes.data?.rankings?.topServices || []).map((item) => ({
          ...item,
          subtitle: `${item.qty || 0} execucoes`,
          name: item.name || 'Servico',
        })),
      });
    } catch (err) {
      console.error('[VehiclesPage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const summary = useMemo(() => {
    const overdue = alerts.filter((item) => item.alertLevel === 'OVERDUE').length;
    const dueSoon = alerts.filter((item) => item.alertLevel === 'DUE_SOON').length;
    const ok = Math.max(0, total - overdue - dueSoon);
    return { overdue, dueSoon, ok };
  }, [alerts, total]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const openVehicle = useCallback((vehicleId) => navigate(`/veiculos/${vehicleId}`), [navigate]);

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Veiculos</h1>
          <p className="page-subtitle">Busca rapida por placa, modelo e proprietario, com foco em atendimento e manutencao.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/veiculos/novo')}>+ Novo Veiculo</button>
          <button className="btn btn-outline" onClick={() => navigate('/manutencao')}>Ver manutencao</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          <div className="section">
            <div className="section-header"><h2 className="section-title">Resumo da frota</h2></div>
            <div className="grid-3">
              <StatCard title="Urgencia" value={summary.overdue} subtitle="Manutencoes vencidas" color="var(--danger)" onClick={() => navigate('/manutencao')} />
              <StatCard title="Atencao" value={summary.dueSoon} subtitle="Vencimento proximo" color="var(--warning)" onClick={() => navigate('/manutencao')} />
              <StatCard title="Em dia" value={summary.ok} subtitle="Veiculos sem pendencia" color="var(--success)" onClick={() => navigate('/veiculos')} />
            </div>
          </div>

          <div className="section">
            <div className="section-header"><h2 className="section-title">Rankings de receita e recorrencia</h2></div>
            <div className="grid-3">
              <RankingList
                title="Veiculos com maior receita"
                items={rankings.vehicles.slice(0, 5)}
                emptyLabel="Sem dados"
                onSelect={(item) => item.id && openVehicle(item.id)}
                valueFormatter={(item) => Number(item.total_revenue || item.revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              />
              <RankingList
                title="Pecas com maior giro"
                items={rankings.parts.slice(0, 5)}
                emptyLabel="Sem dados"
                valueFormatter={(item) => Number(item.revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              />
              <RankingList
                title="Servicos com maior receita"
                items={rankings.services.slice(0, 5)}
                emptyLabel="Sem dados"
                valueFormatter={(item) => Number(item.revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              />
            </div>
          </div>

          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 420 }}>
              <span className="search-icon">??</span>
              <input
                type="text"
                placeholder="Buscar por placa, marca, modelo ou proprietario..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="text-muted text-sm">{total} veiculo{total === 1 ? '' : 's'}</span>
          </div>

          {!vehicles.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">??</div>
              <div className="empty-state-text">{debouncedSearch ? 'Nenhum veiculo encontrado para esta busca' : 'Nenhum veiculo cadastrado'}</div>
              {!debouncedSearch ? <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/veiculos/novo')}>+ Novo Veiculo</button> : null}
            </div>
          ) : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Veiculo</th>
                      <th>Proprietario</th>
                      <th>Ano</th>
                      <th>OS</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((vehicle) => <VehicleRow key={vehicle.id} vehicle={vehicle} onOpen={openVehicle} />)}
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
