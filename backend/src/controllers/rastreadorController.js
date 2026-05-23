/**
 * rastreadorController
 * Endpoints de apoio a tela "Comandos Rastreador".
 * O envio em sequencia (1 comando a cada 20s) e orquestrado pelo frontend,
 * que chama POST /enviar uma vez por comando. Aqui apenas repassamos ao gateway.
 */
const smsGateway = require('../services/smsGatewayService');

async function status(req, res) {
  return res.json({
    configured: smsGateway.isConfigured(),
    mode: smsGateway.isConfigured() ? 'gateway' : 'demo',
  });
}

async function enviar(req, res) {
  try {
    const to = req.body?.to;
    const text = req.body?.text;
    if (!to || !text) {
      return res.status(400).json({ error: 'Informe "to" (numero) e "text" (comando).' });
    }
    if (!smsGateway.isConfigured()) {
      return res.status(503).json({
        error: 'Gateway de SMS nao configurado. Defina SMS_GATEWAY_URL e pareie o celular.',
        code: 'GATEWAY_NOT_CONFIGURED',
      });
    }
    const result = await smsGateway.sendSms(to, text);
    return res.json({ ok: true, to: smsGateway.normalizeNumber(to), gateway: result.status });
  } catch (err) {
    const code = err.code || 'SEND_ERROR';
    const httpStatus = code === 'GATEWAY_NOT_CONFIGURED' ? 503 : 502;
    return res.status(httpStatus).json({ error: err.message || 'Falha ao enviar SMS.', code });
  }
}

module.exports = { status, enviar };
