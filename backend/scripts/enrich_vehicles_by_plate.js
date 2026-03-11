const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = require('../src/lib/prisma');
const { lookupVehicleByPlate, normalizePlate } = require('../src/services/plateLookupService');

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function toPositiveInt(value, fallback = 0) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlaceholderValue(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return ['-', 'nao informado', 'nao informada', 'n/a', 'na', 'null', 'indefinido', 'desconhecido'].includes(normalized);
}

function hasMeaningfulValue(value) {
  return !isPlaceholderValue(value);
}

function buildUpdateData(current, lookup, overwrite = false) {
  const data = {};

  const applyField = (field, value) => {
    if (isPlaceholderValue(value)) return;
    if (!overwrite && hasMeaningfulValue(current[field])) return;

    if (field === 'year') {
      const n = Number.parseInt(String(value).replace(/\D/g, ''), 10);
      if (!Number.isFinite(n)) return;
      if (current.year === n) return;
      data.year = n;
      return;
    }

    const text = String(value).trim();
    if (String(current[field] || '').trim() === text) return;
    data[field] = text;
  };

  applyField('brand', lookup.brand);
  applyField('model', lookup.model);
  applyField('year', lookup.year);
  applyField('color', lookup.color);
  applyField('fuel', lookup.fuel);

  return data;
}

function allVehicleFieldsFilled(vehicle) {
  return hasMeaningfulValue(vehicle.brand)
    && hasMeaningfulValue(vehicle.model)
    && Number.isFinite(vehicle.year)
    && hasMeaningfulValue(vehicle.color)
    && hasMeaningfulValue(vehicle.fuel);
}

function parseArgs() {
  const plateArg = arg('--plate', '');
  const normalizedPlate = plateArg ? normalizePlate(plateArg) : '';

  return {
    apply: hasFlag('--apply'),
    overwrite: hasFlag('--overwrite'),
    includeInactive: hasFlag('--include-inactive'),
    provider: arg('--provider', ''),
    plate: normalizedPlate,
    limit: toPositiveInt(arg('--limit', ''), 0),
    sleepMs: toPositiveInt(arg('--sleep-ms', ''), 250),
  };
}

async function main() {
  const args = parseArgs();

  if (arg('--plate', '') && !args.plate) {
    throw new Error('Placa informada em --plate e invalida.');
  }

  const where = {
    ...(args.includeInactive ? {} : { active: true }),
    ...(args.plate ? { plate: args.plate } : {}),
  };

  const vehicles = await prisma.vehicle.findMany({
    where,
    select: {
      id: true,
      plate: true,
      brand: true,
      model: true,
      year: true,
      color: true,
      fuel: true,
      active: true,
    },
    orderBy: { plate: 'asc' },
    ...(args.limit ? { take: args.limit } : {}),
  });

  const summary = {
    scanned: vehicles.length,
    candidates: 0,
    updated: 0,
    previewUpdates: 0,
    skippedComplete: 0,
    skippedNoData: 0,
    errors: 0,
    mode: args.apply ? 'APPLY' : 'DRY_RUN',
  };

  const failedPlates = [];

  console.log('=== ENRIQUECIMENTO DE VEICULOS POR PLACA ===');
  console.log(`Modo: ${summary.mode}`);
  console.log(`Registros lidos: ${summary.scanned}`);
  console.log(`Overwrite: ${args.overwrite ? 'SIM' : 'NAO (apenas campos vazios)'}`);
  console.log(`Ativos apenas: ${args.includeInactive ? 'NAO' : 'SIM'}`);
  if (args.provider) console.log(`Provider override: ${args.provider}`);
  if (args.plate) console.log(`Placa alvo: ${args.plate}`);

  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];

    if (!args.overwrite && allVehicleFieldsFilled(vehicle)) {
      summary.skippedComplete += 1;
      continue;
    }

    summary.candidates += 1;

    try {
      const lookup = await lookupVehicleByPlate(vehicle.plate, { provider: args.provider });
      const data = buildUpdateData(vehicle, lookup, args.overwrite);

      if (!Object.keys(data).length) {
        summary.skippedNoData += 1;
      } else if (args.apply) {
        await prisma.vehicle.update({ where: { id: vehicle.id }, data });
        summary.updated += 1;
        console.log(`[OK] ${vehicle.plate} -> ${Object.keys(data).join(', ')}`);
      } else {
        summary.previewUpdates += 1;
        console.log(`[DRY] ${vehicle.plate} -> ${JSON.stringify(data)}`);
      }
    } catch (err) {
      summary.errors += 1;
      const message = err?.message || 'Erro desconhecido';
      failedPlates.push({ plate: vehicle.plate, error: message });
      console.log(`[ERRO] ${vehicle.plate} -> ${message}`);
    }

    if (i < vehicles.length - 1) {
      await sleep(args.sleepMs);
    }
  }

  console.log('\nResumo:');
  console.log(`- lidos: ${summary.scanned}`);
  console.log(`- candidatos: ${summary.candidates}`);
  console.log(`- atualizados: ${summary.updated}`);
  console.log(`- pre-visualizados (dry-run): ${summary.previewUpdates}`);
  console.log(`- ignorados (ja completos): ${summary.skippedComplete}`);
  console.log(`- ignorados (sem novos dados): ${summary.skippedNoData}`);
  console.log(`- erros: ${summary.errors}`);

  if (failedPlates.length) {
    console.log('\nFalhas por placa:');
    for (const row of failedPlates.slice(0, 30)) {
      console.log(`- ${row.plate}: ${row.error}`);
    }
    if (failedPlates.length > 30) {
      console.log(`... e mais ${failedPlates.length - 30} falhas.`);
    }
  }

  if (!args.apply) {
    console.log('\nDry-run finalizado. Para aplicar no banco, rode novamente com --apply.');
  }
}

main()
  .catch((err) => {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
