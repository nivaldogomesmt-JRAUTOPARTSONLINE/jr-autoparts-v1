import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productsAPI } from '../../services/api';

function money(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function stockClass(stock) {
  if (stock <= 0) return 'badge-red';
  if (stock <= 2) return 'badge-yellow';
  return 'badge-green';
}

function ProductCard({ product }) {
  const stock = Number(product.stock || 0);
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ height: 150, background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {product.photoUrl ? (
          <img src={product.photoUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 26, color: '#64748b' }}>Sem foto</span>
        )}
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{product.category || 'Sem categoria'}</span>
          <span className={`badge ${stockClass(stock)}`} style={{ fontSize: 10 }}>Estoque: {stock}</span>
        </div>

        <div style={{ fontWeight: 700, color: '#0f172a', minHeight: 40, lineHeight: 1.35 }}>{product.name}</div>
        <div className="text-sm text-muted" style={{ marginTop: 4 }}>Cod. barras: {product.barcode || 'Nao informado'}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <strong style={{ color: '#1A3C5E', fontSize: 16 }}>{money(product.price)}</strong>
          <Link to={`/produtos/${product.id}/editar`} className="btn btn-ghost btn-sm">Editar</Link>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [xmlFile, setXmlFile] = useState(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlFeedback, setXmlFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await productsAPI.list({ search, category, page, limit: 30 });
      setProducts(res.data.data || []);
      setTotal(res.data.total || 0);
      if (res.data.categories) setCategories(res.data.categories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, category, page]);

  const stats = useMemo(() => {
    const stockTotal = products.reduce((acc, p) => acc + Number(p.stock || 0), 0);
    const lowStock = products.filter((p) => Number(p.stock || 0) <= 2).length;
    const withoutPrice = products.filter((p) => Number(p.price || 0) <= 0).length;
    return { stockTotal, lowStock, withoutPrice };
  }, [products]);

  const handleImportXml = async () => {
    if (!xmlFile) {
      setXmlFeedback('Selecione um arquivo XML primeiro.');
      return;
    }

    setXmlLoading(true);
    setXmlFeedback('');
    try {
      const res = await productsAPI.importXml(xmlFile);
      const data = res.data || {};
      setXmlFeedback(`Importacao concluida. Criados: ${data.created || 0}, Atualizados: ${data.updated || 0}.`);
      setXmlFile(null);
      await load();
    } catch (err) {
      setXmlFeedback(err.response?.data?.error || 'Falha ao importar XML.');
    } finally {
      setXmlLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Produtos</div>
          <div className="page-subtitle">{total} produtos cadastrados</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/produtos/novo" className="btn btn-primary">+ Novo Produto</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Estoque (pagina atual)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1A3C5E' }}>{stats.stockTotal}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Baixo estoque</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ca8a04' }}>{stats.lowStock}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Sem preco</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{stats.withoutPrice}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(180px,220px)', gap: 10 }}>
            <input
              className="form-control"
              placeholder="Buscar por nome, codigo de barras, categoria ou descricao..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />

            <select
              className="form-control"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              className="form-control"
              onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
            />
            <button type="button" className="btn btn-outline" onClick={handleImportXml} disabled={xmlLoading}>
              {xmlLoading ? 'Importando...' : 'Importar XML NF'}
            </button>
          </div>

          {xmlFeedback ? <div className="text-sm" style={{ color: xmlFeedback.includes('Falha') ? '#b91c1c' : '#065f46' }}>{xmlFeedback}</div> : null}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Nenhum produto encontrado</div>
            <Link to="/produtos/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Produto</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
