const svc = require('../services/atendimentoService');
const audit = require('../services/auditService');
const axios = require('axios');

const EVO_URL = process.env.EVOLUTION_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const EVO_INSTANCE_VENDAS = process.env.EVO_INSTANCE_VENDAS || 'jr-financeiro-bot';

// POST /api/atendimento/cliente — webhook do BotConversa
async function clienteComFoto(req, res) {
  try {
    const { phone, name, mensagem, imageUrl, imageBase64 } = req.body || {};
    if (!phone || (!imageUrl && !imageBase64)) return res.status(400).json({ error: 'phone e imageUrl|imageBase64 obrigatorios' });
    const r = await svc.processar({ phone, name, mensagem: mensagem || '', imageUrl, imageBase64 });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function clienteMensagem(req, res) {
  try {
    const { phone, name, mensagem } = req.body || {};
    if (!phone || !mensagem) return res.status(400).json({ error: 'phone e mensagem obrigatorios' });
    const r = await svc.processar({ phone, name, mensagem });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listarRascunhos(req, res) {
  try { res.json(await svc.listarRascunhos(req.query.status || 'PENDENTE')); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

async function aprovarERevisar(req, res) {
  try {
    const { conteudoEditado } = req.body || {};
    const draft = await svc.aprovarRascunho(req.params.id, req.user?.email || 'admin');
    // Conteudo final - editado ou original
    const conteudo = conteudoEditado || draft.content;
    // Envia foto PRIMEIRO (UX melhor: cliente vê a peça antes de ler texto)
    if (draft.photoUrl) {
      try {
        const photoFull = draft.photoUrl.startsWith('http') ? draft.photoUrl : 'https://webhook.jrautopartsmt.com.br' + draft.photoUrl;
        await axios.post(`${EVO_URL}/message/sendMedia/${EVO_INSTANCE_VENDAS}`,
          { number: draft.conversation.customerPhone, mediatype: 'image', media: photoFull, caption: conteudo.slice(0, 200) },
          { headers: { apikey: EVO_KEY }, timeout: 25000 }
        );
        // Foto com legenda já leva a mensagem inicial
      } catch (e) { console.log('[atendimento] foto falhou:', e.message); }
    }

    // Texto completo (depois da foto, ou único se não tem foto)
    try {
      await axios.post(`${EVO_URL}/message/sendText/${EVO_INSTANCE_VENDAS}`,
        { number: draft.conversation.customerPhone, text: conteudo },
        { headers: { apikey: EVO_KEY }, timeout: 15000 }
      );
    } catch (e) {
      console.log('[atendimento] erro envio texto:', e.message);
      return res.status(502).json({ error: 'falha ao enviar pelo WhatsApp', detalhe: e.message });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function rejeitar(req, res) {
  try {
    await svc.rejeitarRascunho(req.params.id, req.body?.motivo, req.user?.email || 'admin');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { clienteMensagem, clienteComFoto, listarRascunhos, aprovarERevisar, rejeitar };
