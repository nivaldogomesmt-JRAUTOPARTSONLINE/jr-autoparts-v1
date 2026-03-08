import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { clientsAPI } from '../../services/api';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalModal, setPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState('JR@2024');

  useEffect(() => {
    clientsAPI.get(id).then(res => setClient(res.data)).finally(() => setLoading(false));
  }, [id]);

  const grantAccess = async () => {
    try {
      await clientsAPI.grantPortalAccess(id, { password: portalPassword });
      alert('Acesso ao portal criado com sucesso!');
      setPortalModal(false);
      clientsAPI.get(id).then(res => setClient(res.data));
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar acesso.');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!client) return <div className="alert alert-error">Cliente não encontrado.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{client.name}</div>
          <div className="page-subtitle">{client.type === 'BUSINESS' ? 'Pessoa Jurídica' : 'Pessoa Física'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
          {!client.user && <button className="btn btn-outline btn-sm" onClick={() => setPortalModal(true)}>🔐 Portal</button>}
          <Link to={`/clientes/${id}/editar`} className="btn btn-primary btn-sm">✏️ Editar</Link>
        </div>
      </div>

      <div className="grid-2">
        {/* Dados */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Dados do Cliente</div>
          <table className="table">
            <tbody>
              {[
                ['CPF/CNPJ', client.cpfCnpj], ['Telefone', client.phone], ['WhatsApp', client.whatsapp],
                ['Email', client.email], ['Endereço', client.address], ['Cidade', client.city],
              ].map(([label, val]) => val ? (
                <tr key={label}><td style={{ fontWeight: 600, width: '35%' }}>{label}</td><td>{val}</td></tr>
              ) : null)}
              <tr>
                <td style={{ fontWeight: 600 }}>Portal</td>
                <td>{client.user ? <span className="badge badge-green">✓ Ativo ({client.user.email})</span> : <span className="badge badge-gray">Sem acesso</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Veículos */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Veículos ({client.vehicles.length})</div>
            <Link to={`/veiculos/novo?clientId=${id}`} className="btn btn-outline btn-sm">+ Veículo</Link>
          </div>
          {client.vehicles.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-state-icon">🚗</div>
              <div className="empty-state-text" style={{ fontSize: 13 }}>Nenhum veículo</div>
            </div>
          ) : client.vehicles.map(v => (
            <Link key={v.id} to={`/veiculos/${v.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 6, marginBottom: 6, background: '#f8fafc', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600 }}>{v.plate} — {v.brand} {v.model}</div>
              <div className="text-sm text-muted">{v.year} · {v.color} · {v.currentKm ? `${v.currentKm.toLocaleString('pt-BR')} km` : '—'}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* OS Recentes */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Últimas Ordens de Serviço</div>
          <Link to={`/os/nova?clientId=${id}`} className="btn btn-outline btn-sm">+ Nova OS</Link>
        </div>
        {client.serviceOrders.length === 0 ? (
          <div className="text-muted text-sm">Nenhuma OS registrada.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Nº</th><th>Veículo</th><th>Status</th><th>Total</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {client.serviceOrders.map(os => (
                <tr key={os.id}>
                  <td>#{os.number}</td>
                  <td>{os.vehicle?.plate}</td>
                  <td><span className="badge badge-gray">{os.status}</span></td>
                  <td>R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}</td>
                  <td className="text-sm text-muted">{new Date(os.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td><Link to={`/os/${os.id}`} className="btn btn-ghost btn-sm">Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal portal */}
      {portalModal && (
        <div className="modal-overlay" onClick={() => setPortalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🔐 Criar Acesso ao Portal</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPortalModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>O cliente vai acessar o portal com o email <strong>{client.email}</strong>.</p>
              <div className="form-group">
                <label className="form-label">Senha inicial</label>
                <input type="text" className="form-control" value={portalPassword} onChange={e => setPortalPassword(e.target.value)} />
                <div className="text-sm text-muted mt-1">Avise o cliente desta senha. Ele pode alterar depois.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPortalModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={grantAccess}>Criar Acesso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
