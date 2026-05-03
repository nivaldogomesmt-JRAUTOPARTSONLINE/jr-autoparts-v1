require('dotenv').config();

const prisma = require('../src/lib/prisma');
const { sendBotBoletoProactiveNotifications } = require('../src/services/botBoletoNotificationService');

function hasFlag(name) {
  return process.argv.includes(name);
}

function readArg(name, fallback = undefined) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const dryRun = hasFlag('--dry-run') || !hasFlag('--apply');
  const maxClients = readArg('--max-clients');
  const batchSize = readArg('--batch-size');

  await prisma.$connect();

  const result = await sendBotBoletoProactiveNotifications({
    dryRun,
    maxClients,
    batchSize,
    logger: console,
  });

  console.log('[bot-boleto-notify] resultado:');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('[bot-boleto-notify] erro fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
