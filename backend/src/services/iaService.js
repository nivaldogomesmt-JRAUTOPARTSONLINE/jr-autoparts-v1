// src/services/iaService.js - geração de texto via Ollama local
// Suporta canais: olx, instagram, facebook, whatsapp_catalog
const axios = require('axios');
const templates = require('./adTemplateService');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://172.16.2.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

const PHONE_DISPLAY = '(65) 99281-2000';
const STORE_NAME = 'JR Auto Parts';
const STORE_LOCATION = 'Cuiabá-MT';

async function generate(prompt, opts = {}) {
  const t0 = Date.now();
  const { data } = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model: opts.model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,
    options: {
      temperature: opts.temperature ?? 0.7,
      num_predict: opts.maxTokens ?? 800,
    },
  }, { timeout: opts.timeout || 120000 });
  return {
    text: (data.message && data.message.content) || '',
    model: data.model,
    elapsedMs: Date.now() - t0,
  };
}

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ─── OLX ──────────────────────────────────────────────────────────────────
async function generateOlxAd({ name, description, price, category, brand, model: prodModel, useTemplates = true }) {
  if (useTemplates) {
    try {
      const similares = await templates.findSimilar(name, 3);
      if (similares.length > 0 && similares[0].bodyOlx) {
        const best = similares[0];
        return {
          title: best.title,
          body: best.bodyOlx,
          keywords: [],
          source: 'template',
          templateId: best.id,
          templateBrand: best.brand,
          templateCategory: best.category,
          alternatives: similares.slice(1).map(s => ({ id: s.id, title: s.title, brand: s.brand })),
        };
      }
    } catch (e) {
      console.log('[ia] erro busca template OLX:', e.message);
    }
  }

  const prompt = `Você é redator de anúncios OLX especialista em auto peças no Brasil. Gere anúncio em português brasileiro.

PRODUTO:
- Nome: ${name}
- Descrição: ${description || '(sem descrição)'}
- Preço: R$ ${price || '?'}
- Categoria: ${category || 'auto-peças'}
${brand ? `- Marca: ${brand}` : ''}
${prodModel ? `- Compatível: ${prodModel}` : ''}

REGRAS:
1. Título: até 60 caracteres com palavras-chave (modelo carro, ano).
2. Descrição: 4-6 linhas curtas. Inclua: o que é, compatibilidade, condição (novo), garantia 90 dias da JR Auto Parts, retirada Cuiabá ou envio.
3. NÃO repita preço (já tem campo).
4. Termine com "Chama no zap ${PHONE_DISPLAY}".

Retorne APENAS JSON: {"title":"...","body":"...","keywords":["...","..."]}`;

  const r = await generate(prompt, { temperature: 0.7, maxTokens: 600 });
  const parsed = extractJson(r.text);
  if (!parsed) return { title: name, body: description || '', keywords: [], _raw: r.text };
  return { ...parsed, source: 'ai', _meta: { model: r.model, elapsedMs: r.elapsedMs } };
}

// ─── Instagram ────────────────────────────────────────────────────────────
async function generateInstagramAd({ name, description, price, category, brand, useTemplates = true }) {
  if (useTemplates) {
    try {
      const similares = await templates.findSimilar(name, 3);
      if (similares.length > 0 && similares[0].bodyInstagram) {
        return {
          caption: similares[0].bodyInstagram,
          hashtags: [],
          source: 'template',
          templateId: similares[0].id,
          templateBrand: similares[0].brand,
        };
      }
    } catch (e) {
      console.log('[ia] erro template Insta:', e.message);
    }
  }

  const prompt = `Você é social media de auto peças. Gere caption Instagram em português brasileiro pro produto.

PRODUTO:
- Nome: ${name}
- Descrição: ${description || '(sem)'}
- Preço: R$ ${price || '?'}
${brand ? `- Marca: ${brand}` : ''}

REGRAS:
1. Caption: 4-8 linhas, tom amigável, 2-4 emojis naturais (🚗🔧⚙️✨), gancho na primeira linha.
2. Mencione: o que é, benefício prático, garantia 90 dias, ${STORE_NAME} em ${STORE_LOCATION}.
3. CTA: "Chama no DM ou zap ${PHONE_DISPLAY}"
4. Hashtags: 8-12 relevantes em uma única linha no fim. Misture geral (#autopecas #cuiaba #mt) e específicas do produto/marca.

Retorne APENAS JSON: {"caption":"texto com quebras \\n","hashtags":["#tag1","#tag2","..."]}`;

  const r = await generate(prompt, { temperature: 0.8, maxTokens: 700 });
  const parsed = extractJson(r.text);
  if (!parsed) return { caption: description || name, hashtags: [], _raw: r.text };
  return { ...parsed, source: 'ai', _meta: { model: r.model, elapsedMs: r.elapsedMs } };
}

// ─── Facebook ─────────────────────────────────────────────────────────────
async function generateFacebookAd({ name, description, price, category, brand, useTemplates = true }) {
  // Facebook usa o mesmo body do Instagram como base, mas reformatado mais conversacional
  const prompt = `Você é redator de Facebook Marketplace de auto peças. Gere post em português brasileiro.

PRODUTO:
- Nome: ${name}
- Descrição: ${description || '(sem)'}
- Preço: R$ ${price || '?'}
${brand ? `- Marca: ${brand}` : ''}

REGRAS:
1. Post conversacional, 6-10 linhas, tom direto e amigável.
2. Estrutura: gancho → o que é → compatibilidade/uso → garantia 90 dias → onde retirar (Cuiabá-MT) ou enviar → CTA.
3. Sem hashtags excessivas (máx 3 no fim).
4. CTA: "Manda mensagem aqui ou WhatsApp ${PHONE_DISPLAY}".
5. NÃO repita preço (já tem campo).

Retorne APENAS JSON: {"title":"título atrativo até 80 chars","body":"texto longo com \\n para quebras"}`;

  const r = await generate(prompt, { temperature: 0.75, maxTokens: 700 });
  const parsed = extractJson(r.text);
  if (!parsed) return { title: name, body: description || '', _raw: r.text };
  return { ...parsed, source: 'ai', _meta: { model: r.model, elapsedMs: r.elapsedMs } };
}

// ─── WhatsApp Catalog (Meta Business) ─────────────────────────────────────
async function generateWhatsappCatalogAd({ name, description, price, category, brand, useTemplates = true }) {
  if (useTemplates) {
    try {
      const similares = await templates.findSimilar(name, 3);
      if (similares.length > 0 && similares[0].bodyWhatsapp) {
        return {
          title: similares[0].title,
          description: similares[0].bodyWhatsapp,
          source: 'template',
          templateId: similares[0].id,
        };
      }
    } catch (e) {
      console.log('[ia] erro template WhatsApp:', e.message);
    }
  }

  const prompt = `Gere anúncio para Catálogo do WhatsApp Business em português brasileiro. Tom direto, sem floreios.

PRODUTO:
- Nome: ${name}
- Descrição: ${description || '(sem)'}
- Preço: R$ ${price || '?'}
${brand ? `- Marca: ${brand}` : ''}

REGRAS:
1. Title: até 150 chars, claro, com modelo/aplicação se relevante.
2. Description: 3-5 linhas. Inclua: o que é, aplicação/compatibilidade, condição (novo), garantia 90 dias, ${STORE_NAME}.
3. SEM emojis (catálogo profissional).
4. NÃO termine com CTA (cliente já está no WhatsApp).

Retorne APENAS JSON: {"title":"...","description":"..."}`;

  const r = await generate(prompt, { temperature: 0.6, maxTokens: 500 });
  const parsed = extractJson(r.text);
  if (!parsed) return { title: name, description: description || name, _raw: r.text };
  return { ...parsed, source: 'ai', _meta: { model: r.model, elapsedMs: r.elapsedMs } };
}

// ─── Multi-canal: gera os 4 canais em 1 chamada Ollama ───────────────────
async function generateMultiChannel(product) {
  const { name, description, price, category, brand, useTemplates = true } = product;

  // Tenta pegar template primeiro
  if (useTemplates) {
    try {
      const similares = await templates.findSimilar(name, 3);
      if (similares.length > 0) {
        const best = similares[0];
        // Se template tem todos os 3 campos, retorna direto sem IA
        if (best.bodyOlx && best.bodyInstagram && best.bodyWhatsapp) {
          return {
            olx:       { title: best.title, body: best.bodyOlx, keywords: [] },
            instagram: { caption: best.bodyInstagram, hashtags: [] },
            facebook:  { title: best.title, body: best.bodyOlx },  // FB usa OLX como base
            whatsapp_catalog: { title: best.title, description: best.bodyWhatsapp },
            source: 'template',
            templateId: best.id,
            templateBrand: best.brand,
            templateCategory: best.category,
            alternatives: similares.slice(1).map(s => ({ id: s.id, title: s.title, brand: s.brand })),
          };
        }
      }
    } catch (e) {
      console.log('[ia] erro template multi:', e.message);
    }
  }

  // Sem template — gera tudo em 1 chamada
  const prompt = `Você é redator multi-canal de auto peças. Gere anúncios em PT-BR pro produto abaixo, em 4 canais diferentes. Retorne ESTRITAMENTE em JSON.

PRODUTO:
- Nome: ${name}
- Descrição: ${description || '(sem)'}
- Preço: R$ ${price || '?'}
- Categoria: ${category || 'auto-peças'}
${brand ? `- Marca: ${brand}` : ''}

DADOS DA LOJA: ${STORE_NAME}, ${STORE_LOCATION}, WhatsApp ${PHONE_DISPLAY}, garantia 90 dias.

GERE OS 4 CANAIS:

1) OLX: title até 60 chars, body 4-6 linhas com bullets. Termine com "Chama no zap ${PHONE_DISPLAY}".
2) Instagram: caption 4-8 linhas com 2-4 emojis naturais + 8-12 hashtags no fim em uma linha.
3) Facebook: title até 80 chars + body 6-10 linhas conversacional, máx 3 hashtags.
4) WhatsApp Catalog: title até 150 chars + description 3-5 linhas, SEM emojis (profissional).

Retorne APENAS JSON neste formato exato:
{
  "olx": {"title":"...","body":"...","keywords":["...","..."]},
  "instagram": {"caption":"...","hashtags":["#tag1","#tag2","..."]},
  "facebook": {"title":"...","body":"..."},
  "whatsapp_catalog": {"title":"...","description":"..."}
}`;

  const r = await generate(prompt, { temperature: 0.75, maxTokens: 1800 });
  const parsed = extractJson(r.text);
  if (!parsed) {
    return {
      olx: { title: name, body: description || '', keywords: [] },
      instagram: { caption: description || name, hashtags: [] },
      facebook: { title: name, body: description || '' },
      whatsapp_catalog: { title: name, description: description || name },
      source: 'ai',
      _raw: r.text,
    };
  }
  return { ...parsed, source: 'ai', _meta: { model: r.model, elapsedMs: r.elapsedMs } };
}

// ─── Classificador de categoria ───────────────────────────────────────────
async function classifyOlxCategory(name) {
  const prompt = `Classifique este produto na categoria OLX correta de Auto Peças. Responda APENAS com o nome da subcategoria mais específica em português.

Produto: ${name}

Exemplos: "Motor", "Suspensão", "Freios", "Elétrica", "Carroceria", "Acessórios", "Som e Multimídia", "Ar-condicionado", "Lanternas e Faróis", "Pneus".

Subcategoria:`;
  const r = await generate(prompt, { temperature: 0.2, maxTokens: 30 });
  return r.text.trim().split('\n')[0].replace(/^[-•*\s]+/, '').slice(0, 50);
}

module.exports = {
  generate,
  generateOlxAd,
  generateInstagramAd,
  generateFacebookAd,
  generateWhatsappCatalogAd,
  generateMultiChannel,
  classifyOlxCategory,
};
