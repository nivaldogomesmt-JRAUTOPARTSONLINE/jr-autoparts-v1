import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { maintenanceAPI } from '../../services/api';

const COLORS = { OVERDUE: '#fee2e2', DUE_SOON: '#fef9c3' };
const LABELS = { OVERDUE: '❗ Vencido', DUE_SOON: '⚠️ Próximo' };

export default function MaintenancePage() {
  const [alerts, setAlerts] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { maintenanceAPI.alerts().then(r => setAlerts(r.data)).finally(() => setLoading(false)); }, []);
  const overdue = alerts.filter(a => a.alertLevel === 'OVERDUE');
  const dueSoon = alerts.filter(a => a.alertLevel === 'DUE_SOON');
  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Manutenção Preventiva</div><div className="page-subtitle">{overdue.length} vencidas · {dueSoon.length} próximas nos próximos 30 dias</div></div>
      </div>
      {loading ? <div className="loading"><div className="spinner"/></div> : alerts.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">Nenhuma manutenção pendente!</div><div className="empty-state-sub">Todos os veículos estão em dia.</div></div></div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Status</th><th>Veículo</th><th>Proprietário</th><th>Manutenção</th><th>Próxima Data</th><th>Próximo KM</th><th></th></tr></thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id} style={{ background: COLORS[a.alertLevel] || 'white' }}>
                    <td><span style={{ fontWeight: 700, fontSize: 12 }}>{LABELS[a.alertLevel]}</span></td>
                    <td>
                      <Link to={`/veiculos/${a.vehicleId}`} style={{ fontWeight: 600 }}>{a.vehicle?.plate}</Link>
                      <div className="text-sm text-muted">{a.vehicle?.brand} {a.vehicle?.model}</div>
                    </td>
                    <td className="text-sm">{a.vehicle?.client?.name}</td>
                    <td style={{ fontWeight: 600 }}>{a.label}</td>
                    <td className="text-sm">{a.nextDate ? new Date(a.nextDate).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="text-sm">{a.nextKm ? a.nextKm.toLocaleString('pt-BR') + ' km' : '—'}</td>
                    <td><Link to={`/os/nova?vehicleId=${a.vehicleId}`} className="btn btn-primary btn-sm">+ OS</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
