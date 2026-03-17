import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Layout from './components/Layout';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ClientsPage from './pages/clients/ClientsPage';
import ClientDetail from './pages/clients/ClientDetail';
import ClientForm from './pages/clients/ClientForm';
import VehiclesPage from './pages/vehicles/VehiclesPage';
import VehicleDetail from './pages/vehicles/VehicleDetail';
import VehicleForm from './pages/vehicles/VehicleForm';
import ProductsPage from './pages/products/ProductsPage';
import ProductDetail from './pages/products/ProductDetail';
import ProductForm from './pages/products/ProductForm';
import ServicesPage from './pages/services/ServicesPage';
import ServiceForm from './pages/services/ServiceForm';
import ServiceDetail from './pages/services/ServiceDetail';
import SOListPage from './pages/so/SOListPage';
import SOForm from './pages/so/SOForm';
import SODetail from './pages/so/SODetail';
import MaintenancePage from './pages/maintenance/MaintenancePage';
import MessagesPage from './pages/messages/MessagesPage';
import CompanyAssetsPage from './pages/admin/CompanyAssetsPage';
import DigitalAccountsPage from './pages/admin/DigitalAccountsPage';
import CollaboratorsPage from './pages/admin/CollaboratorsPage';
import TrackingPage from './pages/tracking/TrackingPage';
import TowingPage   from './pages/towing/TowingPage';
import ReportsPage  from './pages/reports/ReportsPage';
import DeliveriesPage from './pages/deliveries/DeliveriesPage';
import IntegrationsHubPage from './pages/integrations/IntegrationsHubPage';
import EfiBoletoTestPage from './pages/integrations/EfiBoletoTestPage';
import EvolutionWhatsAppPage from './pages/integrations/EvolutionWhatsAppPage';
import NotificationCenterPage from './pages/integrations/NotificationCenterPage';

import PortalLogin from './pages/portal/PortalLogin';
import PortalDashboard from './pages/portal/PortalDashboard';
import PortalVehicle from './pages/portal/PortalVehicle';
import PortalTracking from './pages/portal/PortalTracking';
import PortalSODetail from './pages/portal/PortalSODetail';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!user || user.role === 'CLIENT') return <Navigate to="/login" replace />;
  return children;
}

function PortalRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!user || user.role !== 'CLIENT') return <Navigate to="/portal/login" replace />;
  return children;
}

function ActionRoute({ action, children }) {
  const { loading, can } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!can(action)) return <Navigate to="/dashboard" replace />;
  return children;
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
        <Route path="dashboard" element={<ActionRoute action="module:dashboard:view"><Dashboard /></ActionRoute>} />

        <Route path="clientes" element={<ActionRoute action="module:clients:view"><ClientsPage /></ActionRoute>} />
        <Route path="clientes/novo" element={<ActionRoute action="module:clients:add"><ClientForm /></ActionRoute>} />
        <Route path="clientes/:id" element={<ActionRoute action="module:clients:view"><ClientDetail /></ActionRoute>} />
        <Route path="clientes/:id/editar" element={<ActionRoute action="module:clients:edit"><ClientForm /></ActionRoute>} />

        <Route path="veiculos" element={<ActionRoute action="module:vehicles:view"><VehiclesPage /></ActionRoute>} />
        <Route path="veiculos/novo" element={<ActionRoute action="module:vehicles:add"><VehicleForm /></ActionRoute>} />
        <Route path="veiculos/:id" element={<ActionRoute action="module:vehicles:view"><VehicleDetail /></ActionRoute>} />
        <Route path="veiculos/:id/editar" element={<ActionRoute action="module:vehicles:edit"><VehicleForm /></ActionRoute>} />

        <Route path="produtos" element={<ActionRoute action="module:products:view"><ProductsPage /></ActionRoute>} />
        <Route path="produtos/novo" element={<ActionRoute action="module:products:add"><ProductForm /></ActionRoute>} />
        <Route path="produtos/:id" element={<ActionRoute action="module:products:view"><ProductDetail /></ActionRoute>} />
        <Route path="produtos/:id/editar" element={<ActionRoute action="module:products:edit"><ProductForm /></ActionRoute>} />

        <Route path="servicos" element={<ActionRoute action="module:services:view"><ServicesPage /></ActionRoute>} />
        <Route path="servicos/novo" element={<ActionRoute action="module:services:add"><ServiceForm /></ActionRoute>} />
        <Route path="servicos/:id" element={<ActionRoute action="module:services:view"><ServiceDetail /></ActionRoute>} />
        <Route path="servicos/:id/editar" element={<ActionRoute action="module:services:edit"><ServiceForm /></ActionRoute>} />

        <Route path="os" element={<ActionRoute action="module:serviceOrders:view"><SOListPage /></ActionRoute>} />
        <Route path="os/nova" element={<ActionRoute action="module:serviceOrders:add"><SOForm /></ActionRoute>} />
        <Route path="os/:id" element={<ActionRoute action="module:serviceOrders:view"><SODetail /></ActionRoute>} />
        <Route path="os/:id/editar" element={<ActionRoute action="module:serviceOrders:edit"><SOForm /></ActionRoute>} />

        <Route path="manutencao" element={<ActionRoute action="module:serviceOrders:view"><MaintenancePage /></ActionRoute>} />
        <Route path="mensagens" element={<MessagesPage />} />

        <Route path="ativos" element={<ActionRoute action="adminOnly"><CompanyAssetsPage /></ActionRoute>} />
        <Route path="contas-digitais" element={<ActionRoute action="adminOnly"><DigitalAccountsPage /></ActionRoute>} />
        <Route path="colaboradores" element={<ActionRoute action="manageUsers"><CollaboratorsPage /></ActionRoute>} />

        <Route path="rastreamento" element={<ActionRoute action="module:tracking:view"><TrackingPage /></ActionRoute>} />
        <Route path="guincho"      element={<ActionRoute action="module:towing:view"><TowingPage /></ActionRoute>} />
        <Route path="relatorios"   element={<ActionRoute action="module:reports:view"><ReportsPage /></ActionRoute>} />
        <Route path="entregas" element={<ActionRoute action="module:deliveries:view"><DeliveriesPage /></ActionRoute>} />
        <Route path="integracoes" element={<ActionRoute action="module:integrations:view"><IntegrationsHubPage /></ActionRoute>} />
        <Route path="integracoes/efi-teste" element={<ActionRoute action="module:integrations:view"><EfiBoletoTestPage /></ActionRoute>} />
        <Route path="integracoes/evolution-whatsapp" element={<ActionRoute action="adminOnly"><EvolutionWhatsAppPage /></ActionRoute>} />
        <Route path="integracoes/notificacoes" element={<ActionRoute action="adminOnly"><NotificationCenterPage /></ActionRoute>} />
        <Route path="notificacoes"  element={<ActionRoute action="adminOnly"><NotificationCenterPage /></ActionRoute>} />
        <Route path="importacoes"   element={<ActionRoute action="module:integrations:view"><IntegrationsHubPage /></ActionRoute>} />
        <Route path="exportacoes"   element={<ActionRoute action="module:integrations:view"><IntegrationsHubPage /></ActionRoute>} />
        <Route path="logs"          element={<ActionRoute action="module:integrations:view"><IntegrationsHubPage /></ActionRoute>} />
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
