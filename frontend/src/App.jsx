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
import ProductForm from './pages/products/ProductForm';
import ServicesPage from './pages/services/ServicesPage';
import SOListPage from './pages/so/SOListPage';
import SOForm from './pages/so/SOForm';
import SODetail from './pages/so/SODetail';
import MaintenancePage from './pages/maintenance/MaintenancePage';
import MessagesPage from './pages/messages/MessagesPage';
import CompanyAssetsPage from './pages/admin/CompanyAssetsPage';
import DigitalAccountsPage from './pages/admin/DigitalAccountsPage';
import CollaboratorsPage from './pages/admin/CollaboratorsPage';
import TrackingPage from './pages/tracking/TrackingPage';
import DeliveriesPage from './pages/deliveries/DeliveriesPage';

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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/novo" element={<ClientForm />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="clientes/:id/editar" element={<ClientForm />} />
        <Route path="veiculos" element={<VehiclesPage />} />
        <Route path="veiculos/novo" element={<VehicleForm />} />
        <Route path="veiculos/:id" element={<VehicleDetail />} />
        <Route path="veiculos/:id/editar" element={<VehicleForm />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="produtos/novo" element={<ProductForm />} />
        <Route path="produtos/:id/editar" element={<ProductForm />} />
        <Route path="servicos" element={<ServicesPage />} />
        <Route path="os" element={<SOListPage />} />
        <Route path="os/nova" element={<SOForm />} />
        <Route path="os/:id" element={<SODetail />} />
        <Route path="os/:id/editar" element={<SOForm />} />
        <Route path="manutencao" element={<MaintenancePage />} />
        <Route path="mensagens" element={<MessagesPage />} />
        <Route path="ativos" element={<ActionRoute action="adminOnly"><CompanyAssetsPage /></ActionRoute>} />
        <Route path="contas-digitais" element={<ActionRoute action="adminOnly"><DigitalAccountsPage /></ActionRoute>} />
        <Route path="colaboradores" element={<ActionRoute action="manageUsers"><CollaboratorsPage /></ActionRoute>} />
        <Route path="tracking" element={<TrackingPage />} />
        <Route path="entregas" element={<DeliveriesPage />} />
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
