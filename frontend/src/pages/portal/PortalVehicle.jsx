import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { portalAPI } from '../../services/api';

const SO_STATUS_LABEL = {
  QUOTE: 'Orçamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em Andamento',
  WAITING_PART: 'Aguardando Peça',
  FINISHING: 'Finalizando',
  DONE: 'Concluído',
  DELIVERED: 'Entregue',
};

const SO_STATUS_COLOR = {
  QUOTE: '#718096', APPROVED: '#3182ce', STARTED: '#F0A500',
  IN_PROGRESS: '#F0A500', WAITING_PART: '#e53e3e', FINISHING: '#805ad5',
  DONE: '#38a169', DELIVERED: '#38a169',
};

const MAINT_ALERT_BG = { OVERDUE: '#fff5f5', DUE_SOON: '#fffbeb' };
const MAINT_ALERT_COLOR = { OVERDUE: '#c53030', DUE_SOON: '#92400e' };
const MAINT_ICON = { OVERDUE: '❗', DUE_SOON: '⚠️', OK: '✅' };

export default function PortalVehicle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalAPI.vehicleDetail(id)
      .then(r => setData(r.data))
      .catch(() => setError('Veículo não encontrado.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 40, height: 40 }}/>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <div style={{ color: '#718096' }}>{error}</div>
      <button className="btn btn-primary" onClick={() => navigate('/portal')}>Voltar ao Portal</button>
    </div>
  );

  const { vehicle, maintenances, serviceOrders } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/portal')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ←
        </button>
        <div>
          <div style={{ fontWeight: 700 }}>{vehicle.plate}</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{vehicle.brand} {vehicle.model} {vehicle.year ? `· ${vehicle.year}` : ''}</div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
        {/* Vehicle Info Card */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 56, height: 56, background: '#EBF4FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🚗</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#1A3C5E' }}>{vehicle.plate}</div>
              <div style={{ color: '#4a5568', marginTop: 2 }}>{vehicle.brand} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
                {vehicle.color && <span style={{ fontSize: 13, color: '#718096' }}>🎨 {vehicle.color}</span>}
                {vehicle.fuel && <span style={{ fontSize: 13, color: '#718096' }}>⛽ {vehicle.fuel}</span>}
                {vehicle.currentKm && <span style={{ fontSize: 13, color: '#718096' }}>📍 {vehicle.currentKm.toLocaleString('pt-BR')} km</span>}
              </div>
              {vehicle.notes && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#718096', fontStyle: 'italic' }}>
                  "{vehicle.notes}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Maintenance Status */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>
            🔩 Manutenções Preventivas
          </div>
          {maintenances?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: '#718096' }}>
              Nenhuma manutenção registrada.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {maintenances?.map((m, i) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: m.alertLevel ? MAINT_ALERT_BG[m.alertLevel] : 'white',
                  borderBottom: i < maintenances.length - 1 ? '1px solid #f0f0f0' : 'none'
                }}>
                  <div style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                    {MAINT_ICON[m.alertLevel || 'OK']}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: m.alertLevel ? MAINT_ALERT_COLOR[m.alertLevel] : '#2d3748' }}>
                      {m.label}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
                      {m.nextDate && (
                        <span style={{ fontSize: 12, color: '#718096' }}>
                          📅 Próx: {new Date(m.nextDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {m.nextKm && (
                        <span style={{ fontSize: 12, color: '#718096' }}>
                          🔢 Próx: {m.nextKm.toLocaleString('pt-BR')} km
                        </span>
                      )}
                      {m.lastDate && (
                        <span style={{ fontSize: 12, color: '#a0aec0' }}>
                          Último: {new Date(m.lastDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {maintenances?.some(m => m.alertLevel) && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#EBF4FF', borderRadius: 8, fontSize: 13, color: '#1A3C5E' }}>
              Precisa agendar uma revisão? Fale conosco:
              <a href="https://wa.me/5565992812000" style={{ fontWeight: 700, marginLeft: 4 }}>📱 (65) 99281-2000</a>
            </div>
          )}
        </div>

        {/* Service Orders History */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A3C5E', marginBottom: 12 }}>
            📋 Histórico de Serviços
          </div>
          {serviceOrders?.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: '#718096' }}>
              Nenhum serviço realizado neste veículo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {serviceOrders?.map(os => (
                <div key={os.id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1A3C5E' }}>OS #{os.number}</div>
                      <div style={{ fontSize: 12, color: '#718096' }}>
                        {new Date(os.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{
                        background: SO_STATUS_COLOR[os.status] + '20',
                        color: SO_STATUS_COLOR[os.status],
                        padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600
                      }}>
                        {SO_STATUS_LABEL[os.status]}
                      </span>
                      {os.total && (
                        <span style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 15 }}>
                          R$ {parseFloat(os.total).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  {os.items?.length > 0 && (
                    <div style={{ background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
                      {os.items.map((item, i) => (
                        <div key={item.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderBottom: i < os.items.length - 1 ? '1px solid #edf2f7' : 'none',
                          fontSize: 13
                        }}>
                          <div>
                            <span style={{ color: '#4a5568' }}>{item.description}</span>
                            {item.quantity > 1 && <span style={{ color: '#a0aec0', marginLeft: 6 }}>×{item.quantity}</span>}
                          </div>
                          <span style={{ color: '#1A3C5E', fontWeight: 600 }}>
                            R$ {parseFloat(item.subtotal).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {os.notes && (
                    <div style={{ marginTop: 10, fontSize: 13, color: '#718096', fontStyle: 'italic' }}>
                      Obs: {os.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact Footer */}
        <div style={{ marginTop: 32, textAlign: 'center', color: '#a0aec0', fontSize: 12 }}>
          <div>Dúvidas sobre seu veículo?</div>
          <a href="https://wa.me/5565992812000" style={{ color: '#1A3C5E', fontWeight: 600, fontSize: 14 }}>
            📱 WhatsApp: (65) 99281-2000
          </a>
          <div style={{ marginTop: 8 }}>© 2024 JR Auto Parts · jrautopartsmt.com.br</div>
        </div>
      </div>
    </div>
  );
}
