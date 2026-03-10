import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../services/api';

const SO_STATUS_BADGE = {
  QUOTE: { label: 'Orcamento', cls: 'badge-gray' },
  APPROVED: { label: 'Aprovado', cls: 'badge-blue' },
  STARTED: { label: 'Iniciado', cls: 'badge-purple' },
  IN_PROGRESS: { label: 'Em Execucao', cls: 'badge-purple' },
  WAITING_PART: { label: 'Ag. Peca', cls: 'badge-orange' },
  FINISHING: { label: 'Finalizando', cls: 'badge-yellow' },
  DONE: { label: 'Finalizado', cls: 'badge-green' },
  DELIVERED: { label: 'Entregue', cls: 'badge-green' },
};

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function StatCard({ icon, label, value, color, to }) {
  const content = (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, cursor: to ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{value}</div>
        </div>
        <div style={{ fontSize: 32, opacity: 0.6 }}>{icon}</div>
      </div>
    </div>
  );
  if (to) return <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link>;
  return content;
}

function RankingCard({ title, rows }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>{title}</div>
      {!rows?.length ? (
        <div className="text-sm text-muted">Sem dados suficientes ainda.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qtd</th>
                <th>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={`${title}-${item.rank}-${item.name}`}>
                  <td><strong>{item.rank}</strong></td>
                  <td>{item.name}</td>
                  <td>{Number(item.quantity || 0).toLocaleString('pt-BR')}</td>
                  <td>{formatMoney(item.revenue)}</td>
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

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!data) return <div className="alert alert-error">Erro ao carregar dashboard.</div>;

  const { stats, recentOS, rankings } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Visao geral da JR Auto Parts</div>
        </div>
        <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard icon="Clientes" label="Clientes" value={stats.totalClients} color="#1A3C5E" to="/clientes" />
        <StatCard icon="Veiculos" label="Veiculos" value={stats.totalVehicles} color="#2563a8" to="/veiculos" />
        <StatCard icon="OS" label="OS em Aberto" value={stats.activeOS} color="#F0A500" to="/os" />
        <StatCard icon="Mes" label="OS este Mes" value={stats.monthlyOS} color="#16a34a" />
        <StatCard icon="Alertas" label="Manutencoes Pendentes" value={stats.overdueMaintenances} color="#dc2626" to="/manutencao" />
        <StatCard icon="R$" label="Faturamento (mes)" value={formatMoney(stats.monthlyRevenue)} color="#16a34a" />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <RankingCard title="Ranking: Servicos mais executados" rows={rankings?.topServices || []} />
        <RankingCard title="Ranking: Pecas mais vendidas" rows={rankings?.topProducts || []} />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>OS em andamento</div>
          <Link to="/os" className="btn btn-ghost btn-sm">Ver todas</Link>
        </div>

        {recentOS.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">OS</div>
            <div className="empty-state-text">Nenhuma OS em andamento</div>
            <div className="empty-state-sub">
              <Link to="/os/nova" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Criar primeira OS</Link>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>No OS</th>
                  <th>Cliente</th>
                  <th>Veiculo</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOS.map((os) => {
                  const badge = SO_STATUS_BADGE[os.status] || { label: os.status, cls: 'badge-gray' };
                  return (
                    <tr key={os.id}>
                      <td><strong>#{os.number}</strong></td>
                      <td>{os.client.name}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{os.vehicle.plate}</span>
                        <br />
                        <span className="text-muted text-sm">{os.vehicle.brand} {os.vehicle.model}</span>
                      </td>
                      <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                      <td>{formatMoney(os.totalPrice || 0)}</td>
                      <td>
                        <Link to={`/os/${os.id}`} className="btn btn-ghost btn-sm">Ver</Link>
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
