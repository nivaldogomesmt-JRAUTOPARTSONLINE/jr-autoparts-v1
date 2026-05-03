const axios = require('axios');

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PLATE_LOOKUP_TIMEOUT_MS || '15000', 10);

function normalizePlate(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
}

function readAny(obj, keys = []) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return undefined;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);

  const text = String(value);
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return Number.parseInt(yearMatch[0], 10);

  const numeric = Number.parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function toCleanString(value) {
  const text = String(value || '').trim();
  return text ? text : null;
}

function splitBrandModel(combined) {
  const text = toCleanString(combined);
  if (!text) return { brand: null, model: null };

  if (text.includes('/')) {
    const [brand, ...rest] = text.split('/');
    return {
      brand: toCleanString(brand),
      model: toCleanString(rest.join('/')),
    };
  }

  return { brand: text, model: null };
}

function normalizeVehicleData(input = {}, meta = {}) {
  const combined = toCleanString(input.combinedBrandModel);
  const split = splitBrandModel(combined);

  const brand = toCleanString(input.brand) || split.brand;
  const model = toCleanString(input.model) || split.model;
  const year = toIntOrNull(input.year);
  const color = toCleanString(input.color);
  const fuel = toCleanString(input.fuel);

  return {
    plate: normalizePlate(input.plate || meta.plate),
    brand,
    model,
    year,
    color,
    fuel,
    source: meta.source || null,
    raw: meta.raw || null,
  };
}

function resolveProvider(explicitProvider) {
  return String(explicitProvider || process.env.PLATE_LOOKUP_PROVIDER || 'placafipe').trim().toLowerCase();
}

async function lookupWithPlacaFipe(plate) {
  const token = String(process.env.PLATE_LOOKUP_API_KEY || process.env.PLACAFIPE_TOKEN || '').trim();
  if (!token) {
    throw new Error('PLATE_LOOKUP_API_KEY (ou PLACAFIPE_TOKEN) nao configurado para o provedor placafipe.');
  }

  const url = String(process.env.PLATE_LOOKUP_URL || 'https://api.placafipe.com.br/getplaca').trim();
  const timeout = Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 15000;

  const response = await axios.post(
    url,
    { placa: plate, token },
    {
      timeout,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    throw new Error(`Consulta de placa falhou no provedor placafipe (HTTP ${response.status}).`);
  }

  const payload = response.data || {};
  const vehicleInfo = payload.informacoes_veiculo || payload.dados || payload;

  if (!vehicleInfo || typeof vehicleInfo !== 'object') {
    throw new Error('Resposta invalida do provedor placafipe.');
  }

  return normalizeVehicleData(
    {
      plate: readAny(vehicleInfo, ['Placa', 'placa', 'plate']),
      combinedBrandModel: readAny(vehicleInfo, ['Marca', 'marca']),
      model: readAny(vehicleInfo, ['Modelo', 'modelo']),
      year: readAny(vehicleInfo, ['AnoModelo', 'anoModelo', 'ano_modelo', 'Ano', 'ano']),
      color: readAny(vehicleInfo, ['Cor', 'cor']),
      fuel: readAny(vehicleInfo, ['Combustivel', 'combustivel', 'fuel']),
    },
    { plate, source: 'placafipe', raw: payload }
  );
}

async function lookupWithPlacaFipeOnline(plate) {
  const apiKey = String(process.env.PLATE_LOOKUP_API_KEY || process.env.PLACAFIPEONLINE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('PLATE_LOOKUP_API_KEY (ou PLACAFIPEONLINE_API_KEY) nao configurado para o provedor placafipeonline.');
  }

  const baseUrl = String(process.env.PLATE_LOOKUP_URL || 'https://placafipeonline.com.br/api/v1/vehicle/search').trim();
  const timeout = Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 15000;

  const response = await axios.post(
    baseUrl,
    { plate },
    {
      timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    throw new Error(`Consulta de placa falhou no provedor placafipeonline (HTTP ${response.status}).`);
  }

  const payload = response.data || {};
  const vehicleInfo = payload.result || payload.data || payload.vehicle || payload;

  if (!vehicleInfo || typeof vehicleInfo !== 'object') {
    throw new Error('Resposta invalida do provedor placafipeonline.');
  }

  return normalizeVehicleData(
    {
      plate: readAny(vehicleInfo, ['plate', 'placa']),
      brand: readAny(vehicleInfo, ['brand', 'marca']),
      model: readAny(vehicleInfo, ['model', 'modelo']),
      year: readAny(vehicleInfo, ['model_year', 'ano_modelo', 'year', 'ano']),
      color: readAny(vehicleInfo, ['color', 'cor']),
      fuel: readAny(vehicleInfo, ['fuel', 'combustivel']),
    },
    { plate, source: 'placafipeonline', raw: payload }
  );
}

async function lookupVehicleByPlate(rawPlate, options = {}) {
  const plate = normalizePlate(rawPlate);
  if (!plate || plate.length < 7) {
    throw new Error('Placa invalida para consulta.');
  }

  const provider = resolveProvider(options.provider);

  if (provider === 'placafipe') {
    return lookupWithPlacaFipe(plate);
  }
  if (provider === 'placafipeonline') {
    return lookupWithPlacaFipeOnline(plate);
  }

  throw new Error(`Provedor de consulta de placa nao suportado: ${provider}`);
}

module.exports = {
  normalizePlate,
  lookupVehicleByPlate,
};
