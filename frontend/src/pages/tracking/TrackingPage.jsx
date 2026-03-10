import { useEffect, useMemo, useState } from 'react';
import { clientsAPI, trackingAPI, vehiclesAPI } from '../../services/api';

const invoiceBandLabel = {
  ON_TIME: 'Em dia',
  LIGHT: 'Atraso leve (1-30d)',
  INTENSIVE: 'Cobranca intensiva (31-60d)',
  CRITICAL: 'Inadimplente critico (61-90d)',
  RECOVERY: 'Elegivel retirada (+90d)',
};

export default function TrackingPage() {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deviceForm, setDeviceForm] = useState({
    model: '', imei: '', chipNumber: '', carrier: '', status: 'STOCK', clientId: '', vehicleId: '', notes: '',
  });
  const [contractForm, setContractForm] = useState({
    clientId: '', vehicleId: '', deviceId: '', monthlyAmount: '', dueDay: 10, startDate: '', notes: '',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    contractId: '', referenceMonth: '', dueDate: '', amount: '', notes: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, d, c, i, cl, vh] = await Promise.all([
        trackingAPI.summary(),
        trackingAPI.listDevices(),
        trackingAPI.listContracts(),
        trackingAPI.listInvoices(),
        clientsAPI.list({ limit: 500 }),
        vehiclesAPI.list({ limit: 500 }),
      ]);
      setSummary(s.data);
      setDevices(d.data || []);
      setContracts(c.data || []);
      setInvoices(i.data || []);
      setClients(cl.data?.data || []);
      setVehicles(vh.data?.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const overdueInvoices = useMemo(() => (invoices || []).filter((i) => i.daysOverdue > 0 && i.status !== 'PAID'), [invoices]);

  const submitDevice = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await trackingAPI.createDevice(deviceForm);
      setDeviceForm({ model: '', imei: '', chipNumber: '', carrier: '', status: 'STOCK', clientId: '', vehicleId: '', notes: '' });
      await loadAll();
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
      await loadAll();
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
      await loadAll();
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
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao baixar mensalidade.');
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
          <div className="form-group"><label>Rastreador</label><select className="form-control" value={contractForm.deviceId} onChange={(e) => setContractForm({ ...contractForm, deviceId: e.target.value })} required><option value="">Selecione</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.model} - {d.imei}</option>)}</select></div>
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

