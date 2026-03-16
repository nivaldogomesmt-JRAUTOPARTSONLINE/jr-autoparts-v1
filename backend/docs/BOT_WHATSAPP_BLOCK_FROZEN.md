# BOT / WHATSAPP BLOCK — STAGING PREP / EM DESENVOLVIMENTO ATIVO

> Status: **EM STAGING PREP — patches aplicados, aguardando deploy e validação em staging**
> Data de inserção: 2026-03-15
> Branch: main
> Última revisão: 2026-03-15 — patches CP-1 a CP-5 aplicados

> ⚠️ Este bloco permanece **INATIVO em produção**. Ativar apenas após validação completa em staging.

---

## O que é este bloco

Implementação dos endpoints de atendimento WhatsApp para o bot JR Auto Parts.
Foi inserido no branch `main` mas **não está ativo em produção** pois depende de
migration de banco de dados que ainda não foi executada.

---

## Arquivos que pertencem a este bloco

### Novos (criados do zero)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `backend/src/helpers/normalizeHelpers.js` | Normalização e mascaramento de telefone, CPF/CNPJ, placa |
| `backend/src/services/botSessionService.js` | Ciclo de vida das sessões de conversa no Postgres |
| `backend/src/services/botTriageService.js` | Classificação de intenção por palavras-chave |
| `backend/src/services/botClientResolverService.js` | Cascata de identificação de cliente (telefone → CPF → placa) |
| `backend/src/controllers/botWebhookController.js` | Handlers dos 8 endpoints do bot |

### Modificados (conteúdo existente preservado, novo conteúdo appendado ao final)
| Arquivo | O que foi adicionado |
|---------|---------------------|
| `backend/src/routes/botRoutes.js` | Registro das 8 novas rotas |
| `backend/prisma/schema.prisma` | 2 novos models: `WhatsappSession`, `WhatsappEvent` |

---

## Rotas novas criadas (todas em `/api/bot/`)

```
POST /api/bot/triage
POST /api/bot/boleto/resolve-client
POST /api/bot/boleto/open
POST /api/bot/service-intake
POST /api/bot/towing-intake
POST /api/bot/tracking-install
POST /api/bot/tracking-support
POST /api/bot/handoff
```

Todas protegidas pelo middleware `authenticateBot` já existente.
Nenhuma rota existente foi alterada ou removida.

---

## Models adicionados ao schema.prisma

```
WhatsappSession  →  tabela: whatsapp_sessions  (NÃO CRIADA NO BANCO)
WhatsappEvent    →  tabela: whatsapp_events    (NÃO CRIADA NO BANCO)
```

---

## Estado atual do banco de dados

**As tabelas NÃO existem no Supabase.**
A migration `add_whatsapp_sessions` foi adicionada ao schema mas **nunca executada**.
O sistema em produção continua funcionando normalmente.
Qualquer chamada às rotas `/api/bot/*` resultará em erro 500 enquanto a migration não for executada.

---

## O que NÃO deve ser feito sem revisão prévia

- ❌ `npx prisma migrate dev --name add_whatsapp_sessions`
- ❌ `npx prisma migrate deploy`
- ❌ Apontar BotConversa ou qualquer cliente para `/api/bot/*`
- ❌ Alterar os arquivos deste bloco

---

## Dependências não verificadas (requer revisão antes de uso)

1. **Prisma import path** — os services usam `require('../lib/prisma')`. Confirmar se o caminho é correto.
2. **Model names** — usa `prisma.client`, `prisma.vehicle`, `prisma.trackingContract`. Confirmar contra o schema real.
3. **Efí response fields** — `openBoletos` mapeia `c.charge_id`, `c.expire_at`, `c.value`, `c.payment?.banking_billet?.link`. Confirmar contra o response real do SDK.
4. **authenticateBot header** — confirmar qual header o middleware espera.

---

## Para ativar no futuro (checklist)

- [ ] Revisar e corrigir os 4 pontos de dependência acima
- [ ] Aprovar o código com revisão técnica
- [ ] Executar a migration em ambiente de staging primeiro
- [ ] Executar a migration em produção
- [ ] Configurar BotConversa para apontar para os endpoints
- [ ] Configurar variável `BOT_SESSION_TTL_MINUTES` no Render (padrão: 30 min)
