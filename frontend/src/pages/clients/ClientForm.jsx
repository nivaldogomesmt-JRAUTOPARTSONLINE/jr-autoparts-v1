import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clientsAPI } from '../../services/api';

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({ name: '', cpfCnpj: '', phone: '', whatsapp: '', email: '', address: '', city: '', type: 'PERSONAL', createPortalAccess: false, password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      clientsAPI.get(id).then(res => {
        const c = res.data;
        setForm({ name: c.name, cpfCnpj: c.cpfCnpj || '', phone: c.phone || '', whatsapp: c.whatsapp || '', email: c.email || '', address: c.address || '', city: c.city || '', type: c.type, createPortalAccess: false, password: '' });
      });
    }
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return setError('Nome é obrigatório.');
    setLoading(true); setError('');
    try {
      if (isEdit) {
        await clientsAPI.update(id, form);
        navigate(`/clientes/${id}`);
      } else {
        const res = await clientsAPI.create(form);
        navigate(`/clientes/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar cliente.');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Dados Pessoais</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Nome completo</label>
              <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Nome do cliente" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="PERSONAL">Pessoa Física</option>
                <option value="BUSINESS">Pessoa Jurídica</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CPF / CNPJ</label>
              <input className="form-control" value={form.cpfCnpj} onChange={e => set('cpfCnpj', e.target.value)} placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(65) 99999-9999" />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input className="form-control" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="(65) 99999-9999" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Endereço</label>
              <input className="form-control" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número, bairro" />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-control" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Cidade" />
            </div>
          </div>
        </div>

        {!isEdit && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Acesso ao Portal</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <input type="checkbox" id="portal" checked={form.createPortalAccess} onChange={e => set('createPortalAccess', e.target.checked)} />
              <label htmlFor="portal" style={{ cursor: 'pointer' }}>Criar acesso ao portal do cliente agora</label>
            </div>
            {form.createPortalAccess && (
              <div className="form-group">
                <label className="form-label">Senha inicial</label>
                <input type="text" className="form-control" style={{ maxWidth: 250 }} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Ex: JR@2024" />
                <div className="text-sm text-muted mt-1">O cliente pode alterar a senha pelo portal.</div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Cadastrar Cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
