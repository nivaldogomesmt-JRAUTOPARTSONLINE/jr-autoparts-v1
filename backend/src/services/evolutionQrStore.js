/**
 * Armazena o último QR code recebido via webhook QRCODE_UPDATED.
 * Expira após 5 minutos.
 */
const TTL_MS = 5 * 60 * 1000;

let store = null;

function getStore() {
  if (!store) {
    store = { base64: null, pairingCode: null, code: null, timestamp: null };
  }
  return store;
}

function isExpired(ts) {
  return !ts || Date.now() - ts > TTL_MS;
}

function setQr({ base64, pairingCode, code } = {}) {
  const s = getStore();
  s.base64 = base64 || s.base64;
  s.pairingCode = pairingCode || s.pairingCode;
  s.code = code || s.code;
  s.timestamp = Date.now();
}

function getQr() {
  const s = getStore();
  if (isExpired(s.timestamp)) return null;
  return {
    base64: s.base64,
    pairingCode: s.pairingCode,
    code: s.code,
    timestamp: s.timestamp,
  };
}

function clearQr() {
  const s = getStore();
  s.base64 = null;
  s.pairingCode = null;
  s.code = null;
  s.timestamp = null;
}

module.exports = { setQr, getQr, clearQr };
