import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

function hasModuleAccess(accessProfile, moduleKey, actionKey = 'view') {
  const modules = accessProfile?.modules;
  if (!modules || typeof modules !== 'object') return true;

  const row = modules[moduleKey];
  if (!row || typeof row !== 'object') return true;

  return !!row[actionKey];
}

function hasSensitiveAccess(accessProfile, sensitiveKey, fallback = false) {
  const sensitive = accessProfile?.sensitive;
  if (!sensitive || typeof sensitive !== 'object') return !!fallback;
  if (!(sensitiveKey in sensitive)) return !!fallback;
  return !!sensitive[sensitiveKey];
}

function canByAction(user, action) {
  if (!user) return false;
  if (action === 'adminOnly') return user.role === 'ADMIN';

  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const permissions = user.permissions || {};
  const accessProfile = user.accessProfile && typeof user.accessProfile === 'object'
    ? user.accessProfile
    : null;

  if (typeof action === 'string' && action.startsWith('module:')) {
    const [, moduleKey = '', moduleAction = 'view'] = action.split(':');
    if (!moduleKey) return true;
    if (!accessProfile) return true;
    return hasModuleAccess(accessProfile, moduleKey, moduleAction || 'view');
  }

  if (typeof action === 'string' && action.startsWith('sensitive:')) {
    const [, sensitiveKey = ''] = action.split(':');
    if (!sensitiveKey) return true;

    const fallbackMap = {
      viewValues: true,
      viewCost: false,
      viewMargin: false,
      manageUsers: !!permissions.canManageUsers,
    };

    return hasSensitiveAccess(accessProfile, sensitiveKey, fallbackMap[sensitiveKey]);
  }

  if (action === 'manageUsers') {
    return hasSensitiveAccess(accessProfile, 'manageUsers', !!permissions.canManageUsers);
  }

  if (accessProfile?.modules && typeof accessProfile.modules === 'object') {
    const rows = Object.values(accessProfile.modules);

    if (action === 'add') return rows.some((row) => !!row?.add);
    if (action === 'edit') return rows.some((row) => !!row?.edit);
    if (action === 'delete') return rows.some((row) => !!row?.delete);
    if (action === 'print') return rows.some((row) => !!row?.print);
    if (action === 'export') return rows.some((row) => !!row?.export);
    if (action === 'approve') return rows.some((row) => !!row?.approve);
    if (action === 'changeStatus') return rows.some((row) => !!row?.changeStatus);
  }

  if (action === 'add') return !!permissions.canAdd;
  if (action === 'edit') return !!permissions.canEdit;
  if (action === 'delete') return !!permissions.canDelete;

  return true;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('jr_token');
    const savedUser = localStorage.getItem('jr_user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('jr_user');
      }

      authAPI.me()
        .then((res) => {
          setUser(res.data);
          localStorage.setItem('jr_user', JSON.stringify(res.data));
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
      return;
    }

    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: authenticatedUser } = res.data;

    localStorage.setItem('jr_token', token);

    let hydratedUser = authenticatedUser;
    try {
      const meRes = await authAPI.me();
      hydratedUser = meRes.data;
    } catch {
      hydratedUser = authenticatedUser;
    }

    localStorage.setItem('jr_user', JSON.stringify(hydratedUser));
    setUser(hydratedUser);
    return hydratedUser;
  };

  const logout = () => {
    localStorage.removeItem('jr_token');
    localStorage.removeItem('jr_user');
    setUser(null);
  };

  const isAdmin = () => user?.role === 'ADMIN';
  const isEmployee = () => ['ADMIN', 'EMPLOYEE'].includes(user?.role);
  const isClient = () => user?.role === 'CLIENT';
  const can = (action) => canByAction(user, action);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isEmployee, isClient, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro do AuthProvider');
  return ctx;
};
