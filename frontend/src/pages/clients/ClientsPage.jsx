import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientsAPI } from '../../services/api';

function formatSummary(summary) {
  if (!summary) return [];
  return [
    ['Clientes criados', summary.clientsCreated],
    ['Clientes atualizados', summary.clientsUpdated],
    ['Veiculos criados', summary.vehiclesCreated],
    ['Veiculos atualizados', summary.vehiclesUpdated],
    ['Rastreadores criados', summary.devicesCreated],
    ['Rastreadores atualizados', summary.devicesUpdated],
    ['Veiculos ignorados', summary.skippedVehicles],
  ];
}

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [rastrekClientsFile, setRastrekClientsFile] = useState(null);
  const [rastrekVehiclesFile, setRastrekVehiclesFile] = useState(null);
  const [importingRastrek, setImportingRastrek] = useState(false);
  const [rastrekResult, setRastrekResult] = useState(null);
  const [rastrekError, setRastrekError] = useState('');
  const [exportingConsolidated, setExportingConsolidated] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientsAPI.list({ search, page, limit: 20 });
      setClients(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, page]);

  const runRastrekImport = async (dryRun) => {
    if (!rastrekClientsFile || !rastrekVehiclesFile) {
      setRastrekError('Selecione os dois arquivos da Rastrek antes de continuar.');
      return;
    }

    setImportingRastrek(true);
    setRastrekError('');

    try {
      const res = await clientsAPI.importRastrek(rastrekClientsFile, rastrekVehiclesFile, { dryRun });
      setRastrekResult(res.data);
      await load();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.error || err?.response?.data?.details || 'Erro ao importar arquivos da Rastrek.';
      setRastrekError(message);
    } finally {
      setImportingRastrek(false);
    }
  };

  const summaryRows = formatSummary(rastrekResult?.summary);

  const downloadConsolidatedExport = async () => {
    setExportingConsolidated(true);
    try {
      const res = await clientsAPI.exportConsolidated({ search });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `clientes_placas_consolidado_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setRastrekError('Nao foi possivel exportar a planilha consolidada.');
    } finally {
      setExportingConsolidated(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-subtitle">{total} clientes cadastrados</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={downloadConsolidatedExport}
            disabled={exportingConsolidated}
          >
            {exportingConsolidated ? 'Exportando...' : 'Exportar cliente + placas'}
          </button>
          <Link to="/clientes/novo" className="btn btn-primary">+ Novo Cliente</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Importar base Rastrek (clientes + veiculos)</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label className="form-label">Arquivo de clientes (.xls/.xlsx)</label>
            <input
              type="file"
              className="form-control"
              accept=".xls,.xlsx"
              onChange={(e) => setRastrekClientsFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <label className="form-label">Arquivo de veiculos (.xls/.xlsx)</label>
            <input
              type="file"
              className="form-control"
              accept=".xls,.xlsx"
              onChange={(e) => setRastrekVehiclesFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => runRastrekImport(true)}
            disabled={importingRastrek}
          >
            {importingRastrek ? 'Processando...' : 'Simular Importacao'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runRastrekImport(false)}
            disabled={importingRastrek}
          >
            {importingRastrek ? 'Importando...' : 'Importar Agora'}
          </button>
        </div>

        {rastrekError ? (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 14 }}>{rastrekError}</div>
        ) : null}

        {rastrekResult ? (
          <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{rastrekResult.message}</div>
            <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Modo: {rastrekResult.mode} | Linhas clientes: {rastrekResult?.totalRows?.clients || 0} | Linhas veiculos: {rastrekResult?.totalRows?.vehicles || 0}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {summaryRows.map(([label, value]) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 6, padding: '8px 10px' }}>
                  <div className="text-sm text-muted">{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">Clientes</div>
            <div className="empty-state-text">Nenhum cliente encontrado</div>
            <Link to="/clientes/novo" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ Cadastrar Cliente</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Veiculos</th>
                  <th>OS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="text-sm text-muted">{c.email}</div>
                    </td>
                    <td className="text-sm">{c.cpfCnpj || '-'}</td>
                    <td className="text-sm">{c.phone || '-'}</td>
                    <td><span className="badge badge-blue">{c._count.vehicles}</span></td>
                    <td><span className="badge badge-gray">{c._count.serviceOrders}</span></td>
                    <td>
                      <Link to={`/clientes/${c.id}`} className="btn btn-outline btn-sm">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 20 ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </button>
            <span style={{ padding: '5px 10px', fontSize: 13 }}>Pagina {page} de {Math.ceil(total / 20)}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={clients.length < 20}
            >
              Proxima
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}



