'use strict';

/**
 * botClientResolverService.js
 * 3-step client identification cascade:
 *   1. WhatsApp number   → prisma.client.findFirst({ whatsapp | phone })
 *   2. CPF / CNPJ        → prisma.client.findFirst({ cpfCnpj })
 *   3. Vehicle plate     → prisma.vehicle.findFirst({ plate }) + soft name match
 *
 * ⚠️  Model names below assume your Prisma schema uses:
 *     model Client  { ... }   →  prisma.client
 *     model Vehicle { ... }   →  prisma.vehicle
 *     Adjust if your models are named differently (e.g. Customer, Car, etc.)
 *
 * ⚠️  Field names assumed:
 *     Client:  id, name, cpfCnpj, whatsapp, phone, email
 *     Vehicle: id, plate, clientId, client { name }
 */

const prisma = require('../lib/prisma'); // ⚠️ adjust import path if needed
const {
  normalizePhone,
  normalizeDocument,
  normalizePlate,
  maskDocument,
  maskName,
} = require('../helpers/normalizeHelpers');

// ---------------------------------------------------------------------------
// Internal select sets
// ---------------------------------------------------------------------------

/** Full projection — used internally; includes cpfCnpj for Efí calls */
function _selectFull() {
  return {
    id: true,
    name: true,
    cpfCnpj: true,
    whatsapp: true,
    phone: true,
    email: true,
  };
}

/** Safe projection — hides cpfCnpj; used for ambiguity lists sent to bot */
function _selectSafe() {
  return {
    id: true,
    name: true,
    whatsapp: true,
    phone: true,
  };
}

// ---------------------------------------------------------------------------
// Step 1 — by phone
// ---------------------------------------------------------------------------

async function resolveClientByPhone(phone) {
  const normalised = normalizePhone(phone);
  if (!normalised) return null;

  // Try both whatsapp and phone fields (with and without country code)
  const client = await prisma.client.findFirst({
    where: {
      OR: [
        { whatsapp: normalised },
        { phone: normalised },
        // Some systems store without country code
        { whatsapp: normalised.slice(2) },
        { phone: normalised.slice(2) },
      ],
    },
    select: _selectFull(),
  });

  return client || null;
}

// ---------------------------------------------------------------------------
// Step 2 — by CPF / CNPJ
// ---------------------------------------------------------------------------

async function _resolveByDocument(doc) {
  const normalised = normalizeDocument(doc);
  if (!normalised) return null;

  return prisma.client.findFirst({
    where: { cpfCnpj: normalised },
    select: _selectFull(),
  });
}

// ---------------------------------------------------------------------------
// Step 3 — by vehicle plate
// ---------------------------------------------------------------------------

async function _resolveByPlate(plate, nameHint) {
  const normalised = normalizePlate(plate);
  if (!normalised) return null;

  const vehicle = await prisma.vehicle.findFirst({
    where: { plate: normalised },
    include: {
      client: { select: _selectFull() },
    },
  });

  if (!vehicle || !vehicle.client) return null;

  // Optional soft name match for extra security (avoid false positives)
  if (nameHint) {
    const hintTokens = nameHint.toLowerCase().split(/\s+/).filter(Boolean);
    const clientName = (vehicle.client.name || '').toLowerCase();
    const matches = hintTokens.some(t => clientName.includes(t));
    if (!matches) return null; // name hint provided but doesn't match
  }

  return vehicle.client;
}

// ---------------------------------------------------------------------------
// Ambiguity helper
// ---------------------------------------------------------------------------

async function _findCandidatesByPhone(phone) {
  const normalised = normalizePhone(phone);
  if (!normalised) return [];

  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { whatsapp: { contains: normalised.slice(-8) } },
        { phone:    { contains: normalised.slice(-8) } },
      ],
    },
    take: 5,
    select: _selectSafe(),
  });

  return clients.map(c => ({
    id: c.id,
    name: maskName(c.name),
    phone: c.whatsapp || c.phone,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a client using the cascade: phone → document → plate.
 *
 * @param {object} params
 * @param {string} [params.phone]     WhatsApp ID / phone number
 * @param {string} [params.document]  CPF or CNPJ (raw or formatted)
 * @param {string} [params.plate]     Vehicle plate
 * @param {string} [params.name]      Optional name hint for plate step
 *
 * @returns {Promise<{
 *   status: 'FOUND' | 'NEED_CONFIRMATION' | 'NOT_FOUND',
 *   client?: object,
 *   candidates?: object[],
 *   resolvedBy?: 'phone' | 'document' | 'plate'
 * }>}
 */
async function resolveClient({ phone, document, plate, name }) {
  // Step 1 — phone
  if (phone) {
    const byPhone = await resolveClientByPhone(phone);
    if (byPhone) return { status: 'FOUND', client: byPhone, resolvedBy: 'phone' };
  }

  // Step 2 — document (CPF/CNPJ)
  if (document) {
    const byDoc = await _resolveByDocument(document);
    if (byDoc) return { status: 'FOUND', client: byDoc, resolvedBy: 'document' };
  }

  // Step 3 — plate
  if (plate) {
    const byPlate = await _resolveByPlate(plate, name);
    if (byPlate) return { status: 'FOUND', client: byPlate, resolvedBy: 'plate' };
  }

  // Ambiguity — multiple candidates loosely matching the phone
  if (phone) {
    const candidates = await _findCandidatesByPhone(phone);
    if (candidates.length > 0) {
      return { status: 'NEED_CONFIRMATION', candidates };
    }
  }

  return { status: 'NOT_FOUND' };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  resolveClient,
  resolveClientByPhone,
};
