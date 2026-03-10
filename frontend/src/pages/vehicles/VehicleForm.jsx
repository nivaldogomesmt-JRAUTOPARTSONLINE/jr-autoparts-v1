import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { vehiclesAPI, clientsAPI } from '../../services/api';

const MAINTENANCE_PRESETS = {
  STANDARD: { oilIntervalKm: 10000, oilIntervalMonths: 6, beltIntervalKm: 60000, beltIntervalMonths: 48 },
  SEVERE: { oilIntervalKm: 7000, oilIntervalMonths: 6, beltIntervalKm: 40000, beltIntervalMonths: 36 },
  EXTENDED: { oilIntervalKm: 10000, oilIntervalMonths: 12, beltIntervalKm: 50000, beltIntervalMonths: 48 },
};

export default function VehicleForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    clientId: searchParams.get('clientId') || '',
    plate: '',
    brand: '',
    model: '',
    year: '',
    color: '',
    fuel: '',
    currentKm: '',
    notes: '',
  });

  const [maintenanceMode, setMaintenanceMode] = useState('STANDARD');
  const [maintenanceConfig, setMaintenanceConfig] = useState({ ...MAINTENANCE_PRESETS.STANDARD });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    clientsAPI.list({ page: 1, limit: 5000 }).then((r) => setClients(r.data.data));

    if (isEdit) {
      vehiclesAPI.get(id).then((r) => {
        const vehicle = r.data;
        setForm({
          clientId: vehicle.clientId,
          plate: vehicle.plate,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year || '',
          color: vehicle.color || '',
          fuel: vehicle.fuel || '',
          currentKm: vehicle.currentKm || '',
          notes: vehicle.notes || '',
        });

        setPhotoPreview(vehicle.photoUrl || '');

        const oil = vehicle.maintenances?.find((m) => m.type === 'oil');
        const belt = vehicle.maintenances?.find((m) => m.type === 'belt');
        setMaintenanceMode('CUSTOM');
        setMaintenanceConfig({
          oilIntervalKm: oil?.intervalKm || 10000,
          oilIntervalMonths: oil?.intervalMonths || 6,
          beltIntervalKm: belt?.intervalKm || 60000,
          beltIntervalMonths: belt?.intervalMonths || 48,
        });
      });
    }
  }, [id, isEdit]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.cpfCnpj, c.phone, c.whatsapp, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const applyPreset = (mode) => {
    setMaintenanceMode(mode);
    if (mode !== 'CUSTOM') {
      setMaintenanceConfig({ ...MAINTENANCE_PRESETS[mode] });
    }
  };

  const onSelectPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = {
      ...form,
      maintenanceConfig,
    };

    try {
      let vehicleId = id;
      if (isEdit) {
        await vehiclesAPI.update(id, payload);
      } else {
        const response = await vehiclesAPI.create(payload);
        vehicleId = response.data.id;
      }

      if (photoFile && vehicleId) {
        await vehiclesAPI.uploadPhoto(vehicleId, photoFile);
      }

      navigate(`/veiculos/${vehicleId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{isEdit ? 'Editar Veiculo' : 'Novo Veiculo'}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Buscar cliente</label>
              <input className="form-control" placeholder="Digite nome, CPF/CNPJ, telefone ou email..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <label className="form-label required">Cliente</label>
              <select className="form-control" value={form.clientId} onChange={(e) => setField('clientId', e.target.value)} required>
                <option value="">Selecione...</option>
                {filteredClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Placa</label>
              <input className="form-control" value={form.plate} onChange={(e) => setField('plate', e.target.value.toUpperCase())} required placeholder="ABC1234" maxLength={8} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Marca</label>
              <input className="form-control" value={form.brand} onChange={(e) => setField('brand', e.target.value)} required placeholder="Ex: Toyota" />
            </div>
            <div className="form-group">
              <label className="form-label required">Modelo</label>
              <input className="form-control" value={form.model} onChange={(e) => setField('model', e.target.value)} required placeholder="Ex: SW4" />
            </div>
            <div className="form-group">
              <label className="form-label">Ano</label>
              <input type="number" className="form-control" value={form.year} onChange={(e) => setField('year', e.target.value)} min={1950} max={2035} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Cor</label>
              <input className="form-control" value={form.color} onChange={(e) => setField('color', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Combustivel</label>
              <select className="form-control" value={form.fuel} onChange={(e) => setField('fuel', e.target.value)}>
                <option value="">Selecione...</option>
                {['Gasolina', 'Alcool', 'Flex', 'Diesel', 'GNV', 'Eletrico', 'Hibrido'].map((fuel) => <option key={fuel} value={fuel}>{fuel}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">KM Atual</label>
              <input type="number" className="form-control" value={form.currentKm} onChange={(e) => setField('currentKm', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Foto do veiculo</label>
            <input type="file" accept="image/*" className="form-control" onChange={onSelectPhoto} />
            {photoPreview ? (
              <div style={{ marginTop: 8 }}>
                <img src={photoPreview} alt="Preview" style={{ width: 220, maxWidth: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </div>
            ) : null}
          </div>

          <div className="form-group">
            <label className="form-label">Observacoes</label>
            <textarea className="form-control" rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Configuracao de manutencao (por veiculo/cliente)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className={`btn ${maintenanceMode === 'STANDARD' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => applyPreset('STANDARD')}>
              Padrao (Oleo 10k / Correia 60k)
            </button>
            <button type="button" className={`btn ${maintenanceMode === 'SEVERE' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => applyPreset('SEVERE')}>
              Severo (Oleo 7k / Correia 40k)
            </button>
            <button type="button" className={`btn ${maintenanceMode === 'EXTENDED' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => applyPreset('EXTENDED')}>
              Estendido (Oleo 10k / Correia 50k)
            </button>
            <button type="button" className={`btn ${maintenanceMode === 'CUSTOM' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => applyPreset('CUSTOM')}>
              Personalizado
            </button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Oleo - intervalo KM</label>
              <input type="number" className="form-control" value={maintenanceConfig.oilIntervalKm} onChange={(e) => { setMaintenanceMode('CUSTOM'); setMaintenanceConfig((p) => ({ ...p, oilIntervalKm: e.target.value })); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Oleo - intervalo meses</label>
              <input type="number" className="form-control" value={maintenanceConfig.oilIntervalMonths} onChange={(e) => { setMaintenanceMode('CUSTOM'); setMaintenanceConfig((p) => ({ ...p, oilIntervalMonths: e.target.value })); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Correia - intervalo KM</label>
              <input type="number" className="form-control" value={maintenanceConfig.beltIntervalKm} onChange={(e) => { setMaintenanceMode('CUSTOM'); setMaintenanceConfig((p) => ({ ...p, beltIntervalKm: e.target.value })); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Correia - intervalo meses</label>
              <input type="number" className="form-control" value={maintenanceConfig.beltIntervalMonths} onChange={(e) => { setMaintenanceMode('CUSTOM'); setMaintenanceConfig((p) => ({ ...p, beltIntervalMonths: e.target.value })); }} />
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#64748b' }}>
            Essa configuracao sera usada para calcular proximas trocas no portal do cliente.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar Veiculo'}</button>
        </div>
      </form>
    </div>
  );
}
