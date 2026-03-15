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

const MODULE_ORDER = ['OS', 'ENTREGA', 'MANUTENCAO', 'CADASTRO', 'RASTREAMENTO'];

const MODULE_META = {
  OS:           { label: 'Ordens de ServiÃ§o',  color: '#2563eb', bg: '#eff6ff' },
  ENTREGA:      { label: 'Entregas',               color: '#7c3aed', bg: '#f5f3ff' },
  MANUTENCAO:   { label: 'ManutenÃ§Ã£o',   color: '#d97706', bg: '#fffbeb' },
  CADASTRO:     { label: 'Cadastro',               color: '#059669', bg: '#ecfdf5' },
  RASTREAMENTO: { label: 'Rastreamento',           color: '#dc2626', bg: '#fef2f2' },
};

const DISPATCH_SOURCE = {
  OS_STATUS_STARTED:                    'soController.js',
  OS_STATUS_IN_PROGRESS:                'soController.js',
  OS_STATUS_WAITING_PART:               'soController.js',
  OS_STATUS_FINISHING:                  'soController.js',
  OS_STATUS_DONE:                       'soController.js',
  OS_STATUS_DELIVERED:                  'soController.js',
  DELIVERY_STATUS_AWAITING_DISPATCH:    'soController.js',
  DELIVERY_STATUS_OUT_FOR_DELIVERY:     'soController.js',
  DELIVERY_STATUS_DELIVERED:            'soController.js',
  DELIVERY_STATUS_DELIVERY_FAILED:      'soController.js',
  ORDER_PHASE_CONFIRMED:                'soController.js',
  ORDER_PHASE_PAYMENT_APPROVED:         'soController.js',
  ORDER_PHASE_IN_SEPARATION:            'soController.js',
  ORDER_PHASE_SHIPPED:                  'soController.js',
  ORDER_PHASE_DELIVERED:                'soController.js',
  ORDER_PHASE_CANCELED:                 'soController.js',
  MAINTENANCE_DUE_SOON:                 'maintenanceNotificationService.js',
  MAINTENANCE_OVERDUE:                  'maintenanceNotificationService.js',
  TRACKING_BILLING_UPCOMING:            'trackingBillingService.js',
  TRACKING_BILLING_LIGHT:               'trackingBillingService.js',
  TRACKING_BILLING_INTENSIVE:           'trackingBillingService.js',
  TRACKING_BILLING_CRITICAL:            'trackingBillingService.js',
  TRACKING_BILLING_RECOVERY:            'trackingBillingService.js',
  TRACKING_INSTALL_DONE:                'trackingController.js',
  TRACKING_MAINTENANCE_DONE:            'trackingController.js',
  TRACKING_REMOVAL_DONE:                'trackingController.js',
};

const TITLE_LABELS = {
  OS_STATUS_STARTED:                    'OS Iniciada',
  OS_STATUS_IN_PROGRESS:                'OS Em Andamento',
  OS_STATUS_WAITING_PART:               'OS Aguardando PeÃ§a',
  OS_STATUS_FINISHING:                  'OS Em FinalizaÃ§Ã£o',
  OS_STATUS_DONE:                       'OS ConcluÃ­da',
  OS_STATUS_DELIVERED:                  'OS Entregue ao Cliente',
  DELIVERY_STATUS_AWAITING_DISPATCH:    'Entrega Aguardando Despacho',
  DELIVERY_STATUS_OUT_FOR_DELIVERY:     'Saiu para Entrega',
  DELIVERY_STATUS_DELIVERED:            'Entrega Realizada',
  DELIVERY_STATUS_DELIVERY_FAILED:      'Tentativa de Entrega Falhou',
  ORDER_PHASE_CONFIRMED:                'Pedido Confirmado',
  ORDER_PHASE_PAYMENT_APPROVED:         'Pagamento Aprovado',
  ORDER_PHASE_IN_SEPARATION:            'Pedido em SeparaÃ§Ã£o',
  ORDER_PHASE_SHIPPED:                  'Pedido Despachado',
  ORDER_PHASE_DELIVERED:                'Pedido Entregue',
  ORDER_PHASE_CANCELED:                 'Pedido Cancelado',
  MAINTENANCE_DUE_SOON:                 'ManutenÃ§Ã£o PrÃ³xima do Vencimento',
  MAINTENANCE_OVERDUE:                  'ManutenÃ§Ã£o Vencida',
  PROFILE_WHATSAPP_UPDATED:             'WhatsApp do Cliente Atualizado',
  PROFILE_EMAIL_UPDATED:                'E-mail do Cliente Atualizado',
  PROFILE_UPDATED:                      'Dados do Cliente Atualizados',
  TRACKING_BILLING_UPCOMING:            'CobranÃ§a de Rastreamento PrÃ³xima',
  TRACKING_BILLING_LIGHT:               'CobranÃ§a Rastreamento â Leve',
  TRACKING_BILLING_INTENSIVE:           'CobranÃ§a Rastreamento â Intensiva',
  TRACKING_BILLING_CRITICAL:            'CobranÃ§a Rastreamento â CrÃ­tica',
  TRACKING_BILLING_RECOVERY:            'CobranÃ§a Rastreamento â RecuperaÃ§Ã£o',
  TRACKING_INSTALL_DONE:                'Instalação de Rastreador Concluída',
  TRACKING_MAINTENANCE_DONE:            'Manutenção de Rastreador Concluída',
  TRACKING_REMOVAL_DONE:                'Retirada de Rastreador Concluída',
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

  const grouped = useMemo(() => {
    const search = debouncedSearch.toLowerCase();
    const modulesToShow = moduleFilter === 'ALL' ? MODULE_ORDER : [moduleFilter];
    return modulesToShow
      .map(mod => {
        const modEvents = events.filter(ev => {
          if (ev.module !== mod) return false;
          if (moduleFilter === 'ALL' && search && !ev.key.toLowerCase().includes(search) && !(TITLE_LABELS[ev.key] || ev.label || '').toLowerCase().includes(search)) return false;
          if (moduleFilter !== 'ALL' && search && !ev.key.toLowerCase().includes(search) && !(TITLE_LABELS[ev.key] || ev.label || '').toLowerCase().includes(search)) return false;
          return true;
        });
        return { module: mod, events: modEvents };
      })
      .filter(g => g.events.length > 0);
  }, [events, debouncedSearch, moduleFilter]);

  const totalActive = events.filter(e => e.enabled).length;
  const totalDispatching = events.filter(e => e.enabled && DISPATCH_SOURCE[e.key]).length;

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
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Central de NotificaÃ§Ãµes</h1>
          <p className="page-subtitle">
            {totalActive} ativo{totalActive !== 1 ? 's' : ''}{' Â· '}{totalDispatching} disparando{' Â· '}{events.length} configurados
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {feedback && (
            <span style={{ fontSize: 13, color: feedback.startsWith('â') ? '#dc2626' : '#16a34a' }}>
              {feedback}
            </span>
          )}
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Salvando...' : 'ð¾ Salvar'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Buscar evento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            className="input"
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            style={{ width: 190 }}
          >
            <option value="ALL">Todos os mÃ³dulos</option>
            {modules.map(m => (
              <option key={m} value={m}>{MODULE_META[m]?.label || m}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {totalActive} ativos Â· {totalDispatching} disparando
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Nenhum evento encontrado.</div>
      ) : (
        grouped.map(({ module: mod, events: modEvents }) => {
          const meta = MODULE_META[mod] || { label: mod, color: '#6b7280', bg: '#f9fafb' };
          return (
            <div key={mod} style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 8, marginBottom: 12,
                background: meta.bg, borderLeft: '4px solid ' + meta.color,
              }}>
                <span style={{ fontWeight: 700, color: meta.color, fontSize: 14 }}>{meta.label}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {modEvents.filter(e => e.enabled).length}/{modEvents.length} ativos
                </span>
              </div>

              {modEvents.map(ev => {
                const isDispatching = !!DISPATCH_SOURCE[ev.key];
                const dispatchFile = DISPATCH_SOURCE[ev.key];
                const titleLabel = TITLE_LABELS[ev.key] || ev.label || ev.key;
                const dotColor = !ev.enabled ? '#9ca3af' : isDispatching ? '#16a34a' : '#ca8a04';
                return (
                  <div key={ev.key} style={{
                    background: '#fff', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 16px', marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: dotColor, display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{titleLabel}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{ev.key}</span>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 99,
                        background: '#dcfce7', color: '#15803d', fontWeight: 600,
                      }}>ð¬ WhatsApp</span>
                      {isDispatching ? (
                        <span title={'Disparado em ' + dispatchFile} style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 99,
                          background: '#dcfce7', color: '#15803d', fontWeight: 600,
                        }}>â Disparando</span>
                      ) : (
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 99,
                          background: '#fef9c3', color: '#854d0e', fontWeight: 600,
                        }}>âï¸ Configurado</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!ev.enabled}
                          onChange={e => setEventField(ev.key, 'enabled', e.target.checked)}
                        />
                        Ativo
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span style={{ color: '#6b7280' }}>Dedupe:</span>
                        <input
                          type="number"
                          min={0}
                          value={ev.dedupeHours ?? 24}
                          onChange={e => setEventField(ev.key, 'dedupeHours', Number(e.target.value))}
                          style={{ width: 60, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 13 }}
                        />
                        <span style={{ color: '#9ca3af' }}>h</span>
                      </label>
                    </div>

                    <textarea
                      value={ev.template || ''}
                      onChange={e => setEventField(ev.key, 'template', e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', fontSize: 12, fontFamily: 'monospace',
                        border: '1px solid var(--border)', borderRadius: 6,
                        padding: '6px 8px', resize: 'vertical', boxSizing: 'border-box',
                        background: '#fafafa',
                      }}
                      placeholder="Template da mensagem..."
                    />
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 12px', flexShrink: 0 }}
                        onClick={() => previewEvent(ev.key, ev.template)}
                      >
                        ð Preview
                      </button>
                      {preview.key === ev.key && preview.text && (
                        <div style={{
                          flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0',
                          borderRadius: 6, padding: '6px 10px', fontSize: 12,
                          color: '#166534', whiteSpace: 'pre-wrap',
                        }}>
                          {preview.text}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );

}