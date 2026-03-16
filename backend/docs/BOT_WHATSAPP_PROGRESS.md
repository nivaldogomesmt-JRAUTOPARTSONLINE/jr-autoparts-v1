# BOT_WHATSAPP_PROGRESS.md
## Controle de Progresso — Bloco WhatsApp Bot

---

## Última atualização
- Data: 2026-03-15
- Etapa atual: CHECKPOINT-5 — Todos os patches aplicados e documentados
- Status: ✅ TODOS CONCLUÍDOS — pronto para staging

## Histórico de Checkpoints

### CHECKPOINT-0 — Inicialização do modo checkpoint
- **Status:** ✅ DONE
- **Arquivos alterados:** backend/docs/BOT_WHATSAPP_PROGRESS.md (criado)
- **O que foi feito:** Auditoria técnica completa. Problemas identificados e priorizados.

### CHECKPOINT-1 — Patch A: Fix campo payLink na resposta da Efí
- **Status:** ✅ DONE
- **Arquivo:** backend/src/controllers/botWebhookController.js
- **O que foi feito:** Substituído `c.payment?.banking_billet?.link` por cadeia de fallback:
  `c.link || c.billet_link || c.payment?.banking_billet?.link || c.data?.payment?.banking_billet?.link || c.linkBoleto || null`
- **Commit:** dbc62491a6f0

### CHECKPOINT-2 — Patch C: Validação de status em botSessionService
- **Status:** ✅ DONE
- **Arquivo:** backend/src/services/botSessionService.js
- **O que foi feito:** Adicionados `VALID_STATUSES` e `assertValidStatus()`. Chamado em `updateSession()` para rejeitar status inválido com erro descritivo.
- **Commit:** 6afb5816f6ed

### CHECKPOINT-3 — Patch B + Migration: @unique em messageId + SQL de migração
- **Status:** ✅ DONE
- **Arquivos:**
  - backend/prisma/schema.prisma — adicionado `@unique` em `WhatsappEvent.messageId`
  - backend/prisma/migrations/migration_lock.toml — criado
  - backend/prisma/migrations/20260315000000_add_whatsapp_sessions/migration.sql — criado
- **O que foi feito:** Schema atualizado. Migration SQL criada com ambas as tabelas, índices e FK. Partial unique index em messageId (WHERE NOT NULL).
- **Commits:** 2e253681c0db (schema), ebffc8167492 (lock), 8977f3b34ba6 (migration SQL)

### CHECKPOINT-4 — Patch D: .env.example atualizado
- **Status:** ✅ DONE
- **Arquivo:** backend/.env.example
- **O que foi feito:** Adicionado `BOT_SESSION_TTL_MINUTES=30` com comentário. Anotado `BOT_SECRET_TOKEN`.
- **Commit:** 83fd3c681d16

### CHECKPOINT-5 — Documentação final atualizada
- **Status:** ✅ DONE
- **Arquivos:** BOT_WHATSAPP_BLOCK_FROZEN.md + este arquivo
- **O que foi feito:** FROZEN.md rebatizado para STAGING PREP. PROGRESS.md atualizado com todos os checkpoints.

---

## Problemas identificados na auditoria

| # | Prioridade | Problema | Status |
|---|-----------|----------|--------|
| P1 | 🔴 CRÍTICO | Campo `payLink` com mapeamento Efí frágil | ✅ RESOLVIDO (CP-1) |
| P2 | 🔴 CRÍTICO | Migration não executada — tabelas não existem | ✅ RESOLVIDO (CP-3) |
| P3 | 🟡 MÉDIO | `messageId` sem UNIQUE no schema | ✅ RESOLVIDO (CP-3) |
| P4 | 🟡 MÉDIO | `status` sem validação de enum no service | ✅ RESOLVIDO (CP-2) |
| P5 | 🟢 BAIXO | BOT_SESSION_TTL_MINUTES ausente do .env.example | ✅ RESOLVIDO (CP-4) |

---

## Estado atual do bloco

- **Produção:** INATIVO (bloco não exposto em prod — rotas montadas mas token não configurado)
- **Staging:** PRONTO PARA DEPLOY — executar `npx prisma migrate deploy` + definir `BOT_SECRET_TOKEN`
- **Próximos passos:** deploy em staging → testes mínimos dos endpoints → validar fluxo boleto
