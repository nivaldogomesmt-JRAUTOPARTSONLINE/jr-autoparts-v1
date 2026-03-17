import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('jr_token');

const TIPOS = ['Instalação', 'Instalação com Bloqueio', 'Manutenção', 'Retirada'];
const RASTREK_BASE_URL = 'https://painel.rastrek.com.br'; // fallback — ajuste se necessário
const STATUS_CONF = {
  'Agendado':   { badge: 'badge-blue',   label: 'Agendado' },
  'Concluído':  { badge: 'badge-green',  label: 'Concluído' },
  'Cancelado':  { badge: 'badge-red',    label: 'Cancelado' },
  'Em andamento':{ badge: 'badge-yellow',label: 'Em Andamento' },
};

function TrackingModal({ record, onClose, onSave }) {
  const [form, setForm] = useState(record || {
    client_name: '', plate: '', vehicle: '', imei: '',
    equipment_model: '', chip: '', service_type: 'Instalação',
    date: new Date().toISOString().split('T')[0],
    technician: '', notes: '', status: 'Agendado',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">{record ? 'Editar Atendimento' : 'Novo Atendimento'} — Rastreamento</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <input className="form-control" value={form.client_name} onChange={e=>set('client_name',e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="form-group">
              <label className="form-label required">Placa</label>
              <input className="form-control" style={{ textTransform:'uppercase', fontFamily:'monospace', fontWeight:700 }} value={form.plate} onChange={e=>set('plate',e.target.value.toUpperCase())} placeholder="ABC1234" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Veículo (Marca/Modelo)</label>
              <input className="form-control" value={form.vehicle} onChange={e=>set('vehicle',e.target.value)} placeholder="Ex: Fiat Strada" />
            </div>
            <div className="form-group">
              <label className="form-label required">IMEI</label>
              <input className="form-control" value={form.imei} onChange={e=>set('imei',e.target.value)} placeholder="000000000000000" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Modelo do Equipamento</label>
              <input className="form-control" value={form.equipment_model} onChange={e=>set('equipment_model',e.target.value)} placeholder="Ex: Unipro G3" />
            </div>
            <div className="form-group">
              <label className="form-label">Chip / SIM Card</label>
              <input className="form-control" value={form.chip} onChange={e=>set('chip',e.target.value)} placeholder="Número do chip, se houver" />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Tipo de Serviço</label>
              <select className="form-control" value={form.service_type} onChange={e=>set('service_type',e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Data</label>
              <input type="date" className="form-control" value={form.date} onChange={e=>set('date',e.target.value)} />
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
              <label className="form-label">Técnico Responsável</label>
              <input className="form-control" value={form.technician} onChange={e=>set('technician',e.target.value)} placeholder="Nome do técnico" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Informações adicionais..." style={{ resize:'vertical' }} />
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

export default function TrackingPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [stats, setStats] = useState({ total: 0, instalacoes: 0, manutencoes: 0, retiradas: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(API + '/api/tracking', { headers: { Authorization: 'Bearer ' + token() } });
        if (r.ok) {
          const data = await r.json();
          const list = Array.isArray(data) ? data : data.records || [];
          setRecords(list);
          setStats({
            total: list.length,
            instalacoes: list.filter(r => r.service_type?.includes('Instalação')).length,
            manutencoes: list.filter(r => r.service_type === 'Manutenção').length,
            retiradas:   list.filter(r => r.service_type === 'Retirada').length,
          });
        }
      } catch (e) { console.error('[TrackingPage] error:', e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = records.filter(r => {
    const ms = !search ||
      r.plate?.toLowerCase().includes(search.toLowerCase()) ||
      r.imei?.includes(search) ||
      r.client_name?.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'all' || r.service_type === typeFilter;
    return ms && mt;
  });

  const handleSave = async (form) => {
    try {
      const method = form.id ? 'PUT' : 'POST';
      const url = form.id ? `${API}/api/tracking/${form.id}` : `${API}/api/tracking`;
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
    } catch (e) { console.error('[TrackingPage] error:', e); }
  };

  const handleCopyImei = (imei) => {
    if (!imei) return;
    navigator.clipboard.writeText(imei).catch(() => {});
  };

  const handleOpenRastrek = (r) => {
    if (r.rastrekLink) {
      window.open(r.rastrekLink, '_blank', 'noopener');
      return;
    }
    const q = r.plate || r.imei || '';
    window.open(`${RASTREK_BASE_URL}?q=${encodeURIComponent(q)}`, '_blank', 'noopener');
  };

  return (
    <div>
      <div className="page-header-row page-header">
        <div>
          <h1 className="page-title">Rastreamento Unipro</h1>
          <p className="page-subtitle">Gestão de instalações, manutenções e retiradas de rastreadores</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setModal({})}>+ Novo Atendimento</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="section">
            <div className="section-header"><h2 className="section-title">Resumo</h2></div>
            <div className="grid-4">
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="stat-label">Total de Atendimentos</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)', cursor: 'pointer' }} onClick={() => setTypeFilter('Instalação')}>
                <div className="stat-label">Instalações</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.instalacoes}</div>
                <div className="stat-sub">Instalação + com bloqueio</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)', cursor: 'pointer' }} onClick={() => setTypeFilter('Manutenção')}>
                <div className="stat-label">Manutenções</div>
                <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.manutencoes}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--gray-300)', cursor: 'pointer' }} onClick={() => setTypeFilter('Retirada')}>
                <div className="stat-label">Retiradas</div>
                <div className="stat-value">{stats.retiradas}</div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="filters-bar">
            <div className="search-bar" style={{ flex: 1, maxWidth: 320 }}>
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Placa, IMEI, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${typeFilter==='all'?'btn-primary':'btn-outline'}`} onClick={()=>setTypeFilter('all')}>Todos</button>
              {TIPOS.map(t => (
                <button key={t} className={`btn btn-sm ${typeFilter===t?'btn-primary':'btn-outline'}`} onClick={()=>setTypeFilter(t)}>{t}</button>
              ))}
            </div>
            <span className="text-muted text-sm">{filtered.length} registro{filtered.length!==1?'s':''}</span>
          </div>

          {/* Tabela */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📡</div>
              <div className="empty-state-text">{search || typeFilter !== 'all' ? 'Nenhum atendimento encontrado' : 'Nenhum atendimento cadastrado'}</div>
              {!search && typeFilter === 'all' && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal({})}>+ Novo Atendimento</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Placa</th><th>Cliente</th><th>IMEI</th><th>Equipamento</th><th>Tipo</th><th>Data</th><th>Técnico</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const sc = STATUS_CONF[r.status] || { badge: 'badge-gray', label: r.status };
                    return (
                      <tr key={r.id}>
                        <td><span style={{ fontFamily:'monospace', fontWeight:800, fontSize:13 }}>{r.plate}</span></td>
                        <td style={{ fontWeight:600 }}>{r.client_name}</td>
                        <td className="text-sm text-muted" style={{ fontFamily:'monospace' }}>{r.imei || '—'}</td>
                        <td className="text-sm">{r.equipment_model || '—'}</td>
                        <td><span className="badge badge-blue" style={{ fontSize:11 }}>{r.service_type}</span></td>
                        <td className="text-sm">{r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="text-sm text-muted">{r.technician || '—'}</td>
                        <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                        <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn btn-ghost btn-sm" title="Abrir na Rastrek" onClick={() => handleOpenRastrek(r)}>🔗 Rastrek</button>
                          <button className="btn btn-ghost btn-sm" title="Copiar IMEI" onClick={() => handleCopyImei(r.imei)}>📋 IMEI</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal(r)}>Editar</button>
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

      {modal !== null && (
        <TrackingModal record={modal?.id ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />
      )}
    </div>
  );
}
