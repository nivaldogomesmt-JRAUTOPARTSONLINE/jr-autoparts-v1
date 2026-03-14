import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BRAND } from '../config/brand';

const NAV = [
  { section: 'GERAL' },
  { code: 'DB', label: 'Dashboard',        path: '/dashboard' },

  { section: 'CADASTROS' },
  { code: 'CL', label: 'Clientes',          path: '/clientes' },
  { code: 'VH', label: 'Veiculos',          path: '/veiculos' },
  { code: 'PD', label: 'Produtos',          path: '/produtos' },
  { code: 'SV', label: 'Servicos',          path: '/servicos' },

  { section: 'OPERACIONAL' },
  { code: 'OS', label: 'Ordens de Servico', path: '/os' },
  { code: 'MN', label: 'Manutencao Prev.',  path: '/manutencao' },
  { code: 'TR', label: 'Rastreamento',      path: '/rastreamento' },
  { code: 'EN', label: 'Entregas',          path: '/entregas' },

  { section: 'INTEGRAÇÕES' },
  { code: 'IN', label: 'Integracoes',       path: '/integracoes' },
  { code: 'IM', label: 'Importacoes',       path: '/importacoes' },
  { code: 'EX', label: 'Exportacoes',       path: '/exportacoes' },
  { code: 'LG', label: 'Logs',              path: '/logs' },
  { code: 'NT', label: 'Notificacoes',      path: '/notificacoes' },

  { section: 'GESTÃO' },
  { code: 'AT', label: 'Ativos',            path: '/ativos' },
  { code: 'CD', label: 'Contas Digitais',   path: '/contas-digitais' },
  { code: 'US', label: 'Colaboradores',     path: '/colaboradores' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageTitle = useMemo(() => {
    const found = NAV.find(n => n.path && location.pathname.startsWith(n.path));
    return found?.label || 'JR Auto Parts';
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          {BRAND.logo ? (
            <img src={BRAND.logo} alt={BRAND.name} className="sidebar-logo-image" />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔧</div>
          )}
          <div className="sidebar-logo-text">
            {BRAND.name}
            {BRAND.phone && <small>{BRAND.phone}</small>}
          </div>
        </div>

        {/* Navegação */}
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) {
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-item-code">{item.code}</span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Rodapé */}
        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.email || 'Usuário'}</div>
          <button className="btn btn-outline btn-sm w-full" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="main-content">
        <header className="main-header">
          <button
            id="menu-btn"
            className="btn btn-ghost btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="main-header-title">
            <span style={{ color: 'var(--primary)', fontWeight: 800 }}>JR</span> Auto Parts
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {user?.role === 'admin' ? 'Admin' : 'Usuário'}
            </span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700
            }}>
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
