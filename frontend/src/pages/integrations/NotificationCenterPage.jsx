import { useEffect, useMemo, useState } from 'react';
import { notificationCenterAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const SAMPLE_VARIABLES = {
  clientName: 'Cliente Exemplo',
  plate: 'ABC1D23',
  brand: 'Fiat',
  model: 'Mobi',
  soNumber: 123,
  status: 'IN_PROGRESS',
  statusLabel: 'Em Execucao',
  deliveryStatus: 'OUT_FOR_DELIVERY',
  deliveryStatusLabel: 'Saiu para entrega',
  orderPhase: 'IN_SEPARATION',
  orderPhaseLabel: 'Em separacao',
  locationUrl: 'https://maps.google.com/?q=-15.601,-56.097',
  note: 'Previsao de chegada em 40 minutos',
  locationLine: '\nLocalizacao da entrega: https://maps.google.com/?q=-15.601,-56.097',
  noteLine: '\nObs: Previsao de chegada em 40 minutos',
  maintenanceLabel: 'Troca de Oleo',
  alertLevel: 'DUE_SOON',
  alertLabel: 'Atencao',
  nextDate: '20/03/2026',
  nextKm: '52.000 km',
  portalUrl: 'https://jr-autoparts-v1.vercel.app/portal',
  referenceMonth: '2026-03',
  dueDate: '20/03/2026',
  amount: '249,90',
  daysOverdue: 7,
};

export default function NotificationCenterPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [updatedBy, setUpdatedBy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [preview, setPreview] = useState({ key: '', text: '' });

  const debouncedSearch = useDebouncedValue(search, 180);

  const load = async () => {
    setLoading(true);
    setFeedback('');
    try {
      const res = await notificationCenterAPI.getCenter();
      setEvents(Array.isArray(res.data?.events) ? res.data.events : []);
      setUpdatedAt(res.data?.updatedAt || '');
      setUpdatedBy(res.data?.updatedBy || '');
    } catch (err) {
      setFeedback(err?.response?.data?.error || 'Falha ao carregar central de notificacoes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const modules = useMemo(() => {
    const uniq = Array.from(new Set(events.map((e) => e.module || 'GERAL'))).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...uniq];
  }, [events]);

  const filtered = useMemo(() => {
    const token = String(debouncedSearch || '').trim().toLowerCase();
    return events.filter((ev) => {
      if (moduleFilter !== 'ALL' && (ev.module || 'GERAL') !== moduleFilter) return false;
      if (!token) return true;
      return [ev.key, ev.title, ev.module, ev.template]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(token);
    });
  }, [events, debouncedSearch, moduleFilter]);

  const setEventField = (key, field, value) => {
    setEvents((prev) => prev.map((ev) => (ev.key === key ? { ...ev, [field]: value } : ev)));
  };

  const saveAll = async () => {
    setSaving(true);
    setFeedback('');
    try {
      const payload = events.map((ev) => ({
        key: ev.key,
        module: ev.module,
        title: ev.title,
        channel: ev.channel,
        active: !!ev.active,
        dedupeHours: Number.parseInt(String(ev.dedupeHours || 24), 10) || 24,
        template: String(ev.template || ''),
      }));

      const res = await notificationCenterAPI.saveCenter({ events: payload });
      setEvents(Array.isArray(res.data?.events) ? res.data.events : payload);
      setUpdatedAt(res.data?.updatedAt || '');
      setUpdatedBy(res.data?.updatedBy || '');
      setFeedback('Central de notificacoes salva com sucesso.');
    } catch (err) {
      setFeedback(err?.response?.data?.error || 'Falha ao salvar central de notificacoes.');
    } finally {
      setSaving(false);
    }
  };

  const previewEvent = async (eventKey, fallbackContent) => {
    try {
      const res = await notificationCenterAPI.preview({
        eventKey,
        fallbackContent,
        variables: SAMPLE_VARIABLES,
        fallbackDedupeHours: 24,
      });
      setPreview({
        key: eventKey,
        text: res.data?.enabled === false
          ? `Evento desativado: ${res.data?.reason || 'sem envio'}`
          : (res.data?.content || ''),
      });
    } catch (err) {
      setPreview({ key: eventKey, text: err?.response?.data?.error || 'Falha ao gerar previa.' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Central de Notificacoes</div>
          <div className="page-subtitle">Gerencie eventos, templates e janela de dedupe do WhatsApp</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={load} disabled={loading || saving}>Recarregar</button>
          <button type="button" className="btn btn-primary" onClick={saveAll} disabled={loading || saving}>{saving ? 'Salvando...' : 'Salvar alteracoes'}</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10 }}>
          <input
            className="form-control"
            placeholder="Buscar por modulo, chave, titulo ou template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-control" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            {modules.map((m) => (
              <option key={m} value={m}>{m === 'ALL' ? 'Todos os modulos' : m}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-muted" style={{ marginTop: 8 }}>
          Ultima atualizacao: {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : '-'} {updatedBy ? `por ${updatedBy}` : ''}
        </div>
        {feedback ? <div className="text-sm" style={{ marginTop: 8 }}>{feedback}</div> : null}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : !filtered.length ? (
          <div className="empty-state"><div className="empty-state-text">Nenhum evento encontrado.</div></div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.map((ev) => (
              <div key={ev.key} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{ev.title}</div>
                    <div className="text-sm text-muted">{ev.module} | {ev.key}</div>
                  </div>
                  <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!ev.active}
                      onChange={(e) => setEventField(ev.key, 'active', e.target.checked)}
                    />
                    Ativo
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <input
                    className="form-control"
                    type="number"
                    min={1}
                    max={720}
                    value={ev.dedupeHours}
                    onChange={(e) => setEventField(ev.key, 'dedupeHours', e.target.value)}
                  />
                  <textarea
                    className="form-control"
                    rows={3}
                    value={ev.template || ''}
                    onChange={(e) => setEventField(ev.key, 'template', e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => previewEvent(ev.key, ev.template || '')}
                  >
                    Previa
                  </button>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                  Dedupe (horas) | Template com variaveis: {'{clientName}'}, {'{plate}'}, {'{soNumber}'}, {'{statusLabel}'}, {'{nextDate}'}, {'{nextKm}'}, {'{amount}'}.
                </div>
                {preview.key === ev.key && preview.text ? (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Previa</div>
                    <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

