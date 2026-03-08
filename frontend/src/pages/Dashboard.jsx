import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../services/api';

const SO_STATUS_BADGE = {
  QUOTE: { label: 'Orçamento', cls: 'badge-gray' },
  APPROVED: { label: 'Aprovado', cls: 'badge-blue' },
  STARTED: { label: 'Iniciado', cls: 'badge-purple' },
  IN_PROGRESS: { label: 'Em Execução', cls: 'badge-purple' },
  WAITING_PART: { label: 'Ag. Peça', cls: 'badge-orange' },
  FINISHING: { label: 'Finalizando', cls: 'badge-yellow' },
  DONE: { label: 'Finalizado', cls: 'badge-green' },
  DELIVERED: { label: 'Entregue', cls: 'badge-green' },
};

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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.get()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!data) return <div className="alert alert-error">Erro ao carregar dashboard.</div>;

  const { stats, recentOS } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Visão geral da JR Auto Parts</div>
        </div>
        <Link to="/os/nova" className="btn btn-primary">+ Nova OS</Link>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard icon="👥" label="Clientes" value={stats.totalClients} color="#1A3C5E" to="/clientes" />
        <StatCard icon="🚗" label="Veículos" value={stats.totalVehicles} color="#2563a8" to="/veiculos" />
        <StatCard icon="📋" label="OS em Aberto" value={stats.activeOS} color="#F0A500" to="/os" />
        <StatCard icon="🗓️" label="OS este Mês" value={stats.monthlyOS} color="#16a34a" />
        <StatCard icon="⚙️" label="Manutenções Pendentes" value={stats.overdueMaintenances} color="#dc2626" to="/manutencao" />
        <StatCard
          icon="💰"
          label="Faturamento (mês)"
          value={`R$ ${stats.monthlyRevenue.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
          color="#16a34a"
        />
      </div>

      {/* OS Recentes */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📋 OS em Andamento</div>
          <Link to="/os" className="btn btn-ghost btn-sm">Ver todas →</Link>
        </div>

        {recentOS.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
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
                  <th>Nº OS</th>
                  <th>Cliente</th>
                  <th>Veículo</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOS.map(os => {
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
                      <td>R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}</td>
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
