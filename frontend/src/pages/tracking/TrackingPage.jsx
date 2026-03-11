import { useEffect, useMemo, useState } from 'react';
import { clientsAPI, trackingAPI, vehiclesAPI } from '../../services/api';

const CAMPAIGNS_STORAGE_KEY = 'jr_tracking_campaigns';

const DEFAULT_CAMPAIGNS = [
  {
    id: 'trk-campaign-1',
    name: 'Reducao de inadimplencia',
    objective: 'Diminuir mensalidades em atraso',
    period: 'Mensal',
    owner: 'Financeiro',
    target: 5,
    achieved: 0,
    autoSource: 'OPEN_INVOICES',
  },
  {
    id: 'trk-campaign-2',
    name: 'Ativacao de contratos',
    objective: 'Aumentar contratos ativos',
    period: 'Mensal',
    owner: 'Comercial',
    target: 20,
    achieved: 0,
    autoSource: 'ACTIVE_CONTRACTS',
  },
];

const invoiceBandLabel = {
  ON_TIME: 'Em dia',
  LIGHT: 'Atraso leve (1-30d)',
  INTENSIVE: 'Cobranca intensiva (31-60d)',
  CRITICAL: 'Inadimplente critico (61-90d)',
  RECOVERY: 'Elegivel retirada (+90d)',
};

const deviceStatusLabel = {
  ACTIVE: 'Ativo',
  STOCK: 'Estoque',
  MAINTENANCE: 'Manutencao',
  REMOVED: 'Removido',
};

const deviceStatusBadgeClass = {
  ACTIVE: 'badge-green',
  STOCK: 'badge-blue',
  MAINTENANCE: 'badge-yellow',
  REMOVED: 'badge-red',
};

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

export default function TrackingPage() {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceListLoading, setDeviceListLoading] = useState(false);
  const [jobReferenceMonth, setJobReferenceMonth] = useState('');
  const [deviceFilters, setDeviceFilters] = useState({ search: '', status: 'ALL' });

  const [deviceForm, setDeviceForm] = useState({
    model: '', imei: '', chipNumber: '', carrier: '', status: 'STOCK', clientId: '', vehicleId: '', notes: '',
  });
  const [contractForm, setContractForm] = useState({
    clientId: '', vehicleId: '', deviceId: '', monthlyAmount: '', dueDay: 10, startDate: '', notes: '',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    contractId: '', referenceMonth: '', dueDate: '', amount: '', notes: '',
  });
  const [campaigns, setCampaigns] = useState(() => getInitialCampaigns());

  const loadBaseData = async () => {
    setLoading(true);
    try {
      const [s, c, i, cl, vh, allD] = await Promise.all([
        trackingAPI.summary(),
        trackingAPI.listContracts(),
        trackingAPI.listInvoices(),
        clientsAPI.list({ page: 1, limit: 5000 }),
        vehiclesAPI.list({ page: 1, limit: 5000 }),
        trackingAPI.listDevices(),
      ]);
      setSummary(s.data);
      setContracts(c.data || []);
      setInvoices(i.data || []);
      setClients(cl.data?.data || []);
      setVehicles(vh.data?.data || []);
      setAllDevices(allD.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async (filters = deviceFilters) => {
    setDeviceListLoading(true);
    try {
      const params = {};
      const trimmedSearch = String(filters.search || '').trim();
      if (trimmedSearch) params.search = trimmedSearch;
      if (filters.status && filters.status !== 'ALL') params.status = filters.status;

      const d = await trackingAPI.listDevices(params);
      setDevices(d.data || []);
    } finally {
      setDeviceListLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
    loadDevices({ search: '', status: 'ALL' });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDevices(deviceFilters);
    }, 250);
    return () => clearTimeout(timer);
  }, [deviceFilters.search, deviceFilters.status]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    } catch {
      // ignore storage errors
    }
  }, [campaigns]);

  const overdueInvoices = useMemo(() => (invoices || []).filter((i) => i.daysOverdue > 0 && i.status !== 'PAID'), [invoices]);

  const deviceStats = useMemo(() => {
    const stats = { total: devices.length, ACTIVE: 0, STOCK: 0, MAINTENANCE: 0, REMOVED: 0 };
    devices.forEach((d) => {
      if (stats[d.status] !== undefined) stats[d.status] += 1;
    });
    return stats;
  }, [devices]);

  const campaignsView = useMemo(() => (
    campaigns.map((campaign) => {
      let achieved = Number(campaign.achieved || 0);
      if (campaign.autoSource === 'OPEN_INVOICES') achieved = Number(summary?.openInvoices || 0);
      if (campaign.autoSource === 'ACTIVE_CONTRACTS') achieved = Number(summary?.activeContracts || 0);
      if (campaign.autoSource === 'OPEN_AMOUNT') achieved = Number(summary?.openAmount || 0);
      const status = getCampaignStatus(campaign.target, achieved);
      return {
        ...campaign,
        achieved,
        statusLabel: status.label,
        statusColor: status.color,
        statusBg: status.bg,
      };
    })
  ), [campaigns, summary]);

  const addCampaign = () => {
    const name = window.prompt('Nome da campanha:');
    if (!name) return;

    const objective = window.prompt('Objetivo da campanha:', 'Melhorar indicadores de rastreamento') || '';
    const period = window.prompt('Periodo (ex: Mensal):', 'Mensal') || 'Mensal';
    const owner = window.prompt('Responsavel:', 'Financeiro') || 'Financeiro';
    const target = Number(window.prompt('Meta numerica:', '10') || 0);

    setCampaigns((prev) => [
      {
        id: `trk-campaign-${Date.now()}`,
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

  const submitDevice = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await trackingAPI.createDevice(deviceForm);
      setDeviceForm({ model: '', imei: '', chipNumber: '', carrier: '', status: 'STOCK', clientId: '', vehicleId: '', notes: '' });
      await Promise.all([loadBaseData(), loadDevices()]);
      alert('Rastreador cadastrado com sucesso.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cadastrar rastreador.');
    } finally {
      setSaving(false);
    }
  };

  const submitContract = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await trackingAPI.createContract(contractForm);
      setContractForm({ clientId: '', vehicleId: '', deviceId: '', monthlyAmount: '', dueDay: 10, startDate: '', notes: '' });
      await loadBaseData();
      alert('Contrato criado com sucesso.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar contrato.');
    } finally {
      setSaving(false);
    }
  };

  const submitInvoice = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await trackingAPI.createInvoice(invoiceForm);
      setInvoiceForm({ contractId: '', referenceMonth: '', dueDate: '', amount: '', notes: '' });
      await loadBaseData();
      alert('Mensalidade criada com sucesso.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar mensalidade.');
    } finally {
      setSaving(false);
    }
  };

  const payInvoice = async (id) => {
    if (!confirm('Confirmar baixa de pagamento desta mensalidade?')) return;
    setSaving(true);
    try {
      await trackingAPI.payInvoice(id);
      await loadBaseData();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao baixar mensalidade.');
    } finally {
      setSaving(false);
    }
  };

  const runJobs = async () => {
    setSaving(true);
    try {
      await trackingAPI.runJobs(jobReferenceMonth ? { referenceMonth: jobReferenceMonth } : {});
      await loadBaseData();
      alert('Rotinas de rastreamento executadas com sucesso.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao executar rotinas.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Rastreamento e Mensalidades</h1>
          <p>Controle de rastreadores, contratos e inadimplencia.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-control" style={{ width: 130 }} placeholder="YYYY-MM" value={jobReferenceMonth} onChange={(e) => setJobReferenceMonth(e.target.value)} />
          <button className="btn btn-outline" onClick={runJobs} disabled={saving}>Rodar cobranca</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
        <div className="card"><div style={{ fontSize: 12, color: '#64748b' }}>Rastreadores</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary?.devices || 0}</div></div>
        <div className="card"><div style={{ fontSize: 12, color: '#64748b' }}>Contratos ativos</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary?.activeContracts || 0}</div></div>
        <div className="card"><div style={{ fontSize: 12, color: '#64748b' }}>Mensalidades em aberto</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary?.openInvoices || 0}</div></div>
        <div className="card"><div style={{ fontSize: 12, color: '#64748b' }}>Valor em aberto</div><div style={{ fontSize: 28, fontWeight: 700 }}>R$ {Number(summary?.openAmount || 0).toFixed(2).replace('.', ',')}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Prioridade de cobranca</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          <div>1-30 dias: <b>{summary?.delinquency?.light || 0}</b></div>
          <div>31-60 dias: <b>{summary?.delinquency?.intensive || 0}</b></div>
          <div>61-90 dias: <b>{summary?.delinquency?.critical || 0}</b></div>
          <div>+90 dias: <b>{summary?.delinquency?.recovery || 0}</b></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Metas e campanhas</h3>
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
                  <div className="text-sm text-muted">Realizado automatico com base no painel de rastreamento.</div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Listagem de rastreadores</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-gray">Total: {deviceStats.total}</span>
            <span className="badge badge-green">Ativo: {deviceStats.ACTIVE}</span>
            <span className="badge badge-blue">Estoque: {deviceStats.STOCK}</span>
            <span className="badge badge-yellow">Manutencao: {deviceStats.MAINTENANCE}</span>
            <span className="badge badge-red">Removido: {deviceStats.REMOVED}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(260px, 1fr) 190px auto', marginBottom: 10 }}>
          <input
            className="form-control"
            placeholder="Buscar por placa, cliente, IMEI, modelo ou chip"
            value={deviceFilters.search}
            onChange={(e) => setDeviceFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <select
            className="form-control"
            value={deviceFilters.status}
            onChange={(e) => setDeviceFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="STOCK">Estoque</option>
            <option value="MAINTENANCE">Manutencao</option>
            <option value="REMOVED">Removido</option>
          </select>
          <button className="btn btn-outline" onClick={() => setDeviceFilters({ search: '', status: 'ALL' })}>
            Limpar filtros
          </button>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Placa</th>
                <th>IMEI</th>
                <th>Modelo</th>
                <th>Chip</th>
                <th>Operadora</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deviceListLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted">Carregando rastreadores...</td>
                </tr>
              ) : devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted">Nenhum rastreador encontrado para os filtros informados.</td>
                </tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id}>
                    <td>{d.client?.name || '-'}</td>
                    <td>{d.vehicle?.plate || '-'}</td>
                    <td>{d.imei}</td>
                    <td>{d.model || '-'}</td>
                    <td>{d.chipNumber || '-'}</td>
                    <td>{d.carrier || '-'}</td>
                    <td>
                      <span className={`badge ${deviceStatusBadgeClass[d.status] || 'badge-gray'}`}>
                        {deviceStatusLabel[d.status] || d.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <form className="card" onSubmit={submitDevice}>
          <h3>Cadastrar rastreador</h3>
          <div className="form-group"><label>Modelo</label><input className="form-control" value={deviceForm.model} onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })} required /></div>
          <div className="form-group"><label>IMEI</label><input className="form-control" value={deviceForm.imei} onChange={(e) => setDeviceForm({ ...deviceForm, imei: e.target.value })} required /></div>
          <div className="form-group"><label>Chip</label><input className="form-control" value={deviceForm.chipNumber} onChange={(e) => setDeviceForm({ ...deviceForm, chipNumber: e.target.value })} /></div>
          <div className="form-group"><label>Operadora</label><input className="form-control" value={deviceForm.carrier} onChange={(e) => setDeviceForm({ ...deviceForm, carrier: e.target.value })} /></div>
          <div className="form-group"><label>Cliente</label><select className="form-control" value={deviceForm.clientId} onChange={(e) => setDeviceForm({ ...deviceForm, clientId: e.target.value })}><option value="">Nao vinculado</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group"><label>Veiculo</label><select className="form-control" value={deviceForm.vehicleId} onChange={(e) => setDeviceForm({ ...deviceForm, vehicleId: e.target.value })}><option value="">Nao vinculado</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>)}</select></div>
          <button className="btn btn-primary" disabled={saving}>Salvar rastreador</button>
        </form>

        <form className="card" onSubmit={submitContract}>
          <h3>Criar contrato</h3>
          <div className="form-group"><label>Cliente</label><select className="form-control" value={contractForm.clientId} onChange={(e) => setContractForm({ ...contractForm, clientId: e.target.value })} required><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group"><label>Veiculo</label><select className="form-control" value={contractForm.vehicleId} onChange={(e) => setContractForm({ ...contractForm, vehicleId: e.target.value })} required><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>)}</select></div>
          <div className="form-group"><label>Rastreador</label><select className="form-control" value={contractForm.deviceId} onChange={(e) => setContractForm({ ...contractForm, deviceId: e.target.value })} required><option value="">Selecione</option>{allDevices.map((d) => <option key={d.id} value={d.id}>{d.model} - {d.imei}</option>)}</select></div>
          <div className="form-group"><label>Valor mensal</label><input className="form-control" type="number" step="0.01" value={contractForm.monthlyAmount} onChange={(e) => setContractForm({ ...contractForm, monthlyAmount: e.target.value })} required /></div>
          <div className="form-group"><label>Dia vencimento</label><input className="form-control" type="number" min="1" max="28" value={contractForm.dueDay} onChange={(e) => setContractForm({ ...contractForm, dueDay: e.target.value })} required /></div>
          <div className="form-group"><label>Inicio</label><input className="form-control" type="date" value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} required /></div>
          <button className="btn btn-primary" disabled={saving}>Salvar contrato</button>
        </form>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
        <form className="card" onSubmit={submitInvoice}>
          <h3>Gerar mensalidade</h3>
          <div className="form-group"><label>Contrato</label><select className="form-control" value={invoiceForm.contractId} onChange={(e) => setInvoiceForm({ ...invoiceForm, contractId: e.target.value })} required><option value="">Selecione</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.client?.name} - {c.vehicle?.plate}</option>)}</select></div>
          <div className="form-group"><label>Competencia (YYYY-MM)</label><input className="form-control" placeholder="2026-03" value={invoiceForm.referenceMonth} onChange={(e) => setInvoiceForm({ ...invoiceForm, referenceMonth: e.target.value })} required /></div>
          <div className="form-group"><label>Vencimento</label><input className="form-control" type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} required /></div>
          <div className="form-group"><label>Valor</label><input className="form-control" type="number" step="0.01" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} required /></div>
          <button className="btn btn-primary" disabled={saving}>Criar mensalidade</button>
        </form>

        <div className="card">
          <h3>Mensalidades com atraso</h3>
          {overdueInvoices.length === 0 ? (
            <p style={{ color: '#64748b' }}>Sem inadimplencia no momento.</p>
          ) : (
            <div style={{ maxHeight: 280, overflow: 'auto', display: 'grid', gap: 8 }}>
              {overdueInvoices.map((inv) => (
                <div key={inv.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{inv.contract?.client?.name} - {inv.contract?.vehicle?.plate}</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{inv.referenceMonth} | {inv.daysOverdue} dias | {invoiceBandLabel[inv.delinquencyBand]}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>R$ {Number(inv.amount).toFixed(2).replace('.', ',')}</div>
                  <button className="btn btn-sm btn-outline" onClick={() => payInvoice(inv.id)} disabled={saving} style={{ marginTop: 6 }}>Baixar pagamento</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

