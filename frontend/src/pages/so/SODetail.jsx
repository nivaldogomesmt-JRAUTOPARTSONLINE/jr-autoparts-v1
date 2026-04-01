import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messagesAPI, soAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyWhatsAppError } from '../../utils/whatsappMessages';

const STATUS_LIST = [
  { value: 'QUOTE', label: 'Orcamento', badge: 'badge-gray' },
  { value: 'APPROVED', label: 'Aprovado', badge: 'badge-blue' },
  { value: 'STARTED', label: 'Iniciado', badge: 'badge-purple' },
  { value: 'IN_PROGRESS', label: 'Em execucao', badge: 'badge-purple' },
  { value: 'WAITING_PART', label: 'Aguardando peca', badge: 'badge-orange' },
  { value: 'FINISHING', label: 'Finalizando', badge: 'badge-yellow' },
  { value: 'DONE', label: 'Finalizado', badge: 'badge-green' },
  { value: 'DELIVERED', label: 'Entregue', badge: 'badge-green' },
];

const STATUS_TIMELINE_ORDER = ['QUOTE', 'APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING', 'DONE', 'DELIVERED'];

const MESSAGE_STATUS = {
  SENT: { label: 'Enviada', badge: 'badge-green' },
  FAILED: { label: 'Falha ao enviar', badge: 'badge-red' },
  PENDING: { label: 'Pendente', badge: 'badge-yellow' },
};

const PRINT_THEMES = [
  { value: 'os', label: 'Resumo da OS' },
  { value: 'financeiro', label: 'Financeiro (itens e total)' },
  { value: 'fotos', label: 'Fotos da OS' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'whatsapp', label: 'WhatsApp e historico' },
];
const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_so_detail';

function getInitialPrintTheme() {
  if (typeof window === 'undefined') return 'os';
  try {
    const saved = window.localStorage.getItem(PRINT_THEME_STORAGE_KEY);
    return PRINT_THEMES.some((theme) => theme.value === saved) ? saved : 'os';
  } catch {
    return 'os';
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatQty(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) return '0';
  return Number.isInteger(qty)
    ? qty.toLocaleString('pt-BR')
    : qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function stripDeliveryMeta(notes) {
  const text = String(notes || '');
  const marker = text.indexOf('[DELIVERY_META]');
  return (marker >= 0 ? text.slice(0, marker) : text).trim();
}

function SummaryCard({ title, main, secondary, accent = 'var(--primary)' }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{main || '-'}</div>
      {secondary ? <div className="text-sm text-muted" style={{ marginTop: 6 }}>{secondary}</div> : null}
    </div>
  );
}

function Section({ title, children, actions = null, className = '' }) {
  return (
    <section className={`card ${className}`.trim()} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function SODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resendingMap, setResendingMap] = useState({});
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [deletingPhotoMap, setDeletingPhotoMap] = useState({});
  const [error, setError] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoCategory, setPhotoCategory] = useState('GENERAL');
  const [photoCaption, setPhotoCaption] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('AWAITING_DISPATCH');
  const [deliveryLocationUrl, setDeliveryLocationUrl] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [sendingDelivery, setSendingDelivery] = useState(false);
  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await soAPI.get(id);
      setOs(res.data);
    } catch {
      setError('Erro ao carregar OS.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!os?.deliveryMeta) return;
    setDeliveryStatus(os.deliveryMeta.status || 'AWAITING_DISPATCH');
    setDeliveryLocationUrl(os.deliveryMeta.locationUrl || '');
    setDeliveryNote(os.deliveryMeta.note || '');
  }, [os]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore
    }
  }, [printTheme]);

  const handleStatusChange = async (newStatus) => {
    const label = STATUS_LIST.find((item) => item.value === newStatus)?.label || newStatus;
    if (!window.confirm(`Confirmar mudanca de status para "${label}"?`)) return;

    setUpdatingStatus(true);
    try {
      await soAPI.updateStatus(id, { status: newStatus });
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleResend = async (messageId) => {
    setResendingMap((prev) => ({ ...prev, [messageId]: true }));
    try {
      await messagesAPI.resend(messageId);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao reenviar mensagem.');
    } finally {
      setResendingMap((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const handleUploadPhotos = async () => {
    if (!photoFiles.length) {
      window.alert('Selecione pelo menos uma foto.');
      return;
    }

    setUploadingPhotos(true);
    try {
      await soAPI.uploadPhotos(id, photoFiles, { category: photoCategory, caption: photoCaption });
      setPhotoFiles([]);
      setPhotoCaption('');
      setPhotoCategory('GENERAL');
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao enviar fotos da OS.');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Remover esta foto da OS?')) return;
    setDeletingPhotoMap((prev) => ({ ...prev, [photoId]: true }));
    try {
      await soAPI.deletePhoto(id, photoId);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao remover foto.');
    } finally {
      setDeletingPhotoMap((prev) => ({ ...prev, [photoId]: false }));
    }
  };

  const handleDeliveryUpdate = async () => {
    if (!os?.integrationStatus?.whatsappConfigured) {
      window.alert('WhatsApp indisponivel. Configure a integracao antes de enviar atualizacoes.');
      return;
    }

    setSendingDelivery(true);
    try {
      await soAPI.updateDelivery(id, {
        deliveryStatus,
        locationUrl: deliveryLocationUrl || null,
        note: deliveryNote || null,
      });
      await load();
      window.alert('Atualizacao de entrega registrada com sucesso.');
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao atualizar entrega.');
    } finally {
      setSendingDelivery(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!window.confirm('Deseja realmente excluir esta OS? Esta acao nao pode ser desfeita.')) return;
    try {
      await soAPI.remove(id);
      window.alert('OS excluida com sucesso.');
      navigate('/os');
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erro ao excluir OS.');
    }
  };

  const handlePrint = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'so-detail');
    html.setAttribute('data-print-theme', printTheme);

    const clearPrintState = () => {
      html.removeAttribute('data-print-theme');
      html.removeAttribute('data-print-context');
      window.removeEventListener('afterprint', clearPrintState);
    };

    window.addEventListener('afterprint', clearPrintState);
    window.print();
    setTimeout(clearPrintState, 1200);
  };

  const currentBadge = STATUS_LIST.find((status) => status.value === os?.status);
  const cleanNotes = useMemo(() => stripDeliveryMeta(os?.notes), [os?.notes]);

  const statusTimeline = useMemo(() => {
    const logs = Array.isArray(os?.statusLogs) ? os.statusLogs : [];
    return logs
      .filter((log) => STATUS_TIMELINE_ORDER.includes(log.newStatus))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((log) => ({
        ...log,
        label: STATUS_LIST.find((item) => item.value === log.newStatus)?.label || log.newStatus,
      }));
  }, [os?.statusLogs]);

  const messageHistory = useMemo(() => {
    const messages = Array.isArray(os?.messages) ? os.messages : [];
    return [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [os?.messages]);

  const serviceItems = useMemo(() => (os?.items || []).filter((item) => item.type === 'SERVICE'), [os?.items]);
  const productItems = useMemo(() => (os?.items || []).filter((item) => item.type !== 'SERVICE'), [os?.items]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!os) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">OS #{os.number}</div>
          <div className="page-subtitle">
            <span className={`badge ${currentBadge?.badge || 'badge-gray'}`}>{currentBadge?.label || os.status}</span>
            <span style={{ marginLeft: 8 }}>Aberta em {formatDate(os.createdAt)}</span>
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-control" style={{ minWidth: 220 }} value={printTheme} onChange={(e) => setPrintTheme(e.target.value)}>
            {PRINT_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={handlePrint}>Imprimir OS</button>
          <Link to="/os" className="btn btn-ghost btn-sm">Voltar</Link>
          <Link to={`/os/${id}/editar`} className="btn btn-outline btn-sm">Editar</Link>
          {can('delete') ? <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteOrder}>Excluir</button> : null}
        </div>
      </div>

      {!os.integrationStatus?.whatsappConfigured ? (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          WhatsApp indisponivel. As notificacoes ficam pausadas ate a integracao ser configurada.
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <SummaryCard title="Cliente" main={os.client?.name} secondary={os.client?.phone || os.client?.whatsapp || 'Telefone nao informado'} accent="var(--primary)" />
        <SummaryCard title="Veiculo" main={`${os.vehicle?.brand || '-'} ${os.vehicle?.model || ''}`.trim()} secondary={os.vehicle?.plate || 'Placa nao informada'} accent="var(--warning)" />
        <SummaryCard title="Valor total" main={formatCurrency(os.totalPrice)} secondary={`${formatQty(os.items?.length || 0)} item(ns)`} accent="var(--success)" />
        <SummaryCard title="Status atual" main={currentBadge?.label || os.status} secondary={`Abertura: ${formatDate(os.createdAt)}`} accent="var(--danger)" />
      </div>

      <Section title="Servicos e pecas" className="print-block print-block-os print-block-financeiro">
        {cleanNotes ? (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
            {cleanNotes}
          </div>
        ) : null}

        {os.items.length === 0 ? (
          <div className="text-muted text-sm">Nenhum item adicionado.</div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Servicos</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceItems.length ? serviceItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.itemName}</td>
                      <td>{formatQty(item.quantity)}</td>
                      <td>{formatCurrency(item.unitPrice)}</td>
                      <td><strong>{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</strong></td>
                    </tr>
                  )) : <tr><td colSpan={4} className="text-sm text-muted">Nenhum servico registrado.</td></tr>}
                </tbody>
              </table>
            </div>

            <div>
              <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Pecas</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {productItems.length ? productItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.itemName}</td>
                      <td>{formatQty(item.quantity)}</td>
                      <td>{formatCurrency(item.unitPrice)}</td>
                      <td><strong>{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</strong></td>
                    </tr>
                  )) : <tr><td colSpan={4} className="text-sm text-muted">Nenhuma peca registrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Total da ordem" className="print-block print-block-os print-block-financeiro">
        <div className="grid-3">
          <SummaryCard title="Servicos" main={formatCurrency(serviceItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0))} accent="var(--primary)" />
          <SummaryCard title="Pecas" main={formatCurrency(productItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0))} accent="var(--warning)" />
          <SummaryCard title="Total final" main={formatCurrency(os.totalPrice)} secondary={os.entryKm ? `KM de entrada: ${Number(os.entryKm).toLocaleString('pt-BR')}` : 'KM de entrada nao informado'} accent="var(--success)" />
        </div>
      </Section>

      <div className="print-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
        <div>
          <Section title="Timeline de status" className="print-block print-block-os print-block-whatsapp">
            {statusTimeline.length === 0 ? (
              <div className="text-sm text-muted">Sem eventos de status ainda.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {statusTimeline.map((event) => (
                  <div key={event.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>{event.label}</div>
                      <div className="text-sm text-muted">{formatDateTime(event.createdAt)}</div>
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                      {event.user?.name ? `Atualizado por ${event.user.name}` : 'Atualizacao automatica'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Historico de mensagens" className="print-block print-block-whatsapp">
            {messageHistory.length === 0 ? (
              <div className="text-sm text-muted">Nenhuma mensagem enviada para esta OS.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {messageHistory.map((message) => {
                  const friendlyError = getFriendlyWhatsAppError(message.errorMessage);
                  return (
                    <div key={message.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>{message.phone || 'WhatsApp do cliente'}</div>
                        <div className="text-sm text-muted">{formatDateTime(message.createdAt)}</div>
                      </div>
                      <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>{message.content}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`badge ${MESSAGE_STATUS[message.status]?.badge || 'badge-gray'}`}>{MESSAGE_STATUS[message.status]?.label || message.status}</span>
                        {message.status === 'FAILED' ? <span className="text-sm" style={{ color: '#b91c1c' }}>{friendlyError}</span> : null}
                        {message.status === 'FAILED' ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleResend(message.id)}
                            disabled={!!resendingMap[message.id] || !os.integrationStatus?.whatsappConfigured}
                          >
                            {resendingMap[message.id] ? 'Reenviando...' : 'Reenviar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Atualizar status" className="no-print">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_LIST.map((status) => (
                <button
                  key={status.value}
                  className={`btn ${status.value === os.status ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={() => status.value !== os.status && handleStatusChange(status.value)}
                  disabled={updatingStatus || status.value === os.status}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {status.value === os.status ? 'Atual: ' : ''}{status.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Entrega e WhatsApp" className="print-block print-block-entrega">
            <div className="form-group no-print">
              <label className="form-label">Status da entrega</label>
              <select className="form-control" value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}>
                <option value="AWAITING_DISPATCH">Confirmado</option>
                <option value="OUT_FOR_DELIVERY">Enviado</option>
                <option value="DELIVERED">Entregue</option>
                <option value="DELIVERY_FAILED">Falha na entrega</option>
              </select>
            </div>
            <div className="form-group no-print">
              <label className="form-label">Link de localizacao</label>
              <input className="form-control" value={deliveryLocationUrl} onChange={(e) => setDeliveryLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." />
            </div>
            <div className="form-group no-print">
              <label className="form-label">Observacao</label>
              <textarea className="form-control" rows={3} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary btn-sm no-print" onClick={handleDeliveryUpdate} disabled={sendingDelivery || !os.integrationStatus?.whatsappConfigured}>
              {sendingDelivery ? 'Enviando...' : 'Registrar atualizacao'}
            </button>

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div className="text-sm text-muted">Status atual da entrega</div>
              <div style={{ fontWeight: 700 }}>{os.deliveryMeta?.statusLabel || 'Sem atualizacao'}</div>
              {os.deliveryMeta?.locationUrl ? <a href={os.deliveryMeta.locationUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Abrir localizacao</a> : null}
              {os.deliveryMeta?.note ? <div className="text-sm text-muted">{os.deliveryMeta.note}</div> : null}
              {os.deliveryMeta?.updatedAt ? <div className="text-sm text-muted">Ultima atualizacao: {formatDateTime(os.deliveryMeta.updatedAt)}</div> : null}
            </div>
          </Section>

          <Section title="Fotos da OS" className="print-block print-block-fotos">
            <div className="form-group no-print">
              <label className="form-label">Categoria</label>
              <select className="form-control" value={photoCategory} onChange={(e) => setPhotoCategory(e.target.value)}>
                <option value="GENERAL">Geral</option>
                <option value="PART">Peca</option>
                <option value="BEFORE">Antes</option>
                <option value="AFTER">Depois</option>
              </select>
            </div>
            <div className="form-group no-print">
              <label className="form-label">Descricao curta</label>
              <input className="form-control" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Ex: Pastilha nova instalada" />
            </div>
            <div className="form-group no-print">
              <label className="form-label">Fotos</label>
              <input type="file" multiple accept="image/*" className="form-control" onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
            </div>
            <button className="btn btn-primary btn-sm no-print" onClick={handleUploadPhotos} disabled={uploadingPhotos}>
              {uploadingPhotos ? 'Enviando...' : 'Enviar fotos'}
            </button>

            {!os.photos?.length ? (
              <div className="text-sm text-muted" style={{ marginTop: 10 }}>Nenhuma foto cadastrada.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
                {os.photos.map((photo) => (
                  <div key={photo.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                    <img src={photo.url} alt={photo.caption || 'Foto da OS'} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>{photo.category}</div>
                    <div className="text-sm text-muted" style={{ minHeight: 30 }}>{photo.caption || '-'}</div>
                    <button className="btn btn-ghost btn-sm no-print" onClick={() => handleDeletePhoto(photo.id)} disabled={!!deletingPhotoMap[photo.id]}>
                      {deletingPhotoMap[photo.id] ? 'Removendo...' : 'Remover'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
