import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('jr_token');

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(API + '/api/products', { headers: { Authorization: 'Bearer ' + token() } });
        if (r.ok) {
          const data = await r.json();
          setProducts(Array.isArray(data) ? data : data.products || []);
          if (data.stats) setStats(data.stats);
        }
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'low_stock' ? (p.stock_qty != null && p.min_stock != null && p.stock_qty <= p.min_stock) :
      filter === 'no_sales' ? !(p.sold_qty > 0) :
      filter === 'no_price' ? !(p.sale_price > 0) : true;
    return matchSearch && matchFilter;
  });

  const statCards = [
    { key: 'most_sold', label: 'Mais Vendido', value: stats.most_sold?.name || '—', sub: stats.most_sold ? stats.most_sold.qty + ' vendidos' : '', color: 'var(--primary)' },
    { key: 'most_revenue', label: 'Maior Receita', value: stats.most_revenue?.name || '—', sub: stats.most_revenue ? 'R$ ' + Number(stats.most_revenue.revenue||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '', color: 'var(--success)' },
    { key: 'low_stock', label: 'Baixo Estoque', value: stats.low_stock_count ?? 0, sub: 'Abaixo do mínimo', color: 'var(--warning)' },
    { key: 'no_sales', label: 'Sem Venda', value: stats.no_sales_count ?? 0, sub: 'Nunca vendidos', color: 'var(--gray-500)' },
  ];

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Produtos</h1>
          <p className="page-subtitle">{products.length} produto{products.length !== 1 ? 's' : ''} cadastrado{products.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/produtos/novo')}>+ Novo Produto</button>
          <button className="btn btn-outline" onClick={() => navigate('/importacoes')}>Importar</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPIs de produtos */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Visão Gerencial</h2></div>
            <div className="grid-4">
              {statCards.map(s => (
                <div key={s.key} className="stat-card card-sm" style={{ cursor: 'pointer' }} onClick={() => setFilter(s.key)}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ fontSize: typeof s.value === 'number' ? 26 : 14, color: s.color, wordBreak: 'break-word' }}>{s.value}</div>
                  {s.sub && <div className="stat-sub">{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 320 }}>
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Buscar produto ou código..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { v: 'all', l: 'Todos' },
                { v: 'low_stock', l: 'Baixo Estoque' },
                { v: 'no_sales', l: 'Sem Venda' },
                { v: 'no_price', l: 'Sem Preço' },
              ].map(f => (
                <button
                  key={f.v}
                  className={`btn btn-sm ${filter === f.v ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setFilter(f.v)}
                >{f.l}</button>
              ))}
            </div>
            <span className="text-muted text-sm">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-text">{search || filter !== 'all' ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</div>
              {!search && filter === 'all' && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/produtos/novo')}>+ Novo Produto</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Código</th><th>Nome</th><th>Categoria</th><th className="text-right">Estoque</th><th className="text-right">Preço</th><th className="text-right">Vendidos</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const lowStock = p.stock_qty != null && p.min_stock != null && p.stock_qty <= p.min_stock;
                    return (
                      <tr key={p.id} onClick={() => navigate(`/produtos/${p.id}`)} style={{ cursor: 'pointer' }}>
                        <td className="text-sm" style={{ fontFamily: 'monospace' }}>{p.code || '—'}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.brand && <div className="text-muted text-sm">{p.brand}</div>}
                        </td>
                        <td className="text-sm text-muted">{p.category || '—'}</td>
                        <td className="text-right">
                          <span className={`badge ${lowStock ? 'badge-yellow' : 'badge-gray'}`}>
                            {p.stock_qty ?? 0} {p.unit || 'un'}
                          </span>
                        </td>
                        <td className="text-right" style={{ fontWeight: 600 }}>
                          {p.sale_price ? `R$ ${Number(p.sale_price).toFixed(2)}` : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-right">
                          <span className="badge badge-blue">{p.sold_qty ?? 0}</span>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); navigate(`/produtos/${p.id}`); }}>Ver →</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
