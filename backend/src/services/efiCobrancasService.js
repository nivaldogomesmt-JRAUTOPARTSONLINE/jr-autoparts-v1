const axios = require('axios');

const BASE_URLS = {
  homologation: 'https://cobrancas-h.api.efipay.com.br',
  production: 'https://cobrancas.api.efipay.com.br',
};

let tokenCache = null;

function getBaseUrl() {
  const env = String(process.env.EFI_ENV || 'homologation').toLowerCase();
  return BASE_URLS[env] || BASE_URLS.homologation;
}

function getCredentials() {
  const clientId = process.env.EFI_CLIENT_ID;
  const clientSecret = process.env.EFI_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('EFI_CLIENT_ID e EFI_CLIENT_SECRET devem estar configurados.');
  }
  return { clientId, clientSecret };
}

function isTokenValid() {
  if (!tokenCache) return false;
  const bufferSeconds = 60;
  return Date.now() < (tokenCache.expiresAt - bufferSeconds * 1000);
}

async function getAccessToken() {
  if (isTokenValid()) return tokenCache.accessToken;

  const { clientId, clientSecret } = getCredentials();
  const baseUrl = getBaseUrl();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    `${baseUrl}/v1/authorize`,
    { grant_type: 'client_credentials' },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const data = response.data || {};
  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in) || 600;

  if (!accessToken) {
    throw new Error('Resposta da Efí sem access_token.');
  }

  tokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return accessToken;
}

/**
 * Remove caracteres não numéricos do CPF/CNPJ.
 * @param {string} doc - CPF ou CNPJ (pode ter formatação)
 * @returns {string} - Apenas dígitos
 */
function normalizeDocument(doc) {
  return String(doc || '').replace(/\D/g, '');
}

/**
 * Lista cobranças (boletos) por CPF e intervalo de datas.
 * @param {Object} params
 * @param {string} params.cpf - CPF (11 dígitos, com ou sem formatação)
 * @param {string} params.beginDate - Data início (YYYY-MM-DD)
 * @param {string} params.endDate - Data fim (YYYY-MM-DD)
 * @param {string} [params.chargeType] - Tipo de cobrança: 'billet' (boleto) ou 'carnet' (default: billet)
 * @param {number} [params.limit] - Limite de resultados
 * @param {number} [params.offset] - Offset para paginação
 * @returns {Promise<Object>} - Resposta da API Efí
 */
async function listChargesByCpf({ cpf, beginDate, endDate, chargeType = 'billet', limit = 50, offset = 0 }) {
  const clientDoc = normalizeDocument(cpf);
  if (clientDoc.length !== 11) {
    throw new Error('CPF deve conter 11 dígitos.');
  }

  const begin = String(beginDate || '').trim();
  const end = String(endDate || '').trim();
  if (!begin || !end) {
    throw new Error('beginDate e endDate são obrigatórios.');
  }

  const token = await getAccessToken();
  const baseUrl = getBaseUrl();

  const params = new URLSearchParams({
    charge_type: chargeType,
    begin_date: begin,
    end_date: end,
    customer_document: clientDoc,
    limit: String(limit),
    offset: String(offset),
  });

  const response = await axios.get(`${baseUrl}/v1/charges?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });

  return response.data;
}

module.exports = {
  getAccessToken,
  listChargesByCpf,
  normalizeDocument,
};
