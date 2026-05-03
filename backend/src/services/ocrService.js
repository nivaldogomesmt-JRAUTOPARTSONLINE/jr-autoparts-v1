// src/services/ocrService.js — OCR via microservice jr-ocr (pyzbar + EasyOCR + pos-processamento)
// Llava fica como fallback se o microservice estiver fora do ar.
const axios = require('axios');

const OCR_URL = process.env.OCR_URL || 'http://jr-ocr:8000';
const OLLAMA = process.env.OLLAMA_BASE_URL || 'http://172.16.2.1:11434';
const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llava:7b';

// Regex usadas só no fallback Llava — o microservice ja parseia tudo
const REGEX_PLACA_ANTIGA   = /\b([A-Z]{3}[\-\s]?\d{4})\b/;
const REGEX_PLACA_MERCOSUL = /\b([A-Z]{3}\d[A-Z]\d{2})\b/;
const REGEX_IMEI           = /\b(\d{15})\b/;
const REGEX_BARCODE        = /\b(\d{8,14})\b/;
const REGEX_ANATEL         = /\b(\d{4,5}-\d{2}-\d{4,5})\b/;

/** Baixa imagem em base64 via Evolution API com retry */
async function fetchImageBase64(instance, messageOrKey, maxAttempts = 5) {
  const key = messageOrKey?.key || messageOrKey;
  const body = { message: { key }, convertToMp4: false };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await axios.post(`${EVO_URL}/chat/getBase64FromMediaMessage/${instance}`,
        body,
        { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      const b64 = r.data?.base64;
      if (b64) {
        console.log(`[ocr] imagem baixada na tentativa ${attempt} (${b64.length} chars)`);
        return b64;
      }
    } catch (e) {
      const detail = e.response?.data?.response?.message?.[0] || e.message;
      const isNotFound = String(detail).includes('not found');
      if (isNotFound && attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.log(`[ocr] tent ${attempt}/${maxAttempts}: not found, aguardando ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.log(`[ocr] fetchImage err:`, String(detail).substring(0, 150));
      return null;
    }
  }
  return null;
}

/** Chama o microservice jr-ocr — entrega tudo ja parseado (placa, IMEI, barcode, ANATEL). */
async function extractFromMicroservice(base64) {
  const t0 = Date.now();
  try {
    const r = await axios.post(`${OCR_URL}/detect-base64`,
      { image_base64: base64 },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
    );
    const elapsed = Date.now() - t0;
    const data = r.data || {};
    console.log(`[ocr-microservice] ${elapsed}ms — barcodes:${data.barcodes?.length||0} plates:${data.plates?.length||0} imeis:${data.imeis?.length||0} anatel:${data.anatel?.length||0}`);
    return { ok: true, data, elapsed_ms: elapsed };
  } catch (e) {
    console.log(`[ocr-microservice] err:`, e.message);
    return { ok: false, error: e.message };
  }
}

/** Pega o resultado do microservice e devolve no contrato esperado pelos controllers */
function microserviceToResult(svc) {
  const d = svc.data || {};

  // Prioridade: barcode > placa > IMEI > ANATEL
  if (d.barcodes && d.barcodes.length) {
    const bc = d.barcodes[0];
    return {
      ok: true,
      type: 'codigo_barras',
      subtype: bc.type,
      value: bc.data,
      source: 'pyzbar',
      raw: bc.data,
      elapsed_ms: svc.elapsed_ms,
    };
  }

  if (d.plates && d.plates.length) {
    const p = d.plates[0];
    const isMercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p.text);
    let value = p.text;
    if (!isMercosul && /^[A-Z]{3}\d{4}$/.test(p.text)) {
      value = p.text.slice(0, 3) + '-' + p.text.slice(3);
    }
    return {
      ok: true,
      type: 'placa',
      subtype: isMercosul ? 'mercosul' : 'antiga',
      value,
      source: 'easyocr',
      raw: p.raw || p.text,
      conf: p.conf,
      elapsed_ms: svc.elapsed_ms,
    };
  }

  if (d.imeis && d.imeis.length) {
    return {
      ok: true,
      type: 'imei',
      value: d.imeis[0].text,
      source: 'easyocr',
      raw: d.imeis[0].text,
      conf: d.imeis[0].conf,
      elapsed_ms: svc.elapsed_ms,
    };
  }

  if (d.anatel && d.anatel.length) {
    return {
      ok: true,
      type: 'anatel',
      value: d.anatel[0].text,
      source: 'easyocr',
      raw: d.anatel[0].text,
      conf: d.anatel[0].conf,
      elapsed_ms: svc.elapsed_ms,
    };
  }

  return null;
}

/** OCR via llava (fallback se o microservice cair) */
async function extractLlava(base64) {
  const PROMPT = `OCR task: list ALL text, numbers, codes you see in this image. One per line. No explanations.`;
  try {
    const t0 = Date.now();
    const r = await axios.post(`${OLLAMA}/api/generate`, {
      model: VISION_MODEL, prompt: PROMPT, images: [base64], stream: false,
      options: { temperature: 0.1 },
    }, { timeout: 120000 });
    const elapsed = Date.now() - t0;
    const raw = String(r.data?.response || '').trim();
    console.log(`[ocr-llava] ${elapsed}ms — raw: "${raw.substring(0, 200)}"`);
    return { ok: !!raw, raw, elapsed_ms: elapsed };
  } catch (e) {
    console.log('[ocr-llava] err:', e.message);
    return { ok: false };
  }
}

/** Parser usado SOMENTE no fallback Llava (microservice ja parseia). */
function parseCodesLegacy(rawText) {
  const text = (rawText || '').toUpperCase().replace(/[^A-Z0-9\s\-\n]/g, ' ');

  const m1 = text.match(REGEX_PLACA_MERCOSUL);
  if (m1) return { ok: true, type: 'placa', subtype: 'mercosul', value: m1[1] };

  const m2 = text.match(REGEX_PLACA_ANTIGA);
  if (m2) {
    const placa = m2[1].replace(/\s/g, '-');
    const formatted = placa.includes('-') ? placa : placa.slice(0, 3) + '-' + placa.slice(3);
    return { ok: true, type: 'placa', subtype: 'antiga', value: formatted };
  }

  const tokens = text.split(/[\s\n]+/).filter(t => t.length === 7 && /^[A-Z0-9]+$/.test(t));
  for (const tok of tokens) {
    if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(tok)) return { ok: true, type: 'placa', subtype: 'mercosul', value: tok };
    if (/^[A-Z]{3}\d{4}$/.test(tok)) return { ok: true, type: 'placa', subtype: 'antiga', value: tok.slice(0, 3) + '-' + tok.slice(3) };
  }

  const m3 = text.match(REGEX_ANATEL);
  if (m3) return { ok: true, type: 'anatel', value: m3[1] };

  const m4 = text.match(REGEX_IMEI);
  if (m4) return { ok: true, type: 'imei', value: m4[1] };

  const m5 = text.match(REGEX_BARCODE);
  if (m5 && m5[1].length >= 8 && m5[1].length <= 14) return { ok: true, type: 'codigo_barras', value: m5[1] };

  return { ok: false };
}

/** Pipeline principal: microservice (rapido, 95%+ precisao) -> Llava fallback. */
async function extract(base64) {
  if (!base64) return { ok: false, reason: 'sem_imagem' };

  // 1) Tenta o microservice jr-ocr (pyzbar + EasyOCR + pos-processamento)
  const svc = await extractFromMicroservice(base64);
  if (svc.ok) {
    const result = microserviceToResult(svc);
    if (result) return result;
    console.log('[ocr] microservice sem match, tentando llava...');
  } else {
    console.log('[ocr] microservice falhou, tentando llava como fallback...');
  }

  // 2) Fallback: Llava
  const llava = await extractLlava(base64);
  if (llava.ok) {
    const parsed = parseCodesLegacy(llava.raw);
    if (parsed.ok) {
      return { ...parsed, source: 'llava', raw: llava.raw, elapsed_ms: llava.elapsed_ms };
    }
  }

  return {
    ok: false,
    reason: 'sem_codigo_identificado',
    microservice_data: svc.data,
    llava_raw: llava?.raw,
  };
}

function formatReply(result, sender) {
  if (!result.ok) return null;
  const senderTxt = sender ? `\n_(enviado por @${sender.replace(/\D/g, '').slice(-9)})_` : '';
  const fonteMap = {
    pyzbar: 'pyzbar',
    easyocr: 'EasyOCR',
    llava: 'Llava (fallback)',
  };
  const fonte = fonteMap[result.source] || result.source || 'OCR';

  if (result.type === 'placa') {
    const tipo = result.subtype === 'mercosul' ? 'Mercosul' : 'antigo';
    return `🚗 *Placa identificada:* \`${result.value}\`\n_(formato ${tipo} · via ${fonte})_${senderTxt}`;
  }
  if (result.type === 'imei') {
    return `📱 *IMEI identificado:* \`${result.value}\`\n_(via ${fonte})_${senderTxt}`;
  }
  if (result.type === 'codigo_barras') {
    return `📊 *Código de barras:* \`${result.value}\`${result.subtype ? ` _(${result.subtype})_` : ''}\n_(via ${fonte})_${senderTxt}`;
  }
  if (result.type === 'anatel') {
    return `📋 *Homologação ANATEL:* \`${result.value}\`\n_(via ${fonte})_${senderTxt}`;
  }
  return null;
}

module.exports = { fetchImageBase64, extract, formatReply };
