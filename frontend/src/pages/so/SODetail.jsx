import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { soAPI } from '../../services/api';

const STATUS_LIST = [
  { value: 'QUOTE', label: 'Orçamento', badge: 'badge-gray' },
  { value: 'APPROVED', label: 'Aprovado', badge: 'badge-blue' },
  { value: 'STARTED', label: 'Iniciado', badge: 'badge-purple' },
  { value: 'IN_PROGRESS', label: 'Em Execução', badge: 'badge-purple' },
  { value: 'WAITING_PART', label: 'Aguardando Peça', badge: 'badge-orange' },
  { value: 'FINISHING', label: 'Finalizando', badge: 'badge-yellow' },
  { value: 'DONE', label: 'Finalizado', badge: 'badge-green' },
  { value: 'DELIVERED', label: 'Entregue', badge: 'badge-green' },
];

export default function SODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await soAPI.get(id);
      setOs(res.data);
    } catch { setError('Erro ao carregar OS.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Confirmar mudança de status para "${STATUS_LIST.find(s=>s.value===newStatus)?.label}"?`)) return;
    setUpdatingStatus(true);
    try {
      await soAPI.updateStatus(id, { status: newStatus });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar status.');
    } finally { setUpdatingStatus(false); }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!os) return null;

  const currentBadge = STATUS_LIST.find(s => s.value === os.status);
  const currentIdx = STATUS_LIST.findIndex(s => s.value === os.status);
  const nextStatus = STATUS_LIST[currentIdx + 1];
  const prevStatus = STATUS_LIST[currentIdx - 1];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">OS #{os.number}</div>
          <div className="page-subtitle">
            <span className={`badge ${currentBadge?.badge}`}>{currentBadge?.label}</span>
            <span style={{ marginLeft: 8 }}>{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/os" className="btn btn-ghost btn-sm">← Voltar</Link>
          <Link to={`/os/${id}/editar`} className="btn btn-outline btn-sm">✏️ Editar</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Coluna principal */}
        <div>
          {/* Info cliente/veículo */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Dados da OS</div>
            <div className="grid-2">
              <div>
                <div className="text-sm text-muted">Cliente</div>
                <div style={{ fontWeight: 600 }}>{os.client.name}</div>
                <div className="text-sm text-muted">{os.client.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Veículo</div>
                <div style={{ fontWeight: 600 }}>{os.vehicle.brand} {os.vehicle.model} ({os.vehicle.plate})</div>
                {os.entryKm && <div className="text-sm text-muted">KM entrada: {os.entryKm.toLocaleString('pt-BR')}</div>}
              </div>
            </div>
            {os.notes && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                📝 {os.notes}
              </div>
            )}
          </div>

          {/* Itens */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Serviços e Peças</div>
            {os.items.length === 0 ? (
              <div className="text-muted text-sm">Nenhum item adicionado.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {os.items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <span className={`badge ${item.type === 'SERVICE' ? 'badge-blue' : 'badge-gray'}`}>
                          {item.type === 'SERVICE' ? 'Serv.' : 'Peça'}
                        </span>
                      </td>
                      <td>{item.itemName}</td>
                      <td>{parseFloat(item.quantity)}</td>
                      <td>R$ {parseFloat(item.unitPrice).toFixed(2).replace('.', ',')}</td>
                      <td><strong>R$ {(parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2).replace('.', ',')}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                    <td style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 16 }}>
                      R$ {parseFloat(os.totalPrice).toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Histórico de status */}
          <div className="card">
            <div className="card-title">Histórico de Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {os.statusLogs.map((log, i) => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>
                    {new Date(log.createdAt).toLocaleDateString('pt-BR')} {new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {STATUS_LIST.find(s => s.value === log.newStatus)?.label || log.newStatus}
                  </span>
                  {log.user && <span style={{ color: '#94a3b8' }}>por {log.user.name}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna lateral: ações */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Atualizar Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_LIST.map((s, i) => (
                <button
                  key={s.value}
                  className={`btn ${s.value === os.status ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={() => s.value !== os.status && handleStatusChange(s.value)}
                  disabled={updatingStatus || s.value === os.status}
                  style={{ justifyContent: 'flex-start', opacity: s.value === os.status ? 1 : 0.8 }}
                >
                  {s.value === os.status ? '✓ ' : ''}{s.label}
                </button>
              ))}
            </div>
            {updatingStatus && <div className="text-sm text-muted" style={{ marginTop: 8 }}>Atualizando...</div>}
          </div>

          <div className="card">
            <div className="card-title">WhatsApp</div>
            <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
              Mensagens enviadas automaticamente ao mudar status.
            </div>
            <div style={{ fontSize: 13 }}>
              {os.messages.slice(0, 3).map(m => (
                <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span className={`badge ${m.status === 'SENT' ? 'badge-green' : m.status === 'FAILED' ? 'badge-red' : 'badge-yellow'}`} style={{ marginRight: 6 }}>
                    {m.status === 'SENT' ? '✓' : m.status === 'FAILED' ? '✗' : '⏳'}
                  </span>
                  {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                </div>
              ))}
            </div>
            <Link to="/mensagens" className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }}>
              Ver log completo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
