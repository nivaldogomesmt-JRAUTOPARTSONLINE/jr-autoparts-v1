'use strict';

/**
 * botSessionService.js
 * Manages WhatsApp conversation sessions stored in Postgres via Prisma.
 * No Redis — all state lives in the whatsapp_sessions / whatsapp_events tables.
 *
 * ⚠️  Verify the prisma client import path matches your project layout.
 *     Common paths: '../lib/prisma'  |  '../../lib/prisma'  |  '../config/prisma'
 */
const prisma = require('../lib/prisma'); // ⚠️ adjust if needed

const SESSION_TTL_MINUTES = parseInt(process.env.BOT_SESSION_TTL_MINUTES || '30', 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expiresAt() {
  return new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Fetch the active session for a given waId, or create a fresh one.
 */
async function getOrCreateSession(waId) {
  // Expire stale sessions for this waId before looking up
  await prisma.whatsappSession.updateMany({
    where: {
      waId,
      status: 'active',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });

  let session = await prisma.whatsappSession.findFirst({
    where: { waId, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    session = await prisma.whatsappSession.create({
      data: {
        waId,
        status: 'active',
        expiresAt: expiresAt(),
        collectedData: {},
      },
    });
  }

  return session;
}

/**
 * Apply a partial update to a session.
 * Also refreshes the TTL on every meaningful interaction.
 */
async function updateSession(sessionId, patch) {
  return prisma.whatsappSession.update({
    where: { id: sessionId },
    data: {
      ...patch,
      expiresAt: expiresAt(), // slide the TTL window
      updatedAt: new Date(),
    },
  });
}

async function completeSession(sessionId) {
  return prisma.whatsappSession.update({
    where: { id: sessionId },
    data: { status: 'completed', updatedAt: new Date() },
  });
}

async function transferSession(sessionId) {
  return prisma.whatsappSession.update({
    where: { id: sessionId },
    data: { status: 'transferred', updatedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Event log (audit trail)
// ---------------------------------------------------------------------------

/**
 * Log a single conversation event.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.waId
 * @param {'INBOUND'|'OUTBOUND'} params.direction
 * @param {string} [params.messageId]
 * @param {object} [params.payloadSummary]
 * @param {string} [params.detectedIntent]
 * @param {string} [params.endpointHit]
 * @param {string} [params.status]   default 'ok'
 */
async function logEvent({
  sessionId,
  waId,
  direction,
  messageId,
  payloadSummary,
  detectedIntent,
  endpointHit,
  status = 'ok',
}) {
  return prisma.whatsappEvent.create({
    data: {
      sessionId,
      waId,
      direction,
      messageId: messageId || null,
      payloadSummary: payloadSummary || {},
      detectedIntent: detectedIntent || null,
      endpointHit: endpointHit || null,
      status,
    },
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Returns true if this messageId was already processed (idempotency guard).
 */
async function isMessageDuplicate(messageId) {
  if (!messageId) return false;
  const existing = await prisma.whatsappEvent.findFirst({
    where: { messageId },
  });
  return !!existing;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function getSessionHistory(sessionId) {
  return prisma.whatsappEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getOrCreateSession,
  updateSession,
  completeSession,
  transferSession,
  logEvent,
  isMessageDuplicate,
  getSessionHistory,
};
