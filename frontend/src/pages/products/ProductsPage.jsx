import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { productsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const CAMPAIGNS_STORAGE_KEY = 'jr_products_campaigns';

const DEFAULT_CAMPAIGNS = [
  {
    id: 'prd-campaign-1',
    name: 'Reducao de baixo estoque',
    objective: 'Diminuir itens em ruptura e risco',
    period: 'Mensal',
    owner: 'Estoque',
    target: 10,
    achieved: 0,
    autoSource: 'LOW_STOCK',
  },
  {
    id: 'prd-campaign-2',
    name: 'Correcao de precos pendentes',
    objective: 'Eliminar produtos sem preco',
    period: 'Mensal',
    owner: 'Financeiro',
    target: 5,
    achieved: 0,
    autoSource: 'WITHOUT_PRICE',
  },
];

function money(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function stockClass(stock) {
  if (stock <= 0) return 'badge-red';
  if (stock <= 2) return 'badge-yellow';
  return 'badge-green';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadXlsxBlob(data, filename) {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function getInitialCampaigns() {
  if (typeof window === 'undefined') return DEFAULT_CAMPAIGNS;
  try {
    const raw = window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (!raw) return DEFAULT_CAMPAIGNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_CAMPAIGNS;
    return parsed;
  } catch {
    return DEFAULT_CAMPAIGNS;
  }
}

function getCampaignStatus(target, achieved) {
  const safeTarget = Number(target || 0);
  const safeAchieved = Number(achieved || 0);
  if (safeTarget <= 0) return { label: 'Sem meta', color: '#334155', bg: '#e2e8f0' };

  const ratio = safeAchieved / safeTarget;
  if (ratio >= 1) return { label: 'Em meta', color: '#166534', bg: '#dcfce7' };
  if (ratio >= 0.7) return { label: 'Em acompanhamento', color: '#92400e', bg: '#fef3c7' };
  return { label: 'Atencao', color: '#991b1b', bg: '#fee2e2' };
}

function ProductCard({ product, showValues = true }) {
  const stock = Number(product.stock || 0);
  return (
    <Link to={`/produtos/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
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
            <strong style={{ color: '#1A3C5E', fontSize: 16 }}>{showValues ? money(product.price) : 'Restrito'}</strong>
            <span className="btn btn-ghost btn-sm">Abrir</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const canViewValues = can('sensitive:viewValues');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [campaigns, setCampaigns] = useState(() => getInitialCampaigns());

  const load = async () => {
    setLoading(true);
    try {
      const res = await productsAPI.list({ search: debouncedSearch, category, page, limit: 30 });
      setProducts(res.data.data || []);
      setTotal(res.data.total || 0);
      if (res.data.categories) setCategories(res.data.categories);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await productsAPI.overview();
      setOverview(res.data || null);
    } catch (err) {
      console.error(err);
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [debouncedSearch, category, page]);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    } catch {
      // ignore storage errors
    }
  }, [campaigns]);

  const campaignsView = useMemo(() => (
    campaigns.map((campaign) => {
      let achieved = Number(campaign.achieved || 0);
      if (campaign.autoSource === 'LOW_STOCK') achieved = Number(overview?.totals?.lowStock || 0);
      if (campaign.autoSource === 'WITHOUT_PRICE') achieved = Number(overview?.totals?.withoutPrice || 0);
      if (campaign.autoSource === 'WITHOUT_SALE') achieved = Number(overview?.totals?.withoutSale || 0);
      const status = getCampaignStatus(campaign.target, achieved);
      return {
        ...campaign,
        achieved,
        statusLabel: status.label,
        statusColor: status.color,
        statusBg: status.bg,
      };
    })
  ), [campaigns, overview]);

  const addCampaign = () => {
    const name = window.prompt('Nome da campanha:');
    if (!name) return;

    const objective = window.prompt('Objetivo da campanha:', 'Melhorar desempenho de produtos') || '';
    const period = window.prompt('Periodo (ex: Mensal):', 'Mensal') || 'Mensal';
    const owner = window.prompt('Responsavel:', 'Gestao') || 'Gestao';
    const target = Number(window.prompt('Meta numerica:', '10') || 0);

    setCampaigns((prev) => [
      {
        id: `prd-campaign-${Date.now()}`,
        name: String(name).trim(),
        objective: String(objective).trim(),
        period: String(period).trim(),
        owner: String(owner).trim(),
        target,
        achieved: 0,
        autoSource: '',
      },
      ...prev,
    ]);
  };

  const removeCampaign = (id) => {
    if (!window.confirm('Remover esta campanha?')) return;
    setCampaigns((prev) => prev.filter((row) => row.id !== id));
  };

  const exportFiltered = async () => {
    setExporting(true);
    try {
      const res = await productsAPI.exportFile({
        search: String(debouncedSearch || '').trim() || undefined,
        category: category || undefined,
        active: true,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadXlsxBlob(res.data, `produtos_filtrados_${today}.xlsx`);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Erro ao exportar produtos filtrados.');
    } finally {
      setExporting(false);
    }
  };

  const printFiltered = () => {
    const rows = products.map((p) => `
      <tr>
        <td>${escapeHtml(p.name || '-')}</td>
        <td>${escapeHtml(p.category || '-')}</td>
        <td>${escapeHtml(p.barcode || '-')}</td>
        <td>${escapeHtml(String(Number(p.stock || 0)))}</td>
        <td>${escapeHtml(money(p.price))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Produtos filtrados</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0 0 14px; color: #475569; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Produtos filtrados</h1>
          <p>Impressao em ${new Date().toLocaleString('pt-BR')} | Exibindo ${products.length} de ${total}</p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Codigo de barras</th>
                <th>Estoque</th>
                <th>Preco</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `;

    const w = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=720');
    if (!w) {
      window.alert('Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-up.');
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Produtos</div>
          <div className="page-subtitle">{total} produtos cadastrados</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/integracoes" className="btn btn-outline">Integracoes</Link>
          {canViewValues ? (
            <>
              <button className="btn btn-outline" onClick={exportFiltered} disabled={exporting || loading}>
                {exporting ? 'Exportando...' : 'Exportar filtrados'}
              </button>
              <button className="btn btn-outline" onClick={printFiltered} disabled={loading || !products.length}>
                Imprimir
              </button>
            </>
          ) : null}
          <Link to="/produtos/novo" className="btn btn-primary">+ Novo Produto</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Mais vendido</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>
            {overviewLoading ? '...' : (overview?.rankings?.topByQuantity?.[0]?.name || '-')}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Maior receita</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
            {overviewLoading ? '...' : (overview?.rankings?.topByRevenue?.[0]?.name || '-')}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Baixo estoque</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ca8a04' }}>
            {overviewLoading ? '...' : Number(overview?.totals?.lowStock || 0)}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Sem venda</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f766e' }}>
            {overviewLoading ? '...' : Number(overview?.totals?.withoutSale || 0)}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Sem preco</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>
            {overviewLoading ? '...' : Number(overview?.totals?.withoutPrice || 0)}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Ranking por quantidade</div>
          {overviewLoading ? <div className="loading"><div className="spinner" /></div> : (
            !(overview?.rankings?.topByQuantity || []).length
              ? <div className="text-sm text-muted">Sem vendas registradas.</div>
              : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {overview.rankings.topByQuantity.slice(0, 6).map((item) => (
                    <div key={`qty-${item.rank}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{item.rank}. {item.name}</span>
                      <strong>{Number(item.quantity || 0).toLocaleString('pt-BR')}</strong>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Ranking por receita</div>
          {overviewLoading ? <div className="loading"><div className="spinner" /></div> : (
            !(overview?.rankings?.topByRevenue || []).length
              ? <div className="text-sm text-muted">Sem vendas registradas.</div>
              : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {overview.rankings.topByRevenue.slice(0, 6).map((item) => (
                    <div key={`rev-${item.rank}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{item.rank}. {item.name}</span>
                      <strong>{canViewValues ? money(item.revenue) : 'Restrito'}</strong>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Metas e campanhas</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addCampaign}>+ Nova campanha</button>
        </div>

        {!campaignsView.length ? (
          <div className="text-sm text-muted">Sem campanhas cadastradas.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {campaignsView.map((campaign) => (
              <div key={campaign.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{campaign.name}</div>
                  <span style={{ background: campaign.statusBg, color: campaign.statusColor, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    {campaign.statusLabel}
                  </span>
                </div>
                <div className="text-sm text-muted">Objetivo: {campaign.objective || '-'}</div>
                <div className="text-sm text-muted">Periodo: {campaign.period || '-'} | Responsavel: {campaign.owner || '-'}</div>
                <div className="text-sm">
                  Meta: <b>{Number(campaign.target || 0)}</b> | Realizado: <b>{Number(campaign.achieved || 0)}</b> | Status: <b>{campaign.statusLabel}</b>
                </div>
                {campaign.autoSource ? (
                  <div className="text-sm text-muted">Realizado automatico com base no painel de produtos.</div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCampaign(campaign.id)}>Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
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
      </div>

      <div className="card">
        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
          Mostrando {products.length} de {total} produto(s) conforme os filtros atuais.
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Nenhum produto encontrado</div>
            <Link to="/produtos/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Produto</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {products.map((p) => <ProductCard key={p.id} product={p} showValues={canViewValues} />)}
          </div>
        )}
      </div>
    </div>
  );
}
