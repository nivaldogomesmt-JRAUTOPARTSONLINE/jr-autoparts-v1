import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('jr_token');
    const savedUser = localStorage.getItem('jr_user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Valida token com o servidor
      authAPI.me()
        .then(res => setUser(res.data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user } = res.data;
    localStorage.setItem('jr_token', token);
    localStorage.setItem('jr_user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('jr_token');
    localStorage.removeItem('jr_user');
    setUser(null);
  };

  const isAdmin = () => user?.role === 'ADMIN';
  const isEmployee = () => ['ADMIN', 'EMPLOYEE'].includes(user?.role);
  const isClient = () => user?.role === 'CLIENT';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isEmployee, isClient }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro do AuthProvider');
  return ctx;
};
