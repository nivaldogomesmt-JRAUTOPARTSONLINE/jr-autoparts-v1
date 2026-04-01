import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messagesAPI, soAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_LIST = [
  { value: 'QUOTE', label: 'Orcamento', badge: 'badge-gray' },
  { value: 'APPROVED', label: 'Aprovado', badge: 'badge-blue' },
  { value: 'STARTED', label: 'Iniciado', badge: 'badge-purple' },
  { value: 'IN_PROGRESS', label: 'Em Execucao', badge: 'badge-purple' },
  { value: 'WAITING_PART', label: 'Aguardando Peca', badge: 'badge-orange' },
  { value: 'FINISHING', label: 'Finalizando', badge: 'badge-yellow' },
  { value: 'DONE', label: 'Finalizado', badge: 'badge-green' },
  { value: 'DELIVERED', label: 'Entregue', badge: 'badge-green' },
];

const MESSAGE_STATUS = {
  SENT: { label: 'Enviada', badge: 'badge-green' },
  FAILED: { label: 'Falhou', badge: 'badge-red' },
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
    const allowed = PRINT_THEMES.map((theme) => theme.value);
    return allowed.includes(saved) ? saved : 'os';
  } catch {
    return 'os';
  }
}

function formatDateTime(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

/** Remove metadados internos [DELIVERY_META] e qualquer JSON que venha após */
function stripDeliveryMeta(notes) {
  if (!notes) return '';
  const idx = notes.indexOf('[DELIVERY_META]');
  return idx !== -1 ? notes.slice(0, idx).trim() : notes;
}

function formatQty(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) return '0';
  if (Number.isInteger(qty)) return qty.toLocaleString('pt-BR');
  return qty.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, [id]);

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
      // ignore storage errors
    }
  }, [printTheme]);

  const handleStatusChange = async (newStatus) => {
    const label = STATUS_LIST.find((s) => s.value === newStatus)?.label;
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
    setSendingDelivery(true);
    try {
      await soAPI.updateDelivery(id, {
        deliveryStatus,
        locationUrl: deliveryLocationUrl || null,
        note: deliveryNote || null,
      });
      await load();
      window.alert('Atualizacao de entrega enviada ao cliente.');
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

  const timeline = useMemo(() => {
    if (!os) return [];

    const statusEvents = (os.statusLogs || []).map((log) => ({
      id: `status-${log.id}`,
      createdAt: log.createdAt,
      type: 'STATUS',
      title: `Status alterado para ${STATUS_LIST.find((s) => s.value === log.newStatus)?.label || log.newStatus}`,
      subtitle: log.user?.name ? `por ${log.user.name}` : '',
    }));

    const messageEvents = (os.messages || []).map((m) => ({
      id: `message-${m.id}`,
      createdAt: m.createdAt,
      type: 'MESSAGE',
      status: m.status,
      messageId: m.id,
      phone: m.phone,
      content: m.content,
      title: `WhatsApp ${MESSAGE_STATUS[m.status]?.label || m.status}`,
      subtitle: m.phone || '',
      errorMessage: m.errorMessage || '',
    }));

    return [...statusEvents, ...messageEvents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [os]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!os) return null;

  const currentBadge = STATUS_LIST.find((s) => s.value === os.status);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">OS #{os.number}</div>
          <div className="page-subtitle">
            <span className={`badge ${currentBadge?.badge}`}>{currentBadge?.label}</span>
            <span style={{ marginLeft: 8 }}>{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="text-sm text-muted">Tema da impressao:</span>
            <select className="form-control" style={{ minWidth: 220 }} value={printTheme} onChange={(e) => setPrintTheme(e.target.value)}>
              {PRINT_THEMES.map((theme) => (
                <option key={theme.value} value={theme.value}>{theme.label}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={handlePrint}>Imprimir OS</button>
          <Link to="/os" className="btn btn-ghost btn-sm">Voltar</Link>
          <Link to={`/os/${id}/editar`} className="btn btn-outline btn-sm">Editar</Link>
          {can('delete') ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteOrder}>Excluir</button>
          ) : null}
        </div>
      </div>

      {/* Painel de resumo rápido — visível apenas na tela */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div className="card" style={{ padding: '12px 16px', marginBottom: 0 }}>
          <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Cliente</div>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{os.client?.name || '-'}</div>
          <div className="text-sm text-muted">{os.client?.phone || '-'}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', marginBottom: 0 }}>
          <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Veículo</div>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{os.vehicle?.brand} {os.vehicle?.model}</div>
          <div className="text-sm text-muted">{os.vehicle?.plate}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', marginBottom: 0 }}>
          <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Total</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1A3C5E' }}>
            R$ {parseFloat(os.totalPrice || 0).toFixed(2).replace('.', ',')}
          </div>
          <div className="text-sm text-muted">{os.items?.length || 0} {os.items?.length === 1 ? 'item' : 'itens'}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', marginBottom: 0 }}>
          <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Status</div>
          <span className={`badge ${currentBadge?.badge}`}>{currentBadge?.label}</span>
          <div className="text-sm text-muted" style={{ marginTop: 4 }}>Abertura: {formatDate(os.createdAt)}</div>
        </div>
      </div>

      <div className="print-only card" style={{ marginBottom: 14 }}>
        <div className="card-title">Resumo para Impressao</div>
        <div className="grid-2">
          <div>
            <div className="text-sm text-muted">Cliente</div>
            <div style={{ fontWeight: 700 }}>{os.client?.name || '-'}</div>
            <div className="text-sm text-muted">{os.client?.phone || '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Veiculo</div>
            <div style={{ fontWeight: 700 }}>{os.vehicle?.brand} {os.vehicle?.model} ({os.vehicle?.plate})</div>
            <div className="text-sm text-muted">Data: {formatDate(os.createdAt)}</div>
          </div>
        </div>
      </div>

      <div className="print-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div>
          <div className="card print-block print-block-os print-block-financeiro print-block-fotos print-block-entrega print-block-whatsapp" style={{ marginBottom: 16 }}>
            <div className="card-title">Dados da OS</div>
            <div className="grid-2">
              <div>
                <div className="text-sm text-muted">Cliente</div>
                <div style={{ fontWeight: 600 }}>{os.client.name}</div>
                <div className="text-sm text-muted">{os.client.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Veiculo</div>
                <div style={{ fontWeight: 600 }}>{os.vehicle.brand} {os.vehicle.model} ({os.vehicle.plate})</div>
                {os.entryKm ? <div className="text-sm text-muted">KM entrada: {Number(os.entryKm).toLocaleString('pt-BR')}</div> : null}
              </div>
            </div>
            {stripDeliveryMeta(os.notes) ? (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                {stripDeliveryMeta(os.notes)}
              </div>
            ) : null}
          </div>

          <div className="card print-block print-block-os print-block-financeiro" style={{ marginBottom: 16 }}>
            <div className="card-title">Servicos e Pecas</div>
            {os.items.length === 0 ? (
              <div className="text-muted text-sm">Nenhum item adicionado.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {os.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className={`badge ${item.type === 'SERVICE' ? 'badge-blue' : 'badge-gray'}`}>
                          {item.type === 'SERVICE' ? 'Serv.' : 'Peca'}
                        </span>
                      </td>
                      <td>{item.itemName}</td>
                      <td>{formatQty(item.quantity)}</td>
                      <td>R$ {parseFloat(item.unitPrice).toFixed(2).replace('.', ',')}</td>
                      <td><strong>R$ {(parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2).replace('.', ',')}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                    <td style={{ fontWeight: 700, color: '#1A3C5E', fontSize: 16 }}>
                      R$ {parseFloat(os.totalPrice).toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="card print-block print-block-fotos" style={{ marginBottom: 16 }}>
            <div className="card-title">Fotos da Ordem de Servico</div>
            <div className="form-row no-print" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-control" value={photoCategory} onChange={(e) => setPhotoCategory(e.target.value)}>
                  <option value="GENERAL">Geral</option>
                  <option value="PART">Peca</option>
                  <option value="BEFORE">Antes</option>
                  <option value="AFTER">Depois</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Descricao curta</label>
                <input className="form-control" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Ex: Pastilha nova instalada" />
              </div>
              <div className="form-group">
                <label className="form-label">Fotos</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="form-control"
                  onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
                />
              </div>
            </div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleUploadPhotos} disabled={uploadingPhotos}>
                {uploadingPhotos ? 'Enviando...' : 'Enviar fotos'}
              </button>
            </div>

            {!os.photos?.length ? (
              <div className="text-sm text-muted">Nenhuma foto cadastrada nesta OS.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {os.photos.map((photo) => (
                  <div key={photo.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                    <img src={photo.url} alt={photo.caption || 'Foto OS'} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>{photo.category}</div>
                    <div className="text-sm text-muted" style={{ minHeight: 32 }}>{photo.caption || '-'}</div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDeletePhoto(photo.id)}
                      disabled={!!deletingPhotoMap[photo.id]}
                    >
                      {deletingPhotoMap[photo.id] ? 'Removendo...' : 'Remover'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card print-block print-block-whatsapp">
            <div className="card-title">Linha do Tempo da OS</div>
            {timeline.length === 0 ? (
              <div className="text-sm text-muted">Sem eventos ainda.</div>
            ) : (
              <>
                {/* Eventos de mudança de status */}
                {timeline.filter(e => e.type === 'STATUS').length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', marginBottom: 6 }}>
                      Histórico de Status
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {timeline.filter(e => e.type === 'STATUS').map((event) => (
                        <div key={event.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#f8fafc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{event.title}</div>
                            <div className="text-sm text-muted">{formatDateTime(event.createdAt)}</div>
                          </div>
                          {event.subtitle ? <div className="text-sm text-muted">{event.subtitle}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Eventos de envio WhatsApp */}
                {timeline.filter(e => e.type === 'MESSAGE').length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', marginBottom: 6 }}>
                      Envios WhatsApp
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {timeline.filter(e => e.type === 'MESSAGE').map((event) => (
                        <div key={event.id} style={{ border: `1px solid ${event.status === 'FAILED' ? '#fee2e2' : '#f1f5f9'}`, borderRadius: 8, padding: 10, background: event.status === 'FAILED' ? '#fff7f7' : '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{event.title}</div>
                            <div className="text-sm text-muted">{formatDateTime(event.createdAt)}</div>
                          </div>
                          <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{event.subtitle}</div>
                          <div style={{ fontSize: 13, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{event.content}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className={`badge ${MESSAGE_STATUS[event.status]?.badge || 'badge-gray'}`}>
                              {MESSAGE_STATUS[event.status]?.label || event.status}
                            </span>
                            {event.status === 'FAILED' ? (
                              <span
                                className="text-sm"
                                style={{ color: '#b91c1c', cursor: event.errorMessage ? 'help' : 'default' }}
                                title={event.errorMessage || ''}
                              >
                                ⚠ Falha no envio{event.errorMessage ? ' (passe o mouse para detalhes)' : ''}
                              </span>
                            ) : null}
                            {event.status === 'FAILED' ? (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleResend(event.messageId)}
                                disabled={!!resendingMap[event.messageId]}
                              >
                                {resendingMap[event.messageId] ? 'Reenviando...' : 'Reenviar'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="card no-print" style={{ marginBottom: 16 }}>
            <div className="card-title">Atualizar Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_LIST.map((s) => (
                <button
                  key={s.value}
                  className={`btn ${s.value === os.status ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={() => s.value !== os.status && handleStatusChange(s.value)}
                  disabled={updatingStatus || s.value === os.status}
                  style={{ justifyContent: 'flex-start', opacity: s.value === os.status ? 1 : 0.85 }}
                >
                  {s.value === os.status ? 'Atual: ' : ''}{s.label}
                </button>
              ))}
            </div>
            {updatingStatus ? <div className="text-sm text-muted" style={{ marginTop: 8 }}>Atualizando...</div> : null}
          </div>



                    <div className="card print-block print-block-entrega" style={{ marginBottom: 16 }}>
            <div className="card-title">Campo de Entrega</div>

            <div className="no-print">
              <div className="form-group">
                <label className="form-label">Status da entrega</label>
                <select className="form-control" value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}>
                  <option value="AWAITING_DISPATCH">Aguardando envio</option>
                  <option value="OUT_FOR_DELIVERY">Saiu para entrega</option>
                  <option value="DELIVERED">Entregue</option>
                  <option value="DELIVERY_FAILED">Tentativa sem sucesso</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Link de localizacao (opcional)</label>
                <input className="form-control" placeholder="https://maps.google.com/..." value={deliveryLocationUrl} onChange={(e) => setDeliveryLocationUrl(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Observacao da entrega</label>
                <textarea className="form-control" rows={2} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleDeliveryUpdate} disabled={sendingDelivery}>
                {sendingDelivery ? 'Enviando...' : 'Enviar atualizacao via WhatsApp'}
              </button>
            </div>

            <div className="print-only" style={{ marginTop: 6 }}>
              <div className="text-sm text-muted">Status da entrega</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {os.deliveryMeta?.statusLabel || '-'}
              </div>
              <div className="text-sm text-muted">Link de localizacao</div>
              <div style={{ marginBottom: 6 }}>{os.deliveryMeta?.locationUrl || '-'}</div>
              <div className="text-sm text-muted">Observacao</div>
              <div>{os.deliveryMeta?.note || '-'}</div>
            </div>
            {os.deliveryMeta?.updatedAt ? (
              <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                Ultima atualizacao: {formatDateTime(os.deliveryMeta.updatedAt)}
              </div>
            ) : null}
          </div>

          <div className="card print-block print-block-whatsapp">
            <div className="card-title">Resumo WhatsApp</div>
            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
              Envios automaticos por mudanca de status.
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(os.messages || []).slice(0, 5).map((m) => (
                <div key={m.id} style={{ fontSize: 13, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatDateTime(m.createdAt)}</span>
                    <span className={`badge ${MESSAGE_STATUS[m.status]?.badge || 'badge-gray'}`}>
                      {MESSAGE_STATUS[m.status]?.label || m.status}
                    </span>
                  </div>
                  {m.status === 'FAILED' ? (
                    <div
                      className="text-sm"
                      style={{ color: '#b91c1c', marginTop: 4, cursor: m.errorMessage ? 'help' : 'default' }}
                      title={m.errorMessage || ''}
                    >
                      ⚠ Falha no envio
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <Link to="/mensagens" className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }}>Ver log completo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}









