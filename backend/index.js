require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./src/lib/prisma');
const { createRateLimit } = require('./src/middleware/rateLimit');

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = allowedOrigins.includes(origin);
    const isVercelPreview =
      /^https:\/\/jr-autoparts-v1([-.].+)?\.vercel\.app$/.test(origin) ||
      /^https:\/\/jr-autoparts-git-.+\.vercel\.app$/.test(origin);

    if (isExplicitlyAllowed || isVercelPreview) {
      return callback(null, true);
    }

    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(createRateLimit({
  windowMs: 60_000,
  max: 300,
  keyPrefix: 'api',
  message: 'Muitas requisições. Aguarde alguns instantes.'
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: 'JR Auto Parts API',
  });
});

app.use('/api/auth',        require('./src/routes/authRoutes'));
app.use('/api/clients',     require('./src/routes/clientRoutes'));
app.use('/api/vehicles',    require('./src/routes/vehicleRoutes'));
app.use('/api/products',    require('./src/routes/productRoutes'));
app.use('/api/services',    require('./src/routes/serviceRoutes'));
app.use('/api/so',          require('./src/routes/soRoutes'));
app.use('/api/maintenance', require('./src/routes/maintenanceRoutes'));
app.use('/api/messages',    require('./src/routes/messageRoutes'));
app.use('/api/bot',         require('./src/routes/botRoutes'));
app.use('/api/portal',      require('./src/routes/portalRoutes'));
app.use('/api/dashboard',   require('./src/routes/dashboardRoutes'));

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

  if (err.message && err.message.startsWith('Origem não permitida pelo CORS')) {
    return res.status(403).json({ error: err.message });
  }

  return res.status(err.status || 500).json({
    error: err.publicMessage || 'Erro interno do servidor.',
  });
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
