require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./src/lib/prisma');
const { createRateLimit } = require('./src/middleware/rateLimit');

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(createRateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'api', message: 'Muitas requisições. Aguarde alguns instantes.' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), app: 'JR Auto Parts API' });
});

// Compatibilidade: aceita rotas com e sem prefixo /api.
const routes = {
  auth: require('./src/routes/authRoutes'),
  clients: require('./src/routes/clientRoutes'),
  vehicles: require('./src/routes/vehicleRoutes'),
  products: require('./src/routes/productRoutes'),
  services: require('./src/routes/serviceRoutes'),
  so: require('./src/routes/soRoutes'),
  maintenance: require('./src/routes/maintenanceRoutes'),
  messages: require('./src/routes/messageRoutes'),
  bot: require('./src/routes/botRoutes'),
  portal: require('./src/routes/portalRoutes'),
  dashboard: require('./src/routes/dashboardRoutes'),
  companyAssets: require('./src/routes/companyAssetRoutes'),
  digitalAccounts: require('./src/routes/digitalAccountRoutes'),
  tracking: require('./src/routes/trackingRoutes'),
};

function mount(path, handler) {
  app.use(`/api/${path}`, handler);
  app.use(`/${path}`, handler);
}

mount('auth', routes.auth);
mount('clients', routes.clients);
mount('vehicles', routes.vehicles);
mount('products', routes.products);
mount('services', routes.services);
mount('so', routes.so);
mount('maintenance', routes.maintenance);
mount('messages', routes.messages);
mount('bot', routes.bot);
mount('portal', routes.portal);
mount('dashboard', routes.dashboard);
mount('company-assets', routes.companyAssets);
mount('digital-accounts', routes.digitalAccounts);
mount('tracking', routes.tracking);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Erro inesperado:', err);
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Registro duplicado. Verifique os dados e tente novamente.' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro não encontrado.' });
  }
  if (err.message === 'Origem não permitida pelo CORS.') {
    return res.status(403).json({ error: err.message });
  }
  return res.status(err.status || 500).json({ error: err.publicMessage || 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log(`JR Auto Parts API rodando na porta ${PORT}`);
    console.log('Banco de dados conectado');
  } catch (e) {
    console.error('Falha ao conectar ao banco:', e.message);
    process.exit(1);
  }
});

async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
