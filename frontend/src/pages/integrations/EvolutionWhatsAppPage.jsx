import { useState, useEffect, useCallback, useRef } from 'react';
import { evolutionAPI } from '../../services/api';

const EVOLUTION_MANAGER_URL = import.meta.env.VITE_EVOLUTION_MANAGER_URL || 'http://localhost:8087/manager';
const POLL_INTERVAL_MS = 2500;

export default function EvolutionWhatsAppPage() {
  const [status, setStatus] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await evolutionAPI.getStatus();
      setStatus(res.data?.state ?? null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao verificar status.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQr = useCallback(async (trigger = false) => {
    try {
      const res = await evolutionAPI.getQrCode(trigger);
      const data = res.data || {};
      if (data.connected) {
        setQrData(null);
        setPending(false);
        loadStatus();
        return;
      }
      if (data.base64 || data.pairingCode || data.code) {
        setQrData(data);
        setPending(false);
        setError('');
        return;
      }
      if (data.pending) {
        setPending(true);
        setError('');
        return;
      }
      setError(data.message || 'QR code nao disponivel via API.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao obter QR code.');
      setPending(false);
    }
  }, [loadStatus]);

  const loadQrCode = useCallback(async () => {
    setQrLoading(true);
    setQrData(null);
    setError('');
    setPending(false);
    try {
      await fetchQr(true);
    } finally {
      setQrLoading(false);
    }
  }, [fetchQr]);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    setError('');
    try {
      await evolutionAPI.logout();
      setQrData(null);
      loadStatus();
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao desconectar.');
    } finally {
      setLogoutLoading(false);
    }
  }, [loadStatus]);

  const handleDisconnectReset = useCallback(async () => {
    setResetLoading(true);
    setError('');
    try {
      await evolutionAPI.disconnectReset();
      setQrData(null);
      setPending(false);
      loadStatus();
      await fetchQr(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao resetar.');
    } finally {
      setResetLoading(false);
    }
  }, [loadStatus, fetchQr]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!pending || qrLoading) return;
    pollRef.current = setInterval(() => fetchQr(false), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pending, qrLoading, fetchQr]);

  const isConnected = status === 'open';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">WhatsApp - Evolution API</div>
          <div className="page-subtitle">Vincule seu telefone para enviar e receber mensagens</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">Status da conexao</div>
        {loading ? (
          <div className="text-muted">Verificando...</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isConnected ? '#22c55e' : '#eab308',
              }}
            />
            <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
          </div>
        )}

        {error && (
          <div className="text-sm text-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!isConnected && (
          <>
            <div style={{ marginBottom: 16 }}>
              <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                Para vincular seu WhatsApp, escaneie o QR code no celular: WhatsApp → Menu (⋮) → Aparelhos conectados → Conectar um aparelho.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={loadQrCode}
                disabled={qrLoading}
              >
                {qrLoading ? 'Gerando...' : 'Gerar QR Code'}
              </button>
              {pending && (
                <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                  Aguardando QR code da Evolution API... (polling automatico)
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <a
                href={EVOLUTION_MANAGER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                Abrir Evolution Manager (alternativa)
              </a>
              {qrData?.base64 && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <img
                    src={qrData.base64.startsWith('data:') ? qrData.base64 : `data:image/png;base64,${qrData.base64}`}
                    alt="QR Code WhatsApp"
                    style={{ maxWidth: 280, height: 'auto' }}
                  />
                </div>
              )}
              {qrData?.code && !qrData?.base64 && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <img
                    src={qrData.code.startsWith('data:') ? qrData.code : `data:image/png;base64,${qrData.code}`}
                    alt="QR Code WhatsApp"
                    style={{ maxWidth: 280, height: 'auto' }}
                  />
                </div>
              )}
              {qrData?.pairingCode && !qrData?.base64 && !qrData?.code && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-sm text-muted">Codigo de pareamento:</div>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, marginTop: 4 }}>
                    {qrData.pairingCode}
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                    No WhatsApp: Aparelhos conectados → Conectar com numero de telefone → Digite este codigo
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {isConnected && (
          <div>
            <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Seu WhatsApp esta vinculado. O sistema pode enviar e receber mensagens.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleLogout}
                disabled={logoutLoading}
              >
                {logoutLoading ? 'Desconectando...' : 'Desconectar'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDisconnectReset}
                disabled={resetLoading}
              >
                {resetLoading ? 'Resetando...' : 'Desconectar e reconectar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
