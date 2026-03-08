import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { vehiclesAPI, maintenanceAPI } from '../../services/api';

const ALERT_COLOR = { OVERDUE: '#dc2626', DUE_SOON: '#f59e0b', OK: '#16a34a' };
const ALERT_LABEL = { OVERDUE: '❗ Vencido', DUE_SOON: '⚠️ Próximo', OK: '✓ Ok' };

export default function VehicleDetail() {
  const { id } = useParams(); const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null); const [maint, setMaint] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([vehiclesAPI.get(id), maintenanceAPI.byVehicle(id)])
      .then(([v, m]) => { setVehicle(v.data); setMaint(m.data); })
      .finally(() => setLoading(false));
  }, [id]);
  if (loading) return <div className="loading"><div className="spinner"/></div>;
  if (!vehicle) return <div className="alert alert-error">Veículo não encontrado.</div>;
  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">{vehicle.plate} — {vehicle.brand} {vehicle.model}</div>
          <div className="page-subtitle">{vehicle.year} · {vehicle.color} · <Link to={`/clientes/${vehicle.clientId}`}>{vehicle.client?.name}</Link></div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
          <Link to={`/veiculos/${id}/editar`} className="btn btn-outline btn-sm">✏️ Editar</Link>
          <Link to={`/os/nova?vehicleId=${id}`} className="btn btn-primary btn-sm">+ Nova OS</Link>
        </div>
      </div>
      <div className="grid-2">
        <div>
          {maint && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">⚙️ Manutenção Preventiva</div>
              {maint.maintenances.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                    <div className="text-sm text-muted">
                      {m.nextDate ? `Próxima: ${new Date(m.nextDate).toLocaleDateString('pt-BR')}` : ''}
                      {m.nextKm ? ` · ${m.nextKm.toLocaleString('pt-BR')} km` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ALERT_COLOR[m.alertLevel] }}>{ALERT_LABEL[m.alertLevel]}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="card-title">📋 Histórico de OS</div>
            {vehicle.serviceOrders.length === 0 ? <div className="text-muted text-sm">Sem OS finalizadas.</div> :
              vehicle.serviceOrders.map(os => (
                <Link key={os.id} to={`/os/${os.id}`} style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>OS #{os.number}</span>
                    <span className="text-sm text-muted">{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="text-sm text-muted">{os.items?.length} itens · R$ {parseFloat(os.totalPrice||0).toFixed(2).replace('.', ',')}</div>
                </Link>
              ))
            }
          </div>
        </div>
        <div className="card">
          <div className="card-title">Dados do Veículo</div>
          {[['Placa', vehicle.plate], ['Marca', vehicle.brand], ['Modelo', vehicle.model], ['Ano', vehicle.year], ['Cor', vehicle.color], ['Combustível', vehicle.fuel], ['KM Atual', vehicle.currentKm ? vehicle.currentKm.toLocaleString('pt-BR') + ' km' : '—']].map(([l,v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 14 }}>
              <span style={{ color: '#64748b' }}>{l}</span><span style={{ fontWeight: 600 }}>{v || '—'}</span>
            </div>
          ))}
          {vehicle.notes && <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>📝 {vehicle.notes}</div>}
        </div>
      </div>
    </div>
  );
}
