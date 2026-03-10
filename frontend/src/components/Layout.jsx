import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { section: 'GERAL', items: [
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'CADASTROS', items: [
    { to: '/clientes', icon: '👥', label: 'Clientes' },
    { to: '/veiculos', icon: '🚗', label: 'Veiculos' },
    { to: '/produtos', icon: '📦', label: 'Produtos' },
    { to: '/servicos', icon: '🔧', label: 'Servicos' },
  ]},
  { section: 'OPERACIONAL', items: [
    { to: '/os', icon: '📋', label: 'Ordens de Servico' },
    { to: '/manutencao', icon: '⚙', label: 'Manutencao Prev.' },
  ]},
  { section: 'COMUNICACAO', items: [
    { to: '/mensagens', icon: '💬', label: 'Mensagens WhatsApp' },
  ]},
  { section: 'GESTAO', items: [
    { to: '/ativos', icon: '🛠', label: 'Ativos' },
    { to: '/contas-digitais', icon: '🌐', label: 'Contas Digitais' },
  ]},
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          JR <span>Auto Parts</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(group => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map(item => (
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
          <button className="btn btn-outline btn-sm" onClick={handleLogout} style={{ width: '100%', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="main-header">
          <button
            className="btn btn-ghost btn-sm"
            style={{ display: 'none' }}
            id="menu-btn"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <style>{`@media (max-width: 768px) { #menu-btn { display: flex !important; } }`}</style>
          <span style={{ fontWeight: 600, color: '#1A3C5E' }}>JR Auto Parts</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {user?.role === 'ADMIN' ? '⭐ Admin' : '👷 Funcionário'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</span>
          </div>
        </header>
        <div className="main-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
