import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientsAPI, integrationLogsAPI, productsAPI, soAPI, vehiclesAPI } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const HUB_TABS = [
  { key: 'integracoes', label: '1. Integrações' },
  { key: 'importacoes', label: '2. Importações' },
  { key: 'exportacoes', label: '3. Exportações' },
  { key: 'logs', label: '4. Logs' },
];

const SECTION_ID_BY_TAB = {
  integracoes: 'section-integracoes',
  importacoes: 'section-importacoes',
  exportacoes: 'section-exportacoes',
  logs: 'section-logs',
};
function formatLogWhen(iso) {
  if (!iso) return '-';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return `${parsed.toLocaleDateString('pt-BR')} ${parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}


function shortStatusLabel(status) {
  if (status === 'UPDATED') return 'Atualizado';
  if (status === 'PREVIEW') return 'Previsão';
  if (status === 'SKIPPED_COMPLETE') return 'Já completo';
  if (status === 'NO_DATA') return 'Sem novidade';
  if (status === 'ERROR') return 'Erro';
  return status || '-';
}

export default function IntegrationsHubPage() {
  const [xmlFile, setXmlFile] = useState(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlFeedback, setXmlFeedback] = useState('');

  const [rastrekClientsFile, setRastrekClientsFile] = useState(null);
  const [rastrekVehiclesFile, setRastrekVehiclesFile] = useState(null);
  const [rastrekLoading, setRastrekLoading] = useState(false);
  const [rastrekFeedback, setRastrekFeedback] = useState('');

  const [plateBatchLimit, setPlateBatchLimit] = useState(40);
  const [plateBatchOverwrite, setPlateBatchOverwrite] = useState(false);
  const [plateBatchIncludeInactive, setPlateBatchIncludeInactive] = useState(false);
  const [plateBatchLoading, setPlateBatchLoading] = useState(false);
  const [plateBatchFeedback, setPlateBatchFeedback] = useState('');
  const [plateBatchResult, setPlateBatchResult] = useState(null);

  const [exportingClients, setExportingClients] = useState(false);
  const [exportingConsolidated, setExportingConsolidated] = useState(false);
  const [exportingVehicles, setExportingVehicles] = useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [exportingOrders, setExportingOrders] = useState(false);
  const [exportSearch, setExportSearch] = useState('');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportOrderStatus, setExportOrderStatus] = useState('');
  const [exportOrderPhase, setExportOrderPhase] = useState('');
  const [exportDeliveryStatus, setExportDeliveryStatus] = useState('');
  const [exportIncludeInactive, setExportIncludeInactive] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');
  const debouncedLogsSearch = useDebouncedValue(logsSearch, 220);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = String(searchParams.get('tab') || 'integracoes').toLowerCase();
  const currentTab = HUB_TABS.some((tab) => tab.key === tabParam) ? tabParam : 'integracoes';

  const setCurrentTab = useCallback((tabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabKey);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const getSectionCardStyle = useCallback((tabKey) => {
    if (currentTab !== tabKey) return undefined;
    return {
      border: '2px solid #1A3C5E',
      boxShadow: '0 0 0 2px rgba(26, 60, 94, 0.12)',
    };
  }, [currentTab]);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const res = await integrationLogsAPI.list({
        search: String(debouncedLogsSearch || '').trim(),
        page: 1,
        limit: 80,
      });
      setLogs(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setLogsError(err?.response?.data?.error || 'Nao foi possivel carregar os logs.');
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [debouncedLogsSearch]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const sectionId = SECTION_ID_BY_TAB[currentTab];
    if (!sectionId) return undefined;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);

    return () => window.clearTimeout(timer);
  }, [currentTab]);

  const registerIntegrationLog = useCallback(async (entry) => {
    try {
      await integrationLogsAPI.create(entry);
      await loadLogs();
    } catch {
      // Nao bloqueia o fluxo principal
    }
  }, [loadLogs]);

  const filteredLogs = useMemo(() => logs, [logs]);

  const downloadBlob = (data, filename) => {
    const blob = new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleImportXml = async () => {
    if (!xmlFile) {
      setXmlFeedback('Selecione um XML para importar.');
      return;
    }

    setXmlLoading(true);
    setXmlFeedback('');
    try {
      const res = await productsAPI.importXml(xmlFile);
      const created = Number(res.data?.created || 0);
      const updated = Number(res.data?.updated || 0);
      const msg = `XML importado com sucesso. Criados: ${created}, Atualizados: ${updated}.`;
      setXmlFeedback(msg);
      await registerIntegrationLog({        area: 'Importacao XML',
        user: 'Operacao Manual',
        quantity: created + updated,
        failures: 0,
        reason: '-',
      });
      setXmlFile(null);
    } catch (err) {
      const reason = err?.response?.data?.error || 'Falha ao importar XML.';
      setXmlFeedback(reason);
      await registerIntegrationLog({        area: 'Importacao XML',
        user: 'Operacao Manual',
        quantity: 0,
        failures: 1,
        reason,
      });
    } finally {
      setXmlLoading(false);
    }
  };

  const runRastrekImport = async (dryRun) => {
    if (!rastrekClientsFile || !rastrekVehiclesFile) {
      setRastrekFeedback('Selecione os 2 arquivos (clientes e veiculos) para importar da Rastrek.');
      return;
    }

    setRastrekLoading(true);
    setRastrekFeedback('');
    try {
      const res = await clientsAPI.importRastrek(rastrekClientsFile, rastrekVehiclesFile, { dryRun });
      const summary = res.data?.summary || {};
      const totalImported = Number(summary.clientsCreated || 0)
        + Number(summary.clientsUpdated || 0)
        + Number(summary.vehiclesCreated || 0)
        + Number(summary.vehiclesUpdated || 0);
      const msg = dryRun
        ? `Simulacao concluida. Potenciais alteracoes: ${totalImported}.`
        : `Importacao concluida. Registros processados: ${totalImported}.`;
      setRastrekFeedback(msg);
      await registerIntegrationLog({        area: dryRun ? 'Simulacao Rastrek' : 'Importacao Rastrek',
        user: 'Operacao Manual',
        quantity: totalImported,
        failures: Number(summary.skippedVehicles || 0),
        reason: Number(summary.skippedVehicles || 0) > 0 ? 'Alguns veiculos foram ignorados por validacao.' : '-',
      });
    } catch (err) {
      const reason = err?.response?.data?.error || 'Falha ao importar base Rastrek.';
      setRastrekFeedback(reason);
      await registerIntegrationLog({        area: dryRun ? 'Simulacao Rastrek' : 'Importacao Rastrek',
        user: 'Operacao Manual',
        quantity: 0,
        failures: 1,
        reason,
      });
    } finally {
      setRastrekLoading(false);
    }
  };

  const runPlateBatch = async (apply) => {
    const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(plateBatchLimit || ''), 10) || 40));

    setPlateBatchLoading(true);
    setPlateBatchFeedback('');
    setPlateBatchResult(null);
    try {
      const res = await vehiclesAPI.enrichBatchByPlate({
        apply,
        overwrite: plateBatchOverwrite,
        includeInactive: plateBatchIncludeInactive,
        limit: safeLimit,
      });

      const summary = res.data?.summary || {};
      const scanned = Number(summary.scanned || 0);
      const updated = Number(summary.updated || 0);
      const preview = Number(summary.previewUpdates || 0);
      const errors = Number(summary.errors || 0);

      const msg = apply
        ? `Compilacao aplicada. Lidos: ${scanned}, atualizados: ${updated}, erros: ${errors}.`
        : `Simulacao concluida. Lidos: ${scanned}, potenciais atualizacoes: ${preview}, erros: ${errors}.`;

      setPlateBatchFeedback(msg);
      setPlateBatchResult(res.data || null);

      await registerIntegrationLog({        area: apply ? 'Compilacao Placas (Aplicar)' : 'Compilacao Placas (Simulacao)',
        user: 'Operacao Manual',
        quantity: apply ? updated : preview,
        failures: errors,
        reason: errors > 0 ? 'Algumas placas falharam na consulta.' : '-',
      });
    } catch (err) {
      const reason = err?.response?.data?.error || 'Falha ao compilar dados de placas.';
      setPlateBatchFeedback(reason);
      await registerIntegrationLog({        area: apply ? 'Compilacao Placas (Aplicar)' : 'Compilacao Placas (Simulacao)',
        user: 'Operacao Manual',
        quantity: 0,
        failures: 1,
        reason,
      });
    } finally {
      setPlateBatchLoading(false);
    }
  };

  const handleExportClients = async () => {
    setExportingClients(true);
    try {
      const res = await clientsAPI.exportFile({});
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `clientes_export_${today}.xlsx`);
      await loadLogs();
    } catch (err) {
      await loadLogs();
    } finally {
      setExportingClients(false);
    }
  };

  const handleExportConsolidated = async () => {
    setExportingConsolidated(true);
    try {
      const res = await clientsAPI.exportConsolidated({});
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `clientes_placas_consolidado_${today}.xlsx`);
      await loadLogs();
    } catch (err) {
      await loadLogs();
    } finally {
      setExportingConsolidated(false);
    }
  };

  const handleExportVehicles = async () => {
    setExportingVehicles(true);
    try {
      const res = await vehiclesAPI.exportFile({
        search: String(exportSearch || '').trim(),
        includeInactive: exportIncludeInactive,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `veiculos_export_${today}.xlsx`);
      await loadLogs();
    } catch (err) {
      await loadLogs();
    } finally {
      setExportingVehicles(false);
    }
  };

  const handleExportProducts = async () => {
    setExportingProducts(true);
    try {
      const res = await productsAPI.exportFile({
        search: String(exportSearch || '').trim(),
        active: exportIncludeInactive ? undefined : true,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `produtos_export_${today}.xlsx`);
      await loadLogs();
    } catch (err) {
      await loadLogs();
    } finally {
      setExportingProducts(false);
    }
  };

  const handleExportOrders = async () => {
    setExportingOrders(true);
    try {
      const res = await soAPI.exportFile({
        search: String(exportSearch || '').trim(),
        status: exportOrderStatus || undefined,
        orderPhase: exportOrderPhase || undefined,
        deliveryStatus: exportDeliveryStatus || undefined,
        dateFrom: exportDateFrom || undefined,
        dateTo: exportDateTo || undefined,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `os_export_${today}.xlsx`);
      await loadLogs();
    } catch (err) {
      await loadLogs();
    } finally {
      setExportingOrders(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Integracoes, Importacoes e Exportacoes</div>
          <div className="page-subtitle">Central operacional para integracoes e movimentacao de dados</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {HUB_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={currentTab === tab.key ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => setCurrentTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div id={SECTION_ID_BY_TAB.integracoes} className="card" style={getSectionCardStyle('integracoes')}>
          <div className="card-title">1. Integrações</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Link to="/mensagens" className="btn btn-outline">WhatsApp / Mensagens</Link>
            <Link to="/integracoes/evolution-whatsapp" className="btn btn-outline">WhatsApp - Evolution API (vincular telefone)</Link>
            <Link to="/integracoes/notificacoes" className="btn btn-outline">Central de Notificações</Link>
            <Link to="/integracoes/botconversa" className="btn btn-outline">BotConversa — Automação WhatsApp</Link>
            <Link to="/integracoes/efi-teste" className="btn btn-outline">Teste Efí - Boleto por CPF</Link>
            <Link to="/rastreamento" className="btn btn-outline">Rastreamento / APIs externas</Link>
            <button type="button" className="btn btn-outline" disabled>XML / NF (via importacao)</button>
            <button type="button" className="btn btn-outline" disabled>Pedidos online / marketplaces (estrutura pronta)</button>
          </div>
        </div>

        <div id={SECTION_ID_BY_TAB.importacoes} className="card" style={getSectionCardStyle('importacoes')}>
          <div className="card-title">2. Importações</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Produtos via XML</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input type="file" accept=".xml,text/xml,application/xml" className="form-control" onChange={(e) => setXmlFile(e.target.files?.[0] || null)} />
                <button type="button" className="btn btn-primary" onClick={handleImportXml} disabled={xmlLoading || !xmlFile}>
                  {xmlLoading ? 'Importando...' : 'Importar XML'}
                </button>
              </div>
              {xmlFeedback ? <div className="text-sm" style={{ marginTop: 6 }}>{xmlFeedback}</div> : null}
            </div>

            <div>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Base Rastrek (clientes + veiculos)</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input type="file" className="form-control" accept=".xls,.xlsx" onChange={(e) => setRastrekClientsFile(e.target.files?.[0] || null)} />
                <input type="file" className="form-control" accept=".xls,.xlsx" onChange={(e) => setRastrekVehiclesFile(e.target.files?.[0] || null)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline" onClick={() => runRastrekImport(true)} disabled={rastrekLoading}>Simular</button>
                  <button type="button" className="btn btn-primary" onClick={() => runRastrekImport(false)} disabled={rastrekLoading}>Importar</button>
                </div>
                {rastrekFeedback ? <div className="text-sm">{rastrekFeedback}</div> : null}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Compilar dados de placas (preencher marca/modelo/ano/cor/combustivel)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, marginBottom: 8 }}>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="form-control"
                  value={plateBatchLimit}
                  onChange={(e) => setPlateBatchLimit(e.target.value)}
                  placeholder="Limite"
                />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={plateBatchOverwrite}
                      onChange={(e) => setPlateBatchOverwrite(e.target.checked)}
                    />
                    sobrescrever dados existentes
                  </label>
                  <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={plateBatchIncludeInactive}
                      onChange={(e) => setPlateBatchIncludeInactive(e.target.checked)}
                    />
                    incluir inativos
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" disabled={plateBatchLoading} onClick={() => runPlateBatch(false)}>
                  {plateBatchLoading ? 'Processando...' : 'Simular compilacao'}
                </button>
                <button type="button" className="btn btn-primary" disabled={plateBatchLoading} onClick={() => runPlateBatch(true)}>
                  {plateBatchLoading ? 'Aplicando...' : 'Aplicar compilacao'}
                </button>
              </div>

              {plateBatchFeedback ? <div className="text-sm" style={{ marginTop: 8 }}>{plateBatchFeedback}</div> : null}

              {plateBatchResult?.summary ? (
                <div style={{ marginTop: 8 }} className="text-sm text-muted">
                  Lidos: {Number(plateBatchResult.summary.scanned || 0)} | Candidatos: {Number(plateBatchResult.summary.candidates || 0)} |
                  Atualizados: {Number(plateBatchResult.summary.updated || 0)} | Previsoes: {Number(plateBatchResult.summary.previewUpdates || 0)} |
                  Erros: {Number(plateBatchResult.summary.errors || 0)}
                </div>
              ) : null}

              {plateBatchResult?.rows?.length ? (
                <div className="table-container" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Placa</th>
                        <th>Status</th>
                        <th>Campos</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plateBatchResult.rows.slice(0, 20).map((row) => (
                        <tr key={`${row.id}-${row.plate}-${row.status}`}>
                          <td>{row.plate}</td>
                          <td>{shortStatusLabel(row.status)}</td>
                          <td>{Array.isArray(row.fields) ? row.fields.join(', ') : '-'}</td>
                          <td className="text-sm text-muted">{row.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div id={SECTION_ID_BY_TAB.exportacoes} className="card" style={getSectionCardStyle('exportacoes')}>
          <div className="card-title">3. Exportações</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              className="form-control"
              placeholder="Filtro global de exportacao (cliente, placa, produto, numero da OS...)"
              value={exportSearch}
              onChange={(e) => setExportSearch(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8 }}>
              <input
                type="date"
                className="form-control"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
              />
              <input
                type="date"
                className="form-control"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
              />
            </div>

            <select
              className="form-control"
              value={exportOrderStatus}
              onChange={(e) => setExportOrderStatus(e.target.value)}
            >
              <option value="">Status da OS (todos)</option>
              <option value="QUOTE">Orcamento</option>
              <option value="APPROVED">Aprovado</option>
              <option value="STARTED">Iniciado</option>
              <option value="IN_PROGRESS">Em execucao</option>
              <option value="WAITING_PART">Aguardando peca</option>
              <option value="FINISHING">Finalizando</option>
              <option value="DONE">Finalizado</option>
              <option value="DELIVERED">Entregue</option>
            </select>

            <select
              className="form-control"
              value={exportOrderPhase}
              onChange={(e) => setExportOrderPhase(e.target.value)}
            >
              <option value="">Fase do pedido (todos)</option>
              <option value="CONFIRMED">Pedido confirmado</option>
              <option value="PAYMENT_APPROVED">Pagamento aprovado</option>
              <option value="IN_SEPARATION">Em separacao</option>
              <option value="SHIPPED">Enviado</option>
              <option value="DELIVERED">Entregue</option>
              <option value="CANCELED">Cancelado</option>
            </select>

            <select
              className="form-control"
              value={exportDeliveryStatus}
              onChange={(e) => setExportDeliveryStatus(e.target.value)}
            >
              <option value="">Status da entrega (todos)</option>
              <option value="AWAITING_DISPATCH">Aguardando envio</option>
              <option value="OUT_FOR_DELIVERY">Saiu para entrega</option>
              <option value="DELIVERED">Entregue</option>
              <option value="DELIVERY_FAILED">Tentativa sem sucesso</option>
            </select>

            <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={exportIncludeInactive}
                onChange={(e) => setExportIncludeInactive(e.target.checked)}
              />
              incluir registros inativos (veiculos/produtos)
            </label>

            <button type="button" className="btn btn-outline" onClick={handleExportClients} disabled={exportingClients}>
              {exportingClients ? 'Exportando...' : 'Exportar clientes'}
            </button>
            <button type="button" className="btn btn-outline" onClick={handleExportConsolidated} disabled={exportingConsolidated}>
              {exportingConsolidated ? 'Exportando...' : 'Exportar clientes + placas'}
            </button>
            <button type="button" className="btn btn-outline" onClick={handleExportVehicles} disabled={exportingVehicles}>
              {exportingVehicles ? 'Exportando...' : 'Exportar veiculos'}
            </button>
            <button type="button" className="btn btn-outline" onClick={handleExportProducts} disabled={exportingProducts}>
              {exportingProducts ? 'Exportando...' : 'Exportar produtos'}
            </button>
            <button type="button" className="btn btn-outline" onClick={handleExportOrders} disabled={exportingOrders}>
              {exportingOrders ? 'Exportando...' : 'Exportar ordens de servico'}
            </button>
          </div>
        </div>

        <div id={SECTION_ID_BY_TAB.logs} className="card" style={getSectionCardStyle('logs')}>
          <div className="card-title">4. Logs de operações</div>
          <input
            className="form-control"
            placeholder="Buscar em logs por operacao, usuario, motivo..."
            value={logsSearch}
            onChange={(e) => setLogsSearch(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {logsError ? <div className="text-sm text-danger" style={{ marginBottom: 8 }}>{logsError}</div> : null}
          {logsLoading ? (
            <div className="text-sm text-muted">Carregando logs...</div>
          ) : !filteredLogs.length ? (
            <div className="text-sm text-muted">Sem historico recente. As proximas importacoes/exportacoes executadas por este menu serao registradas aqui.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Operacao</th>
                    <th>Usuario</th>
                    <th>Qtd</th>
                    <th>Falhas</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => (
                    <tr key={`${log.id || log.when || 'log'}-${idx}`}>
                      <td>{formatLogWhen(log.when)}</td>
                      <td>{log.area}</td>
                      <td>{log.user}</td>
                      <td>{log.quantity}</td>
                      <td>{log.failures}</td>
                      <td className="text-sm text-muted">{log.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
