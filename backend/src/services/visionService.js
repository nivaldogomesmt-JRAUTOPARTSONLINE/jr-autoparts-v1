// src/services/visionService.js - reconhecimento de foto via Ollama vision
const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://172.16.2.1:11434';
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llava:7b';

/** Recebe URL de imagem ou path local, retorna base64 */
async function loadImageBase64(input) {
  if (!input) return null;
  if (input.startsWith('http')) {
    const r = await axios.get(input, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(r.data).toString('base64');
  }
  if (fs.existsSync(input)) {
    return fs.readFileSync(input).toString('base64');
  }
  // Já é base64
  if (typeof input === 'string' && input.length > 100) return input;
  return null;
}

/**
 * Identifica peça automotiva na imagem.
 * Retorna { description, bestGuess, confidence }
 */
async function identificarPeca(imageInput) {
  const b64 = await loadImageBase64(imageInput);
  if (!b64) throw new Error('Imagem inválida');

  const prompt = `Você é especialista em peças automotivas. Olhe esta imagem e descreva em português o que vê:
1. Que tipo de peça é? (ex: farol de milha, lanterna traseira, retrovisor, kit câmera de ré, antena, etc.)
2. Para que veículo aparenta ser? (marca/modelo aparente)
3. Características notáveis (formato, cor, encaixe, conector)

Responda em formato JSON:
{
  "tipo": "tipo da peça em 2-4 palavras",
  "veiculo": "marca/modelo aparente ou null",
  "caracteristicas": ["lista de detalhes visíveis"],
  "palavras_chave": ["palavras que ajudam a buscar este produto"],
  "confianca": "alta|media|baixa"
}

Apenas o JSON, nada mais.`;

  const t0 = Date.now();
  const { data } = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model: VISION_MODEL,
    messages: [{ role: 'user', content: prompt, images: [b64] }],
    stream: false,
    options: { temperature: 0.3, num_predict: 500 },
  }, { timeout: 120000 });

  const text = data.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { raw: text, elapsedMs: Date.now() - t0 };
  try {
    return { ...JSON.parse(m[0]), _meta: { model: data.model, elapsedMs: Date.now() - t0 } };
  } catch { return { raw: text, elapsedMs: Date.now() - t0 }; }
}

module.exports = { identificarPeca, loadImageBase64 };
