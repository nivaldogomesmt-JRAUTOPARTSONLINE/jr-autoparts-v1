# Correções aplicadas por revisão técnica

## Backend
- PrismaClient centralizado em `backend/src/lib/prisma.js`
- Rate limit global de API
- Rate limit específico para login e para rotas do bot
- Endurecimento da autenticação JWT
- Bloqueio temporário após múltiplas tentativas inválidas de login
- Campos adicionados ao usuário:
  - `mustChangePassword`
  - `failedLoginCount`
  - `lockedUntil`
  - `lastLoginAt`
- Política mínima de senha forte implementada
- Seed alterado para usar senhas fortes padrão e exigir troca no primeiro uso
- Token do bot validado com comparação segura
- Controller de OS ajustado para:
  - usar transações
  - atualizar KM do veículo com consistência
  - notificar também `IN_PROGRESS` e `FINISHING`
- Bot controller endurecido com normalização de telefone/placa/documento

## Arquivos principais alterados
- `backend/index.js`
- `backend/.env.example`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.js`
- `backend/src/controllers/authController.js`
- `backend/src/controllers/botController.js`
- `backend/src/controllers/soController.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/rateLimit.js`
- `backend/src/lib/prisma.js`
- `backend/src/utils/security.js`
- `backend/src/routes/authRoutes.js`
- `backend/src/routes/botRoutes.js`

## Ainda não entra nesta rodada
- redesign do frontend
- fluxo completo de troca obrigatória de senha no frontend
- módulo de chamados externos/guincho
- transbordo humano completo do bot
- financeiro
- locação
- rastreamento
