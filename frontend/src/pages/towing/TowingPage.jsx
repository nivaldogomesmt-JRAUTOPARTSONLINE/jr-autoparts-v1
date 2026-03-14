import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('jr_token');

const TIPOS = ['Guincho', 'Assistência em Estrada', 'Troca de Pneu', 'Pane Seca', 'Bateria', 'Reboque', 'Outros'];
const STATUS_CONF = {
  'Aguardando':  { badge: 'badge-yellow', label: 'Aguardando' },
  'Em Rota':     { badge: 'badge-blue',   label: 'Em Rota' },
  'Concluído':   { badge: 'badge-green',  label: 'Concluído' },
  'Cancelado':   { badge: 'badge-red',    label: 'Cancelado' },
};

function TowingModal({ record, onClose, onSave }) {
  const [form, setForm] = useState(record || {
    client_name: '', fleet_client: '', plate: '', vehicle: '',
    service_type: 'Guincho', datetime: new Date().toISOString().slice(0,16),
    origin: '', destination: '', provider: '', value: '',
    status: 'Aguardando', notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl">
        <div className="modal-header">
          <h3 className="modal-title">{record?.id ? 'Editar' : 'Novo'} Atendimento — Guincho/Assistência</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <input className="form-control" value={form.client_name} onChange={e=>set('client_name',e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="form-group">
              <label className="form-label">Cliente Frotista</label>
              <input className="form-control" value={form.fleet_client} onChange={e=>set('fleet_client',e.target.value)} placeholder="Empresa/frota, se aplicável" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Placa</label>
              <input className="form-control" style={{ textTransform:'uppercase', fontFamily:'monospace', fontWeight:700 }} value={form.plate} onChange={e=>set('plate',e.target.value.toUpperCase())} placeholder="ABC1234" />
            </div>
            <div className="form-group">
              <label className="form-label">Veículo</label>
              <input className="form-control" value={form.vehicle} onChange={e=>set('vehicle',e.target.value)} placeholder="Marca e Modelo" />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Tipo de Atendimento</label>
              <select className="form-control" value={form.service_type} onChange={e=>set('service_type',e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Data e Hora</label>
              <input type="datetime-local" className="form-control" value={form.datetime} onChange={e=>set('datetime',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e=>set('status',e.target.value)}>
                {Object.keys(STATUS_CONF).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Origem</label>
              <input className="form-control" value={form.origin} onChange={e=>set('origin',e.target.value)} placeholder="Endereço de origem" />
            </div>
            <div className="form-group">
              <label className="form-label">Destino</label>
              <input className="form-control" value={form.destination} onChange={e=>set('destination',e.target.value)} placeholder="Endereço de destino" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Prestador / Motorista</label>
              <input className="form-control" value={form.provider} onChange={e=>set('provider',e.target.value)} placeholder="Nome do prestador" />
            </div>
            <div className="form-group">
              <label className="form-label">Valor (R$)</label>
              <input type="number" step="0.01" className="form-control" value={form.value} onChange={e=>set('value',e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Detalhes do atendimento..." style={{ resize:'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>Salvar Atendimento</button>
        </div>
      </div>
    </div>
  );
}

const TABS = ['Atendimentos', 'Clientes Frotistas', 'Prestadores', 'Relatórios'];

export default function TowingPage() {
  const [tab, setTab] = useState('Atendimentos');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(API + '/api/towing', { headers: { Authorization: 'Bearer ' + token() } });
        if (r.ok) {
          const data = await r.json();
          setRecords(Array.isArray(data) ? data : data.records || []);
        }
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = records.filter(r => {
    const ms = !search ||
      r.plate?.toLowerCase().includes(search.toLowerCase()) ||
      r.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.fleet_client?.toLowerCase().includes(search.toLowerCase());
    const mf = statusFilter === 'all' || r.status === statusFilter;
    return ms && mf;
  });

  const countByStatus = (s) => records.filter(r => r.status === s).length;
  const totalValue = records.reduce((s, r) => s + (Number(r.value) || 0), 0);

  const handleSave = async (form) => {
    try {
      const method = form.id ? 'PUT' : 'POST';
      const url = form.id ? `${API}/api/towing/${form.id}` : `${API}/api/towing`;
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        const saved = await r.json();
        setRecords(prev => form.id ? prev.map(x => x.id === form.id ? saved : x) : [saved, ...prev]);
        setModal(null);
      }
    } catch (e) { /* silent */ }
  };

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Guincho e Assistência Veicular</h1>
          <p className="page-subtitle">Gestão de atendimentos, frotistas e prestadores</p>
        </div>
        <div className="page-actions">
          {tab === 'Atendimentos' && (
            <button className="btn btn-primary" onClick={() => setModal({})}>+ Novo Atendimento</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="section">
        <div className="grid-4">
          <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div className="stat-label">Total Atendimentos</div>
            <div className="stat-value">{records.length}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)', cursor:'pointer' }} onClick={()=>setStatusFilter('Em Rota')}>
            <div className="stat-label">Em Rota</div>
            <div className="stat-value" style={{ color:'var(--warning)' }}>{countByStatus('Em Rota')}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="stat-label">Concluídos</div>
            <div className="stat-value" style={{ color:'var(--success)' }}>{countByStatus('Concluído')}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--gray-300)' }}>
            <div className="stat-label">Faturamento Total</div>
            <div className="stat-value" style={{ fontSize:18 }}>R$ {totalValue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : tab === 'Atendimentos' ? (
        <>
          <div className="filters-bar">
            <div className="search-bar" style={{ flex:1, maxWidth:320 }}>
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Placa, cliente, frotista..." value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['all',...Object.keys(STATUS_CONF)].map(s => (
                <button key={s} className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-outline'}`} onClick={()=>setStatusFilter(s)}>
                  {s === 'all' ? 'Todos' : s}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚛</div>
              <div className="empty-state-text">{search ? 'Nenhum atendimento encontrado' : 'Nenhum atendimento cadastrado'}</div>
              {!search && <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setModal({})}>+ Novo Atendimento</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Cliente</th><th>Frotista</th><th>Placa</th><th>Tipo</th><th>Data/Hora</th><th>Origem</th><th>Destino</th><th>Prestador</th><th className="text-right">Valor</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const sc = STATUS_CONF[r.status] || { badge:'badge-gray', label:r.status };
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight:600 }}>{r.client_name}</td>
                        <td className="text-sm text-muted">{r.fleet_client || '—'}</td>
                        <td><span style={{ fontFamily:'monospace', fontWeight:800, fontSize:12 }}>{r.plate}</span></td>
                        <td><span className="badge badge-blue" style={{ fontSize:10 }}>{r.service_type}</span></td>
                        <td className="text-sm">{r.datetime ? new Date(r.datetime).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—'}</td>
                        <td className="text-sm text-muted truncate" style={{ maxWidth:120 }}>{r.origin || '—'}</td>
                        <td className="text-sm text-muted truncate" style={{ maxWidth:120 }}>{r.destination || '—'}</td>
                        <td className="text-sm">{r.provider || '—'}</td>
                        <td className="text-right" style={{ fontWeight:700 }}>{r.value ? `R$ ${Number(r.value).toFixed(2)}` : '—'}</td>
                        <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                        <td><button className="btn btn-ghost btn-sm" onClick={()=>setModal(r)}>Editar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">{tab === 'Clientes Frotistas' ? '🏢' : tab === 'Prestadores' ? '🚛' : '📊'}</div>
          <div className="empty-state-text">Módulo {tab} em desenvolvimento</div>
          <div className="empty-state-sub">Em breve disponível nesta seção</div>
        </div>
      )}

      {modal !== null && (
        <TowingModal record={modal?.id ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />
      )}
    </div>
  );
}
