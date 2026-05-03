'use strict';

/**
 * botTriageService.js
 * Keyword-based intent classification with entity extraction.
 * Designed for low coupling — plug in an LLM classifier later without changing callers.
 */

const { normalizeDocument, normalizePlate } = require('../helpers/normalizeHelpers');

// ---------------------------------------------------------------------------
// Intent rules (ordered: most specific / highest confidence first)
// ---------------------------------------------------------------------------

const INTENT_RULES = [
  {
    intent: 'humano',
    confidence: 1.0,
    keywords: [
      'atendente', 'humano', 'pessoa', 'falar com alguem', 'falar com alguém',
      'preciso de ajuda', 'não entendi', 'nao entendi', 'sair', 'cancelar',
      'voltar', 'menu', 'atendimento humano',
    ],
  },
  {
    intent: 'guincho',
    confidence: 0.95,
    keywords: [
      'guincho', 'reboque', 'carro parou', 'carro quebrou', 'quebrei',
      'pneu furou', 'bateria', 'socorro', 'emergencia', 'emergência',
      'estou preso', 'carro não liga', 'carro nao liga',
    ],
  },
  {
    intent: 'boleto',
    confidence: 0.9,
    keywords: [
      'boleto', 'pagamento', 'pagar', 'cobrança', 'cobranca', 'fatura',
      'segunda via', '2a via', '2ª via', 'vencido', 'vencimento',
      'débito', 'debito', 'conta', 'financeiro',
    ],
  },
  {
    intent: 'servicos',
    confidence: 0.9,
    keywords: [
      'revisão', 'revisao', 'oficina', 'mecânico', 'mecanico', 'serviço',
      'servico', 'troca de óleo', 'troca de oleo', 'alinhamento', 'balanceamento',
      'freio', 'suspensão', 'suspensao', 'manutenção', 'manutencao',
      'agendar', 'agendamento',
    ],
  },
  {
    intent: 'rastreamento',
    confidence: 0.9,
    keywords: [
      'rastreamento', 'rastreador', 'rastrear', 'gps', 'localização',
      'localizacao', 'monitoramento', 'monitorar', 'tracker', 'instalar rastreador',
      'instalar gps', 'suporte rastreamento',
    ],
  },
  {
    intent: 'pecas',
    confidence: 0.85,
    keywords: [
      'peça', 'peca', 'peças', 'pecas', 'produto', 'estoque', 'disponível',
      'disponivel', 'preço', 'preco', 'comprar', 'cotação', 'cotacao',
      'filtro', 'vela', 'correia', 'amortecedor', 'pastilha', 'disco',
    ],
  },
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify the intent of a free-text message.
 *
 * @param {string} text
 * @returns {{ intent: string, confidence: number, matchedKeyword: string|null }}
 */
function classifyIntent(text) {
  if (!text || typeof text !== 'string') {
    return { intent: 'unknown', confidence: 0, matchedKeyword: null };
  }

  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      const kNorm = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(kNorm)) {
        return {
          intent: rule.intent,
          confidence: rule.confidence,
          matchedKeyword: keyword,
        };
      }
    }
  }

  return { intent: 'unknown', confidence: 0, matchedKeyword: null };
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

// CPF: 000.000.000-00 or 00000000000
const CPF_RE    = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g;
// CNPJ: 00.000.000/0000-00 or 00000000000000
const CNPJ_RE   = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;
// Plate: ABC-1234 or ABC1D23
const PLATE_RE  = /\b[A-Za-z]{3}[-\s]?\d[A-Za-z0-9]\d{2}\b/g;

/**
 * Extract structured entities from free text.
 *
 * @param {string} text
 * @returns {{ plates: string[], documents: string[] }}
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') return { plates: [], documents: [] };

  const plates = [];
  const documents = [];

  const plateMatches = text.match(PLATE_RE) || [];
  for (const m of plateMatches) {
    const p = normalizePlate(m);
    if (p && !plates.includes(p)) plates.push(p);
  }

  const cpfMatches = text.match(CPF_RE) || [];
  for (const m of cpfMatches) {
    const d = normalizeDocument(m);
    if (d && d.length === 11 && !documents.includes(d)) documents.push(d);
  }

  const cnpjMatches = text.match(CNPJ_RE) || [];
  for (const m of cnpjMatches) {
    const d = normalizeDocument(m);
    if (d && d.length === 14 && !documents.includes(d)) documents.push(d);
  }

  return { plates, documents };
}

// ---------------------------------------------------------------------------
// Action mapping
// ---------------------------------------------------------------------------

const ACTION_MAP = {
  humano:       { action: 'HANDOFF',           endpoint: '/api/bot/handoff' },
  guincho:      { action: 'TOWING_INTAKE',     endpoint: '/api/bot/towing-intake' },
  boleto:       { action: 'BOLETO_RESOLVE',    endpoint: '/api/bot/boleto/resolve-client' },
  servicos:     { action: 'SERVICE_INTAKE',    endpoint: '/api/bot/service-intake' },
  rastreamento: { action: 'TRACKING_INSTALL',  endpoint: '/api/bot/tracking-install' },
  pecas:        { action: 'PARTS_INQUIRY',     endpoint: null }, // handled by BotConversa catalogue
  unknown:      { action: 'HANDOFF',           endpoint: '/api/bot/handoff' },
};

/**
 * Map an intent to the next backend action / endpoint.
 */
function getNextAction(intent) {
  return ACTION_MAP[intent] || ACTION_MAP['unknown'];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  classifyIntent,
  extractEntities,
  getNextAction,
};
