import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../../config/brand';

const API = import.meta.env.VITE_API_URL || '';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch(API + '/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Credenciais inválidas');
      localStorage.setItem('jr_portal_token', data.token);
      navigate('/portal');
    } catch (err) {
      setError(err.message || 'Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a8a 0%, #2563EB 60%, #3b82f6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', padding: '40px 36px', width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {BRAND.logo
            ? <img src={BRAND.logo} alt={BRAND.name} style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 12 }} />
            : <div style={{ width: 56, height: 56, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 12px' }}>🔧</div>
          }
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{BRAND.name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Portal do Cliente</div>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 20, textAlign: 'center' }}>Bem-vindo!</h2>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20, marginTop: -12 }}>
          Acesse para ver suas ordens de serviço e histórico do seu veículo.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Senha</label>
            <input type="password" className="form-control" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn btn-primary w-full btn-lg" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no Portal'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ borderTop: '1px solid #e2e8f0', margin: '16px 0' }} />
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Não tem acesso? Entre em contato:
          </div>
          <a href={`https://wa.me/55${(BRAND.phone||'').replace(/D/g,'')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 14, fontWeight: 600, color: '#16a34a', textDecoration: 'none' }}>
            📱 {BRAND.phone || '(65) 99281-2000'}
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#94a3b8' }}>
          © {new Date().getFullYear()} {BRAND.name} · jrautopartsmt.com.br
        </div>
      </div>
    </div>
  );
}
