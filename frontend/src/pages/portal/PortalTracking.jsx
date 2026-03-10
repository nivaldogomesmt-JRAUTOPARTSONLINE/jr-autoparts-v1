import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { portalAPI } from '../../services/api';

const RASTREK_URL = import.meta.env.VITE_RASTREK_URL || 'https://painel.rastrek.com.br/';
const WHATSAPP_URL = 'https://wa.me/5565992812000';

const STATUS_LABEL = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em execucao',
  WAITING_PART: 'Aguardando peca',
  FINISHING: 'Finalizando',
  DONE: 'Finalizado',
  DELIVERED: 'Entregue',
};

export default function PortalTracking() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalAPI.me().then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const openOrders = useMemo(() => {
    const orders = data?.recentOrders || [];
    return orders.filter((o) => !['DONE', 'DELIVERED'].includes(o.status));
  }, [data]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#1A3C5E', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/portal')}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: 'white',
            width: 36,
            height: 36,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'<-'}
        </button>
        <div>
          <div style={{ fontWeight: 700 }}>Central de Rastreamento</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Acesso rapido e simples para clientes JR Auto Parts</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 28px' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 17 }}>Rastreamento veicular</div>
              <div style={{ color: '#718096', fontSize: 13, marginTop: 4 }}>
                Para localizacao em tempo real, voce pode abrir o painel oficial da Rastrek com um clique.
              </div>
            </div>
            <a
              href={RASTREK_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ whiteSpace: 'nowrap' }}
            >
              Abrir painel Rastrek
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card">
            <div style={{ color: '#718096', fontSize: 12 }}>Veiculos no portal</div>
            <div style={{ color: '#1A3C5E', fontWeight: 800, fontSize: 28, marginTop: 4 }}>{data?.vehicles?.length || 0}</div>
          </div>
          <div className="card">
            <div style={{ color: '#718096', fontSize: 12 }}>Alertas de manutencao</div>
            <div style={{ color: '#c53030', fontWeight: 800, fontSize: 28, marginTop: 4 }}>{data?.maintenances?.length || 0}</div>
          </div>
          <div className="card">
            <div style={{ color: '#718096', fontSize: 12 }}>OS em andamento</div>
            <div style={{ color: '#1A3C5E', fontWeight: 800, fontSize: 28, marginTop: 4 }}>{openOrders.length}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Meus veiculos e proximas acoes</div>
          {data?.vehicles?.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#1A3C5E' }}>{vehicle.plate}</div>
                    <div style={{ color: '#718096', fontSize: 13 }}>
                      {vehicle.brand} {vehicle.model} {vehicle.year ? `- ${vehicle.year}` : ''}
                    </div>
                    <div style={{ color: '#a0aec0', fontSize: 12, marginTop: 2 }}>
                      Ultima KM registrada: {vehicle.currentKm ? vehicle.currentKm.toLocaleString('pt-BR') : 'Nao informada'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/portal/veiculo/${vehicle.id}`} className="btn btn-secondary">
                      Historico
                    </Link>
                    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">
                      WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#718096', fontSize: 14 }}>Nenhum veiculo cadastrado no seu perfil.</div>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Andamento de ordens de servico</div>
          {openOrders.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {openOrders.map((order) => (
                <div key={order.id} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, color: '#1A3C5E' }}>OS #{order.number}</div>
                    <div style={{ color: '#718096', fontSize: 12 }}>{STATUS_LABEL[order.status] || order.status}</div>
                  </div>
                  <div style={{ color: '#4a5568', fontSize: 13, marginTop: 4 }}>
                    {order.vehicle?.plate} - {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#718096', fontSize: 14 }}>Nenhuma ordem em andamento no momento.</div>
          )}
        </div>
      </div>
    </div>
  );
}
