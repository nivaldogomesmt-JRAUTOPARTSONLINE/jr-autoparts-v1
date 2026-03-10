import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

export default function PortalSODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalAPI.soDetail(id)
      .then((res) => setOrder(res.data))
      .catch(() => setError('Nao foi possivel carregar a OS.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 8 }}>Detalhe da OS</div>
          <div style={{ color: '#64748b', marginBottom: 12 }}>{error || 'OS nao encontrada.'}</div>
          <button className="btn btn-primary" onClick={() => navigate('/portal')}>Voltar ao portal</button>
        </div>
      </div>
    );
  }

  const statusColor = SO_STATUS_COLOR[order.status] || '#718096';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#1A3C5E', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => navigate('/portal')}
          style={{ background: 'rgba(255,255,255,0.18)', border: 0, color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
        >
          Voltar
        </button>
        <div style={{ fontWeight: 700 }}>OS #{order.number}</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'grid', gap: 12 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>Ordem de Servico #{order.number}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{order.vehicle?.plate || '-'} | {order.vehicle?.brand || ''} {order.vehicle?.model || ''}</div>
            </div>
            <span style={{ background: `${statusColor}22`, color: statusColor, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {SO_STATUS_LABEL[order.status] || order.status}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
            Abertura: {formatDate(order.createdAt)}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, color: '#1A3C5E', marginBottom: 10 }}>Itens da OS</div>
          {order.items?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {order.items.map((item) => (
                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.itemName || item.description || 'Item'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Qtd: {item.quantity || 0}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#1A3C5E' }}>
                    R$ {Number(item.unitPrice || 0).toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748b' }}>Nenhum item registrado.</div>
          )}
        </div>
      </div>
    </div>
  );
}
