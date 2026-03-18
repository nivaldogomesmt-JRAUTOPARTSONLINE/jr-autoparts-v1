import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';
const ptoken = () => localStorage.getItem('jr_portal_token');

const STATUS_STEPS = ['STARTED', 'IN_PROGRESS', 'DONE', 'DELIVERED'];
const STATUS_STEP_LABELS = { STARTED: 'Iniciado', IN_PROGRESS: 'Em andamento', FINISHING: 'Finalizando', DONE: 'Pronto', DELIVERED: 'Entregue' };

export default function PortalSODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/portal/os/${id}`, {
          headers: { Authorization: 'Bearer ' + ptoken() }
        });
        if (r.status === 401) { navigate('/portal/login'); return; }
        if (r.ok) setOs(await r.json());
      } catch (e) { console.error('[PortalSODetail] error:', e); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!os) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ fontSize:15, color:'var(--text-secondary)' }}>OS não encontrada</div></div>;

  const services = os.serviceItems || os.os_services || os.services || [];
  const products = os.productItems || os.os_products || os.products || [];
  const totalServices = services.reduce((s, i) => s + (Number(i.lineTotal ?? (i.price * (i.qty || 1))) || 0), 0);
  const totalProducts = products.reduce((s, i) => s + (Number(i.lineTotal ?? (i.price * (i.qty || 1))) || 0), 0);
  const total = os.displayTotal ?? os.totalPrice ?? os.total ?? (totalServices + totalProducts);

  const stepIdx = STATUS_STEPS.indexOf(os.status);
  const isClosed = ['DONE', 'DELIVERED', 'FINISHING'].includes(os.status);

  const STATUS_COLOR = {
    'STARTED':      { bg:'#eff6ff', color:'#1d4ed8' },
    'IN_PROGRESS':  { bg:'#fff7ed', color:'#c2410c' },
    'FINISHING':    { bg:'#fff7ed', color:'#c2410c' },
    'WAITING_PART': { bg:'#fffbeb', color:'#d97706' },
    'DONE':         { bg:'#f0fdf4', color:'#15803d' },
    'DELIVERED':    { bg:'#f1f5f9', color:'#475569' },
    'APPROVED':     { bg:'#eff6ff', color:'#4f46e5' },
    'QUOTE':        { bg:'#f8fafc', color:'#64748b' },
  };
  const sc = STATUS_COLOR[os.status] || { bg:'#f1f5f9', color:'#475569' };
  const osStatusLabel = STATUS_STEP_LABELS[os.status] || os.status;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--primary)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>
          ←
        </button>
        {BRAND.logo && <img src={BRAND.logo} alt="" style={{ width: 28, height: 28, borderRadius: 5, background: '#fff', padding: 2 }} />}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Ordem de Serviço #{os.id}</div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {/* Status e progresso */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>OS #{os.id}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Criada em {(os.createdAt || os.created_at) ? new Date(os.createdAt || os.created_at).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
            <div style={{ background: sc.bg, color: sc.color, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700 }}>
              {osStatusLabel}
            </div>
          </div>

          {/* Barra de progresso */}
          {!isClosed && stepIdx >= 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: 4,
                      background: i <= stepIdx ? 'var(--primary)' : 'var(--gray-200)',
                      borderRadius: i === 0 ? '4px 0 0 4px' : i === STATUS_STEPS.length - 1 ? '0 4px 4px 0' : 0,
                      marginBottom: 6
                    }} />
                    <div style={{ fontSize: 10, fontWeight: i === stepIdx ? 700 : 400, color: i <= stepIdx ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {STATUS_STEP_LABELS[step] || step}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Veículo</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, marginTop: 2 }}>{os.vehicle?.plate || os.vehicles?.plate || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(os.vehicle?.brand || os.vehicles?.brand)} {(os.vehicle?.model || os.vehicles?.model)}</div>
            </div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Última atualização</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{(os.updatedAt || os.updated_at) ? new Date(os.updatedAt || os.updated_at).toLocaleDateString('pt-BR') : '—'}</div>
            </div>
          </div>

          {(os.notes || os.observations) && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong>Observações:</strong> {os.notes || os.observations}
            </div>
          )}
        </div>

        {/* Serviços realizados */}
        {services.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2, display: 'inline-block' }} />
              🔧 Serviços ({services.length})
            </div>
            {services.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < services.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.itemName || s.name || s.services?.name}</div>
                  {(s.quantity || s.qty) > 1 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.quantity || s.qty}x</div>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>R$ {Number(s.lineTotal ?? (s.price * (s.qty||1))).toFixed(2)}</div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subtotal serviços</span>
              <span style={{ fontWeight: 700 }}>R$ {totalServices.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Peças utilizadas */}
        {products.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 16, background: 'var(--warning)', borderRadius: 2, display: 'inline-block' }} />
              📦 Peças e Produtos ({products.length})
            </div>
            {products.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < products.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.itemName || p.name || p.products?.name}</div>
                  {(p.quantity || p.qty) > 1 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.quantity || p.qty}x un.</div>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>R$ {Number(p.lineTotal ?? (p.price * (p.qty||1))).toFixed(2)}</div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subtotal peças</span>
              <span style={{ fontWeight: 700 }}>R$ {totalProducts.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Total */}
        <div style={{ background: 'var(--primary)', borderRadius: 12, padding: '18px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total da OS</div>
            {services.length > 0 && products.length > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                Serviços: R$ {totalServices.toFixed(2)} · Peças: R$ {totalProducts.toFixed(2)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>
            R$ {Number(total).toFixed(2)}
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}?text=Olá! Tenho uma dúvida sobre a OS #${os.id}`}
            target="_blank" rel="noreferrer"
            style={{ flex: 1, minWidth: 140, background: '#16a34a', color: '#fff', padding: '11px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
            💬 Falar no WhatsApp
          </a>
          <button onClick={() => window.print()}
            style={{ padding: '11px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            🖨️ Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
