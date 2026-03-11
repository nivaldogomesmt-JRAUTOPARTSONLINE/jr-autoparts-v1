# CI/CD (Vercel + Supabase)

Este projeto usa deploy principal em Vercel (frontend) e banco no Supabase.

## Workflows adicionados

- `ci-monorepo.yml`
  - Roda em push/PR para `main`.
  - Backend: install, generate Prisma client, smoke check de controllers.
  - Frontend: install e build.

- `supabase-migrate.yml`
  - Execucao manual (`workflow_dispatch`).
  - Aplica `prisma migrate deploy` no Supabase.

## Secrets necessarios no GitHub

- `SUPABASE_DATABASE_URL`
  - URL de conexao do PostgreSQL do Supabase.

## Fluxo recomendado

1. Abrir PR.
2. CI valida backend/frontend.
3. Merge na `main`.
4. Vercel faz deploy automatico do frontend.
5. Quando houver migracao Prisma nova, executar manualmente `Deploy Prisma Migrations (Supabase)`.
