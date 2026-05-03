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
    throw new Error('Resposta da Efi sem access_token.');
  }

  tokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return accessToken;
}

function normalizeDocument(doc) {
  return String(doc || '').replace(/\D/g, '');
}

function isValidCpfOrCnpj(docDigits) {
  return docDigits.length === 11 || docDigits.length === 14;
}

// Extrai todos os documentos do customer (CPF, CNPJ direto, ou juridical_person.cnpj)
function extrairDocs(c) {
  const possiveis = [
    c?.customer,
    c?.payment?.banking_billet?.customer,
    c?.banking_billet?.customer,
  ];
  const docs = [];
  for (const cu of possiveis) {
    if (!cu) continue;
    if (cu.cpf) docs.push(normalizeDocument(cu.cpf));
    if (cu.cnpj) docs.push(normalizeDocument(cu.cnpj));
    if (cu.juridical_person?.cnpj) docs.push(normalizeDocument(cu.juridical_person.cnpj));
  }
  return docs.filter(Boolean);
}

function isEfiUnavailableError(err) {
  const status = Number(err?.response?.status || 0);
  const code = String(err?.code || '').toUpperCase();
  const unavailableCodes = new Set(['ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT']);
  return unavailableCodes.has(code) || status === 429 || status >= 500;
}

// Pagina em paralelo todas as cobrancas no periodo e filtra localmente.
// Necessario porque o filtro customer_document da Efi nao acha CNPJ em juridical_person.cnpj (PJ).
async function listChargesByDocument({
  document,
  cpf,
  beginDate,
  endDate,
  chargeType = 'billet',
  limit = 50,
  offset = 0,
}) {
  const clientDoc = normalizeDocument(document || cpf);
  if (!isValidCpfOrCnpj(clientDoc)) {
    throw new Error('CPF/CNPJ deve conter 11 ou 14 digitos.');
  }

  const begin = String(beginDate || '').trim();
  const end = String(endDate || '').trim();
  if (!begin || !end) {
    throw new Error('beginDate e endDate sao obrigatorios.');
  }

  const token = await getAccessToken();
  const baseUrl = getBaseUrl();

  const PAGE_LIMIT = 100;
  const MAX_PAGES = 30;

  const pagePromises = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      charge_type: chargeType,
      begin_date: begin,
      end_date: end,
      limit: String(PAGE_LIMIT),
      page: String(page),
    });
    pagePromises.push(
      axios.get(`${baseUrl}/v1/charges?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      })
        .then((r) => r.data?.data ?? r.data ?? [])
        .catch(() => [])
    );
  }

  const allPages = await Promise.all(pagePromises);
  const allCharges = [];
  for (const p of allPages) {
    if (Array.isArray(p)) allCharges.push(...p);
  }

  // Dedupe + filtro local por documento
  const seen = new Set();
  const matches = [];
  for (const c of allCharges) {
    const id = c?.charge_id ?? c?.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const docs = extrairDocs(c);
    if (docs.includes(clientDoc)) matches.push(c);
  }

  // Ordena por created_at desc (mais recentes primeiro)
  matches.sort((a, b) => {
    const da = new Date(a?.created_at || 0).getTime();
    const db = new Date(b?.created_at || 0).getTime();
    return db - da;
  });

  // Aplica paginacao do cliente
  const sliced = matches.slice(offset, offset + limit);

  return {
    data: sliced,
    params: {
      charge_type: chargeType,
      begin_date: begin,
      end_date: end,
      customer_document: clientDoc,
    },
    total_matches: matches.length,
  };
}

async function listChargesByCpf({ cpf, ...rest }) {
  return listChargesByDocument({ document: cpf, ...rest });
}

module.exports = {
  getAccessToken,
  listChargesByDocument,
  listChargesByCpf,
  normalizeDocument,
  isEfiUnavailableError,
  extrairDocs,
};
