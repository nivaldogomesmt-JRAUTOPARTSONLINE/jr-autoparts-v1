import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsAPI } from '../../services/api';

const CATEGORIES = ['Bateria', 'Filtros', 'Freios', 'Lubrificantes', 'Pneus', 'Suspensao', 'Eletrica', 'Arrefecimento', 'Transmissao', 'Acessorios', 'Outros'];

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    barcode: '',
    description: '',
    category: '',
    price: '',
    unit: 'un',
    stock: '',
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    productsAPI.get(id).then((r) => {
      const p = r.data;
      setForm({
        name: p.name || '',
        barcode: p.barcode || '',
        description: p.description || '',
        category: p.category || '',
        price: p.price || '',
        unit: p.unit || 'un',
        stock: p.stock ?? '',
      });
      if (p.photoUrl) setPreview(p.photoUrl);
    });
  }, [id, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      setError('Nome e preco sao obrigatorios.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      });
      if (photo) fd.append('photo', photo);

      if (isEdit) {
        await productsAPI.update(id, fd);
      } else {
        await productsAPI.create(fd);
      }
      navigate('/produtos');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar produto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{isEdit ? 'Editar Produto' : 'Novo Produto'}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
          <div className="card">
            <div className="card-title">Dados do Produto</div>

            <div className="form-group">
              <label className="form-label required">Nome</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                placeholder="Ex: Filtro de oleo"
              />
            </div>

            <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="form-group">
                <label className="form-label">Codigo de barras</label>
                <input
                  className="form-control"
                  value={form.barcode}
                  onChange={(e) => set('barcode', e.target.value)}
                  placeholder="Bipe o leitor ou digite"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus={!isEdit}
                />
                <div className="text-sm text-muted" style={{ marginTop: 6 }}>Dica: use leitor de codigo de barras e finalize com Enter.</div>
              </div>

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
                <label className="form-label required">Preco (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unidade</label>
                <select className="form-control" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                  {['un', 'par', 'kit', 'jogo', 'L', 'ml', 'm', 'cm', 'kg', 'g'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Estoque</label>
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Descricao</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Descricao para OS e atendimento"
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title">Foto do Produto</div>
            <div style={{ border: '2px dashed #e2e8f0', borderRadius: 8, padding: 16, textAlign: 'center', marginBottom: 12, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f8fafc' }}>
              {preview ? (
                <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }} />
              ) : (
                <div className="text-sm text-muted">Sem foto</div>
              )}
            </div>
            <label className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
              Selecionar Foto
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar Produto'}
          </button>
        </div>
      </form>
    </div>
  );
}

