import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { maintenanceAPI, trackingAPI, vehiclesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const ALERT_COLOR = { OVERDUE: '#dc2626', DUE_SOON: '#f59e0b', OK: '#16a34a' };
const ALERT_LABEL = { OVERDUE: 'Urgencia', DUE_SOON: 'Atencao', OK: 'Em dia' };
const RASTREK_BASE_URL = 'https://painel.rastrek.com.br';

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatKm(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

function resolveNextMaintenance(maintenances) {
  if (!maintenances?.length) return null;
  const prioritized = [...maintenances].sort((a, b) => {
    const order = { OVERDUE: 0, DUE_SOON: 1, OK: 2 };
    const alertDiff = (order[a.alertLevel] ?? 9) - (order[b.alertLevel] ?? 9);
    if (alertDiff !== 0) return alertDiff;
    return new Date(a.nextDate || '2999-12-31') - new Date(b.nextDate || '2999-12-31');
  });
  return prioritized[0];
}

function MaintenanceSummaryCard({ title, item }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${ALERT_COLOR[item?.alertLevel || 'OK']}` }}>
      <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{item?.label || 'Nao configurado'}</div>
      <div className="text-sm text-muted" style={{ marginTop: 6 }}>Data: {formatDate(item?.nextDate)}</div>
      <div className="text-sm text-muted">KM: {formatKm(item?.nextKm)}</div>
      <div style={{ marginTop: 8 }}><span className={`badge ${item?.alertLevel === 'OVERDUE' ? 'badge-red' : item?.alertLevel === 'DUE_SOON' ? 'badge-yellow' : 'badge-green'}`}>{ALERT_LABEL[item?.alertLevel || 'OK']}</span></div>
    </div>
  );
}

const ServiceOrderRow = memo(function ServiceOrderRow({ order }) {
  return (
    <Link to={`/os/${order.id}`} style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>OS #{order.number}</div>
          <div className="text-sm text-muted">{order.items?.length || 0} item(ns) � {formatDate(order.createdAt)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="badge badge-blue">{order.status}</span>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{Number(order.totalPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        </div>
      </div>
    </Link>
  );
});

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [maint, setMaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [trackingDevices, setTrackingDevices] = useState([]);
  const [openMaintenance, setOpenMaintenance] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [vehicleRes, maintenanceRes] = await Promise.all([vehiclesAPI.get(id), maintenanceAPI.byVehicle(id)]);
      setVehicle(vehicleRes.data);
      setMaint(maintenanceRes.data);
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
    if (!maint?.maintenances?.length) return;
    const initialState = {};
    for (const item of maint.maintenances) {
      if (item.alertLevel === 'OVERDUE' || item.alertLevel === 'DUE_SOON') {
        initialState[item.id] = true;
      }
    }
    setOpenMaintenance(initialState);
  }, [maint]);

  useEffect(() => {
    if (!vehicle?.id) return;
    trackingAPI.listDevices({ search: vehicle.plate })
      .then((response) => {
        const list = (response.data || []).filter((device) => device.vehicleId === vehicle.id);
        setTrackingDevices(list);
      })
      .catch(() => {});
  }, [vehicle?.id, vehicle?.plate]);

  const maintenanceList = useMemo(() => maint?.maintenances || [], [maint]);
  const overdueOrDueSoon = useMemo(() => maintenanceList.filter((item) => item.alertLevel !== 'OK'), [maintenanceList]);
  const nextMaintenance = useMemo(() => resolveNextMaintenance(maintenanceList), [maintenanceList]);
  const latestOrders = useMemo(() => (vehicle?.serviceOrders || []).slice(0, 3), [vehicle?.serviceOrders]);
  const totalCompleted = useMemo(() => (vehicle?.serviceOrders || []).filter((order) => ['DONE', 'DELIVERED'].includes(order.status)).length, [vehicle?.serviceOrders]);
  const activeDevice = trackingDevices.find((device) => device.status === 'ACTIVE') || trackingDevices[0] || null;

  const toggleMaintenance = (maintenanceId) => {
    setOpenMaintenance((prev) => ({ ...prev, [maintenanceId]: !prev[maintenanceId] }));
  };

  const initializeMaintenances = async () => {
    setError('');
    setInfo('');
    try {
      const response = await maintenanceAPI.initialize(id);
      setInfo(response?.data?.message || 'Itens padrao criados com sucesso.');
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Erro ao inicializar manutencoes.');
    }
  };

  const removeVehicle = async () => {
    if (!can('delete')) return;
    const hardDelete = user?.role === 'ADMIN'
      ? window.confirm('Exclusao definitiva? OK = definitiva | Cancelar = apenas desativar')
      : false;

    const question = hardDelete
      ? 'Confirmar exclusao definitiva do veiculo? Esta acao nao pode ser desfeita.'
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

  const handleCopyImei = (imei) => {
    if (!imei) return;
    navigator.clipboard.writeText(imei).catch(() => {});
  };

  const handleOpenRastrek = (device) => {
    if (device?.rastrekLink) {
      window.open(device.rastrekLink, '_blank', 'noopener');
      return;
    }
    const query = vehicle?.plate || device?.imei || '';
    window.open(`${RASTREK_BASE_URL}?q=${encodeURIComponent(query)}`, '_blank', 'noopener');
  };

  const TRACKING_STATUS_LABEL = { ACTIVE: 'Ativo', STOCK: 'Estoque', MAINTENANCE: 'Em manutencao', REMOVED: 'Removido' };
  const TRACKING_STATUS_BADGE = { ACTIVE: 'badge-green', STOCK: 'badge-blue', MAINTENANCE: 'badge-yellow', REMOVED: 'badge-red' };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!vehicle) return <div className="alert alert-error">Veiculo nao encontrado.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{vehicle.plate} � {vehicle.brand} {vehicle.model}</div>
          <div className="page-subtitle">{vehicle.year || '-'} � {vehicle.color || 'Sem cor'} � <Link to={`/clientes/${vehicle.clientId}`}>{vehicle.client?.name || 'Cliente nao informado'}</Link></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
          <Link to={`/os/nova?vehicleId=${id}`} className="btn btn-primary btn-sm">+ Nova OS</Link>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/os')}>Ver historico completo</button>
          <Link to={`/veiculos/${id}/editar`} className="btn btn-outline btn-sm">Editar</Link>
          <button className="btn btn-outline btn-sm" onClick={initializeMaintenances}>Criar itens padrao</button>
          {can('delete') ? <button className="btn btn-danger btn-sm" onClick={removeVehicle} disabled={deleting}>{deleting ? 'Excluindo...' : 'Excluir'}</button> : null}
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {info ? <div className="alert alert-success" style={{ marginBottom: 12 }}>{info}</div> : null}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Resumo do veiculo</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div><strong>Placa:</strong> {vehicle.plate}</div>
            <div><strong>Marca/Modelo:</strong> {vehicle.brand} {vehicle.model}</div>
            <div><strong>Ano:</strong> {vehicle.year || '-'}</div>
            <div><strong>KM atual:</strong> {formatKm(vehicle.currentKm)}</div>
            <div><strong>Total de OS concluidas:</strong> {totalCompleted}</div>
          </div>
        </div>
        <MaintenanceSummaryCard title="Proxima manutencao" item={nextMaintenance} />
        <div className="card">
          <div className="card-title">Atencao neste veiculo</div>
          {!overdueOrDueSoon.length ? (
            <div className="text-sm text-muted">Sem itens vencidos ou proximos no momento.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {overdueOrDueSoon.slice(0, 3).map((item) => (
                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong>{item.label}</strong>
                    <span className={`badge ${item.alertLevel === 'OVERDUE' ? 'badge-red' : 'badge-yellow'}`}>{ALERT_LABEL[item.alertLevel]}</span>
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 6 }}>Data: {formatDate(item.nextDate)} � KM: {formatKm(item.nextKm)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Historico de OS</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/os')}>Ver todas</button>
        </div>
        {!latestOrders.length ? (
          <div className="text-sm text-muted">Sem ordens de servico registradas.</div>
        ) : (
          latestOrders.map((order) => <ServiceOrderRow key={order.id} order={order} />)
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Manutencao preventiva</div>
        {!maintenanceList.length ? (
          <div className="text-sm text-muted">Nenhum item cadastrado. Use "Criar itens padrao" para iniciar.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {maintenanceList
              .filter((item) => item.alertLevel !== 'OK' || openMaintenance[item.id])
              .concat(maintenanceList.filter((item) => item.alertLevel === 'OK' && !openMaintenance[item.id]))
              .map((item) => (
                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <button
                    type="button"
                    onClick={() => toggleMaintenance(item.id)}
                    style={{ width: '100%', border: 'none', background: 'transparent', padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 700 }}>{item.label}</div>
                      <div className="text-sm text-muted">Proxima data: {formatDate(item.nextDate)} � Proximo KM: {formatKm(item.nextKm)}</div>
                    </div>
                    <span className={`badge ${item.alertLevel === 'OVERDUE' ? 'badge-red' : item.alertLevel === 'DUE_SOON' ? 'badge-yellow' : 'badge-green'}`}>{ALERT_LABEL[item.alertLevel]}</span>
                  </button>

                  {openMaintenance[item.id] ? (
                    <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #f1f5f9' }}>
                      <div className="grid-2" style={{ paddingTop: 12 }}>
                        <div className="text-sm text-muted">Ultima troca em {formatDate(item.lastDate)}</div>
                        <div className="text-sm text-muted">Ultimo KM {formatKm(item.lastKm)}</div>
                        <div className="text-sm text-muted">Intervalo de data: {item.intervalMonths ? `${item.intervalMonths} mes(es)` : '-'}</div>
                        <div className="text-sm text-muted">Intervalo de KM: {item.intervalKm ? formatKm(item.intervalKm) : '-'}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Rastreamento</div>
          {!activeDevice ? (
            <div className="text-sm text-muted">Nenhum rastreador vinculado a este veiculo.</div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className={`badge ${TRACKING_STATUS_BADGE[activeDevice.status] || 'badge-blue'}`}>{TRACKING_STATUS_LABEL[activeDevice.status] || activeDevice.status}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleOpenRastrek(activeDevice)}>Abrir Rastrek</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleCopyImei(activeDevice.imei)}>Copiar IMEI</button>
                </div>
              </div>
              <div className="text-sm text-muted">IMEI: {activeDevice.imei || '-'}</div>
              <div className="text-sm text-muted">Equipamento: {activeDevice.model || '-'}</div>
              <div className="text-sm text-muted">Ultima instalacao: {formatDate(activeDevice.installedAt)}</div>
              {activeDevice.notes ? <div style={{ marginTop: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>{activeDevice.notes}</div> : null}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Configuracoes e observacoes</div>
          {vehicle.photoUrl ? <img src={vehicle.photoUrl} alt={`Veiculo ${vehicle.plate}`} style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }} /> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            <div><strong>Combustivel:</strong> {vehicle.fuel || '-'}</div>
            <div><strong>Cor:</strong> {vehicle.color || '-'}</div>
            <div><strong>Cliente:</strong> {vehicle.client?.name || '-'}</div>
            <div><strong>Atualizado em:</strong> {formatDateTime(vehicle.updatedAt)}</div>
          </div>
          {vehicle.notes ? <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>{vehicle.notes}</div> : null}
        </div>
      </div>
    </div>
  );
}
