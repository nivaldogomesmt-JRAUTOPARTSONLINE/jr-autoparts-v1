// src/services/atendimentoService.js - cliente WhatsApp -> Ollama+RAG -> rascunho
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const leadService = require('./leadService');
const complaintClassifierService = require('./complaintClassifierService');

const templates = require('./adTemplateService');
const audit = require('./auditService');
const learning = require('./learningService');
const vision = require('./visionService');

const INTENTS = ['INFO', 'INTERESSE', 'RESERVAR', 'FECHAR', 'PROBLEMA', 'OUTRO'];
const ESCALAR_HUMANO = ['FECHAR', 'PROBLEMA'];
const HORARIO_HUMANO_INI = 8, HORARIO_HUMANO_FIM = 18;

function dentroHorarioComercial(d = new Date()) {
  const cuiaba = new Date(d.toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
  const dia = cuiaba.getDay(), hora = cuiaba.getHours();
  return dia >= 1 && dia <= 6 && hora >= HORARIO_HUMANO_INI && hora < HORARIO_HUMANO_FIM;
}

function limpoFone(f) { return String(f || '').replace(/\D/g, ''); }

async function getOrCreateConversation(phone, name) {
  const limpo = limpoFone(phone);
  let c = await prisma.conversation.findFirst({
    where: { customerPhone: limpo, status: { in: ['ATIVA', 'AGUARDANDO_HUMANO'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!c) {
    c = await prisma.conversation.create({
      data: { customerPhone: limpo, customerName: name || null, channel: 'whatsapp' },
    });

  // Captura/atualiza lead estruturado em background (não trava resposta)
  leadService.captureFromMessage({
    phone, name, mensagem, source: 'whatsapp', conversationId: c.id,
  }).catch(e => console.log('[lead] capture falhou:', e.message));

  // Classifica mensagem como reclamação (background, não trava resposta)
  complaintClassifierService.processCustomerMessage({
    phone, name, mensagem: mensagem || '', conversationId: c?.id,
  }).catch(e => console.log('[complaint] classify falhou:', e.message));
  }
  return c;
}

async function classificarIntent(mensagem, historico = []) {
  const ctx = historico.slice(-3).map(m => `${m.direction === 'IN' ? 'Cliente' : 'Atendente'}: ${m.content}`).join('\n');
  const prompt = `Classifique a INTENÇÃO da última mensagem do cliente em UMA palavra (escolha entre INFO, INTERESSE, RESERVAR, FECHAR, PROBLEMA, OUTRO).

INFO = só tirando dúvida básica
INTERESSE = mostrou interesse no produto
RESERVAR = quer reservar / segurar produto
FECHAR = quer pagar, fechar negócio, comprar agora ("vou levar", "quanto fica?", "manda o pix")
PROBLEMA = reclamação, problema com pedido, devolução
OUTRO = não se encaixa

${ctx ? 'Histórico:\n' + ctx + '\n\n' : ''}Última mensagem do cliente: "${mensagem}"

Responda APENAS uma das palavras (INFO, INTERESSE, RESERVAR, FECHAR, PROBLEMA, OUTRO).`;
  try {
    const r = await ia.generate(prompt, { temperature: 0.1, maxTokens: 20 });
    const palavra = (r.text || '').trim().toUpperCase().split(/\s+/)[0];
    return INTENTS.includes(palavra) ? palavra : 'OUTRO';
  } catch { return 'OUTRO'; }
}

function tomPara(primeiroContato) {
  return primeiroContato
    ? `Tom FORMAL (primeiro contato): "Bom dia!" ou "Boa tarde!" Trate por "senhor" ou "senhora" se possível. Use "vocês" no plural representando JR Auto Parts. Profissional, cordial, objetivo. Sem gírias, sem informalidade exagerada.`
    : `Tom AMISTOSO (cliente já em conversa): "Oi", "tudo bem?" — descontraído mas educado. Pode usar emojis com moderação. Sem gírias regionais nem tratamento muito casual.`;
}

async function gerarResposta({ conversation, mensagem, historico }) {
  // Busca template similar
  const similares = await templates.findSimilar(mensagem, 3);
  const primeiroContato = historico.length === 0;

  let templateContext = '';
  let templateUsado = null;
  let fotoUrl = null;
  if (similares.length > 0) {
    const best = similares[0];
    templateUsado = best;
    templateContext = `\nTEMOS este produto disponível:\nTítulo: ${best.title}\nMarca: ${best.brand} | Categoria: ${best.category}\n${best.bodyOlx ? 'Descrição completa:\n' + best.bodyOlx.slice(0, 800) : ''}`;
    fotoUrl = best.photosUrl || null;
  }

  // Few-shot: busca exemplos aprovados similares
  let fewShotBlock = '';
  try {
    const exemplos = await learning.findSimilar(mensagem, { limit: 2 });
    if (exemplos.length) {
      const lines = exemplos.map((e, i) => 'Exemplo ' + (i+1) + ': Cliente: "' + e.inputText + '" / Nos: "' + e.outputText + '"').join(' || ');
      fewShotBlock = '\nEXEMPLOS DE BOAS RESPOSTAS APROVADAS (siga o tom): ' + lines;
    }
  } catch {}

  const prompt = `Você é atendente de WhatsApp da JR Auto Parts (loja de auto peças e franquia Rastrek em Cuiabá-MT).

REGRAS DE TOM:
${tomPara(primeiroContato)}

REGRAS DE NEGÓCIO:
- Pagamento: à vista (PIX/boleto) com desconto, ou parcelamos em até 6x sem juros no cartão de crédito
- Garantia: 90 dias
- Retirada em loja (Bela Vista, Cuiabá-MT) ou enviamos por transportadora
- Atendimento humano (vendas/negociação): SEGUNDA a SÁBADO 8h-18h pelo (65) 99281-2000
- Se for fora do horário comercial, avise: "Nosso atendimento humano funciona seg a sáb 8h-18h. Posso adiantar com informação básica e a equipe entra em contato em breve."

${fewShotBlock}${templateContext ? '\nINFORMAÇÃO DO PRODUTO:\n' + templateContext : '\n(Sem produto identificado na mensagem.)'}

HISTÓRICO da conversa:
${historico.length === 0 ? '(primeira mensagem)' : historico.slice(-5).map(m => `${m.direction === 'IN' ? 'Cliente' : 'JR'}: ${m.content}`).join('\n')}

ÚLTIMA MENSAGEM DO CLIENTE: "${mensagem}"

Responda em português do Brasil, máximo 5 linhas, finalizando com pergunta ou call-to-action quando fizer sentido. Se for primeiro contato, comece com saudação. NÃO invente preço — diga que vai consultar com o vendedor se cliente perguntar valor.`;

  const t0 = Date.now();
  const r = await ia.generate(prompt, { temperature: 0.5, maxTokens: 400 });
  return {
    resposta: (r.text || '').trim(),
    templateUsado,
    fotoUrl,
    aiModel: r.model,
    aiElapsedMs: Date.now() - t0,
  };
}

async function processar({ phone, name, mensagem, imageUrl, imageBase64 }) {
  // Se cliente mandou foto, identifica antes
  let visionDescr = null;
  if (imageUrl || imageBase64) {
    try {
      const r = await vision.identificarPeca(imageBase64 || imageUrl);
      visionDescr = r;
      // Se descreveu produto, usa como mensagem
      if (r.tipo) {
        mensagem = mensagem ? mensagem + ' (foto enviada com: ' + r.tipo + (r.veiculo ? ' ' + r.veiculo : '') + ')'
                            : 'Cliente enviou foto de: ' + r.tipo + (r.veiculo ? ' para ' + r.veiculo : '');
      }
    } catch (e) {
      console.log('[atendimento] erro vision:', e.message);
    }
  }

  const conv = await getOrCreateConversation(phone, name);
  const historico = await prisma.conversationMessage.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: 'asc' },
  });

  // Salva mensagem do cliente
  await prisma.conversationMessage.create({
    data: {
      conversationId: conv.id,
      direction: 'IN',
      content: mensagem,
    },
  });

  // Classifica intent
  const intent = await classificarIntent(mensagem, historico);

  // Se humano já assumiu, nem gera rascunho
  if (conv.status === 'HUMANO') {
    await audit.log({
      eventType: 'mensagem_humano_atendendo', severity: 'INFO',
      source: 'atendimento', action: `Cliente ${phone} mandou msg, humano já assumiu conversa`,
      resource: conv.id, details: { mensagem: mensagem.slice(0, 100) },
    });
    return { conversationId: conv.id, status: 'HUMANO', intent };
  }

  // Se intent escala, manda pra humano
  if (ESCALAR_HUMANO.includes(intent)) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: 'AGUARDANDO_HUMANO', lastIntent: intent },
    });
    await audit.log({
      eventType: 'lead_quente', severity: 'NOTICE',
      source: 'atendimento',
      action: `🔥 Cliente ${phone} ${intent === 'FECHAR' ? 'quer FECHAR venda' : 'tem PROBLEMA'}`,
      resource: conv.id,
      details: { phone, mensagem: mensagem.slice(0, 200), intent },
    });
    return { conversationId: conv.id, status: 'AGUARDANDO_HUMANO', intent };
  }

  // Gera rascunho via Ollama
  const { resposta, templateUsado, fotoUrl, aiModel, aiElapsedMs } = await gerarResposta({
    conversation: conv, mensagem, historico,
  });

  // Salva como rascunho
  const draft = await prisma.conversationMessage.create({
    data: {
      conversationId: conv.id,
      direction: 'OUT_DRAFT',
      content: resposta,
      intent,
      draftStatus: 'PENDENTE',
      templateId: templateUsado?.id || null,
      photoUrl: fotoUrl,
      aiModel, aiElapsedMs,
    },
  });

  await prisma.conversation.update({
    where: { id: conv.id }, data: { lastIntent: intent },
  });

  await audit.log({
    eventType: 'rascunho_gerado', severity: 'INFO',
    source: 'atendimento',
    action: `Rascunho gerado para ${phone} (intent: ${intent})`,
    resource: draft.id, details: { phone, intent, ai_ms: aiElapsedMs },
  });

  return {
    conversationId: conv.id, draftId: draft.id, intent,
    rascunho: resposta, fotoUrl,
    templateUsado: templateUsado ? { id: templateUsado.id, title: templateUsado.title } : null,
  };
}

async function aprovarRascunho(draftId, approvedBy = 'sistema', conteudoEditado = null) {
  const draft = await prisma.conversationMessage.findUnique({
    where: { id: draftId },
    include: { conversation: { include: { messages: { where: { direction: 'IN' }, orderBy: { createdAt: 'desc' }, take: 1 } } } },
  });
  if (!draft || draft.draftStatus !== 'PENDENTE') {
    throw new Error('Rascunho não encontrado ou já processado');
  }
  const conteudoFinal = conteudoEditado || draft.content;
  // Marca aprovado
  await prisma.conversationMessage.update({
    where: { id: draftId },
    data: { draftStatus: 'APROVADO', approvedBy, approvedAt: new Date(), direction: 'OUT', content: conteudoFinal },
  });
  // REGISTRA COMO APRENDIZADO
  const ultimaIn = draft.conversation.messages[0];
  if (ultimaIn) {
    try {
      await learning.registrar({
        inputText: ultimaIn.content,
        outputText: conteudoFinal,
        intent: draft.intent,
        score: conteudoEditado ? 2 : 3, // editado vale 2, aprovado direto vale 3
        approvedBy,
        sourceType: 'APPROVAL',
        sourceId: draft.id,
        templateId: draft.templateId,
      });
    } catch (e) { console.log('[atendimento] erro learning:', e.message); }
  }
  await audit.log({
    eventType: 'rascunho_aprovado', severity: 'INFO',
    source: 'atendimento', actor: approvedBy,
    action: `Rascunho ${draftId} aprovado`,
    resource: draftId,
  });
  return draft;
}

async function rejeitarRascunho(draftId, motivo, approvedBy) {
  const draft = await prisma.conversationMessage.findUnique({
    where: { id: draftId },
    include: { conversation: { include: { messages: { where: { direction: 'IN' }, orderBy: { createdAt: 'desc' }, take: 1 } } } },
  });
  await prisma.conversationMessage.update({
    where: { id: draftId },
    data: { draftStatus: 'REJEITADO', approvedBy },
  });
  // Registra rejeição como aprendizado negativo
  const ultimaIn = draft?.conversation?.messages?.[0];
  if (ultimaIn && draft) {
    try {
      await learning.registrar({
        inputText: ultimaIn.content,
        outputText: '[REJEITADO: ' + (motivo || 'sem motivo') + '] ' + draft.content,
        intent: draft.intent,
        score: -1,
        approvedBy,
        sourceType: 'REJECTION',
        sourceId: draft.id,
      });
    } catch {}
  }
  await audit.log({
    eventType: 'rascunho_rejeitado', severity: 'NOTICE',
    source: 'atendimento', actor: approvedBy,
    action: `Rascunho ${draftId} rejeitado: ${motivo || 'sem motivo'}`,
    resource: draftId,
  });
}

async function listarRascunhos(status = 'PENDENTE') {
  return prisma.conversationMessage.findMany({
    where: { draftStatus: status },
    include: { conversation: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

module.exports = {
  processar, aprovarRascunho, rejeitarRascunho, listarRascunhos,
  getOrCreateConversation, classificarIntent, dentroHorarioComercial,
};
