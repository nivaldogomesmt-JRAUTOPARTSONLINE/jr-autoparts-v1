const crypto = require('crypto');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function normalizePlate(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(value)) return 'A senha deve ter pelo menos 1 letra maiúscula.';
  if (!/[a-z]/.test(value)) return 'A senha deve ter pelo menos 1 letra minúscula.';
  if (!/[0-9]/.test(value)) return 'A senha deve ter pelo menos 1 número.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'A senha deve ter pelo menos 1 caractere especial.';
  return null;
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isValidEmail(email = '') {
  return EMAIL_REGEX.test(String(email).trim().toLowerCase());
}

module.exports = {
  normalizeDigits,
  normalizePlate,
  validatePasswordStrength,
  safeCompare,
  isValidEmail,
};
