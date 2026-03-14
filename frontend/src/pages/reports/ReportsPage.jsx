import { useState, useEffect } from 'react';

const STATUS_CONFIG = {
  ativo:    { label: 'Ativo',    cls: 'badge-success' },
  pausado:  { label: 'Pausado',  cls: 'badge-warning' },
  erro:     { label: 'Erro',     cls: 'badge-danger'  },
};

const MODULES = [
  'Clientes', 'Veículos', 'Produtos', 'Serviços',
  'Ordens de Serviço', 'Rastreamento', 'Guincho', 'Financeiro',
];

const PERIODICITIES = [
  { value: 'diario',    label: 'Diário' },
  { value: 'semanal',   label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal',    label: 'Mensal' },
  { value: 'manual',    label: 'Sob demanda' },
];

const CHANNELS = [
  { value: 'email',      label: 'E-mail' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'ambos',      label: 'E-mail + WhatsApp' },
];

const FORMATS = [
  { value: 'pdf',   label: 'PDF' },
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'csv',   label: 'CSV' },
];

const EMPTY_FORM = {
  name: '', module: '', client: '', periodicity: 'mensal',
  next_send: '', channel: 'email', emails: '', whatsapp: '',
  format: 'pdf', active: true, notes: '',
};

function ReportModal({ report, onClose, onSave }) {
  const [form, setForm] = useState(report ? { ...report } : { ...EMPTY_FORM });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.module) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{report ? 'Editar Relatório' : 'Novo Relatório Programado'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* Nome */}
            <div className="form-group">
              <label className="form-label">Nome do Relatório *</label>
              <input className="form-control" placeholder="Ex: Faturamento Mensal" value={form.name}
                onChange={e => set('name', e.target.value)} required />
            </div>

            {/* Módulo + Periodicidade */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Módulo *</label>
                <select className="form-control" value={form.module} onChange={e => set('module', e.target.value)} required>
                  <option value="">Selecione...</option>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Periodicidade</label>
                <select className="form-control" value={form.periodicity} onChange={e => set('periodicity', e.target.value)}>
                  {PERIODICITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Cliente + Próximo envio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Cliente (opcional)</label>
                <input className="form-control" placeholder="Filtrar por cliente..." value={form.client}
                  onChange={e => set('client', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Próximo Envio</label>
                <input type="date" className="form-control" value={form.next_send}
                  onChange={e => set('next_send', e.target.value)} />
              </div>
            </div>

            {/* Canal + Formato */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Canal de Envio</label>
                <select className="form-control" value={form.channel} onChange={e => set('channel', e.target.value)}>
                  {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Formato</label>
                <select className="form-control" value={form.format} onChange={e => set('format', e.target.value)}>
                  {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>

            {/* E-mails */}
            {(form.channel === 'email' || form.channel === 'ambos') && (
              <div className="form-group">
                <label className="form-label">E-mails destinatários</label>
                <input className="form-control" placeholder="email1@dominio.com, email2@dominio.com"
                  value={form.emails} onChange={e => set('emails', e.target.value)} />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Separe múltiplos e-mails com vírgula</small>
              </div>
            )}

            {/* WhatsApp */}
            {(form.channel === 'whatsapp' || form.channel === 'ambos') && (
              <div className="form-group">
                <label className="form-label">WhatsApp (número com DDD)</label>
                <input className="form-control" placeholder="(65) 99999-9999"
                  value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
              </div>
            )}

            {/* Observações */}
            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea className="form-control" rows={2} value={form.notes}
                onChange={e => set('notes', e.target.value)} placeholder="Informações adicionais..." />
            </div>

            {/* Ativo */}
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="active-chk" checked={form.active}
                onChange={e => set('active', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="active-chk" style={{ margin: 0, cursor: 'pointer', fontWeight: 500 }}>
                Relatório ativo (envio automático habilitado)
              </label>
            </div>

          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">
              {report ? 'Salvar Alterações' : 'Criar Relatório'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  /* Simulated KPIs from reports list */
  const total    = reports.length;
  const ativos   = reports.filter(r => r.active).length;
  const comErro  = reports.filter(r => r.last_failed).length;
  const hojeEnvio = reports.filter(r => {
    if (!r.next_send) return false;
    const today = new Date().toISOString().split('T')[0];
    return r.next_send === today;
  }).length;

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setReports(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setReports([]); setLoading(false); });
  }, []);

  const filtered = reports.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name?.toLowerCase().includes(q) ||
      r.module?.toLowerCase().includes(q) ||
      r.client?.toLowerCase().includes(q);
    const matchModule  = !filterModule  || r.module === filterModule;
    const matchChannel = !filterChannel || r.channel === filterChannel;
    const matchActive  = filterActive === '' ? true :
      filterActive === '1' ? r.active : !r.active;
    return matchSearch && matchModule && matchChannel && matchActive;
  });

  const handleSave = async (form) => {
    try {
      const method = editing ? 'PUT' : 'POST';
      const url    = editing ? `/api/reports/${editing.id}` : '/api/reports';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const saved = await res.json();
        if (editing) {
          setReports(rs => rs.map(r => r.id === saved.id ? saved : r));
        } else {
          setReports(rs => [saved, ...rs]);
        }
        setModalOpen(false);
        setEditing(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleActive = async (report) => {
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !report.active }),
      });
      if (res.ok) {
        setReports(rs => rs.map(r => r.id === report.id ? { ...r, active: !r.active } : r));
      }
    } catch (err) { console.error(err); }
  };

  const handleRunNow = async (report) => {
    if (!window.confirm(`Enviar o relatório "${report.name}" agora?`)) return;
    try {
      await fetch(`/api/reports/${report.id}/run`, { method: 'POST' });
      alert('Relatório enviado com sucesso!');
    } catch { alert('Erro ao enviar relatório.'); }
  };

  const handleDelete = async (report) => {
    if (!window.confirm(`Excluir o relatório "${report.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/reports/${report.id}`, { method: 'DELETE' });
      if (res.ok) setReports(rs => rs.filter(r => r.id !== report.id));
    } catch { /* noop */ }
  };

  const openEdit = (r) => { setEditing(r); setModalOpen(true); };
  const openNew  = ()  => { setEditing(null); setModalOpen(true); };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR');
  };

  const periodLabel = (v) => PERIODICITIES.find(p => p.value === v)?.label || v;
  const channelLabel = (v) => CHANNELS.find(c => c.value === v)?.label || v;
  const formatLabel  = (v) => FORMATS.find(f => f.value === v)?.label || v;

  const isOverdue = (r) => {
    if (!r.next_send || !r.active) return false;
    return new Date(r.next_send) < new Date(new Date().toDateString());
  };

  return (
    <div className="main-body">

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Central de Relatórios Programados
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Automatize o envio de relatórios por e-mail e WhatsApp
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          + Novo Relatório
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total de Relatórios', value: total,    icon: '📋', color: '#2563EB', bg: '#eff6ff' },
          { label: 'Ativos',              value: ativos,   icon: '✅', color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Envios Hoje',         value: hojeEnvio,icon: '📅', color: '#d97706', bg: '#fffbeb' },
          { label: 'Com Erro',            value: comErro,  icon: '⚠️', color: '#dc2626', bg: '#fef2f2' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, borderLeft: `4px solid ${k.color}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: k.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 240 }}>
          <span className="search-icon">🔍</span>
          <input placeholder="Buscar por nome, módulo ou cliente..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 170 }} value={filterModule}
          onChange={e => setFilterModule(e.target.value)}>
          <option value="">Todos os módulos</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="form-control" style={{ width: 170 }} value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}>
          <option value="">Todos os canais</option>
          {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="form-control" style={{ width: 140 }} value={filterActive}
          onChange={e => setFilterActive(e.target.value)}>
          <option value="">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Pausados</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <p style={{ margin: 0 }}>Nenhum relatório encontrado.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openNew}>
              Criar primeiro relatório
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Módulo</th>
                <th>Periodicidade</th>
                <th>Canal</th>
                <th>Formato</th>
                <th>Próximo Envio</th>
                <th>Último Envio</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const overdue = isOverdue(r);
                return (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.6 }}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                      {r.client && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.client}</div>}
                    </td>
                    <td>
                      <span className="badge badge-primary" style={{ fontSize: 11 }}>{r.module}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{periodLabel(r.periodicity)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{channelLabel(r.channel)}</td>
                    <td>
                      <span className="badge" style={{
                        background: r.format === 'pdf' ? '#fee2e2' : r.format === 'excel' ? '#d1fae5' : '#e0e7ff',
                        color:      r.format === 'pdf' ? '#dc2626' : r.format === 'excel' ? '#16a34a' : '#4338ca',
                        fontSize: 11,
                      }}>
                        {formatLabel(r.format)}
                      </span>
                    </td>
                    <td>
                      {r.next_send ? (
                        <span style={{ color: overdue ? '#dc2626' : 'var(--text-secondary)', fontWeight: overdue ? 600 : 400 }}>
                          {overdue && '⚠ '}{fmtDate(r.next_send)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {r.last_send ? fmtDate(r.last_send) : '—'}
                      {r.last_failed && (
                        <div style={{ color: '#dc2626', fontSize: 11 }}>
                          Falha: {fmtDate(r.last_failed)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${r.active ? (r.last_failed ? 'badge-danger' : 'badge-success') : 'badge-warning'}`}>
                        {r.active ? (r.last_failed ? 'Erro' : 'Ativo') : 'Pausado'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}
                          title="Enviar agora" onClick={() => handleRunNow(r)}>▶</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}
                          title={r.active ? 'Pausar' : 'Ativar'} onClick={() => handleToggleActive(r)}>
                          {r.active ? '⏸' : '▶'}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => openEdit(r)}>✏️</button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleDelete(r)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <ReportModal
          report={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
