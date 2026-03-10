import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BRAND } from '../config/brand';

const BASE_NAV = [
  {
    section: 'GERAL',
    items: [{ to: '/dashboard', icon: 'DB', label: 'Dashboard' }],
  },
  {
    section: 'CADASTROS',
    items: [
      { to: '/clientes', icon: 'CL', label: 'Clientes' },
      { to: '/veiculos', icon: 'VH', label: 'Veiculos' },
      { to: '/produtos', icon: 'PD', label: 'Produtos' },
      { to: '/servicos', icon: 'SV', label: 'Servicos' },
    ],
  },
  {
    section: 'OPERACIONAL',
    items: [
      { to: '/os', icon: 'OS', label: 'Ordens de Servico' },
      { to: '/manutencao', icon: 'MN', label: 'Manutencao Prev.' },
      { to: '/tracking', icon: 'TR', label: 'Rastreamento' },
    ],
  },
  {
    section: 'COMUNICACAO',
    items: [{ to: '/mensagens', icon: 'WA', label: 'Mensagens WhatsApp' }],
  },
  {
    section: 'GESTAO',
    items: [
      { to: '/ativos', icon: 'AT', label: 'Ativos', permission: 'adminOnly' },
      { to: '/contas-digitais', icon: 'CD', label: 'Contas Digitais', permission: 'adminOnly' },
      { to: '/colaboradores', icon: 'US', label: 'Colaboradores', permission: 'manageUsers' },
    ],
  },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = useMemo(
    () => BASE_NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    })).filter((group) => group.items.length > 0),
    [can]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src={BRAND.logoUrl} alt={BRAND.name} className="sidebar-logo-image" />
          <div className="sidebar-logo-text">{BRAND.name}</div>
        </div>

        <nav className="sidebar-nav">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            {user?.name}
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleLogout}
            style={{ width: '100%', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="main-header">
          <button
            className="btn btn-ghost btn-sm"
            style={{ display: 'none' }}
            id="menu-btn"
            onClick={() => setSidebarOpen(true)}
          >
            MENU
          </button>
          <style>{`@media (max-width: 768px) { #menu-btn { display: flex !important; } }`}</style>

          <span style={{ fontWeight: 600, color: '#1A3C5E' }}>{BRAND.name}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {user?.role === 'ADMIN' ? 'Admin' : 'Funcionario'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</span>
          </div>
        </header>

        <div className="main-body">
          <div className="print-brand-header" aria-hidden="true">
            <img src={BRAND.logoUrl} alt={BRAND.name} className="print-brand-logo" />
            <div>
              <div className="print-brand-title">{BRAND.name}</div>
              <div className="print-brand-subtitle">WhatsApp: {BRAND.phone}</div>
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
