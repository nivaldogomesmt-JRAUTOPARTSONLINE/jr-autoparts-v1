import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productsAPI } from '../../services/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]); const [page, setPage] = useState(1); const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await productsAPI.list({ search, category, page, limit: 30 });
      setProducts(res.data.data); setTotal(res.data.total);
      if (res.data.categories) setCategories(res.data.categories);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [search, category, page]);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Produtos</div><div className="page-subtitle">{total} produtos cadastrados</div></div>
        <Link to="/produtos/novo" className="btn btn-primary">+ Novo Produto</Link>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input className="form-control" placeholder="🔍  Nome, descrição ou categoria..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/>
          </div>
          <select className="form-control" style={{ width: 200 }} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        {loading ? <div className="loading"><div className="spinner"/></div> : products.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-text">Nenhum produto encontrado</div>
            <Link to="/produtos/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Produto</Link></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {products.map(p => (
              <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
                <div style={{ height: 140, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: 40 }}>📦</span>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {p.category && <span className="badge badge-gray" style={{ fontSize: 10, marginBottom: 4 }}>{p.category}</span>}
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#1A3C5E' }}>R$ {parseFloat(p.price).toFixed(2).replace('.', ',')}</span>
                    <Link to={`/produtos/${p.id}/editar`} className="btn btn-ghost btn-sm">✏️</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
