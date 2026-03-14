import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BRAND } from '../config/brand';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@jrautoparts.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Email ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          {BRAND.logo ? (
            <img src={BRAND.logo} alt={BRAND.name} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🔧</div>
          )}
          <div className="login-logo-name">{BRAND.name}</div>
          <div className="login-logo-sub">Sistema de Gestão</div>
        </div>

        {/* Form */}
        <h2 className="login-title">Entrar no Sistema</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required">Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label required">Senha</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full btn-lg"
            style={{ marginTop: 8 }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div className="divider" style={{ margin: '16px 0' }} />
          <Link to="/portal/login" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Sou cliente → Acessar meu portal
          </Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} {BRAND.name}
        </div>
      </div>
    </div>
  );
}
