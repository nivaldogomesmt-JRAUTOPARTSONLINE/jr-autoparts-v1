import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function PortalLogin() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await login(form.email, form.password);
      navigate('/portal');
    } catch {
      setError('Email ou senha inválidos. Verifique seus dados e tente novamente.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1A3C5E 0%, #0f2440 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: '#F0A500', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 28 }}>🔧</div>
          <div style={{ color: 'white', fontSize: 24, fontWeight: 700 }}>JR Auto Parts</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 }}>Portal do Cliente</div>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: 16, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1A3C5E', marginBottom: 8 }}>Bem-vindo!</div>
          <div style={{ fontSize: 13, color: '#718096', marginBottom: 24 }}>
            Acesse para ver suas ordens de serviço e histórico do seu veículo.
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Entrando...' : 'Entrar no Portal'}
            </button>
          </form>

          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: 13, color: '#718096' }}>
            Não tem acesso? Entre em contato conosco pelo WhatsApp:
            <a href="https://wa.me/5565992812000" style={{ display: 'block', color: '#1A3C5E', fontWeight: 600, marginTop: 4 }}>
              📱 (65) 99281-2000
            </a>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          © 2024 JR Auto Parts · jrautopartsmt.com.br
        </div>
      </div>
    </div>
  );
}
