import { useState, useEffect, useCallback } from 'react';
import { botconversaAPI } from '../../services/api';

const STATUS_COLOR = {
  ok: '#16a34a',
  erro: '#dc2626',
  pendente: '#d97706',
};

function Badge({ color, children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      background: `${color}18`,
      color,
      fontWeight: 600,
      fontSize: 12,
    }}>
      {children}
    </span>
  );
}

function EnvRow({ label, value }) {
  const configured = value && value !== 'null' && value !== 'undefined';
  return (
    <tr>
      <td style={{ fontFamily: 'monospace', fontSize: 12, paddingRight: 12, color: '#374151', whiteSpace: 'nowrap' }}>{label}</td>
      <td>
        {configured
          ? <Badge color={STATUS_COLOR.ok}>{value}</Badge>
          : <Badge color={STATUS_COLOR.erro}>não configurada</Badge>}
      </td>
    </tr>
  );
}

export default function BotconversaPage() {
  const [status, setStatus] = useState(null);
  const [synced, setSynced] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, syncedRes] = await Promise.all([
        botconversaAPI.getStatus(),
        botconversaAPI.getSubscribersSynced(),
      ]);
      setStatus(statusRes.data);
      setSynced(syncedRes.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao carregar status do BotConversa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSyncAll = async () => {
    setSyncLoading(true);
    setSyncMsg('');
    try {
      const res = await botconversaAPI.syncAll();
      setSyncMsg(res.data?.message || 'Sincronização iniciada em background.');
    } catch (err) {
      setSyncMsg(err?.response?.data?.error || 'Erro ao iniciar sincronização.');
    } finally {
      setSyncLoading(false);
      setTimeout(() => loadStatus(), 3000);
    }
  };

  const handleTestMessage = async () => {
    if (!testPhone || !testMessage) {
      setTestMsg('Informe o telefone e a mensagem.');
      return;
    }
    setTestLoading(true);
    setTestMsg('');
    try {
      await botconversaAPI.testMessage({ phone: testPhone, message: testMessage });
      setTestMsg('Mensagem enviada com sucesso!');
    } catch (err) {
      setTestMsg(err?.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setTestLoading(false);
    }
  };

  const isEnabled = status?.config?.enabled;
  const envVars = status?.config?.envVars || {};
  const flows = status?.flows || [];
  const tags = status?.tags || [];
  const sequences = status?.sequences || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">BotConversa — Automação WhatsApp</div>
          <div className="page-subtitle">Configuração, status e operações manuais da integração BotConversa</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={loadStatus} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {error ? (
        <div className="card" style={{ marginBottom: 16, color: STATUS_COLOR.erro }}>
          {error}
        </div>
      ) : null}

      {/* Status geral */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Status da Integração</div>
          {loading ? (
            <div className="text-sm text-muted">Carregando...</div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                {isEnabled
                  ? <Badge color={STATUS_COLOR.ok}>✓ API KEY configurada — integração ativa</Badge>
                  : <Badge color={STATUS_COLOR.erro}>✗ BOTCONVERSA_API_KEY não configurada</Badge>}
              </div>
              {!isEnabled && (
                <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
                  Para ativar a integração, adicione a variável de ambiente <code>BOTCONVERSA_API_KEY</code> no painel do Render (Settings → Environment Variables).
                  A chave está disponível em: <strong>BotConversa → Configurações → API Key</strong>.
                </div>
              )}
              {status?.error ? (
                <div className="text-sm" style={{ color: STATUS_COLOR.erro, marginTop: 8 }}>
                  Erro de conexão: {status.error}
                </div>
              ) : null}
              {status?.ok ? (
                <div className="text-sm" style={{ color: STATUS_COLOR.ok }}>
                  Conexão com a API estabelecida com sucesso.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">Assinantes Sincronizados</div>
          {loading ? (
            <div className="text-sm text-muted">Carregando...</div>
          ) : synced ? (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#1A3C5E' }}>{synced.synced}</div>
                  <div className="text-sm text-muted">Sincronizados</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{synced.pending}</div>
                  <div className="text-sm text-muted">Pendentes</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#64748b' }}>{synced.total}</div>
                  <div className="text-sm text-muted">Total clientes ativos</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSyncAll}
                  disabled={syncLoading || !isEnabled}
                >
                  {syncLoading ? 'Iniciando...' : 'Sincronizar todos'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={loadStatus} disabled={loading}>
                  Atualizar contagem
                </button>
              </div>
              {syncMsg ? <div className="text-sm" style={{ marginTop: 8 }}>{syncMsg}</div> : null}
            </>
          ) : (
            <div className="text-sm text-muted">Dados não disponíveis.</div>
          )}
        </div>
      </div>

      {/* Variáveis de ambiente */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Variáveis de Ambiente (Render)</div>
        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
          Configure estas variáveis no painel do Render para ativar cada evento de automação.
          Os IDs de flows, tags e sequences estão disponíveis no painel do BotConversa.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 6, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Variável</th>
                <th style={{ textAlign: 'left', paddingBottom: 6, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Valor atual</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(envVars).map(([key, val]) => (
                <EnvRow key={key} label={key} value={val} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flows / Tags / Sequences disponíveis */}
      {isEnabled && (flows.length > 0 || tags.length > 0 || sequences.length > 0) ? (
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">Flows disponíveis na conta</div>
            {flows.length === 0 ? (
              <div className="text-sm text-muted">Nenhum flow encontrado.</div>
            ) : (
              <div className="table-container" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.id}</td>
                        <td>{f.name || f.title || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Tags e Sequências</div>
            {tags.length > 0 ? (
              <>
                <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {tags.map((t) => (
                    <span key={t.id} style={{ background: '#f1f5f9', borderRadius: 8, padding: '2px 8px', fontSize: 12 }}>
                      {t.id} — {t.name || t.label || '-'}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            {sequences.length > 0 ? (
              <>
                <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Sequências</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sequences.map((s) => (
                    <span key={s.id} style={{ background: '#f0fdf4', borderRadius: 8, padding: '2px 8px', fontSize: 12 }}>
                      {s.id} — {s.name || s.title || '-'}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            {tags.length === 0 && sequences.length === 0 ? (
              <div className="text-sm text-muted">Nenhuma tag ou sequência encontrada.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Mensagem de teste */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Enviar Mensagem de Teste</div>
        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
          Envia uma mensagem direta (texto) para um número via BotConversa. Use para validar a API KEY.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Telefone (com DDD, ex: 65999999999)</label>
            <input
              className="form-control"
              placeholder="65999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Mensagem</label>
            <input
              className="form-control"
              placeholder="Olá! Teste de integração JR Auto Parts."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTestMessage}
            disabled={testLoading || !isEnabled}
          >
            {testLoading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
        {testMsg ? (
          <div className="text-sm" style={{ marginTop: 8, color: testMsg.includes('sucesso') ? STATUS_COLOR.ok : STATUS_COLOR.erro }}>
            {testMsg}
          </div>
        ) : null}
        {!isEnabled ? (
          <div className="text-sm text-muted" style={{ marginTop: 8 }}>
            Configure a BOTCONVERSA_API_KEY no Render para habilitar o envio de mensagens.
          </div>
        ) : null}
      </div>

      {/* Guia de eventos */}
      <div className="card">
        <div className="card-title">Eventos Automatizados</div>
        <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
          A integração dispara automaticamente os eventos abaixo. Configure as variáveis de ambiente correspondentes para ativar cada um.
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Variável de Ambiente</th>
                <th>Tipo</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>OS Iniciada</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_STARTED</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Dispara quando uma OS muda para status STARTED</td>
              </tr>
              <tr>
                <td>OS Em Execução</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_IN_PROGRESS</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Dispara quando a OS entra em IN_PROGRESS</td>
              </tr>
              <tr>
                <td>OS Aguardando Peça</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_WAITING_PART</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Notifica o cliente que está aguardando peça</td>
              </tr>
              <tr>
                <td>OS Finalizando</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_FINISHING</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Avisa que o serviço está sendo finalizado</td>
              </tr>
              <tr>
                <td>OS Finalizada</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_DONE</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Notifica conclusão do serviço</td>
              </tr>
              <tr>
                <td>OS Entregue</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_OS_DELIVERED</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Confirmação de entrega do veículo</td>
              </tr>
              <tr>
                <td>Acesso ao Portal</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_PORTAL_ACCESS</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Envia credenciais de acesso ao portal do cliente</td>
              </tr>
              <tr>
                <td>Alerta de Manutenção</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_FLOW_MAINTENANCE_ALERT</td>
                <td>Flow</td>
                <td className="text-sm text-muted">Notifica manutenção vencida ou próxima do vencimento</td>
              </tr>
              <tr>
                <td>Pós-Serviço (drip)</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_SEQUENCE_POST_SERVICE</td>
                <td>Sequence</td>
                <td className="text-sm text-muted">Sequência de acompanhamento após entrega do veículo</td>
              </tr>
              <tr>
                <td>Sequência Manutenção</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_SEQUENCE_MAINTENANCE</td>
                <td>Sequence</td>
                <td className="text-sm text-muted">Sequência de lembretes de manutenção preventiva</td>
              </tr>
              <tr>
                <td>Tag Portal Cliente</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_TAG_CLIENT_PORTAL</td>
                <td>Tag</td>
                <td className="text-sm text-muted">Aplicada ao ativar acesso ao portal do cliente</td>
              </tr>
              <tr>
                <td>Tag Manutenção Vencida</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>BOTCONVERSA_TAG_MAINTENANCE_OVERDUE</td>
                <td>Tag</td>
                <td className="text-sm text-muted">Aplicada/removida conforme alerta de manutenção vencida</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
