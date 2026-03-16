# BOT_WHATSAPP_PROGRESS.md
## Controle de Progresso — Bloco WhatsApp Bot

---

## Última atualização
- Data: 2026-03-15
- Etapa atual: CHECKPOINT-0 — Arquivo de progresso criado
- Status: DONE

## Histórico de Checkpoints

### CHECKPOINT-0 — Inicialização do modo checkpoint
- **Status:** DONE
- **Arquivos alterados:** backend/docs/BOT_WHATSAPP_PROGRESS.md (criado)
- **O que foi feito:** Auditoria técnica completa realizada. Problemas identificados e priorizados.
- **Commit:** a ser registrado

---

## Problemas identificados na auditoria

| # | Prioridade | Problema | Status |
|---|-----------|----------|--------|
| P1 | 🔴 CRÍTICO | Campo `banking_billet.link` inexistente no retorno da Efí | PENDENTE |
| P2 | 🔴 CRÍTICO | Migration não executada — tabelas não existem | PENDENTE |
| P3 | 🟡 MÉDIO | `messageId` sem UNIQUE no schema | PENDENTE |
| P4 | 🟡 MÉDIO | `status` sem validação de enum no service | PENDENTE |
| P5 | 🟢 BAIXO | BOT_SECRET_TOKEN e BOT_SESSION_TTL_MINUTES ausentes do .env.example | PENDENTE |

---

## Plano de checkpoints

| Checkpoint | Descrição | Arquivo(s) | Status |
|-----------|-----------|------------|--------|
| CP-0 | Criar arquivo de progresso | BOT_WHATSAPP_PROGRESS.md | DONE |
| CP-1 | Patch A — Fix campo Efí no botWebhookController | botWebhookController.js | PENDENTE |
| CP-2 | Patch C — Validação de status no botSessionService | botSessionService.js | PENDENTE |
| CP-3 | Patch B — Unique messageId no schema + migration | schema.prisma + migration.sql | PENDENTE |
| CP-4 | Patch D — Variáveis no .env.example | .env.example | PENDENTE |
| CP-5 | Atualizar BOT_WHATSAPP_BLOCK_FROZEN.md | BOT_WHATSAPP_BLOCK_FROZEN.md | PENDENTE |

---

## Estado do bloco

- **BotConversa:** NÃO apontado para as rotas (bloco inativo em produção)
- **Migration:** NÃO executada (nem em staging, nem em produção)
- **Rotas:** Existem no código mas inatingíveis sem webhook ativo
- **Produção:** BLOCO NÃO ATIVADO

---

## Próximo passo
Executar CP-1: corrigir campo Efí em botWebhookController.js

---

## Observações técnicas
- authenticateBot confirmado em auth.js — sem arquivo separado necessário
- Todos os model names Prisma confirmados como corretos
- Caminho `require('../lib/prisma')` confirmado como correto
- Campo `banking_billet.link` confirmado como inexistente fora do botWebhookController
- efiCobrancasService.js NÃO expõe campo `link` diretamente
