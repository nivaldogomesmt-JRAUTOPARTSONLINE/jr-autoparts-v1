import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { efiAPI } from '../../services/api';

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function formatCurrency(cents) {
  if (cents == null || cents === undefined) return '-';
  const value = Number(cents) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function statusLabel(status) {
  const map = {
    waiting: 'Aguardando',
    paid: 'Pago',
    settled: 'Baixa manual',
    unpaid: 'Inadimplente',
    expired: 'Expirado',
    canceled: 'Cancelado',
    new: 'Novo',
    link: 'Link',
  };
  return map[status] || status || '-';
}

const STATUS_BADGE_STYLES = {
  paid: { backgroundColor: '#dcfce7', color: '#166534' },
  canceled: { backgroundColor: '#f1f5f9', color: '#475569' },
  expired: { backgroundColor: '#fee2e2', color: '#b91c1c' },
  waiting: { backgroundColor: '#fef9c3', color: '#854d0e' },
  new: { backgroundColor: '#fef9c3', color: '#854d0e' },
  settled: { backgroundColor: '#dcfce7', color: '#166534' },
  unpaid: { backgroundColor: '#fee2e2', color: '#b91c1c' },
  link: { backgroundColor: '#e0e7ff', color: '#3730a3' },
};

export default function EfiBoletoTestPage() {
  const [cpf, setCpf] = useState('');
  const [beginDate, setBeginDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);

  const handleCopyBarcode = (text) => {
    const raw = String(text || '').replace(/\s/g, '');
    if (!raw) return;
    navigator.clipboard.writeText(raw).then(() => {
      setCopyFeedback(raw);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  const handleCpfChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 11) setCpf(raw);
  };

  const handleSearch = async () => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setError('CPF deve conter 11 dígitos.');
      return;
    }
    if (!beginDate || !endDate) {
      setError('Informe o intervalo de datas.');
      return;
    }

    setError('');
    setLoading(true);
    setData(null);

    try {
      const res = await efiAPI.listBoletos({
        cpf: digits,
        beginDate,
        endDate,
      });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao buscar boletos.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const charges = Array.isArray(data?.data) ? data.data : [];
  const params = data?.params || {};
  const summary = charges.length
    ? {
        totalPaid: charges.reduce((acc, c) => acc + (Number(c?.payment?.paid_value) || 0), 0),
        paidCount: charges.filter((c) => c?.status === 'paid').length,
        pendingCount: charges.filter((c) => ['waiting', 'new'].includes(c?.status)).length,
        canceledCount: charges.filter((c) => c?.status === 'canceled').length,
      }
    : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Teste Efí - Busca de Boleto por CPF</div>
          <div className="page-subtitle">
            Consulta boletos na API Cobranças Efí (Gerência Net). Configure EFI_CLIENT_ID e EFI_CLIENT_SECRET no backend.
          </div>
        </div>
        <Link to="/integracoes" className="btn btn-outline btn-sm">
          Voltar às Integrações
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Parâmetros da busca</div>
        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <div>
            <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 4 }}>
              CPF
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="000.000.000-00"
              value={formatCpf(cpf)}
              onChange={handleCpfChange}
              maxLength={14}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 4 }}>
                Data início
              </label>
              <input
                type="date"
                className="form-control"
                value={beginDate}
                onChange={(e) => setBeginDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 4 }}>
                Data fim
              </label>
              <input
                type="date"
                className="form-control"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? 'Buscando...' : 'Buscar Boletos'}
          </button>
          {error ? (
            <div className="text-sm" style={{ color: '#b91c1c' }}>
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {data && !loading && (
        <div className="card">
          <div className="card-title">
            Resultados
            {params?.begin_date && params?.end_date && (
              <span className="text-sm text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                ({formatDate(params.begin_date)} a {formatDate(params.end_date)})
              </span>
            )}
          </div>
          {charges.length === 0 ? (
            <div className="text-muted">Nenhum boleto encontrado para o CPF e período informados.</div>
          ) : (
            <>
              {summary && (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span className="text-sm">
                    <strong>Total:</strong> {charges.length} boleto(s)
                  </span>
                  <span className="text-sm">
                    <strong>Total pago:</strong> {formatCurrency(summary.totalPaid)} ({summary.paidCount} pago(s))
                  </span>
                  <span className="text-sm">
                    <strong>Pendentes:</strong> {summary.pendingCount}
                  </span>
                  <span className="text-sm">
                    <strong>Cancelados:</strong> {summary.canceledCount}
                  </span>
                </div>
              )}
              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>ID</th>
                      <th>Ref. interna</th>
                      <th>Cliente</th>
                      <th>Valor</th>
                      <th>Valor pago</th>
                      <th>Status</th>
                      <th>Vencimento</th>
                      <th>Data pagamento</th>
                      <th>Criado em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((charge) => {
                      const billet = charge?.payment?.banking_billet;
                      const pdfUrl = billet?.pdf?.charge;
                      const linkUrl = billet?.link;
                      const barcode = billet?.barcode;
                      const pixSvg = charge?.payment?.pix?.qrcode_image;
                      const isExpanded = expandedId === charge.id;
                      const badgeStyle = STATUS_BADGE_STYLES[charge?.status] || STATUS_BADGE_STYLES.waiting;
                      const isBarcodeCopied = copyFeedback === (barcode || '').replace(/\s/g, '');
                      return (
                        <Fragment key={charge.id}>
                          <tr>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setExpandedId(isExpanded ? null : charge.id)}
                                style={{ padding: '2px 8px', minWidth: 72 }}
                              >
                                {isExpanded ? 'Ocultar' : 'Detalhes'}
                              </button>
                            </td>
                            <td>{charge.id}</td>
                            <td>{charge?.custom_id || '-'}</td>
                            <td>{charge?.customer?.name || '-'}</td>
                            <td>{formatCurrency(charge.total)}</td>
                            <td>{formatCurrency(charge?.payment?.paid_value)}</td>
                            <td>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  ...badgeStyle,
                                }}
                              >
                                {statusLabel(charge.status)}
                              </span>
                            </td>
                            <td>{formatDate(billet?.expire_at)}</td>
                            <td>{formatDateTime(charge?.payment?.paid_at)}</td>
                            <td>{formatDate(charge.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {linkUrl && (
                                  <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                                    Ver boleto
                                  </a>
                                )}
                                {pdfUrl && (
                                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                                    PDF
                                  </a>
                                )}
                                {!linkUrl && !pdfUrl && <span className="text-muted text-sm">-</span>}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${charge.id}-expanded`}>
                              <td colSpan={11} style={{ padding: 16, backgroundColor: '#f8fafc', verticalAlign: 'top' }}>
                                <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
                                  {barcode && (
                                    <div>
                                      <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Código de barras</div>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{barcode}</code>
                                        <button
                                          type="button"
                                          className="btn btn-outline btn-sm"
                                          onClick={() => handleCopyBarcode(barcode)}
                                        >
                                          {isBarcodeCopied ? 'Copiado!' : 'Copiar'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {pixSvg && charge?.status !== 'paid' && (
                                    <div>
                                      <div className="text-sm text-muted" style={{ marginBottom: 4 }}>QR Code PIX</div>
                                      <div
                                        dangerouslySetInnerHTML={{ __html: pixSvg }}
                                        style={{ width: 120, height: 120 }}
                                      />
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                    {charge?.customer?.phone_number && (
                                      <div>
                                        <span className="text-sm text-muted">Telefone: </span>
                                        <span>{charge.customer.phone_number}</span>
                                      </div>
                                    )}
                                    {charge?.customer?.cpf && (
                                      <div>
                                        <span className="text-sm text-muted">CPF: </span>
                                        <span>{formatCpf(charge.customer.cpf)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
