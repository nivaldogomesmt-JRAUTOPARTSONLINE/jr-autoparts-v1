
const globalForPrisma = global;

const prisma = globalForPrisma.__jrPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__jrPrisma = prisma;
}

module.exports = prisma;
