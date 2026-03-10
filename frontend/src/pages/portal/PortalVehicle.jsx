import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { portalAPI } from '../../services/api';

const SO_STATUS_LABEL = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em andamento',
  WAITING_PART: 'Aguardando peca',
  FINISHING: 'Finalizando',
  DONE: 'Concluido',
  DELIVERED: 'Entregue',
};

const SO_STATUS_COLOR = {
  QUOTE: '#718096',
  APPROVED: '#3182ce',
  STARTED: '#F0A500',
  IN_PROGRESS: '#F0A500',
  WAITING_PART: '#e53e3e',
  FINISHING: '#805ad5',
  DONE: '#38a169',
  DELIVERED: '#38a169',
};

const MAINT_ICON = {
  OVERDUE: '!',
  DUE_SOON: '~',
  OK: 'ok',
};

const MAINT_COLOR = {
  OVERDUE: '#c53030',
  DUE_SOON: '#92400e',
  OK: '#2d3748',
};

const TRACKING_STATUS_LABEL = {
  ACTIVE: 'Ativo',
  STOCK: 'Estoque',
  MAINTENANCE: 'Manutencao',
  REMOVED: 'Retirado',
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatKm(value) {
  if (!value && value !== 0) return '-';
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

export default function PortalVehicle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalAPI.vehicleDetail(id)
      .then((r) => setData(r.data))
      .catch(() => setError('Veiculo nao encontrado.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 36 }}>!</div>
        <div style={{ color: '#718096' }}>{error}</div>
        <button className="btn btn-primary" onClick={() => navigate('/portal')}>Voltar ao portal</button>
      </div>
    );
  }

  const { vehicle, maintenances = [], upcomingMaintenances = [], trackingDevices = [], serviceOrders = [] } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/portal')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 18 }}
        >
          {'<-'}
        </button>
        <div>
          <div style={{ fontWeight: 700 }}>{vehicle.plate}</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>{vehicle.brand} {vehicle.model} {vehicle.year ? `- ${vehicle.year}` : ''}</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 24 }}>CAR</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: '#1A3C5E' }}>{vehicle.plate}</div>
              <div style={{ color: '#4a5568' }}>{vehicle.brand} {vehicle.model}</div>
              <div style={{ color: '#718096', fontSize: 13, marginTop: 4 }}>
                KM atual: <b>{formatKm(vehicle.currentKm)}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Proximos servicos recomendados</div>
          {upcomingMaintenances.length === 0 ? (
            <div style={{ color: '#718096' }}>Sem previsoes cadastradas.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {upcomingMaintenances.map((m) => (
                <div key={m.id} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: MAINT_COLOR[m.alertLevel || 'OK'] }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: '#718096' }}>
                      Proxima data: {formatDate(m.nextDate)} | Proximo km: {formatKm(m.nextKm)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: MAINT_COLOR[m.alertLevel || 'OK'] }}>
                    {MAINT_ICON[m.alertLevel || 'OK']} {m.statusLabel || 'Em dia'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Historico de manutencao por item</div>
          {maintenances.length === 0 ? (
            <div style={{ color: '#718096' }}>Nenhuma manutencao registrada.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {maintenances.map((m) => (
                <div key={m.id} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700, color: '#1A3C5E' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>
                    Ultima troca: {formatDate(m.lastDate)} | KM da troca: {formatKm(m.lastKm)}
                  </div>
                  <div style={{ fontSize: 12, color: '#718096' }}>
                    Proxima troca: {formatDate(m.nextDate)} | KM previsto: {formatKm(m.nextKm)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Rastreador instalado</div>
          {trackingDevices.length === 0 ? (
            <div style={{ color: '#718096' }}>Nenhum rastreador vinculado a este veiculo.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {trackingDevices.map((d) => (
                <div key={d.id} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700, color: '#1A3C5E' }}>{d.model}</div>
                  <div style={{ fontSize: 12, color: '#718096' }}>IMEI: {d.imei}</div>
                  <div style={{ fontSize: 12, color: '#718096' }}>Instalado em: {formatDate(d.installedAt)}</div>
                  <div style={{ fontSize: 12, color: '#718096' }}>Status: {TRACKING_STATUS_LABEL[d.status] || d.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Historico de ordens de servico</div>
          {serviceOrders.length === 0 ? (
            <div style={{ color: '#718096' }}>Nenhum servico registrado para este veiculo.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {serviceOrders.map((os) => (
                <div key={os.id} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1A3C5E' }}>OS #{os.number}</div>
                      <div style={{ fontSize: 12, color: '#718096' }}>{formatDate(os.createdAt)}</div>
                    </div>
                    <span style={{ background: `${SO_STATUS_COLOR[os.status] || '#718096'}20`, color: SO_STATUS_COLOR[os.status] || '#718096', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      {SO_STATUS_LABEL[os.status] || os.status}
                    </span>
                  </div>

                  {os.items?.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {os.items.map((item) => {
                        const qty = Number(item.quantity || 0);
                        const unit = Number(item.unitPrice || 0);
                        const subtotal = qty * unit;
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                            <div>{item.itemName || item.description || 'Item'}</div>
                            <div>R$ {subtotal.toFixed(2).replace('.', ',')}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
