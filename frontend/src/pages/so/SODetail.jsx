import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messagesAPI, soAPI } from '../../services/api';

const STATUS_LIST = [
  { value: 'QUOTE', label: 'Orcamento', badge: 'badge-gray' },
  { value: 'APPROVED', label: 'Aprovado', badge: 'badge-blue' },
  { value: 'STARTED', label: 'Iniciado', badge: 'badge-purple' },
  { value: 'IN_PROGRESS', label: 'Em Execucao', badge: 'badge-purple' },
  { value: 'WAITING_PART', label: 'Aguardando Peca', badge: 'badge-orange' },
  { value: 'FINISHING', label: 'Finalizando', badge: 'badge-yellow' },
  { value: 'DONE', label: 'Finalizado', badge: 'badge-green' },
  { value: 'DELIVERED', label: 'Entregue', badge: 'badge-green' },
];

const MESSAGE_STATUS = {
  SENT: { label: 'Enviada', badge: 'badge-green' },
  FAILED: { label: 'Falhou', badge: 'badge-red' },
  PENDING: { label: 'Pendente', badge: 'badge-yellow' },
};

function formatDateTime(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function SODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resendingMap, setResendingMap] = useState({});
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await soAPI.get(id);
      setOs(res.data);
    } catch {
      setError('Erro ao carregar OS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    const label = STATUS_LIST.find((s) => s.value === newStatus)?.label;
    if (!window.confirm(`Confirmar mudanca de status para "${label}"?`)) return;

    setUpdatingStatus(true);
    try {
      await soAPI.updateStatus(id, { status: newStatus });
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleResend = async (messageId) => {
    setResendingMap((prev) => ({ ...prev, [messageId]: true }));
    try {
      await messagesAPI.resend(messageId);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao reenviar mensagem.');
    } finally {
      setResendingMap((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const timeline = useMemo(() => {
    if (!os) return [];

    const statusEvents = (os.statusLogs || []).map((log) => ({
      id: `status-${log.id}`,
      createdAt: log.createdAt,
      type: 'STATUS',
      title: `Status alterado para ${STATUS_LIST.find((s) => s.value === log.newStatus)?.label || log.newStatus}`,
      subtitle: log.user?.name ? `por ${log.user.name}` : '',
    }));

    const messageEvents = (os.messages || []).map((m) => ({
      id: `message-${m.id}`,
      createdAt: m.createdAt,
      type: 'MESSAGE',
      status: m.status,
      messageId: m.id,
      phone: m.phone,
      content: m.content,
      title: `WhatsApp ${MESSAGE_STATUS[m.status]?.label || m.status}`,
      subtitle: m.phone || '',
    }));

    return [...statusEvents, ...messageEvents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [os]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!os) return null;

  const currentBadge = STATUS_LIST.find((s) => s.value === os.status);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">OS #{os.number}</div>
          <div className="page-subtitle">
            <span className={`badge ${currentBadge?.badge}`}>{currentBadge?.label}</span>
            <span style={{ marginLeft: 8 }}>{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/os" className="btn btn-ghost btn-sm">Voltar</Link>
          <Link to={`/os/${id}/editar`} className="btn btn-outline btn-sm">Editar</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Dados da OS</div>
            <div className="grid-2">
              <div>
                <div className="text-sm text-muted">Cliente</div>
                <div style={{ fontWeight: 600 }}>{os.client.name}</div>
                <div className="text-sm text-muted">{os.client.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Veiculo</div>
                <div style={{ fontWeight: 600 }}>{os.vehicle.brand} {os.vehicle.model} ({os.vehicle.plate})</div>
                {os.entryKm ? <div className="text-sm text-muted">KM entrada: {Number(os.entryKm).toLocaleString('pt-BR')}</div> : null}
              </div>
            </div>
            {os.notes ? (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                {os.notes}
              </div>
            ) : null}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Servicos e Pecas</div>
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
                  {os.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className={`badge ${item.type === 'SERVICE' ? 'badge-blue' : 'badge-gray'}`}>
                          {item.type === 'SERVICE' ? 'Serv.' : 'Peca'}
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

          <div className="card">
            <div className="card-title">Linha do Tempo da OS</div>
            {timeline.length === 0 ? (
              <div className="text-sm text-muted">Sem eventos ainda.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {timeline.map((event) => (
                  <div key={event.id} style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{event.title}</div>
                      <div className="text-sm text-muted">{formatDateTime(event.createdAt)}</div>
                    </div>

                    {event.type === 'STATUS' ? (
                      <div className="text-sm text-muted">{event.subtitle}</div>
                    ) : (
                      <>
                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{event.subtitle}</div>
                        <div style={{ fontSize: 13, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{event.content}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`badge ${MESSAGE_STATUS[event.status]?.badge || 'badge-gray'}`}>
                            {MESSAGE_STATUS[event.status]?.label || event.status}
                          </span>
                          {event.status === 'FAILED' ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => handleResend(event.messageId)}
                              disabled={!!resendingMap[event.messageId]}
                            >
                              {resendingMap[event.messageId] ? 'Reenviando...' : 'Reenviar'}
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Atualizar Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_LIST.map((s) => (
                <button
                  key={s.value}
                  className={`btn ${s.value === os.status ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={() => s.value !== os.status && handleStatusChange(s.value)}
                  disabled={updatingStatus || s.value === os.status}
                  style={{ justifyContent: 'flex-start', opacity: s.value === os.status ? 1 : 0.85 }}
                >
                  {s.value === os.status ? 'Atual: ' : ''}{s.label}
                </button>
              ))}
            </div>
            {updatingStatus ? <div className="text-sm text-muted" style={{ marginTop: 8 }}>Atualizando...</div> : null}
          </div>

          <div className="card">
            <div className="card-title">Resumo WhatsApp</div>
            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
              Envios automáticos por mudança de status.
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(os.messages || []).slice(0, 5).map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <span>{formatDateTime(m.createdAt)}</span>
                  <span className={`badge ${MESSAGE_STATUS[m.status]?.badge || 'badge-gray'}`}>{MESSAGE_STATUS[m.status]?.label || m.status}</span>
                </div>
              ))}
            </div>
            <Link to="/mensagens" className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }}>Ver log completo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
