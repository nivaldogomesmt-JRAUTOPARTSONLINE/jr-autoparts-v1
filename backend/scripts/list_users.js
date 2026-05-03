const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { name: 'asc' }, take: 20 });
  console.log(JSON.stringify(users, null, 2));
  await p.$disconnect();
})();
