const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const checks = [
    ['client_total', () => p.client.count()],
    ['client_active', () => p.client.count({ where: { active: true } })],
    ['product_total', () => p.product.count()],
    ['product_active', () => p.product.count({ where: { active: true } })],
  ];
  for (const [name, fn] of checks) {
    try {
      const value = await fn();
      console.log(name + '=' + value);
    } catch (e) {
      console.log(name + '_error=' + (e.code || e.message));
    }
  }
  await p.$disconnect();
})();
