import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import PaginationControls from '../../components/PaginationControls';
import { messagesAPI } from '../../services/api';
import { getFriendlyWhatsAppError } from '../../utils/whatsappMessages';

const PAGE_SIZE = 20;
const STATUS_BADGE = { SENT: 'badge-green', FAILED: 'badge-red', PENDING: 'badge-yellow' };
const STATUS_LABEL = { SENT: 'Enviada', FAILED: 'Falha ao enviar', PENDING: 'Pendente' };

const MessageRow = memo(function MessageRow({ message, onResend }) {
  return (
    <tr>
      <td><span className={`badge ${STATUS_BADGE[message.status] || 'badge-gray'}`}>{STATUS_LABEL[message.status] || message.status}</span></td>
      <td className="text-sm">{message.client?.name || '-'}</td>
      <td className="text-sm">{message.phone}</td>
      <td className="text-sm">{message.serviceOrder ? `#${message.serviceOrder.number}` : '-'}</td>
      <td className="text-sm" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={message.content}>{message.content}</td>
      <td className="text-sm" style={{ maxWidth: 220, color: '#b91c1c' }}>{message.errorMessage ? getFriendlyWhatsAppError(message.errorMessage) : '-'}</td>
      <td className="text-sm text-muted">{new Date(message.createdAt).toLocaleDateString('pt-BR')} {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>{message.status === 'FAILED' ? <button className="btn btn-ghost btn-sm" onClick={() => onResend(message.id)}>Reenviar</button> : null}</td>
    </tr>
  );
});

export default function MessagesPage() {
  const [msgs, setMsgs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    messagesAPI
      .list({ status: filter || undefined, page, limit: PAGE_SIZE })
      .then((response) => {
        setMsgs(response.data?.data || []);
        setTotal(Number(response.data?.total || 0));
      })
      .finally(() => setLoading(false));
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const resend = async (id) => {
    if (!window.confirm('Reenviar esta mensagem?')) return;
    await messagesAPI.resend(id);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Log de WhatsApp</div>
          <div className="page-subtitle">{total} mensagens registradas</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['', 'SENT', 'FAILED', 'PENDING'].map((status) => (
            <button
              key={status}
              className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setFilter(status);
                setPage(1);
              }}
            >
              {status === '' ? 'Todas' : STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : msgs.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">Nenhuma mensagem encontrada</div></div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>OS</th>
                  <th>Mensagem</th>
                  <th>Erro</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {msgs.map((message) => <MessageRow key={message.id} message={message} onResend={resend} />)}
              </tbody>
            </table>
            <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
