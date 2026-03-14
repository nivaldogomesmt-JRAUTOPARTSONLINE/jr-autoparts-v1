import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { maintenanceAPI, trackingAPI, vehiclesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const ALERT_COLOR = { OVERDUE: '#dc2626', DUE_SOON: '#f59e0b', OK: '#16a34a' };
const ALERT_LABEL = { OVERDUE: 'Urgencia', DUE_SOON: 'Atencao', OK: 'OK' };
const RASTREK_BASE_URL = 'https://painel.rastrek.com.br'; // fallback — ajuste se necessário

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function asNumberOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();

  const [vehicle, setVehicle] = useState(null);
  const [maint, setMaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingMap, setSavingMap] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [forms, setForms] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [trackingDevices, setTrackingDevices] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [v, m] = await Promise.all([vehiclesAPI.get(id), maintenanceAPI.byVehicle(id)]);
      setVehicle(v.data);
      setMaint(m.data);
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar dados do veiculo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!maint?.maintenances?.length) {
      setForms({});
      return;
    }

    const next = {};
    for (const m of maint.maintenances) {
      next[m.id] = {
        label: m.label || '',
        intervalKm: asNumberOrEmpty(m.intervalKm),
        intervalMonths: asNumberOrEmpty(m.intervalMonths),
        lastDate: toDateInput(m.lastDate),
        lastKm: asNumberOrEmpty(m.lastKm),
      };
    }
    setForms(next);
  }, [maint]);

  useEffect(() => {
    if (!vehicle?.id) return;
    trackingAPI.listDevices({ search: vehicle.plate })
      .then(res => {
        const devs = (res.data || []).filter(d => d.vehicleId === vehicle.id);
        setTrackingDevices(devs);
      })
      .catch(() => {});
  }, [vehicle?.id, vehicle?.plate]);

  const maintenanceList = useMemo(() => maint?.maintenances || [], [maint]);

  const setField = (maintenanceId, key, value) => {
    setForms((prev) => ({
      ...prev,
      [maintenanceId]: {
        ...(prev[maintenanceId] || {}),
        [key]: value,
      },
    }));
  };

  const saveMaintenance = async (m) => {
    const values = forms[m.id] || {};
    setSavingMap((prev) => ({ ...prev, [m.id]: true }));
    setError('');
    setInfo('');

    try {
      await maintenanceAPI.update(m.id, {
        label: values.label,
        intervalKm: values.intervalKm,
        intervalMonths: values.intervalMonths,
        lastDate: values.lastDate || null,
        lastKm: values.lastKm,
      });
      setInfo(`Item ${values.label || m.label} atualizado com sucesso.`);
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Erro ao salvar item de manutencao.');
    } finally {
      setSavingMap((prev) => ({ ...prev, [m.id]: false }));
    }
  };



  const removeVehicle = async () => {
    if (!can('delete')) return;

    const hardDelete = user?.role === 'ADMIN'
      ? window.confirm('Exclusao definitiva? OK = definitiva | Cancelar = apenas desativar')
      : false;

    const question = hardDelete
      ? 'Confirmar EXCLUSAO DEFINITIVA do veiculo? Esta acao nao pode ser desfeita.'
      : 'Confirmar desativacao do veiculo?';

    if (!window.confirm(question)) return;

    setDeleting(true);
    try {
      await vehiclesAPI.remove(id, hardDelete ? { hard: true } : undefined);
      window.alert(hardDelete ? 'Veiculo excluido definitivamente.' : 'Veiculo desativado.');
      navigate('/veiculos');
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao excluir veiculo.');
    } finally {
      setDeleting(false);
    }
  };

  const initializeMaintenances = async () => {
    setError('');
    setInfo('');
    setSavingMap((prev) => ({ ...prev, __init: true }));
    try {
      const res = await maintenanceAPI.initialize(id);
      setInfo(res?.data?.message || 'Itens de manutencao inicializados.');
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Erro ao inicializar manutencoes do veiculo.');
    } finally {
      setSavingMap((prev) => ({ ...prev, __init: false }));
    }
  };

  const handleCopyImei = (imei) => {
    if (!imei) return;
    navigator.clipboard.writeText(imei).catch(() => {});
  };

  const handleOpenRastrek = (device) => {
    if (device?.rastrekLink) { window.open(device.rastrekLink, '_blank', 'noopener'); return; }
    const q = vehicle?.plate || device?.imei || '';
    window.open(`${RASTREK_BASE_URL}?q=${encodeURIComponent(q)}`, '_blank', 'noopener');
  };

  const TRACKING_STATUS_LABEL = { ACTIVE: 'Ativo', STOCK: 'Estoque', MAINTENANCE: 'Em Manutenção', REMOVED: 'Removido' };
  const TRACKING_STATUS_BADGE = { ACTIVE: 'badge-green', STOCK: 'badge-blue', MAINTENANCE: 'badge-yellow', REMOVED: 'badge-red' };
  const activeDevice = trackingDevices.find(d => d.status === 'ACTIVE') || trackingDevices[0] || null;

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!vehicle) return <div className="alert alert-error">Veiculo nao encontrado.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{vehicle.plate} - {vehicle.brand} {vehicle.model}</div>
          <div className="page-subtitle">
            {vehicle.year} - {vehicle.color} - <Link to={`/clientes/${vehicle.clientId}`}>{vehicle.client?.name}</Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
          <button className="btn btn-outline btn-sm" onClick={initializeMaintenances} disabled={savingMap.__init}>
            {savingMap.__init ? 'Inicializando...' : 'Criar Itens Padrao'}
          </button>
          <Link to={`/veiculos/${id}/editar`} className="btn btn-outline btn-sm">Editar</Link>
          <Link to={`/os/nova?vehicleId=${id}`} className="btn btn-primary btn-sm">+ Nova OS</Link>
          {can('delete') ? (
            <button className="btn btn-danger btn-sm" onClick={removeVehicle} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {info ? <div className="alert alert-success" style={{ marginBottom: 12 }}>{info}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Manutencao Preventiva (configuravel por cliente/veiculo)</div>

            {maintenanceList.length === 0 ? (
              <div className="text-sm text-muted">Nenhum item cadastrado. Clique em "Criar Itens Padrao".</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {maintenanceList.map((m) => {
                  const values = forms[m.id] || {};
                  return (
                    <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>{m.label}</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: ALERT_COLOR[m.alertLevel || 'OK'] }}>
                          {ALERT_LABEL[m.alertLevel || 'OK']}
                        </span>
                      </div>

                      <div className="form-row" style={{ marginBottom: 8 }}>
                        <div className="form-group">
                          <label className="form-label">Nome do item</label>
                          <input
                            className="form-control"
                            value={values.label || ''}
                            onChange={(e) => setField(m.id, 'label', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Intervalo KM</label>
                          <input
                            type="number"
                            className="form-control"
                            value={values.intervalKm || ''}
                            onChange={(e) => setField(m.id, 'intervalKm', e.target.value)}
                            placeholder="Ex: 7000"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Intervalo meses</label>
                          <input
                            type="number"
                            className="form-control"
                            value={values.intervalMonths || ''}
                            onChange={(e) => setField(m.id, 'intervalMonths', e.target.value)}
                            placeholder="Ex: 6"
                          />
                        </div>
                      </div>

                      <div className="form-row" style={{ marginBottom: 8 }}>
                        <div className="form-group">
                          <label className="form-label">Ultima troca (data)</label>
                          <input
                            type="date"
                            className="form-control"
                            value={values.lastDate || ''}
                            onChange={(e) => setField(m.id, 'lastDate', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Ultima troca (km)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={values.lastKm || ''}
                            onChange={(e) => setField(m.id, 'lastKm', e.target.value)}
                            placeholder="Ex: 163000"
                          />
                        </div>
                        <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => saveMaintenance(m)} disabled={!!savingMap[m.id]}>
                            {savingMap[m.id] ? 'Salvando...' : 'Salvar Item'}
                          </button>
                        </div>
                      </div>

                      <div className="text-sm text-muted">
                        Proxima prevista: {m.nextDate ? new Date(m.nextDate).toLocaleDateString('pt-BR') : '-'}
                        {' | '}
                        {m.nextKm ? `${Number(m.nextKm).toLocaleString('pt-BR')} km` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Historico de OS</div>
            {vehicle.serviceOrders.length === 0 ? (
              <div className="text-muted text-sm">Sem OS finalizadas.</div>
            ) : (
              vehicle.serviceOrders.map((os) => (
                <Link
                  key={os.id}
                  to={`/os/${os.id}`}
                  style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>OS #{os.number}</span>
                    <span className="text-sm text-muted">{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="text-sm text-muted">{os.items?.length} itens - R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}</div>
                </Link>
              ))
            )}
          </div>


          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Rastreamento</div>
            {!activeDevice ? (
              <div className="text-sm text-muted">Nenhum rastreador vinculado a este veículo.</div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className={`badge ${TRACKING_STATUS_BADGE[activeDevice.status] || 'badge-blue'}`}>{TRACKING_STATUS_LABEL[activeDevice.status] || activeDevice.status}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" title="Abrir na Rastrek" onClick={() => handleOpenRastrek(activeDevice)}>🔗 Rastrek</button>
                    <button className="btn btn-ghost btn-sm" title="Copiar IMEI" onClick={() => handleCopyImei(activeDevice.imei)}>📋 IMEI</button>
                  </div>
                </div>
                {[
                  ['IMEI', activeDevice.imei],
                  ['Equipamento', activeDevice.model],
                  ['Instalado em', activeDevice.installedAt ? new Date(activeDevice.installedAt).toLocaleDateString('pt-BR') : null],
                  ['Chip', activeDevice.chipNumber],
                  ['Operadora', activeDevice.carrier],
                ].map(([label, value]) => value ? (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc', fontSize: 14 }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{value}</span>
                  </div>
                ) : null)}
                {activeDevice.notes && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>{activeDevice.notes}</div>
                )}
                {trackingDevices.length > 1 && (
                  <div className="text-sm text-muted" style={{ marginTop: 8 }}>{trackingDevices.length} rastreadores vinculados. Exibindo o mais recente ativo.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Dados do Veiculo</div>
          {vehicle.photoUrl ? (
            <div style={{ marginBottom: 12 }}>
              <img src={vehicle.photoUrl} alt={`Veiculo ${vehicle.plate}`} style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
            </div>
          ) : null}
          {[
            ['Placa', vehicle.plate],
            ['Marca', vehicle.brand],
            ['Modelo', vehicle.model],
            ['Ano', vehicle.year],
            ['Cor', vehicle.color],
            ['Combustivel', vehicle.fuel],
            ['KM Atual', vehicle.currentKm ? `${Number(vehicle.currentKm).toLocaleString('pt-BR')} km` : '-'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 14 }}>
              <span style={{ color: '#64748b' }}>{l}</span>
              <span style={{ fontWeight: 600 }}>{v || '-'}</span>
            </div>
          ))}

          {vehicle.notes ? (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
              {vehicle.notes}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


