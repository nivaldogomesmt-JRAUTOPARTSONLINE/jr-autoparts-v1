import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientsAPI, soAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const CAMPAIGNS_STORAGE_KEY = 'jr_clients_campaigns';

const DEFAULT_CAMPAIGNS = [
  {
    id: 'cli-campaign-1',
    name: 'Faturamento recorrente',
    objective: 'Aumentar receita da base ativa de clientes',
    period: 'Mensal',
    owner: 'Comercial',
    target: 5000,
    achieved: 0,
    autoSource: 'TOP_REVENUE',
  },
  {
    id: 'cli-campaign-2',
    name: 'Aumentar volume de OS',
    objective: 'Elevar o numero de OS finalizadas',
    period: 'Mensal',
    owner: 'Operacao',
    target: 20,
    achieved: 0,
    autoSource: 'TOP_ORDERS',
  },
];

function formatSummary(summary) {
  if (!summary) return [];
  return [
    ['Clientes criados', summary.clientsCreated],
    ['Clientes atualizados', summary.clientsUpdated],
    ['Veiculos criados', summary.vehiclesCreated],
    ['Veiculos atualizados', summary.vehiclesUpdated],
    ['Rastreadores criados', summary.devicesCreated],
    ['Rastreadores atualizados', summary.devicesUpdated],
    ['Veiculos ignorados', summary.skippedVehicles],
  ];
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
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

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [topClients, setTopClients] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  const [rastrekClientsFile, setRastrekClientsFile] = useState(null);
  const [rastrekVehiclesFile, setRastrekVehiclesFile] = useState(null);
  const [importingRastrek, setImportingRastrek] = useState(false);
  const [rastrekResult, setRastrekResult] = useState(null);
  const [rastrekError, setRastrekError] = useState('');

  const [exportingClients, setExportingClients] = useState(false);
  const [exportingConsolidated, setExportingConsolidated] = useState(false);
  const [campaigns, setCampaigns] = useState(() => getInitialCampaigns());

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientsAPI.list({ search: debouncedSearch, page, limit: 20 });
      setClients(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRanking = async () => {
    setRankingLoading(true);
    try {
      const [doneRes, deliveredRes] = await Promise.all([
        soAPI.list({ status: 'DONE', page: 1, limit: 500 }),
        soAPI.list({ status: 'DELIVERED', page: 1, limit: 500 }),
      ]);

      const allOrders = [...(doneRes.data?.data || []), ...(deliveredRes.data?.data || [])];
      const map = new Map();

      for (const order of allOrders) {
        const clientId = order.client?.id || `name:${order.client?.name || 'Sem cliente'}`;
        const clientName = order.client?.name || 'Sem cliente';
        const revenue = Number(order.totalPrice || 0);

        if (!map.has(clientId)) {
          map.set(clientId, { clientId, clientName, revenue: 0, orders: 0, ticket: 0 });
        }

        const current = map.get(clientId);
        current.revenue += revenue;
        current.orders += 1;
      }

      const ranked = [...map.values()]
        .map((row) => ({ ...row, ticket: row.orders > 0 ? row.revenue / row.orders : 0 }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      setTopClients(ranked);
    } catch (err) {
      console.error(err);
      setTopClients([]);
    } finally {
      setRankingLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [debouncedSearch, page]);

  useEffect(() => {
    loadRanking();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    } catch {
      // ignore storage errors
    }
  }, [campaigns]);

  const runRastrekImport = async (dryRun) => {
    if (!rastrekClientsFile || !rastrekVehiclesFile) {
      setRastrekError('Selecione os dois arquivos da Rastrek antes de continuar.');
      return;
    }

    setImportingRastrek(true);
    setRastrekError('');

    try {
      const res = await clientsAPI.importRastrek(rastrekClientsFile, rastrekVehiclesFile, { dryRun });
      setRastrekResult(res.data);
      await load();
      await loadRanking();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.error || err?.response?.data?.details || 'Erro ao importar arquivos da Rastrek.';
      setRastrekError(message);
    } finally {
      setImportingRastrek(false);
    }
  };

  const exportFilteredClients = async () => {
    setExportingClients(true);
    try {
      const res = await clientsAPI.exportFile({ search: String(debouncedSearch || '').trim() || undefined });
      const today = new Date().toISOString().slice(0, 10);
      downloadXlsxBlob(res.data, `clientes_filtrados_${today}.xlsx`);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Erro ao exportar clientes filtrados.');
    } finally {
      setExportingClients(false);
    }
  };

  const exportConsolidatedClients = async () => {
    setExportingConsolidated(true);
    try {
      const res = await clientsAPI.exportConsolidated({ search: String(debouncedSearch || '').trim() || undefined });
      const today = new Date().toISOString().slice(0, 10);
      downloadXlsxBlob(res.data, `clientes_placas_filtrados_${today}.xlsx`);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Erro ao exportar consolidado de clientes.');
    } finally {
      setExportingConsolidated(false);
    }
  };

  const printFilteredClients = () => {
    const rows = clients.map((c) => `
      <tr>
        <td>${escapeHtml(c.name || '-')}</td>
        <td>${escapeHtml(c.cpfCnpj || '-')}</td>
        <td>${escapeHtml(c.whatsapp || c.phone || '-')}</td>
        <td>${escapeHtml(c.email || '-')}</td>
        <td>${escapeHtml(String(c?._count?.vehicles || 0))}</td>
        <td>${escapeHtml(String(c?._count?.serviceOrders || 0))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Clientes filtrados</title>
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
          <h1>Clientes filtrados</h1>
          <p>Impressao em ${new Date().toLocaleString('pt-BR')} | Exibindo ${clients.length} de ${total}</p>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>CPF/CNPJ</th>
                <th>Telefone</th>
                <th>Email</th>
                <th>Veiculos</th>
                <th>OS</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">Sem dados</td></tr>'}</tbody>
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

  const summaryRows = formatSummary(rastrekResult?.summary);

  const rankingSummary = useMemo(() => {
    const revenue = topClients.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const orders = topClients.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    return {
      totalRevenue: revenue,
      totalOrders: orders,
      avgTicket: orders > 0 ? revenue / orders : 0,
    };
  }, [topClients]);

  const campaignsView = useMemo(() => (
    campaigns.map((campaign) => {
      let achieved = Number(campaign.achieved || 0);
      if (campaign.autoSource === 'TOP_REVENUE') achieved = Number(rankingSummary.totalRevenue || 0);
      if (campaign.autoSource === 'TOP_ORDERS') achieved = Number(rankingSummary.totalOrders || 0);
      const status = getCampaignStatus(campaign.target, achieved);
      return {
        ...campaign,
        achieved,
        statusLabel: status.label,
        statusColor: status.color,
        statusBg: status.bg,
      };
    })
  ), [campaigns, rankingSummary]);

  const addCampaign = () => {
    const name = window.prompt('Nome da campanha:');
    if (!name) return;

    const objective = window.prompt('Objetivo da campanha:', 'Aumentar performance de clientes') || '';
    const period = window.prompt('Periodo (ex: Mensal):', 'Mensal') || 'Mensal';
    const owner = window.prompt('Responsavel:', 'Comercial') || 'Comercial';
    const target = Number(window.prompt('Meta numerica:', '1000') || 0);

    setCampaigns((prev) => [
      {
        id: `cli-campaign-${Date.now()}`,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-subtitle">{total} clientes cadastrados | importacoes/exportacoes em Integracoes</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/integracoes" className="btn btn-outline">Integracoes</Link>
          <button className="btn btn-outline" onClick={exportFilteredClients} disabled={exportingClients || loading}>
            {exportingClients ? 'Exportando...' : 'Exportar filtrados'}
          </button>
          <button className="btn btn-outline" onClick={exportConsolidatedClients} disabled={exportingConsolidated || loading}>
            {exportingConsolidated ? 'Exportando...' : 'Exportar consolidado'}
          </button>
          <button className="btn btn-outline" onClick={printFilteredClients} disabled={loading || !clients.length}>
            Imprimir
          </button>
          <Link to="/clientes/novo" className="btn btn-primary">+ Novo Cliente</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Ranking de clientes por faturamento</div>
        {rankingLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : topClients.length === 0 ? (
          <div className="text-sm text-muted">Sem dados de OS concluidas/entregues para montar ranking.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 10 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                <div className="text-sm text-muted">Receita (Top 8)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>{formatMoney(rankingSummary.totalRevenue)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                <div className="text-sm text-muted">OS consideradas</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>{rankingSummary.totalOrders}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                <div className="text-sm text-muted">Ticket medio</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1A3C5E' }}>{formatMoney(rankingSummary.avgTicket)}</div>
              </div>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>OS</th>
                    <th>Ticket medio</th>
                    <th>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((row, idx) => (
                    <tr key={`${row.clientId}-${idx}`}>
                      <td><strong>{idx + 1}</strong></td>
                      <td>{row.clientName}</td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.ticket)}</td>
                      <td><strong>{formatMoney(row.revenue)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
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
                  <div className="text-sm text-muted">Realizado automatico com base no ranking de clientes.</div>
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
        <input
          className="form-control"
          placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
          Mostrando {clients.length} de {total} cliente(s) conforme os filtros atuais.
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">Clientes</div>
            <div className="empty-state-text">Nenhum cliente encontrado</div>
            <Link to="/clientes/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Cliente</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Veiculos</th>
                  <th>OS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="text-sm text-muted">{c.email}</div>
                    </td>
                    <td className="text-sm">{c.cpfCnpj || '-'}</td>
                    <td className="text-sm">{c.whatsapp || c.phone || '-'}</td>
                    <td><span className="badge badge-blue">{c._count.vehicles}</span></td>
                    <td><span className="badge badge-gray">{c._count.serviceOrders}</span></td>
                    <td>
                      <Link to={`/clientes/${c.id}`} className="btn btn-outline btn-sm">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 20 ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </button>
            <span style={{ padding: '5px 10px', fontSize: 13 }}>Pagina {page} de {Math.ceil(total / 20)}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={clients.length < 20}
            >
              Proxima
            </button>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Importar base Rastrek (clientes + veiculos)</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label className="form-label">Arquivo de clientes (.xls/.xlsx)</label>
            <input
              type="file"
              className="form-control"
              accept=".xls,.xlsx"
              onChange={(e) => setRastrekClientsFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <label className="form-label">Arquivo de veiculos (.xls/.xlsx)</label>
            <input
              type="file"
              className="form-control"
              accept=".xls,.xlsx"
              onChange={(e) => setRastrekVehiclesFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => runRastrekImport(true)}
            disabled={importingRastrek}
          >
            {importingRastrek ? 'Processando...' : 'Simular Importacao'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runRastrekImport(false)}
            disabled={importingRastrek}
          >
            {importingRastrek ? 'Importando...' : 'Importar Agora'}
          </button>
          <Link to="/integracoes" className="btn btn-ghost">Abrir central de integracoes</Link>
        </div>

        {rastrekError ? (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 14 }}>{rastrekError}</div>
        ) : null}

        {rastrekResult ? (
          <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{rastrekResult.message}</div>
            <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Modo: {rastrekResult.mode} | Linhas clientes: {rastrekResult?.totalRows?.clients || 0} | Linhas veiculos: {rastrekResult?.totalRows?.vehicles || 0}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {summaryRows.map(([label, value]) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 6, padding: '8px 10px' }}>
                  <div className="text-sm text-muted">{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
