import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productsAPI } from '../../services/api';

function money(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function stockClass(stock) {
  if (stock <= 0) return 'badge-red';
  if (stock <= 2) return 'badge-yellow';
  return 'badge-green';
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await productsAPI.get(id);
        setProduct(res.data);
      } catch (err) {
        setError(err?.response?.data?.error || 'Erro ao carregar produto.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!product) return null;

  const stock = Number(product.stock || 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Detalhe do Produto</div>
          <div className="page-subtitle">Visão completa para atendimento e gestão</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/produtos')}>Voltar</button>
          <Link to={`/produtos/${product.id}/editar`} className="btn btn-primary">Editar produto</Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ height: 280, background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 }}>
            {product.photoUrl ? (
              <img src={product.photoUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="text-sm text-muted">Sem imagem cadastrada</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="badge badge-gray">{product.category || 'Sem categoria'}</span>
            <span className={`badge ${stockClass(stock)}`}>Estoque: {stock}</span>
          </div>

          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E', marginBottom: 4 }}>{money(product.price)}</div>
          <div className="text-sm text-muted">Unidade: {product.unit || 'un'}</div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Dados do produto</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div className="text-sm text-muted">Nome</div>
              <div style={{ fontWeight: 700 }}>{product.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Código de barras</div>
              <div style={{ fontWeight: 600 }}>{product.barcode || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Categoria</div>
              <div style={{ fontWeight: 600 }}>{product.category || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Preço</div>
              <div style={{ fontWeight: 700, color: '#1A3C5E' }}>{money(product.price)}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Estoque</div>
              <div style={{ fontWeight: 600 }}>{stock}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Descrição</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{product.description || '-'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
