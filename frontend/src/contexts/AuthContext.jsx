import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

function canByAction(user, action) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EMPLOYEE') return false;

  const permissions = user.permissions;
  if (!permissions) return true;

  if (action === 'add') return !!permissions.canAdd;
  if (action === 'edit') return !!permissions.canEdit;
  if (action === 'delete') return !!permissions.canDelete;
  if (action === 'manageUsers') return !!permissions.canManageUsers;
  return true;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('jr_token');
    const savedUser = localStorage.getItem('jr_user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      authAPI.me()
        .then((res) => {
          setUser(res.data);
          localStorage.setItem('jr_user', JSON.stringify(res.data));
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: authenticatedUser } = res.data;
    localStorage.setItem('jr_token', token);
    localStorage.setItem('jr_user', JSON.stringify(authenticatedUser));
    setUser(authenticatedUser);
    return authenticatedUser;
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
