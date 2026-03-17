import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { servicesAPI } from '../../services/api';

const CATEGORIES = ['Funilaria', 'Pintura', 'Mecânica', 'Elétrica', 'Revisão', 'Alinhamento', 'Balanceamento', 'Suspensão', 'Freios', 'Motor', 'Câmbio', 'Ar Condicionado', 'Diagnóstico', 'Outros'];

export default function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    servicesAPI.get(id).then((r) => {
      const s = r.data;
      setForm({
        name: s.name || '',
        category: s.category || '',
        price: s.price || '',
        description: s.description || '',
      });
    }).catch((err) => {
      setError(err?.response?.data?.error || 'Erro ao carregar serviço.');
    });
  }, [id, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      setError('Nome e preço são obrigatórios.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        await servicesAPI.update(id, form);
      } else {
        await servicesAPI.create(form);
      }
      navigate('/servicos');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar serviço.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{isEdit ? 'Editar Serviço' : 'Novo Serviço'}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-title">Dados do Serviço</div>

          <div className="form-group">
            <label className="form-label required">Nome</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder="Ex: Troca de óleo"
              autoFocus={!isEdit}
            />
          </div>

          <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Selecione...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                required
                placeholder="Ex: 150.00"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descreva o serviço para uso na OS e atendimento..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar Serviço'}
          </button>
        </div>
      </form>
    </div>
  );
}
