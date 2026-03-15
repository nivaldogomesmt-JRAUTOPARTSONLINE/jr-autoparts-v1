const { listChargesByCpf, normalizeDocument } = require('../services/efiCobrancasService');

/**
 * GET /api/efi/boletos
 * Query: cpf, beginDate, endDate, limit, offset
 */
const listBoletos = async (req, res) => {
  try {
    const { cpf, beginDate, endDate, limit, offset } = req.query;

    const cpfDigits = normalizeDocument(cpf);
    if (cpfDigits.length !== 11) {
      return res.status(400).json({
        error: 'CPF inválido. Informe um CPF com 11 dígitos.',
      });
    }

    const begin = String(beginDate || '').trim();
    const end = String(endDate || '').trim();
    if (!begin || !end) {
      return res.status(400).json({
        error: 'beginDate e endDate são obrigatórios (formato YYYY-MM-DD).',
      });
    }

    const result = await listChargesByCpf({
      cpf: cpfDigits,
      beginDate: begin,
      endDate: end,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Math.max(0, Number(offset) || 0),
    });

    return res.json(result);
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({
        error: 'Falha na autenticação com a Efí. Verifique EFI_CLIENT_ID e EFI_CLIENT_SECRET.',
      });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({
        error: 'Limite de requisições da API Efí excedido. Tente novamente mais tarde.',
      });
    }
    if (err.response?.data) {
      const msg = err.response.data?.message || err.response.data?.error_description || err.message;
      return res.status(err.response.status >= 400 ? err.response.status : 502).json({ error: msg });
    }
    return res.status(500).json({
      error: err.message || 'Erro ao consultar boletos na Efí.',
    });
  }
};

module.exports = {
  listBoletos,
};
