import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../services/api';

const ALERT_COLORS = {
  OVERDUE: { bg: '#fee2e2', color: '#b91c1c', label: 'Urgencia' },
  DUE_SOON: { bg: '#fef3c7', color: '#92400e', label: 'Atencao' },
};

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function toCsvCell(value) {
  const text = String(value ?? '');
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(text, filename, type = 'text/plain;charset=utf-8;') {
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

function buildDashboardCsvRows(data) {
  const rows = [];
  const stats = data?.stats || {};

  rows.push(['Secao', 'Indicador', 'Valor']);
  rows.push(['Resumo', 'Manutencoes vencidas', stats.maintenanceOverdue || 0]);
  rows.push(['Resumo', 'Manutencoes a vencer', stats.maintenanceDueSoon || 0]);
  rows.push(['Resumo', 'Troca de oleo vencida', stats.oilOverdue || 0]);
  rows.push(['Resumo', 'Troca de oleo atencao', stats.oilDueSoon || 0]);
  rows.push(['Resumo', 'Correia vencida', stats.beltOverdue || 0]);
  rows.push(['Resumo', 'Correia atencao', stats.beltDueSoon || 0]);
  rows.push(['Resumo', 'OS em andamento', stats.activeOS || 0]);
  rows.push(['Resumo', 'OS atrasadas', stats.overdueOS || 0]);
  rows.push(['Resumo', 'Pedidos pendentes', stats.pendingDeliveries || 0]);
  rows.push(['Resumo', 'Entregas atrasadas', stats.delayedDeliveries || 0]);
  rows.push(['Resumo', 'OS do mes', stats.monthlyOS || 0]);
  rows.push(['Resumo', 'Faturamento do mes', Number(stats.monthlyRevenue || 0).toFixed(2)]);
  rows.push(['Resumo', 'Ticket medio', Number(stats.avgTicket || 0).toFixed(2)]);

  rows.push([]);
  rows.push(['Prioridades', 'Tipo', 'Descricao']);
  (data?.priorities?.maintenance || []).slice(0, 20).forEach((item) => {
    rows.push([
      'Prioridades',
      item.alertLevel || '-',
      `${item.label || '-'} | ${item.vehicle?.plate || '-'} | ${formatDate(item.nextDate)} | ${item.nextKm || '-'} km`,
    ]);
  });

  rows.push([]);
  rows.push(['Operacao', 'OS', 'Cliente/Veiculo']);
  (data?.operation?.inProgress || []).slice(0, 20).forEach((row) => {
    rows.push(['Em andamento', `#${row.number}`, `${row.client?.name || '-'} / ${row.vehicle?.plate || '-'}`]);
  });

  rows.push([]);
  rows.push(['Ranking', 'Item', 'Receita']);
  (data?.rankings?.topServices || []).slice(0, 15).forEach((row) => {
    rows.push(['Servico', row.name || '-', Number(row.revenue || 0).toFixed(2)]);
  });
  (data?.rankings?.topProducts || []).slice(0, 15).forEach((row) => {
    rows.push(['Produto', row.name || '-', Number(row.revenue || 0).toFixed(2)]);
  });

  return rows;
}

function StatCard({ label, value, color, subtitle, to }) {
  const content = (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, minHeight: 120 }}>
      <div className="text-sm text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{value}</div>
      {subtitle ? <div className="text-sm text-muted" style={{ marginTop: 8 }}>{subtitle}</div> : null}
    </div>
  );

  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link> : content;
}

function OrderTable({ rows = [], emptyText = 'Sem registros no momento.' }) {
  if (!rows.length) return <div className="text-sm text-muted">{emptyText}</div>;

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>OS</th>
            <th>Cliente</th>
            <th>Placa</th>
            <th>Status</th>
            <th>Total</th>
            <th>Atualizacao</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/os/${row.id}`}><strong>#{row.number}</strong></Link></td>
              <td>{row.client?.name || '-'}</td>
              <td>{row.vehicle?.plate || '-'}</td>
              <td><span className="badge badge-gray">{row.statusLabel || row.status}</span></td>
              <td>{formatMoney(row.totalPrice)}</td>
              <td className="text-sm text-muted">{formatDate(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingTable({ rows = [], title = 'Ranking' }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>{title}</div>
      {!rows.length ? (
        <div className="text-sm text-muted">Sem dados suficientes.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qtd</th>
                <th>Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${title}-${row.rank}-${row.name}`}>
                  <td><strong>{row.rank}</strong></td>
                  <td>{row.name}</td>
                  <td>{Number(row.quantity || 0).toLocaleString('pt-BR')}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.get()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusResumo = useMemo(() => {
    const byStatus = data?.operation?.byStatus || {};
    const keys = ['APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING', 'DONE', 'DELIVERED'];
    return keys
      .filter((k) => Number(byStatus[k] || 0) > 0)
      .map((k) => `${k}: ${byStatus[k]}`)
      .join(' | ');
  }, [data]);

  const handlePrint = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'dashboard');

    const clear = () => {
      html.removeAttribute('data-print-context');
      window.removeEventListener('afterprint', clear);
    };

    window.addEventListener('afterprint', clear);
    window.print();
    setTimeout(clear, 1200);
  };

  const handleExportSummary = () => {
    if (!data) return;
    const rows = buildDashboardCsvRows(data);
    const csv = rows.map((row) => row.map(toCsvCell).join(';')).join('\n');
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(csv, `dashboard_gerencial_${dateTag}.csv`, 'text/csv;charset=utf-8;');
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!data) return <div className="alert alert-error">Erro ao carregar dashboard.</div>;

  const stats = data.stats || {};
  const priorities = data.priorities || {};
  const operation = data.operation || {};
  const rankings = data.rankings || {};
  const campaigns = data.campaigns || [];

  return (
    <div>
      <style>{`
        @media print {
          html[data-print-context='dashboard'] .no-print-dashboard {
            display: none !important;
          }
          html[data-print-context='dashboard'] .card,
          html[data-print-context='dashboard'] .table-container {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Dashboard Gerencial</div>
          <div className="page-subtitle">Prioridades do dia, operação em andamento e desempenho</div>
        </div>
        <div className="no-print-dashboard" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={handlePrint}>Imprimir painel</button>
          <button type="button" className="btn btn-outline" onClick={handleExportSummary}>Exportar resumo CSV</button>
          <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
          <Link to="/integracoes" className="btn btn-outline">Integracoes</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
        <StatCard label="Manutencoes vencidas" value={stats.maintenanceOverdue || 0} color="#dc2626" subtitle={`Oleo vencido: ${stats.oilOverdue || 0} | Correia vencida: ${stats.beltOverdue || 0}`} to="/manutencao" />
        <StatCard label="Manutencoes a vencer" value={stats.maintenanceDueSoon || 0} color="#ca8a04" subtitle={`Oleo atencao: ${stats.oilDueSoon || 0} | Correia atencao: ${stats.beltDueSoon || 0}`} to="/manutencao" />
        <StatCard label="OS em andamento" value={stats.activeOS || 0} color="#1d4ed8" subtitle={`OS atrasadas: ${stats.overdueOS || 0}`} to="/os" />
        <StatCard label="Pedidos pendentes" value={stats.pendingDeliveries || 0} color="#334155" subtitle={`Entregas atrasadas: ${stats.delayedDeliveries || 0}`} to="/entregas" />
        <StatCard label="OS do mes" value={stats.monthlyOS || 0} color="#7c3aed" subtitle={`Ticket medio: ${formatMoney(stats.avgTicket || 0)}`} />
        <StatCard label="Faturamento do mes" value={formatMoney(stats.monthlyRevenue || 0)} color="#16a34a" subtitle="Baseado em OS concluidas/entregues" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">1. Prioridades do dia</div>
        {!priorities.maintenance?.length && !priorities.deliveries?.length ? (
          <div className="text-sm text-muted">Nenhuma prioridade critica no momento.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {(priorities.maintenance || []).slice(0, 6).map((row) => {
              const style = ALERT_COLORS[row.alertLevel] || ALERT_COLORS.DUE_SOON;
              return (
                <div key={row.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{row.label} - {row.vehicle?.plate || '-'}</div>
                    <div className="text-sm text-muted">{row.vehicle?.client?.name || '-'} | Proxima data: {formatDate(row.nextDate)} | Proximo KM: {row.nextKm ?? '-'}</div>
                  </div>
                  <span style={{ background: style.bg, color: style.color, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 10px' }}>{style.label}</span>
                </div>
              );
            })}

            {(priorities.deliveries || []).slice(0, 4).map((row) => (
              <div key={`delivery-${row.id}`} style={{ border: '1px solid #fde68a', borderRadius: 10, padding: 10, background: '#fffbeb', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Entrega pendente da OS #{row.number}</div>
                  <div className="text-sm text-muted">{row.client?.name || '-'} | {row.vehicle?.plate || '-'} | Ultima atualizacao: {formatDate(row.updatedAt)}</div>
                </div>
                <Link to={`/os/${row.id}`} className="btn btn-outline btn-sm">Abrir OS</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-title">2. Operacao em andamento</div>
          <div className="text-sm text-muted" style={{ marginBottom: 10 }}>{statusResumo || 'Sem registros de status.'}</div>
          <OrderTable rows={operation.inProgress || []} emptyText="Sem OS em execucao agora." />
        </div>

        <div className="card">
          <div className="card-title">OS aguardando peca</div>
          <OrderTable rows={operation.waitingPart || []} emptyText="Nenhuma OS aguardando peca." />
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-title">OS prontas</div>
          <OrderTable rows={operation.ready || []} emptyText="Sem OS prontas no momento." />
        </div>

        <div className="card">
          <div className="card-title">OS paradas ha mais tempo</div>
          <OrderTable rows={operation.stalled || []} emptyText="Sem OS paradas fora do SLA." />
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <RankingTable title="4. Ranking servicos" rows={rankings.topServices || []} />
        <RankingTable title="4. Ranking produtos" rows={rankings.topProducts || []} />
        <RankingTable title="4. Ranking veiculos" rows={rankings.topVehicles || []} />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-title">5. Metas e campanhas</div>
          {!campaigns.length ? (
            <div className="text-sm text-muted">Sem campanhas cadastradas.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {campaigns.map((campaign) => (
                <div key={campaign.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{campaign.name}</div>
                  <div className="text-sm text-muted">Objetivo: {campaign.objective}</div>
                  <div className="text-sm text-muted">Periodo: {campaign.period} | Responsavel: {campaign.owner}</div>
                  <div className="text-sm">Meta: <b>{campaign.target}</b> | Realizado: <b>{campaign.achieved}</b> | Status: <b>{campaign.status}</b></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Acoes rapidas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <Link to="/os/nova" className="btn btn-outline">Nova OS</Link>
            <Link to="/manutencao" className="btn btn-outline">Manutencoes</Link>
            <Link to="/entregas" className="btn btn-outline">Pedidos/Entregas</Link>
            <Link to="/clientes" className="btn btn-outline">Clientes</Link>
            <Link to="/veiculos" className="btn btn-outline">Veiculos</Link>
            <Link to="/integracoes" className="btn btn-outline">Importar/Exportar</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
