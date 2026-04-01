import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BRAND } from '../config/brand';

const NAV = [
  { section: 'GERAL' },
  { code: '??', label: 'Dashboard', path: '/dashboard' },

  { section: 'CADASTROS' },
  { code: '??', label: 'Clientes', path: '/clientes' },
  { code: '??', label: 'Veiculos', path: '/veiculos' },
  { code: '??', label: 'Produtos', path: '/produtos' },
  { code: '??', label: 'Servicos', path: '/servicos' },

  { section: 'OPERACIONAL' },
  { code: '??', label: 'Ordens de Servico', path: '/os' },
  { code: '??', label: 'Manutencao', path: '/manutencao' },
  { code: '??', label: 'Rastreamento', path: '/rastreamento' },
  { code: '??', label: 'Entregas', path: '/entregas' },
  { code: '??', label: 'Mensagens', path: '/mensagens' },

  { section: 'INTEGRACOES' },
  { code: '??', label: 'Integracoes', path: '/integracoes' },
  { code: '??', label: 'WhatsApp Evolution', path: '/integracoes/evolution-whatsapp' },
  { code: '??', label: 'BotConversa', path: '/integracoes/botconversa' },
  { code: '??', label: 'Notificacoes', path: '/integracoes/notificacoes' },

  { section: 'GESTAO' },
  { code: '??', label: 'Relatorios', path: '/relatorios' },
  { code: '??', label: 'Ativos', path: '/ativos' },
  { code: '??', label: 'Contas Digitais', path: '/contas-digitais' },
  { code: '??', label: 'Colaboradores', path: '/colaboradores' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageTitle = useMemo(() => {
    const found = NAV.find((item) => item.path && location.pathname.startsWith(item.path));
    return found?.label || 'JR Auto Parts';
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {sidebarOpen ? <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          {BRAND.logoUrl ? (
            <img src={BRAND.logoUrl} alt={BRAND.name} className="sidebar-logo-image" />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#1e3a8a', flexShrink: 0 }}>JR</div>
          )}
          <div className="sidebar-logo-text">
            {BRAND.name}
            {BRAND.phone ? <small>{BRAND.phone}</small> : null}
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item, index) => item.section ? (
            <div key={`${item.section}-${index}`} className="nav-section">{item.section}</div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-item-code">{item.code}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.email || 'Usuario'}</div>
          <button className="btn btn-outline btn-sm w-full" onClick={handleLogout}>Sair</button>
        </div>
      </aside>

      <div className="main-content">
        <header className="main-header">
          <button id="menu-btn" className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="main-header-title">
            <span style={{ color: 'var(--primary)', fontWeight: 800 }}>JR</span> Auto Parts · {pageTitle}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.role === 'admin' ? 'Admin' : 'Usuario'}</span>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
              {(user?.email || 'A')[0].toUpperCase()}
            </div>
          </div>
        </header>

        <div className="main-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
