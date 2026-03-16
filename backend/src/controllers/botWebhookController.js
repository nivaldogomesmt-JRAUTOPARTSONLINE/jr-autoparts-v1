'use strict';

/**
 * botWebhookController.js
 * All 8 bot endpoint handlers for the JR Auto Parts WhatsApp bot.
 *
 * Routes (all protected by authenticateBot middleware in botRoutes.js):
 *   POST /api/bot/triage
 *   POST /api/bot/boleto/resolve-client
 *   POST /api/bot/boleto/open
 *   POST /api/bot/service-intake
 *   POST /api/bot/towing-intake
 *   POST /api/bot/tracking-install
 *   POST /api/bot/tracking-support
 *   POST /api/bot/handoff
 *
 * â ï¸  VERIFY before deploying:
 *   - Prisma model names: client, vehicle, trackingContract (adjust casing/name if needed)
 *   - prisma import path in service files: '../lib/prisma' may differ
 *   - EfÃ­ listChargesByCpf response fields: charge_id, expire_at, value, payment.banking_billet.link
 *   - authenticateBot middleware header name (x-bot-token or similar)
 */

const prisma              = require('../lib/prisma');         // â ï¸ adjust path
const efiService          = require('../services/efiCobrancasService');  // existing EfÃ­ service
const botTriageService    = require('../services/botTriageService');
const botClientResolver   = require('../services/botClientResolverService');
const botSessionService   = require('../services/botSessionService');
const {
  normalizePhone,
  normalizeDocument,
  normalizePlate,
  maskDocument,
  maskPhone,
  maskName,
} = require('../helpers/normalizeHelpers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, ...data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ ok: false, message });
}

function serverError(res, err, context = '') {
  console.error(`[botWebhookController] ${context}`, err);
  return res.status(500).json({ ok: false, message: 'Erro interno do servidor.' });
}

/**
 * Format a BRL currency value.
 * Assumes EfÃ­ returns values in centavos (integer).
 * â ï¸ Verify: if EfÃ­ returns decimal reais, change / 100 to a no-op.
 */
function formatBRL(centavos) {
  const reais = (centavos || 0) / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Statuses EfÃ­ considers "open/payable"
const OPEN_STATUSES = ['waiting', 'unpaid', 'pending'];

// ---------------------------------------------------------------------------
// 1. POST /api/bot/triage
// ---------------------------------------------------------------------------

async function triage(req, res) {
  try {
    const { waId, messageId, text, mediaType } = req.body;

    if (!waId) return fail(res, 'waId Ã© obrigatÃ³rio.');

    // Idempotency guard
    if (messageId && await botSessionService.isMessageDuplicate(messageId)) {
      return ok(res, { deduplicated: true });
    }

    const session = await botSessionService.getOrCreateSession(waId);

    // Classify intent from text
    const { intent, confidence, matchedKeyword } = botTriageService.classifyIntent(text || '');

    // Extract entities that may appear in the opening message
    const { plates, documents } = botTriageService.extractEntities(text || '');

    // Update session with detected intent
    await botSessionService.updateSession(session.id, {
      currentIntent: intent,
      currentStep: 'triage',
      collectedData: {
        ...(session.collectedData || {}),
        ...(plates.length    ? { plate:    plates[0]    } : {}),
        ...(documents.length ? { document: documents[0] } : {}),
      },
    });

    // Log event
    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      messageId,
      payloadSummary: { text: (text || '').slice(0, 120), mediaType },
      detectedIntent: intent,
      endpointHit:    '/api/bot/triage',
    });

    const nextAction = botTriageService.getNextAction(intent);

    return ok(res, {
      sessionId:  session.id,
      intent,
      confidence,
      matchedKeyword,
      nextAction,
      extractedEntities: {
        plates,
        // Never return raw documents â only masked
        documents: documents.map(d => maskDocument(d)),
      },
    });
  } catch (err) {
    return serverError(res, err, 'triage');
  }
}

// ---------------------------------------------------------------------------
// 2. POST /api/bot/boleto/resolve-client
// ---------------------------------------------------------------------------

async function resolveClientForBoleto(req, res) {
  try {
    const { waId, document, plate, name } = req.body;

    if (!waId) return fail(res, 'waId Ã© obrigatÃ³rio.');

    const session = await botSessionService.getOrCreateSession(waId);

    const result = await botClientResolver.resolveClient({
      phone:    normalizePhone(waId),
      document: document ? normalizeDocument(document) : undefined,
      plate:    plate    ? normalizePlate(plate)       : undefined,
      name,
    });

    // Persist resolved state into session
    if (result.status === 'FOUND') {
      await botSessionService.updateSession(session.id, {
        currentStep:  'boleto_client_resolved',
        collectedData: {
          ...(session.collectedData || {}),
          clientId:        result.client.id,
          clientCpfCnpj:   result.client.cpfCnpj,   // stored internally only
          clientNameMasked: maskName(result.client.name),
          resolvedBy:      result.resolvedBy,
        },
      });
    }

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: {
        document: document ? maskDocument(document) : undefined,
        plate,
      },
      endpointHit: '/api/bot/boleto/resolve-client',
      status:      result.status,
    });

    if (result.status === 'FOUND') {
      return ok(res, {
        status:          'FOUND',
        clientNameMasked: maskName(result.client.name),
        resolvedBy:      result.resolvedBy,
        sessionId:       session.id,
        // cpfCnpj intentionally NOT returned to BotConversa
      });
    }

    if (result.status === 'NEED_CONFIRMATION') {
      return ok(res, {
        status:     'NEED_CONFIRMATION',
        candidates: result.candidates, // already masked
        sessionId:  session.id,
      });
    }

    return ok(res, { status: 'NOT_FOUND', sessionId: session.id });
  } catch (err) {
    return serverError(res, err, 'resolveClientForBoleto');
  }
}

// ---------------------------------------------------------------------------
// 3. POST /api/bot/boleto/open
// ---------------------------------------------------------------------------

async function openBoletos(req, res) {
  try {
    const { waId, sessionId } = req.body;

    if (!waId) return fail(res, 'waId Ã© obrigatÃ³rio.');

    // Load session
    const session = sessionId
      ? await prisma.whatsappSession.findUnique({ where: { id: sessionId } })
      : await botSessionService.getOrCreateSession(waId);

    if (!session) return fail(res, 'SessÃ£o nÃ£o encontrada.', 404);

    const collectedData = session.collectedData || {};
    const cpfCnpj = collectedData.clientCpfCnpj;

    if (!cpfCnpj) {
      return fail(res, 'CPF/CNPJ do cliente nÃ£o encontrado na sessÃ£o. Identifique o cliente primeiro.', 422);
    }

    // EfÃ­ only supports CPF lookup, not CNPJ
    if (cpfCnpj.replace(/\D/g, '').length !== 11) {
      return ok(res, {
        status:   'CNPJ_NOT_SUPPORTED',
        message:  'Consulta de boletos por CNPJ nÃ£o estÃ¡ disponÃ­vel neste canal. Por favor, entre em contato pelo WhatsApp ou ligue para nossa central.',
        sessionId: session.id,
      });
    }

    // Call EfÃ­ service
    // â ï¸ Verify: efiService.listChargesByCpf may be named differently in your project
    const charges = await efiService.listChargesByCpf(cpfCnpj);

    // Filter to open/payable statuses
    const openCharges = (charges || []).filter(c =>
      OPEN_STATUSES.includes((c.status || c.situacao || '').toLowerCase())
    );

    if (openCharges.length === 0) {
      await botSessionService.updateSession(session.id, { currentStep: 'boleto_none_found' });
      return ok(res, {
        status:    'NO_OPEN_BOLETOS',
        message:   `NÃ£o encontrei cobranÃ§as em aberto para ${collectedData.clientNameMasked || 'vocÃª'}.`,
        sessionId: session.id,
      });
    }

    // Shape response â â ï¸ verify actual field names from EfÃ­ SDK response
    const boletos = openCharges.map(c => ({
      chargeId:  c.charge_id  || c.id,
      dueDate:   c.expire_at  || c.dataVencimento,
      amount:    formatBRL(c.value || c.valor),
      payLink:   c.link                                // campo normalizado pelo service
                 || c.billet_link                      // variante 1
                 || c.payment?.banking_billet?.link    // Efí raw v2
                 || c.data?.payment?.banking_billet?.link // Efí raw v1
                 || c.linkBoleto                       // fallback legado
                 || null,
    }));

    await botSessionService.updateSession(session.id, {
      currentStep:   'boleto_presented',
      collectedData: { ...collectedData, boletosCount: boletos.length },
    });

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'OUTBOUND',
      payloadSummary: { boletosCount: boletos.length },
      endpointHit:    '/api/bot/boleto/open',
    });

    return ok(res, {
      status:    'FOUND',
      count:     boletos.length,
      boletos,
      sessionId: session.id,
    });
  } catch (err) {
    return serverError(res, err, 'openBoletos');
  }
}

// ---------------------------------------------------------------------------
// 4. POST /api/bot/service-intake
// ---------------------------------------------------------------------------

async function serviceIntake(req, res) {
  try {
    const { waId, serviceType, vehiclePlate, preferredDate, preferredTime, notes } = req.body;

    if (!waId)        return fail(res, 'waId Ã© obrigatÃ³rio.');
    if (!serviceType) return fail(res, 'Tipo de serviÃ§o Ã© obrigatÃ³rio.');

    const session = await botSessionService.getOrCreateSession(waId);

    const intakeData = {
      serviceType,
      vehiclePlate: vehiclePlate ? normalizePlate(vehiclePlate) : null,
      preferredDate:  preferredDate  || null,
      preferredTime:  preferredTime  || null,
      notes:          notes          || null,
      capturedAt:     new Date().toISOString(),
    };

    await botSessionService.updateSession(session.id, {
      currentIntent: 'servicos',
      currentStep:   'service_intake_complete',
      collectedData: { ...(session.collectedData || {}), serviceIntake: intakeData },
    });

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: { serviceType, vehiclePlate: intakeData.vehiclePlate, preferredDate },
      detectedIntent: 'servicos',
      endpointHit:    '/api/bot/service-intake',
    });

    return ok(res, {
      status:     'INTAKE_RECEIVED',
      message:    `SolicitaÃ§Ã£o de ${serviceType} registrada com sucesso! Nossa equipe entrarÃ¡ em contato para confirmar o agendamento.`,
      sessionId:  session.id,
      intakeData: {
        ...intakeData,
        vehiclePlate: intakeData.vehiclePlate, // plate is not sensitive data
      },
    });
  } catch (err) {
    return serverError(res, err, 'serviceIntake');
  }
}

// ---------------------------------------------------------------------------
// 5. POST /api/bot/towing-intake
// ---------------------------------------------------------------------------

async function towingIntake(req, res) {
  try {
    const { waId, location, vehiclePlate, problem, contactPhone } = req.body;

    if (!waId)     return fail(res, 'waId Ã© obrigatÃ³rio.');
    if (!location) return fail(res, 'LocalizaÃ§Ã£o Ã© obrigatÃ³ria para solicitaÃ§Ã£o de guincho.');

    const session = await botSessionService.getOrCreateSession(waId);

    const intakeData = {
      location,
      vehiclePlate: vehiclePlate ? normalizePlate(vehiclePlate) : null,
      problem:      problem      || null,
      contactPhone: contactPhone ? normalizePhone(contactPhone) : normalizePhone(waId),
      requestedAt:  new Date().toISOString(),
      urgency:      'HIGH', // towing requests are always high priority
    };

    await botSessionService.updateSession(session.id, {
      currentIntent: 'guincho',
      currentStep:   'towing_intake_complete',
      collectedData: { ...(session.collectedData || {}), towingIntake: intakeData },
    });

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: { location: location.slice(0, 80), vehiclePlate: intakeData.vehiclePlate },
      detectedIntent: 'guincho',
      endpointHit:    '/api/bot/towing-intake',
    });

    // Towing always escalates to human
    await botSessionService.transferSession(session.id);

    return ok(res, {
      status:    'TOWING_REQUEST_RECEIVED',
      message:   'SolicitaÃ§Ã£o de guincho recebida! Um atendente jÃ¡ foi notificado e entrarÃ¡ em contato imediatamente.',
      sessionId: session.id,
      handoffRequired: true,
    });
  } catch (err) {
    return serverError(res, err, 'towingIntake');
  }
}

// ---------------------------------------------------------------------------
// 6. POST /api/bot/tracking-install
// ---------------------------------------------------------------------------

async function trackingInstall(req, res) {
  try {
    const { waId, vehiclePlate, vehicleModel, vehicleYear, preferredDate, preferredTime } = req.body;

    if (!waId)         return fail(res, 'waId Ã© obrigatÃ³rio.');
    if (!vehiclePlate) return fail(res, 'Placa do veÃ­culo Ã© obrigatÃ³ria.');

    const normPlate = normalizePlate(vehiclePlate);
    if (!normPlate) return fail(res, 'Placa invÃ¡lida. Informe no formato ABC1234 ou ABC1D23.');

    const session = await botSessionService.getOrCreateSession(waId);

    const intakeData = {
      vehiclePlate:  normPlate,
      vehicleModel:  vehicleModel  || null,
      vehicleYear:   vehicleYear   || null,
      preferredDate: preferredDate || null,
      preferredTime: preferredTime || null,
      requestedAt:   new Date().toISOString(),
    };

    await botSessionService.updateSession(session.id, {
      currentIntent: 'rastreamento',
      currentStep:   'tracking_install_intake',
      collectedData: { ...(session.collectedData || {}), trackingInstall: intakeData },
    });

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: { vehiclePlate: normPlate, vehicleModel, preferredDate },
      detectedIntent: 'rastreamento',
      endpointHit:    '/api/bot/tracking-install',
    });

    return ok(res, {
      status:    'INSTALL_REQUEST_RECEIVED',
      message:   `SolicitaÃ§Ã£o de instalaÃ§Ã£o de rastreador para o veÃ­culo ${normPlate} registrada! Entraremos em contato para confirmar o agendamento.`,
      sessionId: session.id,
      intakeData,
    });
  } catch (err) {
    return serverError(res, err, 'trackingInstall');
  }
}

// ---------------------------------------------------------------------------
// 7. POST /api/bot/tracking-support
// ---------------------------------------------------------------------------

async function trackingSupport(req, res) {
  try {
    const { waId, vehiclePlate, issueDescription } = req.body;

    if (!waId) return fail(res, 'waId Ã© obrigatÃ³rio.');

    const session = await botSessionService.getOrCreateSession(waId);

    // Optionally look up the tracking contract for this vehicle / phone
    // â ï¸ Verify prisma model name: trackingContract may differ in your schema
    let contractInfo = null;
    try {
      const normPhone = normalizePhone(waId);
      const normPlate = vehiclePlate ? normalizePlate(vehiclePlate) : null;

      if (normPlate) {
        contractInfo = await prisma.trackingContract.findFirst({ // â ï¸ model name
          where: { vehiclePlate: normPlate },
          select: { id: true, status: true, deviceSerial: true, vehiclePlate: true },
        });
      } else if (normPhone) {
        // Fallback: try to find by client phone via relation
        contractInfo = await prisma.trackingContract.findFirst({ // â ï¸ model name
          where: {
            client: {
              OR: [
                { mobilePhone: normPhone },
                { phone: normPhone },
              ],
            },
          },
          select: { id: true, status: true, deviceSerial: true, vehiclePlate: true },
        });
      }
    } catch (lookupErr) {
      // Non-fatal: contract lookup is best-effort
      console.warn('[botWebhookController] trackingSupport contract lookup failed:', lookupErr.message);
    }

    await botSessionService.updateSession(session.id, {
      currentIntent: 'rastreamento',
      currentStep:   'tracking_support_open',
      collectedData: {
        ...(session.collectedData || {}),
        trackingSupport: {
          vehiclePlate: vehiclePlate ? normalizePlate(vehiclePlate) : null,
          issueDescription: (issueDescription || '').slice(0, 500),
          contractId: contractInfo?.id || null,
        },
      },
    });

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: { vehiclePlate, contractFound: !!contractInfo },
      detectedIntent: 'rastreamento',
      endpointHit:    '/api/bot/tracking-support',
    });

    if (!contractInfo) {
      // No contract found â escalate to human
      await botSessionService.transferSession(session.id);
      return ok(res, {
        status:          'NO_CONTRACT_FOUND',
        message:         'NÃ£o encontrei um contrato de rastreamento associado. Vou transferir para nossa equipe especializada.',
        sessionId:       session.id,
        handoffRequired: true,
      });
    }

    return ok(res, {
      status:     'CONTRACT_FOUND',
      message:    `Contrato de rastreamento localizado (${contractInfo.vehiclePlate}). Um tÃ©cnico irÃ¡ verificar o dispositivo ${contractInfo.deviceSerial || ''}.`,
      contractStatus: contractInfo.status,
      sessionId:  session.id,
      handoffRequired: contractInfo.status !== 'active',
    });
  } catch (err) {
    return serverError(res, err, 'trackingSupport');
  }
}

// ---------------------------------------------------------------------------
// 8. POST /api/bot/handoff
// ---------------------------------------------------------------------------

async function handoff(req, res) {
  try {
    const { waId, sessionId, reason, extraData } = req.body;

    if (!waId) return fail(res, 'waId Ã© obrigatÃ³rio.');

    // Load or create session
    let session = null;
    if (sessionId) {
      session = await prisma.whatsappSession.findUnique({ where: { id: sessionId } });
    }
    if (!session) {
      session = await botSessionService.getOrCreateSession(waId);
    }

    // Merge any extra data provided by BotConversa into the session
    const mergedData = {
      ...(session.collectedData || {}),
      ...(extraData || {}),
      handoffReason:    reason || 'SolicitaÃ§Ã£o do cliente',
      handoffRequestedAt: new Date().toISOString(),
    };

    await botSessionService.updateSession(session.id, {
      currentStep:   'handoff_requested',
      collectedData: mergedData,
    });

    await botSessionService.transferSession(session.id);

    await botSessionService.logEvent({
      sessionId:      session.id,
      waId,
      direction:      'INBOUND',
      payloadSummary: { reason },
      endpointHit:    '/api/bot/handoff',
      status:         'transferred',
    });

    const handoffId = `HO-${session.id.slice(0, 8).toUpperCase()}`;

    return ok(res, {
      status:    'HANDOFF_INITIATED',
      handoffId,
      message:   'Transferindo para atendimento humano. Um momento, por favor.',
      sessionId: session.id,
      collectedData: {
        // Return a safe summary (no raw CPF/CNPJ)
        intent:       session.currentIntent,
        handoffReason: reason,
        capturedAt:   mergedData.handoffRequestedAt,
      },
    });
  } catch (err) {
    return serverError(res, err, 'handoff');
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  triage,
  resolveClientForBoleto,
  openBoletos,
  serviceIntake,
  towingIntake,
  trackingInstall,
  trackingSupport,
  handoff,
};
