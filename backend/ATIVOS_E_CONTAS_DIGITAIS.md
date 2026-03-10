# Ativos e Contas Digitais - Como ativar

## O que foi adicionado

- Modelos Prisma:
  - `CompanyAsset`
  - `DigitalAccount`
- Rotas protegidas (ADMIN/EMPLOYEE):
  - `GET/POST/PUT/DELETE /api/company-assets`
  - `GET/POST/PUT/DELETE /api/digital-accounts`
- Script de carga inicial com dados da JR:
  - `backend/scripts/seed_company_assets.js`

## Passo a passo para publicar

1. Gerar cliente Prisma no backend:
   - `npm run db:generate`
2. Aplicar schema no banco:
   - `npx prisma db push`
3. Inserir dados iniciais dos ativos/contas:
   - `npm run db:seed:assets`

## Exemplos de uso da API

### Listar ativos

`GET /api/company-assets?page=1&limit=20&search=f250`

### Criar ativo

`POST /api/company-assets`

```json
{
  "code": "ASSET-EXEMPLO-01",
  "name": "Veiculo Exemplo",
  "category": "CAR",
  "plate": "ABC1D23",
  "intendedUse": "Operacional",
  "status": "ACTIVE"
}
```

### Listar contas digitais

`GET /api/digital-accounts?page=1&limit=20&platform=WHATSAPP_BUSINESS`

### Criar conta digital

`POST /api/digital-accounts`

```json
{
  "code": "ACC-EXEMPLO-01",
  "platform": "INSTAGRAM",
  "label": "Instagram Unidade Matriz",
  "contact": "@jrautoparts",
  "plan": "Business",
  "status": "ACTIVE",
  "verified": true
}
```
