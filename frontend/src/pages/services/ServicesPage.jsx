import { useEffect, useMemo, useState } from 'react';
import { servicesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const CAMPAIGNS_STORAGE_KEY = 'jr_services_campaigns';

const DEFAULT_CAMPAIGNS = [
  {
    id: 'srv-campaign-1',
    name: 'Revisao Premium',
    objective: 'Aumentar venda de revisoes completas',
    period: 'Mensal',
    owner: 'Atendimento',
    target: 20,
    achieved: 0,
    autoSource: 'TOP_SERVICE_COUNT',
  },
];

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m ? ` ${m}min` : ''}`;
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
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
  if (safeTarget <= 0) {
    return { label: 'Sem meta', color: '#334155', bg: '#e2e8f0' };
  }

  const ratio = safeAchieved / safeTarget;
  if (ratio >= 1) {
    return { label: 'Em meta', color: '#166534', bg: '#dcfce7' };
  }

  if (ratio >= 0.7) {
    return { label: 'Em acompanhamento', color: '#92400e', bg: '#fef3c7' };
  }

  return { label: 'Atencao', color: '#991b1b', bg: '#fee2e2' };
}

export default function ServicesPage() {
  const { can } = useAuth();
  const canViewValues = can('sensitive:viewValues');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 280);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', estimatedTime: '' });
  const [error, setError] = useState('');

  const [campaigns, setCampaigns] = useState(() => getInitialCampaigns());
  const [campaignModal, setCampaignModal] = useState(false);
  const [campaignEditingId, setCampaignEditingId] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    objective: '',
    period: 'Mensal',
    owner: 'Atendimento',
    target: '',
    achieved: '',
    autoSource: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await servicesAPI.list({ active: 'true', search: debouncedSearch });
      setServices(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await servicesAPI.overview();
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
  }, [debouncedSearch]);

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

  const openModal = (svc = null) => {
    setEditing(svc);
    setForm(
      svc
        ? {
          name: svc.name,
          description: svc.description || '',
          price: svc.price,
          estimatedTime: svc.estimatedTime || '',
        }
        : { name: '', description: '', price: '', estimatedTime: '' }
    );
    setError('');
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      if (editing) await servicesAPI.update(editing.id, form);
      else await servicesAPI.create(form);

      setModal(false);
      await load();
      await loadOverview();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar servico.');
    }
  };

  const resumo = useMemo(() => {
    const totals = overview?.totals || {};
    const topRevenue = overview?.rankings?.topByRevenue || [];
    const topQty = overview?.rankings?.topByQuantity || [];

    return {
      totalServices: Number(totals.services || services.length || 0),
      noSales: Number(totals.noSales || 0),
      averagePrice: Number(totals.averagePrice || 0),
      topRevenueName: topRevenue[0]?.name || '-',
      topQtyName: topQty[0]?.name || '-',
    };
  }, [overview, services.length]);

  const campaignsView = useMemo(() => {
    const topExecutedCount = Number(overview?.rankings?.topByQuantity?.[0]?.count || 0);

    return campaigns.map((campaign) => {
      const achieved = campaign.autoSource === 'TOP_SERVICE_COUNT'
        ? topExecutedCount
        : Number(campaign.achieved || 0);
      const status = getCampaignStatus(campaign.target, achieved);

      return {
        ...campaign,
        achieved,
        statusLabel: status.label,
        statusColor: status.color,
        statusBg: status.bg,
      };
    });
  }, [campaigns, overview]);

  const openCampaignModal = (campaign = null) => {
    if (campaign) {
      setCampaignEditingId(campaign.id);
      setCampaignForm({
        name: campaign.name || '',
        objective: campaign.objective || '',
        period: campaign.period || 'Mensal',
        owner: campaign.owner || 'Atendimento',
        target: campaign.target ?? '',
        achieved: campaign.achieved ?? '',
        autoSource: campaign.autoSource || '',
      });
    } else {
      setCampaignEditingId(null);
      setCampaignForm({
        name: '',
        objective: '',
        period: 'Mensal',
        owner: 'Atendimento',
        target: '',
        achieved: '',
        autoSource: '',
      });
    }

    setCampaignModal(true);
  };

  const saveCampaign = (e) => {
    e.preventDefault();

    const payload = {
      id: campaignEditingId || `srv-campaign-${Date.now()}`,
      name: String(campaignForm.name || '').trim(),
      objective: String(campaignForm.objective || '').trim(),
      period: String(campaignForm.period || 'Mensal').trim(),
      owner: String(campaignForm.owner || 'Atendimento').trim(),
      target: Number(campaignForm.target || 0),
      achieved: Number(campaignForm.achieved || 0),
      autoSource: campaignForm.autoSource || '',
    };

    if (!payload.name) {
      window.alert('Informe o nome da campanha.');
      return;
    }

    if (campaignEditingId) {
      setCampaigns((prev) => prev.map((row) => (row.id === campaignEditingId ? payload : row)));
    } else {
      setCampaigns((prev) => [payload, ...prev]);
    }

    setCampaignModal(false);
  };

  const removeCampaign = (id) => {
    if (!window.confirm('Remover esta campanha?')) return;
    setCampaigns((prev) => prev.filter((row) => row.id !== id));
  };

  const exportFilteredServices = () => {
    if (!services.length) {
      window.alert('Nao ha servicos para exportar.');
      return;
    }

    const header = ['Servico', 'Descricao', 'Preco', 'Tempo estimado (min)', 'Tempo formatado'];
    const rows = services.map((service) => ([
      service.name || '',
      service.description || '',
      Number(service.price || 0).toFixed(2),
      String(service.estimatedTime || ''),
      formatMinutes(service.estimatedTime),
    ]));

    const csv = [header, ...rows]
      .map((line) => line.map(csvEscape).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `servicos_filtrados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Servicos</div>
          <div className="page-subtitle">Tela gerencial de execucao, receita e eficiencia</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canViewValues ? <button className="btn btn-outline" onClick={exportFilteredServices}>Exportar filtrados</button> : null}
          <button className="btn btn-primary" onClick={() => openModal()}>+ Novo Servico</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Servicos ativos</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>{resumo.totalServices}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Maior receita</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#166534' }}>{resumo.topRevenueName}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Mais executado</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1d4ed8' }}>{resumo.topQtyName}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Pouca saida</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ca8a04' }}>{resumo.noSales}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Preco medio</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{canViewValues ? formatMoney(resumo.averagePrice) : 'Restrito'}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Ranking por receita</div>
          {overviewLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : !(overview?.rankings?.topByRevenue || []).length ? (
            <div className="text-sm text-muted">Sem dados de execucao ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {overview.rankings.topByRevenue.slice(0, 6).map((row) => (
                <div key={`rev-${row.rank}-${row.name}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{row.rank}. {row.name}</div>
                  <div className="text-sm text-muted">Qtd: {row.quantity} | Receita: {canViewValues ? formatMoney(row.revenue) : 'Restrito'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Ranking por execucao</div>
          {overviewLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : !(overview?.rankings?.topByQuantity || []).length ? (
            <div className="text-sm text-muted">Sem dados de execucao ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {overview.rankings.topByQuantity.slice(0, 6).map((row) => (
                <div key={`qty-${row.rank}-${row.name}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{row.rank}. {row.name}</div>
                  <div className="text-sm text-muted">Qtd: {row.quantity} | Receita: {canViewValues ? formatMoney(row.revenue) : 'Restrito'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Mais demorados</div>
          {overviewLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : !(overview?.slowRows || []).length ? (
            <div className="text-sm text-muted">Sem tempo estimado configurado.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {overview.slowRows.slice(0, 6).map((row) => (
                <div key={`slow-${row.id}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{row.name}</div>
                  <div className="text-sm text-muted">Tempo: {formatMinutes(row.estimatedTime)} | Preco: {canViewValues ? formatMoney(row.price) : 'Restrito'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Metas e campanhas</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="text-sm text-muted">Planejamento operacional de servicos</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCampaignModal()}>+ Nova campanha</button>
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
                  {campaign.autoSource === 'TOP_SERVICE_COUNT' ? (
                    <div className="text-sm text-muted">Realizado automatico: total de execucoes do servico mais executado.</div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCampaignModal(campaign)}>Editar</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCampaign(campaign.id)}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-sm text-muted">Margem: estrutura pronta para calculo automatico quando houver custo de servico.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="Buscar por nome ou descricao do servico..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">Servicos</div>
            <div className="empty-state-text">Nenhum servico encontrado</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Servico</th>
                  <th>Descricao</th>
                  <th>Preco</th>
                  <th>Tempo estimado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td className="text-sm text-muted">{s.description || '-'}</td>
                    <td><strong style={{ color: '#1A3C5E' }}>{canViewValues ? formatMoney(s.price) : 'Restrito'}</strong></td>
                    <td className="text-sm">{formatMinutes(s.estimatedTime)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openModal(s)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Editar servico' : 'Novo servico'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>Fechar</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label className="form-label required">Nome do servico</label>
                  <input className="form-control" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Descricao</label>
                  <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Preco (R$)</label>
                    {canViewValues ? (
                      <input type="number" step="0.01" className="form-control" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
                    ) : (
                      <input type="text" className="form-control" value="Restrito" disabled />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tempo estimado (minutos)</label>
                    <input type="number" className="form-control" value={form.estimatedTime} onChange={(e) => setForm((f) => ({ ...f, estimatedTime: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {campaignModal && (
        <div className="modal-overlay" onClick={() => setCampaignModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{campaignEditingId ? 'Editar campanha' : 'Nova campanha'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setCampaignModal(false)}>Fechar</button>
            </div>
            <form onSubmit={saveCampaign}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Nome</label>
                  <input className="form-control" value={campaignForm.name} onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Objetivo</label>
                  <input className="form-control" value={campaignForm.objective} onChange={(e) => setCampaignForm((prev) => ({ ...prev, objective: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Periodo</label>
                    <input className="form-control" value={campaignForm.period} onChange={(e) => setCampaignForm((prev) => ({ ...prev, period: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Responsavel</label>
                    <input className="form-control" value={campaignForm.owner} onChange={(e) => setCampaignForm((prev) => ({ ...prev, owner: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Meta</label>
                    <input type="number" className="form-control" value={campaignForm.target} onChange={(e) => setCampaignForm((prev) => ({ ...prev, target: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Realizado (manual)</label>
                    <input type="number" className="form-control" value={campaignForm.achieved} onChange={(e) => setCampaignForm((prev) => ({ ...prev, achieved: e.target.value }))} disabled={campaignForm.autoSource === 'TOP_SERVICE_COUNT'} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fonte do realizado</label>
                  <select className="form-control" value={campaignForm.autoSource} onChange={(e) => setCampaignForm((prev) => ({ ...prev, autoSource: e.target.value }))}>
                    <option value="">Manual</option>
                    <option value="TOP_SERVICE_COUNT">Automatico pelo servico mais executado</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setCampaignModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar campanha</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

