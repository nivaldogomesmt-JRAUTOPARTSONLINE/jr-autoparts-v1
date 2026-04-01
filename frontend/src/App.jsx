import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import PortalLogin from './pages/portal/PortalLogin';
import PortalDashboard from './pages/portal/PortalDashboard';
import PortalVehicle from './pages/portal/PortalVehicle';
import PortalTracking from './pages/portal/PortalTracking';
import PortalSODetail from './pages/portal/PortalSODetail';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'));
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail'));
const ClientForm = lazy(() => import('./pages/clients/ClientForm'));
const VehiclesPage = lazy(() => import('./pages/vehicles/VehiclesPage'));
const VehicleDetail = lazy(() => import('./pages/vehicles/VehicleDetail'));
const VehicleForm = lazy(() => import('./pages/vehicles/VehicleForm'));
const ProductsPage = lazy(() => import('./pages/products/ProductsPage'));
const ProductDetail = lazy(() => import('./pages/products/ProductDetail'));
const ProductForm = lazy(() => import('./pages/products/ProductForm'));
const ServicesPage = lazy(() => import('./pages/services/ServicesPage'));
const ServiceForm = lazy(() => import('./pages/services/ServiceForm'));
const ServiceDetail = lazy(() => import('./pages/services/ServiceDetail'));
const SOListPage = lazy(() => import('./pages/so/SOListPage'));
const SOForm = lazy(() => import('./pages/so/SOForm'));
const SODetail = lazy(() => import('./pages/so/SODetail'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage'));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));
const CompanyAssetsPage = lazy(() => import('./pages/admin/CompanyAssetsPage'));
const DigitalAccountsPage = lazy(() => import('./pages/admin/DigitalAccountsPage'));
const CollaboratorsPage = lazy(() => import('./pages/admin/CollaboratorsPage'));
const TrackingPage = lazy(() => import('./pages/tracking/TrackingPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const DeliveriesPage = lazy(() => import('./pages/deliveries/DeliveriesPage'));
const IntegrationsHubPage = lazy(() => import('./pages/integrations/IntegrationsHubPage'));
const EfiBoletoTestPage = lazy(() => import('./pages/integrations/EfiBoletoTestPage'));
const EvolutionWhatsAppPage = lazy(() => import('./pages/integrations/EvolutionWhatsAppPage'));
const NotificationCenterPage = lazy(() => import('./pages/integrations/NotificationCenterPage'));
const BotconversaPage = lazy(() => import('./pages/integrations/BotconversaPage'));

function RouteLoader() {
  return <div className="loading"><div className="spinner" /></div>;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user || user.role === 'CLIENT') return <Navigate to="/login" replace />;
  return children;
}

function PortalRoute({ children }) {
  const token = localStorage.getItem('jr_portal_token');
  if (!token) return <Navigate to="/portal/login" replace />;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('jr_portal_token');
      return <Navigate to="/portal/login" replace />;
    }
  } catch {
    localStorage.removeItem('jr_portal_token');
    return <Navigate to="/portal/login" replace />;
  }
  return children;
}

function ActionRoute({ action, children }) {
  const { loading, can } = useAuth();
  if (loading) return <RouteLoader />;
  if (!can(action)) return <Navigate to="/dashboard" replace />;
  return children;
}

function LazyPage({ children }) {
  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/portal" element={<PortalRoute><PortalDashboard /></PortalRoute>} />
      <Route path="/portal/veiculo/:id" element={<PortalRoute><PortalVehicle /></PortalRoute>} />
      <Route path="/portal/rastreamento" element={<PortalRoute><PortalTracking /></PortalRoute>} />
      <Route path="/portal/os/:id" element={<PortalRoute><PortalSODetail /></PortalRoute>} />

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ActionRoute action="module:dashboard:view"><LazyPage><Dashboard /></LazyPage></ActionRoute>} />

        <Route path="clientes" element={<ActionRoute action="module:clients:view"><LazyPage><ClientsPage /></LazyPage></ActionRoute>} />
        <Route path="clientes/novo" element={<ActionRoute action="module:clients:add"><LazyPage><ClientForm /></LazyPage></ActionRoute>} />
        <Route path="clientes/:id" element={<ActionRoute action="module:clients:view"><LazyPage><ClientDetail /></LazyPage></ActionRoute>} />
        <Route path="clientes/:id/editar" element={<ActionRoute action="module:clients:edit"><LazyPage><ClientForm /></LazyPage></ActionRoute>} />

        <Route path="veiculos" element={<ActionRoute action="module:vehicles:view"><LazyPage><VehiclesPage /></LazyPage></ActionRoute>} />
        <Route path="veiculos/novo" element={<ActionRoute action="module:vehicles:add"><LazyPage><VehicleForm /></LazyPage></ActionRoute>} />
        <Route path="veiculos/:id" element={<ActionRoute action="module:vehicles:view"><LazyPage><VehicleDetail /></LazyPage></ActionRoute>} />
        <Route path="veiculos/:id/editar" element={<ActionRoute action="module:vehicles:edit"><LazyPage><VehicleForm /></LazyPage></ActionRoute>} />

        <Route path="produtos" element={<ActionRoute action="module:products:view"><LazyPage><ProductsPage /></LazyPage></ActionRoute>} />
        <Route path="produtos/novo" element={<ActionRoute action="module:products:add"><LazyPage><ProductForm /></LazyPage></ActionRoute>} />
        <Route path="produtos/:id" element={<ActionRoute action="module:products:view"><LazyPage><ProductDetail /></LazyPage></ActionRoute>} />
        <Route path="produtos/:id/editar" element={<ActionRoute action="module:products:edit"><LazyPage><ProductForm /></LazyPage></ActionRoute>} />

        <Route path="servicos" element={<ActionRoute action="module:services:view"><LazyPage><ServicesPage /></LazyPage></ActionRoute>} />
        <Route path="servicos/novo" element={<ActionRoute action="module:services:add"><LazyPage><ServiceForm /></LazyPage></ActionRoute>} />
        <Route path="servicos/:id" element={<ActionRoute action="module:services:view"><LazyPage><ServiceDetail /></LazyPage></ActionRoute>} />
        <Route path="servicos/:id/editar" element={<ActionRoute action="module:services:edit"><LazyPage><ServiceForm /></LazyPage></ActionRoute>} />

        <Route path="os" element={<ActionRoute action="module:serviceOrders:view"><LazyPage><SOListPage /></LazyPage></ActionRoute>} />
        <Route path="os/nova" element={<ActionRoute action="module:serviceOrders:add"><LazyPage><SOForm /></LazyPage></ActionRoute>} />
        <Route path="os/:id" element={<ActionRoute action="module:serviceOrders:view"><LazyPage><SODetail /></LazyPage></ActionRoute>} />
        <Route path="os/:id/editar" element={<ActionRoute action="module:serviceOrders:edit"><LazyPage><SOForm /></LazyPage></ActionRoute>} />

        <Route path="manutencao" element={<ActionRoute action="module:serviceOrders:view"><LazyPage><MaintenancePage /></LazyPage></ActionRoute>} />
        <Route path="mensagens" element={<LazyPage><MessagesPage /></LazyPage>} />

        <Route path="ativos" element={<ActionRoute action="adminOnly"><LazyPage><CompanyAssetsPage /></LazyPage></ActionRoute>} />
        <Route path="contas-digitais" element={<ActionRoute action="adminOnly"><LazyPage><DigitalAccountsPage /></LazyPage></ActionRoute>} />
        <Route path="colaboradores" element={<ActionRoute action="manageUsers"><LazyPage><CollaboratorsPage /></LazyPage></ActionRoute>} />

        <Route path="rastreamento" element={<ActionRoute action="module:tracking:view"><LazyPage><TrackingPage /></LazyPage></ActionRoute>} />
        <Route path="relatorios" element={<ActionRoute action="module:reports:view"><LazyPage><ReportsPage /></LazyPage></ActionRoute>} />
        <Route path="entregas" element={<ActionRoute action="module:deliveries:view"><LazyPage><DeliveriesPage /></LazyPage></ActionRoute>} />
        <Route path="integracoes" element={<ActionRoute action="module:integrations:view"><LazyPage><IntegrationsHubPage /></LazyPage></ActionRoute>} />
        <Route path="integracoes/efi-teste" element={<ActionRoute action="module:integrations:view"><LazyPage><EfiBoletoTestPage /></LazyPage></ActionRoute>} />
        <Route path="integracoes/evolution-whatsapp" element={<ActionRoute action="adminOnly"><LazyPage><EvolutionWhatsAppPage /></LazyPage></ActionRoute>} />
        <Route path="integracoes/notificacoes" element={<ActionRoute action="adminOnly"><LazyPage><NotificationCenterPage /></LazyPage></ActionRoute>} />
        <Route path="integracoes/botconversa" element={<ActionRoute action="adminOnly"><LazyPage><BotconversaPage /></LazyPage></ActionRoute>} />
        <Route path="notificacoes" element={<ActionRoute action="adminOnly"><LazyPage><NotificationCenterPage /></LazyPage></ActionRoute>} />
        <Route path="importacoes" element={<ActionRoute action="module:integrations:view"><LazyPage><IntegrationsHubPage /></LazyPage></ActionRoute>} />
        <Route path="exportacoes" element={<ActionRoute action="module:integrations:view"><LazyPage><IntegrationsHubPage /></LazyPage></ActionRoute>} />
        <Route path="logs" element={<ActionRoute action="module:integrations:view"><LazyPage><IntegrationsHubPage /></LazyPage></ActionRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
