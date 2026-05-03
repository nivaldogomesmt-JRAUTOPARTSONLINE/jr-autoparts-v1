const prisma = require('../src/lib/prisma');
const { recalcMaintenanceForecasts } = require('../src/services/maintenanceRecalcService');

function parseArgs(argv) {
  const args = { apply: false, all: false, limit: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    if (token === '--all') args.all = true;
    if (token === '--limit' && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(n) && n > 0) args.limit = n;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('=== RECALCULO DE PREVISOES DE MANUTENCAO ===');
  console.log(`Modo: ${args.apply ? 'APLICAR' : 'DRY-RUN'}`);
  console.log(`Escopo: ${args.all ? 'todos os registros' : 'apenas registros com nextDate/nextKm nulos'}`);

  const summary = await recalcMaintenanceForecasts({
    apply: args.apply,
    all: args.all,
    limit: args.limit,
    logger: console,
  });

  console.log(`Total lido: ${summary.scanned}`);
  console.log('\nResumo:');
  console.log(`- candidatos a atualizar: ${summary.candidates}`);
  console.log(`- atualizados: ${summary.updated}`);
  console.log(`- sem alteracao: ${summary.unchanged}`);

  if (!args.apply) {
    console.log('\nDry-run finalizado. Para aplicar, rode com --apply');
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
