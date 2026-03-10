require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/lib/prisma');

const assets = [
  {
    code: 'ASSET-TOW-815E',
    name: 'Caminhao Cargo Guincho 815E',
    category: 'TOW_TRUCK',
    plate: 'CSK6C62',
    intendedUse: 'Guincho e assistencia 24h',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-MOTO-CG-CARGO',
    name: 'Moto CG Cargo',
    category: 'MOTORCYCLE',
    intendedUse: 'Operacional',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-F250-99-CUMMINS',
    name: 'F250 99 Cummins 4cc',
    category: 'CAR',
    intendedUse: 'Operacional',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-F250-2000-MWM',
    name: 'F250 2000 MWM 6cc',
    category: 'CAR',
    intendedUse: 'Operacional',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-CG160-FAN-OKM',
    name: 'CG 160 FAN OKM',
    category: 'MOTORCYCLE',
    intendedUse: 'Locacao',
    status: 'FOR_RENT',
  },
  {
    code: 'ASSET-YAMAHA-NMAX-2025',
    name: 'Yamaha NMAX 2025',
    category: 'MOTORCYCLE',
    intendedUse: 'Venda ou locacao',
    status: 'FOR_SALE',
  },
  {
    code: 'ASSET-IPHONE-15-PRO-MAX',
    name: 'iPhone 15 Pro Max',
    category: 'DEVICE',
    intendedUse: 'Comercial e atendimento',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-DRONE-DJI-MINI-2',
    name: 'Drone DJI Mini 2',
    category: 'DEVICE',
    intendedUse: 'Captacao de imagem',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-MOTOROLA-RAZR-60',
    name: 'Motorola Razr 60',
    category: 'DEVICE',
    intendedUse: 'Comercial e atendimento',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-IPAD-PRO-12',
    name: 'iPad Pro 12"',
    category: 'DEVICE',
    intendedUse: 'Operacional e comercial',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-LAPTOP-01',
    name: 'Laptop 01',
    category: 'EQUIPMENT',
    intendedUse: 'Administrativo',
    status: 'ACTIVE',
  },
  {
    code: 'ASSET-LAPTOP-02',
    name: 'Laptop 02',
    category: 'EQUIPMENT',
    intendedUse: 'Administrativo',
    status: 'ACTIVE',
  },
];

const digitalAccounts = [
  {
    code: 'ACC-WHATSAPP-BUSINESS',
    platform: 'WHATSAPP_BUSINESS',
    label: 'WhatsApp Business Oficial',
    contact: '65 99281-2000',
    plan: 'Selo azul',
    status: 'ACTIVE',
    verified: true,
  },
  {
    code: 'ACC-OLX-PREMIUM',
    platform: 'OLX',
    label: 'Conta OLX Premium',
    plan: 'Premium',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-BOTCONVERSA-PREMIUM',
    platform: 'BOTCONVERSA',
    label: 'Conta BotConversa Premium',
    plan: 'Premium',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-INSTAGRAM',
    platform: 'INSTAGRAM',
    label: 'Conta Instagram',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-FACEBOOK',
    platform: 'FACEBOOK',
    label: 'Conta Facebook',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-CHATGPT-BUSINESS',
    platform: 'CHATGPT',
    label: 'Conta ChatGPT Business',
    plan: 'Business',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-CLAUDE-PRO',
    platform: 'CLAUDE',
    label: 'Conta Claude Pro',
    plan: 'Pro',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-MAKE-FREE',
    platform: 'MAKE',
    label: 'Conta Make.com',
    plan: 'Free',
    status: 'ACTIVE',
    verified: false,
  },
  {
    code: 'ACC-GMAIL-WORKSPACE',
    platform: 'GMAIL_WORKSPACE',
    label: 'Google Workspace Business',
    contact: 'nivaldogomes.mt@jrautopartsonline.com',
    plan: 'Business',
    status: 'ACTIVE',
    verified: false,
  },
];

async function main() {
  for (const item of assets) {
    await prisma.companyAsset.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        category: item.category,
        plate: item.plate || null,
        intendedUse: item.intendedUse || null,
        status: item.status,
      },
      create: item,
    });
  }

  for (const item of digitalAccounts) {
    await prisma.digitalAccount.upsert({
      where: { code: item.code },
      update: {
        platform: item.platform,
        label: item.label,
        contact: item.contact || null,
        plan: item.plan || null,
        status: item.status,
        verified: item.verified,
      },
      create: item,
    });
  }

  console.log(`Assets upserted: ${assets.length}`);
  console.log(`Digital accounts upserted: ${digitalAccounts.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
