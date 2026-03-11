import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI, soAPI, vehiclesAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const STATUS_META = {
  OVERDUE: { label: 'Urgencia', className: 'badge-red' },
  DUE_SOON: { label: 'Atencao', className: 'badge-yellow' },
  OK: { label: 'OK', className: 'badge-green' },
};

function getStatusMeta(vehicle) {
  const key = vehicle?.maintenanceStatus || 'OK';
  return STATUS_META[key] || STATUS_META.OK;
}

function renderStatusDetails(vehicle) {
  const overdue = Number(vehicle?.maintenanceOverdue || 0);
  const dueSoon = Number(vehicle?.maintenanceDueSoon || 0);

  if (!overdue && !dueSoon) return 'Sem pendencias';

  const parts = [];
  if (overdue) parts.push(`${overdue} urgencia`);
  if (dueSoon) parts.push(`${dueSoon} atencao`);
  return parts.join(' | ');
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadXlsxBlob(data, filename) {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [overviewLoading, setOverviewLoading] = useState(true);
  const [topVehicles, setTopVehicles] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topServices, setTopServices] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    vehiclesAPI
      .list({ search: debouncedSearch, page, limit: 20 })
      .then((r) => {
        setVehicles(r.data.data || []);
        setTotal(r.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, page]);

  useEffect(() => {
    const loadOverview = async () => {
      setOverviewLoading(true);
      try {
        const [doneRes, deliveredRes, dashboardRes] = await Promise.all([
          soAPI.list({ status: 'DONE', page: 1, limit: 500 }),
          soAPI.list({ status: 'DELIVERED', page: 1, limit: 500 }),
          dashboardAPI.get(),
        ]);

        const allOrders = [...(doneRes.data?.data || []), ...(deliveredRes.data?.data || [])];
        const vehicleMap = new Map();

        for (const order of allOrders) {
          const vehicleId = order.vehicle?.id || `plate:${order.vehicle?.plate || 'Sem placa'}`;
          const plate = order.vehicle?.plate || 'Sem placa';
          const model = `${order.vehicle?.brand || ''} ${order.vehicle?.model || ''}`.trim();
          const revenue = Number(order.totalPrice || 0);

          if (!vehicleMap.has(vehicleId)) {
            vehicleMap.set(vehicleId, { vehicleId, plate, model, revenue: 0, orders: 0 });
          }

          const current = vehicleMap.get(vehicleId);
          current.revenue += revenue;
          current.orders += 1;
        }

        setTopVehicles(
          [...vehicleMap.values()]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 8)
        );

        setTopProducts(dashboardRes.data?.rankings?.topProducts || []);
        setTopServices(dashboardRes.data?.rankings?.topServices || []);
      } catch (err) {
        console.error(err);
        setTopVehicles([]);
        setTopProducts([]);
        setTopServices([]);
      } finally {
        setOverviewLoading(false);
      }
    };

    loadOverview();
  }, []);

  const exportFilteredVehicles = async () => {
    setExporting(true);
    try {
      const res = await vehiclesAPI.exportFile({
        search: String(debouncedSearch || '').trim() || undefined,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadXlsxBlob(res.data, `veiculos_filtrados_${today}.xlsx`);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Erro ao exportar veiculos filtrados.');
    } finally {
      setExporting(false);
    }
  };

  const printFilteredVehicles = () => {
    const rows = vehicles.map((v) => {
      const status = getStatusMeta(v);
      return `
        <tr>
          <td>${escapeHtml(v.plate || '-')}</td>
          <td>${escapeHtml(`${v.brand || ''} ${v.model || ''}`.trim() || '-')}</td>
          <td>${escapeHtml(v.client?.name || '-')}</td>
          <td>${escapeHtml(v.currentKm !== null && v.currentKm !== undefined ? `${Number(v.currentKm).toLocaleString('pt-BR')} km` : '-')}</td>
          <td>${escapeHtml(status.label)}</td>
          <td>${escapeHtml(renderStatusDetails(v))}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Veiculos filtrados</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0 0 14px; color: #475569; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Veiculos filtrados</h1>
          <p>Impressao em ${new Date().toLocaleString('pt-BR')} | Exibindo ${vehicles.length} de ${total}</p>
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Veiculo</th>
                <th>Proprietario</th>
                <th>KM</th>
                <th>Status</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">Sem dados</td></tr>'}</tbody>
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
  };

  const summary = useMemo(() => {
    const overdue = vehicles.filter((v) => Number(v.maintenanceOverdue || 0) > 0).length;
    const dueSoon = vehicles.filter((v) => Number(v.maintenanceOverdue || 0) === 0 && Number(v.maintenanceDueSoon || 0) > 0).length;
    const ok = Math.max(0, vehicles.length - overdue - dueSoon);

    return {
      overdue,
      dueSoon,
      ok,
    };
  }, [vehicles]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Veiculos</div>
          <div className="page-subtitle">{total} veiculos | visao gerencial de faturamento e manutencao</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/integracoes" className="btn btn-outline">Integracoes</Link>
          <button className="btn btn-outline" onClick={exportFilteredVehicles} disabled={exporting || loading}>
            {exporting ? 'Exportando...' : 'Exportar filtrados'}
          </button>
          <button className="btn btn-outline" onClick={printFilteredVehicles} disabled={loading || !vehicles.length}>
            Imprimir
          </button>
          <Link to="/veiculos/novo" className="btn btn-primary">+ Novo Veiculo</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Urgencia</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c' }}>{summary.overdue}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Atencao</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#a16207' }}>{summary.dueSoon}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Em dia</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>{summary.ok}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Ranking veiculos (receita)</div>
          {overviewLoading ? <div className="loading"><div className="spinner" /></div> : (
            topVehicles.length === 0 ? <div className="text-sm text-muted">Sem dados de OS concluidas.</div> : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>#</th><th>Placa</th><th>OS</th><th>Receita</th></tr>
                  </thead>
                  <tbody>
                    {topVehicles.slice(0, 6).map((row, idx) => (
                      <tr key={`${row.vehicleId}-${idx}`}>
                        <td><strong>{idx + 1}</strong></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{row.plate}</div>
                          <div className="text-sm text-muted">{row.model || '-'}</div>
                        </td>
                        <td>{row.orders}</td>
                        <td><strong>{formatMoney(row.revenue)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Pecas que mais geram receita</div>
          {overviewLoading ? <div className="loading"><div className="spinner" /></div> : (
            topProducts.length === 0 ? <div className="text-sm text-muted">Sem dados.</div> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {topProducts.slice(0, 6).map((item) => (
                  <div key={`prod-${item.rank}-${item.name}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.rank}. {item.name}</div>
                    <div className="text-sm text-muted">Qtd: {item.quantity} | Receita: {formatMoney(item.revenue)}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Mao de obra que mais gera receita</div>
          {overviewLoading ? <div className="loading"><div className="spinner" /></div> : (
            topServices.length === 0 ? <div className="text-sm text-muted">Sem dados.</div> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {topServices.slice(0, 6).map((item) => (
                  <div key={`svc-${item.rank}-${item.name}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.rank}. {item.name}</div>
                    <div className="text-sm text-muted">Qtd: {item.quantity} | Receita: {formatMoney(item.revenue)}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="Buscar por placa, modelo, marca ou cliente"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card">
        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
          Mostrando {vehicles.length} de {total} veiculo(s) conforme os filtros atuais.
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">[ ]</div>
            <div className="empty-state-text">Nenhum veiculo encontrado</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Veiculo</th>
                  <th>Ano</th>
                  <th>KM</th>
                  <th>Status</th>
                  <th>Proprietario</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const status = getStatusMeta(v);

                  return (
                    <tr key={v.id}>
                      <td><strong>{v.plate}</strong></td>
                      <td>
                        {v.brand} {v.model}
                        <div className="text-sm text-muted">{v.color || '-'}</div>
                      </td>
                      <td>{v.year || '-'}</td>
                      <td>{v.currentKm !== null && v.currentKm !== undefined ? `${Number(v.currentKm).toLocaleString('pt-BR')} km` : '-'}</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
                        <div className="text-sm text-muted">{renderStatusDetails(v)}</div>
                      </td>
                      <td><Link to={`/clientes/${v.clientId}`}>{v.client?.name}</Link></td>
                      <td><Link to={`/veiculos/${v.id}`} className="btn btn-outline btn-sm">Ver</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > vehicles.length ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <button className="btn btn-outline btn-sm" disabled={vehicles.length < 20} onClick={() => setPage((p) => p + 1)}>
            Proxima
          </button>
        </div>
      ) : null}
    </div>
  );
}

