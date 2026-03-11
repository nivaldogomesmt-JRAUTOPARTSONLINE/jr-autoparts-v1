import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { maintenanceAPI } from '../../services/api';

const ROW_COLORS = {
  OVERDUE: '#fee2e2',
  DUE_SOON: '#fef9c3',
};

const LEVEL_META = {
  OVERDUE: { label: 'Urgencia', className: 'badge-red' },
  DUE_SOON: { label: 'Atencao', className: 'badge-yellow' },
  OK: { label: 'OK', className: 'badge-green' },
};

const PRINT_THEMES = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'todos', label: 'Todos os alertas' },
  { value: 'urgencia', label: 'Somente urgencias' },
  { value: 'atencao', label: 'Somente atencoes' },
];
const PRINT_THEME_STORAGE_KEY = 'jr_print_theme_maintenance';

function getInitialPrintTheme() {
  if (typeof window === 'undefined') return 'todos';
  try {
    const saved = window.localStorage.getItem(PRINT_THEME_STORAGE_KEY);
    const allowed = PRINT_THEMES.map((theme) => theme.value);
    return allowed.includes(saved) ? saved : 'todos';
  } catch {
    return 'todos';
  }
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

export default function MaintenancePage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printTheme, setPrintTheme] = useState(() => getInitialPrintTheme());

  useEffect(() => {
    maintenanceAPI
      .alerts()
      .then((r) => setAlerts(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_THEME_STORAGE_KEY, printTheme);
    } catch {
      // ignore storage errors
    }
  }, [printTheme]);

  const counters = useMemo(() => {
    const overdue = alerts.filter((a) => a.alertLevel === 'OVERDUE').length;
    const dueSoon = alerts.filter((a) => a.alertLevel === 'DUE_SOON').length;
    const ok = alerts.filter((a) => !['OVERDUE', 'DUE_SOON'].includes(a.alertLevel)).length;
    return { overdue, dueSoon, ok };
  }, [alerts]);

  const handlePrint = () => {
    const html = document.documentElement;
    html.setAttribute('data-print-context', 'maintenance');
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

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }

          html[data-print-context='maintenance'] .print-block {
            display: none !important;
          }

          html[data-print-context='maintenance'][data-print-theme='resumo'] .print-block-resumo {
            display: block !important;
          }

          html[data-print-context='maintenance'][data-print-theme='todos'] .print-block-todos {
            display: block !important;
          }

          html[data-print-context='maintenance'][data-print-theme='urgencia'] .print-block-urgencia {
            display: block !important;
          }

          html[data-print-context='maintenance'][data-print-theme='atencao'] .print-block-atencao {
            display: block !important;
          }

          html[data-print-context='maintenance'][data-print-theme='urgencia'] tr.print-row-due-soon {
            display: none !important;
          }

          html[data-print-context='maintenance'][data-print-theme='atencao'] tr.print-row-overdue {
            display: none !important;
          }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Manutencao Preventiva</div>
          <div className="page-subtitle">
            {counters.overdue} urgencias | {counters.dueSoon} atencoes para os proximos 30 dias
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-control" style={{ minWidth: 220 }} value={printTheme} onChange={(e) => setPrintTheme(e.target.value)}>
            {PRINT_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={handlePrint}>Imprimir</button>
        </div>
      </div>

      <div className="print-block print-block-resumo print-block-todos print-block-urgencia print-block-atencao" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Urgencias</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c' }}>{counters.overdue}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Atencoes</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#92400e' }}>{counters.dueSoon}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="text-sm text-muted">Total de alertas</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1A3C5E' }}>{alerts.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : alerts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-text">Nenhuma manutencao pendente.</div>
            <div className="empty-state-sub">Todos os veiculos estao em dia.</div>
          </div>
        </div>
      ) : (
        <div className="card print-block print-block-todos print-block-urgencia print-block-atencao">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nivel</th>
                  <th>Veiculo</th>
                  <th>Proprietario</th>
                  <th>Item de manutencao</th>
                  <th>Proxima data</th>
                  <th>Proximo KM</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const level = LEVEL_META[a.alertLevel] || LEVEL_META.OK;
                  const rowClass = a.alertLevel === 'OVERDUE'
                    ? 'print-row-overdue'
                    : (a.alertLevel === 'DUE_SOON' ? 'print-row-due-soon' : '');

                  return (
                    <tr key={a.id} className={rowClass} style={{ background: ROW_COLORS[a.alertLevel] || 'white' }}>
                      <td><span className={`badge ${level.className}`}>{level.label}</span></td>
                      <td>
                        <Link to={`/veiculos/${a.vehicleId}`} style={{ fontWeight: 600 }}>{a.vehicle?.plate}</Link>
                        <div className="text-sm text-muted">{a.vehicle?.brand} {a.vehicle?.model}</div>
                      </td>
                      <td className="text-sm">{a.vehicle?.client?.name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{a.label}</td>
                      <td className="text-sm">{formatDate(a.nextDate)}</td>
                      <td className="text-sm">
                        {a.nextKm !== null && a.nextKm !== undefined ? `${Number(a.nextKm).toLocaleString('pt-BR')} km` : '-'}
                      </td>
                      <td className="no-print">
                        <Link to={`/os/nova?vehicleId=${a.vehicleId}`} className="btn btn-primary btn-sm">+ OS</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
