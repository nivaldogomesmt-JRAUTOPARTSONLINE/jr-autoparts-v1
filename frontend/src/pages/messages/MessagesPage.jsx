import { useEffect, useState } from 'react';
import { messagesAPI } from '../../services/api';

const STATUS_BADGE = { SENT: 'badge-green', FAILED: 'badge-red', PENDING: 'badge-yellow' };
const STATUS_LABEL = { SENT: 'Enviada', FAILED: 'Falhou', PENDING: 'Pendente' };

export default function MessagesPage() {
  const [msgs, setMsgs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    messagesAPI
      .list({ status: filter, page, limit: 30 })
      .then((r) => {
        setMsgs(r.data.data);
        setTotal(r.data.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filter, page]);

  const resend = async (id) => {
    if (!confirm('Reenviar esta mensagem?')) return;
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
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'SENT', 'FAILED', 'PENDING'].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setFilter(s);
                setPage(1);
              }}
            >
              {s === '' ? 'Todas' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : msgs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Nenhuma mensagem encontrada</div>
          </div>
        ) : (
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
              {msgs.map((m) => (
                <tr key={m.id}>
                  <td><span className={`badge ${STATUS_BADGE[m.status] || 'badge-gray'}`}>{STATUS_LABEL[m.status] || m.status}</span></td>
                  <td className="text-sm">{m.client?.name}</td>
                  <td className="text-sm">{m.phone}</td>
                  <td className="text-sm">{m.serviceOrder ? `#${m.serviceOrder.number}` : '-'}</td>
                  <td className="text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</td>
                  <td className="text-sm" style={{ maxWidth: 220, color: '#b91c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.errorMessage || ''}>
                    {m.errorMessage || '-'}
                  </td>
                  <td className="text-sm text-muted">
                    {new Date(m.createdAt).toLocaleDateString('pt-BR')} {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>{m.status === 'FAILED' && <button className="btn btn-ghost btn-sm" onClick={() => resend(m.id)}>Reenviar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
