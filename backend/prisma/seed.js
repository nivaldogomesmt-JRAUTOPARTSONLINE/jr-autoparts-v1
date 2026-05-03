const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { validatePasswordStrength } = require('../src/utils/security');

function getSeedPassword(envName, fallback) {
  const value = process.env[envName] || fallback;
  const error = validatePasswordStrength(value);
  if (error) {
    throw new Error(`Senha inválida em ${envName}: ${error}`);
  }
  return value;
}

async function main() {
  console.log('Iniciando seed...');

  const adminPlain = getSeedPassword('ADMIN_INITIAL_PASSWORD', 'Admin@123!');
  const employeePlain = getSeedPassword('EMPLOYEE_INITIAL_PASSWORD', 'Mecanico@123!');

  const adminPassword = await bcrypt.hash(adminPlain, 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jrautoparts.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@jrautoparts.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });
  console.log('Admin criado:', admin.email);

  const funcPassword = await bcrypt.hash(employeePlain, 12);
  const func = await prisma.user.upsert({
    where: { email: 'mecanico@jrautoparts.com' },
    update: {},
    create: {
      name: 'Mecânico JR',
      email: 'mecanico@jrautoparts.com',
      passwordHash: funcPassword,
      role: 'EMPLOYEE',
      mustChangePassword: true,
    },
  });
  console.log('Funcionário criado:', func.email);

  const client = await prisma.client.upsert({
    where: { cpfCnpj: '000.000.000-00' },
    update: {},
    create: {
      name: 'Cliente Teste',
      cpfCnpj: '000.000.000-00',
      phone: '65999990000',
      whatsapp: '65999990000',
      email: 'cliente@teste.com',
      type: 'PERSONAL',
    },
  });
  console.log('Cliente criado:', client.name);

  const servicos = [
    { name: 'Troca de Óleo e Filtro', description: 'Troca de óleo do motor e filtro de óleo', price: 80.00, estimatedTime: 60 },
    { name: 'Alinhamento e Balanceamento', description: 'Alinhamento de direção e balanceamento de rodas', price: 120.00, estimatedTime: 90 },
    { name: 'Revisão Geral', description: 'Revisão completa do veículo', price: 250.00, estimatedTime: 240 },
    { name: 'Troca de Correia Dentada', description: 'Troca da correia dentada e tensor', price: 350.00, estimatedTime: 180 },
    { name: 'Diagnóstico Eletrônico', description: 'Leitura de falhas com scanner automotivo', price: 80.00, estimatedTime: 60 },
    { name: 'Troca de Pastilhas de Freio', description: 'Troca das pastilhas de freio dianteiras', price: 150.00, estimatedTime: 90 },
    { name: 'Higienização de Ar Condicionado', description: 'Limpeza e higienização do sistema de A/C', price: 120.00, estimatedTime: 90 },
    { name: 'Troca de Amortecedores', description: 'Troca do par de amortecedores (dianteiro ou traseiro)', price: 400.00, estimatedTime: 180 },
  ];

  for (const s of servicos) {
    await prisma.service.upsert({
      where: { id: 'seed-' + s.name.slice(0, 8).toLowerCase().replace(/ /g, '-') },
      update: {},
      create: { id: 'seed-' + s.name.slice(0, 8).toLowerCase().replace(/ /g, '-'), ...s },
    });
  }
  console.log(`${servicos.length} serviços criados`);

  console.log('\nSeed concluído.');
  console.log('Credenciais de teste:');
  console.log(`Admin: admin@jrautoparts.com / ${adminPlain}`);
  console.log(`Mecânico: mecanico@jrautoparts.com / ${employeePlain}`);
  console.log('Troca de senha obrigatória no primeiro uso.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
