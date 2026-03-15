'use strict';

/**
 * normalizeHelpers.js
 * Shared normalization & masking utilities for bot endpoints.
 * NOTE: If whatsappService.js already exports normalizePhone, import from there instead.
 */

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/**
 * Normalise a Brazilian phone number to E.164-like format (55XXXXXXXXXXX).
 * Returns null if the number cannot be normalised.
 */
function normalizePhone(phone) {
  let d = String(phone).replace(/\D/g, '');
  // Strip accidental double country code (e.g. "5555...")
  if (d.startsWith('555') && d.length > 13) d = d.slice(2);
  // Add country code when raw national number provided
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

function maskPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return '***masked***';
  // Keep country code + area code + last 4 digits
  return n.slice(0, 4) + '*****' + n.slice(-4);
}

// ---------------------------------------------------------------------------
// CPF / CNPJ
// ---------------------------------------------------------------------------

function normalizeCPF(cpf) {
  const d = String(cpf).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

function normalizeCNPJ(cnpj) {
  const d = String(cnpj).replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

/**
 * Accepts either a CPF (11 digits) or a CNPJ (14 digits).
 * Returns the raw digits string or null.
 */
function normalizeDocument(doc) {
  const d = String(doc).replace(/\D/g, '');
  if (d.length === 11) return d;
  if (d.length === 14) return d;
  return null;
}

function maskCPF(cpf) {
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return '***masked***';
  return `***.***.***-${d.slice(9)}`;
}

function maskCNPJ(cnpj) {
  const d = String(cnpj).replace(/\D/g, '');
  if (d.length !== 14) return '***masked***';
  return `**.**.***/****-${d.slice(12)}`;
}

function maskDocument(doc) {
  const d = String(doc).replace(/\D/g, '');
  if (d.length === 11) return maskCPF(d);
  if (d.length === 14) return maskCNPJ(d);
  return '***masked***';
}

// ---------------------------------------------------------------------------
// Vehicle plate
// ---------------------------------------------------------------------------

const OLD_PLATE    = /^[A-Z]{3}\d{4}$/;
const MERCOSUL     = /^[A-Z]{3}\d[A-Z]\d{2}$/;

/**
 * Normalise a Brazilian vehicle plate (old or Mercosul format).
 * Returns uppercase 7-char string or null.
 */
function normalizePlate(plate) {
  const n = String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n.length !== 7) return null;
  return OLD_PLATE.test(n) || MERCOSUL.test(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

function maskName(name) {
  if (!name || typeof name !== 'string') return '***';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0] + '***';
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '***').join(' ');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  normalizePhone,
  maskPhone,
  normalizeCPF,
  normalizeCNPJ,
  normalizeDocument,
  maskCPF,
  maskCNPJ,
  maskDocument,
  normalizePlate,
  maskName,
};
