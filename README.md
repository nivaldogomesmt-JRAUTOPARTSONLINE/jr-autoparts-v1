# 🔧 JR Auto Parts — Sistema de Gestão v1

Sistema completo de gestão para oficina mecânica, com portal do cliente e integração WhatsApp.

**Domínio:** jrautopartsmt.com.br
**WhatsApp:** (65) 99281-2000

---

## 🗂️ Estrutura do Projeto

```
jr-autoparts/
├── backend/          → API Node.js + Express + Prisma
│   ├── prisma/       → Schema do banco + seed
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── services/
│   ├── index.js      → Servidor principal
│   └── .env.example  → Modelo de variáveis
│
├── frontend/         → React 18 + Vite
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── pages/
│       │   ├── portal/    → Portal do cliente
│       │   ├── so/        → Ordens de Serviço
│       │   ├── clients/
│       │   ├── vehicles/
│       │   ├── products/
│       │   ├── services/
│       │   ├── maintenance/
│       │   └── messages/
│       └── services/      → Chamadas de API
│
└── DEPLOY.md         → Guia completo de deploy
```

---

## 🚀 Módulos do Sistema

### Gestão Interna (app.jrautopartsmt.com.br)
- **Dashboard** — Visão geral com métricas e OS recentes
- **Ordens de Serviço** — Criar, editar, alterar status + notificações WhatsApp automáticas
- **Clientes** — Cadastro completo com acesso ao portal
- **Veículos** — Histórico + alertas de manutenção preventiva
- **Produtos** — Catálogo com fotos e estoque
- **Serviços** — Tabela de preços e tempos estimados
- **Manutenção** — Alertas de revisões vencidas/próximas
- **Mensagens** — Log de WhatsApp com opção de reenvio

### Portal do Cliente (app.jrautopartsmt.com.br/portal)
- Login com email e senha
- Visualizar veículos e alertas de manutenção
- Acompanhar histórico de OS e status em tempo real

### API do Bot (BotConversa + Make.com)
- Consultar produtos por nome/categoria
- Consultar OS por placa/CPF
- Enviar link do portal do cliente

---

## ⚙️ Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18 + Express.js |
| ORM | Prisma |
| Banco | PostgreSQL (Supabase) |
| Frontend | React 18 + Vite |
| Roteamento | React Router v6 |
| Upload | Multer + Cloudinary |
| WhatsApp | BotConversa API |
| Email | Resend.com |
| Autenticação | JWT + bcrypt |
| Deploy Backend | Render.com |
| Deploy Frontend | Vercel |

---

## 🛠️ Desenvolvimento Local

### Backend

```bash
cd backend
cp .env.example .env
# Edite o .env com suas configurações
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

Servidor em: http://localhost:3001

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend em: http://localhost:5173

---

## 👥 Usuários Padrão (após seed)

| Email | Senha | Papel |
|-------|-------|-------|
| admin@jrautoparts.com | admin123 | Administrador |
| mecanico@jrautoparts.com | jr2024 | Mecânico |

> ⚠️ **Troque as senhas no primeiro login!**

---

## 📱 Rotas da API

### Internas (requer JWT)
```
POST   /api/auth/login
GET    /api/auth/me
GET    /api/clients
POST   /api/clients
GET    /api/vehicles
POST   /api/vehicles
GET    /api/products
POST   /api/products
GET    /api/services
POST   /api/service-orders
PATCH  /api/service-orders/:id/status
GET    /api/maintenance/alerts
GET    /api/messages
GET    /api/dashboard
```

### Portal do Cliente (requer JWT com role=CLIENT)
```
GET    /api/portal/me
GET    /api/portal/vehicles/:id
GET    /api/portal/service-orders/:id
```

### Bot (requer x-bot-token header)
```
GET    /api/bot/produtos?q=filtro
POST   /api/bot/consultar-os
POST   /api/bot/portal-link
```

---

## 📖 Deploy

Veja o arquivo [DEPLOY.md](./DEPLOY.md) para o guia completo passo a passo.

---

© 2024 JR Auto Parts — jrautopartsmt.com.br
