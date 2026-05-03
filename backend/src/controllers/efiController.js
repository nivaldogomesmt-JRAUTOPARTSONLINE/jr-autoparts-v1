const { listChargesByDocument, normalizeDocument } = require('../services/efiCobrancasService');

/**
 * GET /api/efi/boletos
 * Query: cpf | documento, beginDate, endDate, limit, offset
 * Aceita CPF (11 digitos) ou CNPJ (14 digitos)
 */
const listBoletos = async (req, res) => {
  try {
    const { cpf, documento, beginDate, endDate, limit, offset } = req.query;

    const docDigits = normalizeDocument(documento || cpf || '');
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      return res.status(400).json({
        error: 'Documento invalido. Informe CPF (11 digitos) ou CNPJ (14 digitos).',
      });
    }

    const begin = String(beginDate || '').trim();
    const end = String(endDate || '').trim();
    if (!begin || !end) {
      return res.status(400).json({
        error: 'beginDate e endDate sao obrigatorios (formato YYYY-MM-DD).',
      });
    }

    const result = await listChargesByDocument({
      document: docDigits,
      beginDate: begin,
      endDate: end,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Math.max(0, Number(offset) || 0),
    });

    return res.json(result);
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({
        error: 'Falha na autenticacao com a Efi. Verifique EFI_CLIENT_ID e EFI_CLIENT_SECRET.',
      });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({
        error: 'Limite de requisicoes da API Efi excedido. Tente novamente mais tarde.',
      });
    }
    if (err.response?.data) {
      const msg = err.response.data?.message || err.response.data?.error_description || err.message;
      return res.status(err.response.status >= 400 ? err.response.status : 502).json({ error: msg });
    }
    return res.status(500).json({
      error: err.message || 'Erro ao consultar boletos na Efi.',
    });
  }
};

module.exports = {
  listBoletos,
};
