import axios from 'axios';

const API_URL = `${import.meta.env.VITE_API_URL || ''}/api`;

const api = axios.create({ baseURL: API_URL });

// Injeta token em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redireciona para login se token expirar
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jr_token');
      localStorage.removeItem('jr_user');
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/portal')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
  createUser:     (data) => api.post('/auth/users', data),
  listUsers:      ()     => api.get('/auth/users'),
};

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
export const clientsAPI = {
  list:             (params) => api.get('/clients', { params }),
  get:              (id)     => api.get(`/clients/${id}`),
  create:           (data)   => api.post('/clients', data),
  update:           (id, data) => api.put(`/clients/${id}`, data),
  remove:           (id)     => api.delete(`/clients/${id}`),
  grantPortalAccess: (id, data) => api.post(`/clients/${id}/portal-access`, data),
};

// ─── VEHICLES ─────────────────────────────────────────────────────────────────
export const vehiclesAPI = {
  list:    (params)    => api.get('/vehicles', { params }),
  get:     (id)        => api.get(`/vehicles/${id}`),
  create:  (data)      => api.post('/vehicles', data),
  update:  (id, data)  => api.put(`/vehicles/${id}`, data),
  remove:  (id)        => api.delete(`/vehicles/${id}`),
  history: (id)        => api.get(`/vehicles/${id}/history`),
};

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export const productsAPI = {
  list:   (params)   => api.get('/products', { params }),
  get:    (id)       => api.get(`/products/${id}`),
  create: (formData) => api.post('/products', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, formData) => api.put(`/products/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove: (id)       => api.delete(`/products/${id}`),
};

// ─── SERVICES ─────────────────────────────────────────────────────────────────
export const servicesAPI = {
  list:   (params)   => api.get('/services', { params }),
  get:    (id)       => api.get(`/services/${id}`),
  create: (data)     => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  remove: (id)       => api.delete(`/services/${id}`),
};

// ─── SERVICE ORDERS ───────────────────────────────────────────────────────────
export const soAPI = {
  list:         (params)   => api.get('/so', { params }),
  get:          (id)       => api.get(`/so/${id}`),
  create:       (data)     => api.post('/so', data),
  update:       (id, data) => api.put(`/so/${id}`, data),
  updateStatus: (id, data) => api.put(`/so/${id}/status`, data),
};

// ─── MAINTENANCE ──────────────────────────────────────────────────────────────
export const maintenanceAPI = {
  alerts:    ()            => api.get('/maintenance/alerts'),
  byVehicle: (vehicleId)  => api.get(`/maintenance/vehicle/${vehicleId}`),
  update:    (id, data)   => api.put(`/maintenance/${id}`, data),
  markDone:  (vehicleId, data) => api.post(`/maintenance/vehicle/${vehicleId}/mark-done`, data),
};

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
export const messagesAPI = {
  list:   (params) => api.get('/messages', { params }),
  send:   (data)   => api.post('/messages/send', data),
  resend: (id)     => api.post(`/messages/${id}/resend`),
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  get: () => api.get('/dashboard'),
};

// ─── PORTAL (cliente) ─────────────────────────────────────────────────────────
export const portalAPI = {
  me:            ()         => api.get('/portal/me'),
  vehicleDetail: (id)       => api.get(`/portal/vehicles/${id}`),
  soDetail:      (id)       => api.get(`/portal/so/${id}`),
};

export default api;
