import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { soAPI } from '../../services/api';

const DELIVERY_LABELS = {
  AWAITING_DISPATCH: 'Aguardando envio',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  DELIVERY_FAILED: 'Tentativa sem sucesso',
};

const TRACKABLE_OS_STATUS = new Set(['FINISHING', 'DONE', 'DELIVERED']);

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function DeliveriesPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await soAPI.list({ search, sort: 'updated', limit: 200 });
      setOrders(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search]);

  const rows = useMemo(() => {
    return (orders || []).filter((os) => TRACKABLE_OS_STATUS.has(os.status) || os.deliveryMeta);
  }, [orders]);

  const quickUpdate = async (soId, deliveryStatus) => {
    setUpdatingId(`${soId}:${deliveryStatus}`);
    try {
      await soAPI.updateDelivery(soId, { deliveryStatus });
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao atualizar entrega.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Entregas</div>
          <div className="page-subtitle">Atualizacao de entrega e comunicacao WhatsApp</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="Buscar por OS, cliente ou placa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">Entregas</div>
            <div className="empty-state-text">Nenhuma entrega encontrada</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Status entrega</th>
                  <th>Ultima atualizacao</th>
                  <th>Acoes rapidas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((os) => {
                  const status = os.deliveryMeta?.status || (os.status === 'DELIVERED' ? 'DELIVERED' : 'AWAITING_DISPATCH');
                  const label = DELIVERY_LABELS[status] || status;
                  return (
                    <tr key={os.id}>
                      <td><strong>#{os.number}</strong></td>
                      <td>{os.client?.name}</td>
                      <td>{os.vehicle?.plate}</td>
                      <td><span className="badge badge-blue">{label}</span></td>
                      <td className="text-sm text-muted">{formatDateTime(os.deliveryMeta?.updatedAt || os.updatedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => quickUpdate(os.id, 'OUT_FOR_DELIVERY')}
                            disabled={!!updatingId}
                          >
                            {updatingId === `${os.id}:OUT_FOR_DELIVERY` ? 'Enviando...' : 'Saiu'}
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => quickUpdate(os.id, 'DELIVERED')}
                            disabled={!!updatingId}
                          >
                            {updatingId === `${os.id}:DELIVERED` ? 'Enviando...' : 'Entregue'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <Link to={`/os/${os.id}`} className="btn btn-ghost btn-sm">Abrir OS</Link>
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
