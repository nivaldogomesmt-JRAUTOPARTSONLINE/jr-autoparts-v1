import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { soAPI } from '../../services/api';
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

function toStatusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
}

function csvEscape(v) {
  const value = String(v ?? '');
  return `"${value.replace(/"/g, '""')}"`;
}

function formatMoney(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

export default function SOListPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState({ totalOrders: 0, totalAmount: 0, byStatus: {} });

  const currentFilters = useMemo(
    () => ({ search, status, dateFrom, dateTo }),
    [search, status, dateFrom, dateTo]
  );

  const load = async () => {
    setLoading(true);
    try {
      const listRes = await soAPI.list({ ...currentFilters, page, limit: 20 });
      setOrders(listRes.data.data || []);
      setTotal(listRes.data.total || 0);

      const summaryRes = await soAPI.list({ ...currentFilters, page: 1, limit: 1000 });
      const all = summaryRes.data.data || [];
      const byStatus = all.reduce((acc, os) => {
        const key = os.status || 'UNKNOWN';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const totalAmount = all.reduce((acc, os) => acc + Number(os.totalPrice || 0), 0);
      setSummary({ totalOrders: all.length, totalAmount, byStatus });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentFilters, page]);

  const removeOrder = async (id) => {
    if (!can('delete')) return;
    if (!window.confirm('Excluir esta OS/Orcamento definitivamente?')) return;

    try {
      await soAPI.remove(id);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao excluir OS.');
    }
  };

  const reportRows = useMemo(() => {
    return orders.map((os) => ({
      numero: `#${os.number}`,
      cliente: os.client?.name || '',
      placa: os.vehicle?.plate || '',
      veiculo: `${os.vehicle?.brand || ''} ${os.vehicle?.model || ''}`.trim(),
      status: toStatusLabel(os.status),
      total: Number(os.totalPrice || 0).toFixed(2),
      data: new Date(os.createdAt).toLocaleDateString('pt-BR'),
    }));
  }, [orders]);

  const handleExportCsv = () => {
    if (!reportRows.length) {
      window.alert('Nao ha OS para exportar nesta pagina.');
      return;
    }

    const header = ['Numero', 'Cliente', 'Placa', 'Veiculo', 'Status', 'Total', 'Data'];
    const lines = [
      header.map(csvEscape).join(','),
      ...reportRows.map((r) => [r.numero, r.cliente, r.placa, r.veiculo, r.status, r.total, r.data].map(csvEscape).join(',')),
    ];

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-os-p${page}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrintList = () => {
    window.print();
  };

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .table { font-size: 12px; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Ordens de Servico</div>
          <div className="page-subtitle">{total} OS encontradas</div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={handlePrintList}>Imprimir Lista</button>
          <button type="button" className="btn btn-outline" onClick={handleExportCsv}>Exportar CSV</button>
          <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Total no periodo</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1A3C5E' }}>{summary.totalOrders}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Faturamento no periodo</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>{formatMoney(summary.totalAmount)}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Status (resumo)</div>
          <div className="text-sm" style={{ lineHeight: 1.5 }}>
            {Object.keys(summary.byStatus).length
              ? Object.entries(summary.byStatus).map(([k, v]) => `${toStatusLabel(k)}: ${v}`).join(' | ')
              : 'Sem dados'}
          </div>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, minmax(140px, 180px))', gap: 10 }}>
          <input
            className="form-control"
            placeholder="Buscar por numero, cliente ou placa..."
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
              <option key={s.value} value={s.value}>{s.label}</option>
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
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : orders.length === 0 ? (
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
                  <th>Veiculo / Placa</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Data</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((os) => (
                  <tr key={os.id}>
                    <td><strong>#{os.number}</strong></td>
                    <td>{os.client.name}</td>
                    <td>
                      <strong>{os.vehicle.plate}</strong>
                      <div className="text-sm text-muted">{os.vehicle.brand} {os.vehicle.model}</div>
                    </td>
                    <td>
                      <span className={`badge ${BADGE[os.status] || 'badge-gray'}`}>
                        {toStatusLabel(os.status)}
                      </span>
                    </td>
                    <td>R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}</td>
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
            <span style={{ padding: '5px 10px', fontSize: 13 }}>Pagina {page}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={orders.length < 20}>Proxima</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
