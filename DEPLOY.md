# 🚀 Guia de Deploy — JR Auto Parts

> **Domínio:** jrautopartsmt.com.br
> **Stack gratuita:** Supabase + Render.com + Vercel + Cloudinary

---

## 📋 O que você vai configurar

| Serviço | Para quê | Custo |
|---------|----------|-------|
| **GitHub** | Repositório do código | Gratuito |
| **Supabase** | Banco de dados PostgreSQL | Gratuito |
| **Render.com** | Hospedagem do backend (Node.js) | Gratuito |
| **Vercel** | Hospedagem do frontend (React) | Gratuito |
| **Cloudinary** | Armazenamento de fotos | Gratuito |
| **Resend.com** | Envio de emails | Gratuito |

**Tempo estimado: 2 a 3 horas para configurar tudo.**

---

## ETAPA 1 — GitHub (Repositório)

1. Acesse [github.com](https://github.com) e crie uma conta (se não tiver)
2. Clique em **"New repository"**
3. Nome: `jr-autoparts`
4. Deixe **privado** (Private)
5. Clique em **Create repository**
6. Na sua máquina, abra o terminal dentro da pasta `jr-autoparts` e rode:

```bash
git init
git add .
git commit -m "Initial commit - JR Auto Parts v1"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/jr-autoparts.git
git push -u origin main
```

---

## ETAPA 2 — Supabase (Banco de Dados)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **"New Project"**
3. Preencha:
   - **Name:** jr-autoparts
   - **Database Password:** anote essa senha (você vai precisar)
   - **Region:** South America (São Paulo)
4. Aguarde o projeto criar (~2 min)
5. Vá em **Settings → Database → Connection String → URI**
6. Copie a URL (parece assim):
   ```
   postgresql://postgres:SUA_SENHA@db.XXXXXXXX.supabase.co:5432/postgres
   ```
7. Guarde essa URL para usar no próximo passo

---

## ETAPA 3 — Render.com (Backend)

### 3.1 — Criar o serviço

1. Acesse [render.com](https://render.com) e crie uma conta
2. Clique em **"New +"** → **"Web Service"**
3. Conecte seu GitHub e selecione o repositório `jr-autoparts`
4. Configure:
   - **Name:** jr-autoparts-api
   - **Root Directory:** `backend`
   - **Environment:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free

### 3.2 — Variáveis de ambiente

Clique em **"Environment"** e adicione uma por uma:

```
DATABASE_URL        = [URL do Supabase copiada no passo 2]
JWT_SECRET          = [gere uma string aleatória longa - veja abaixo]
JWT_EXPIRES_IN      = 7d
PORT                = 3001
NODE_ENV            = production
FRONTEND_URL        = https://app.jrautopartsmt.com.br
CLOUDINARY_CLOUD_NAME = [do passo 5]
CLOUDINARY_API_KEY    = [do passo 5]
CLOUDINARY_API_SECRET = [do passo 5]
RESEND_API_KEY        = [do passo 6]
EMAIL_FROM            = noreply@jrautopartsmt.com.br
BOTCONVERSA_API_KEY   = [do painel BotConversa]
BOTCONVERSA_API_URL   = https://backend.botconversa.com.br/api/v1
WHATSAPP_FROM_NUMBER  = 5565992812000
BOT_SECRET_TOKEN      = [crie um token secreto]
```

**Como gerar o JWT_SECRET:**
Acesse [generate-secret.vercel.app](https://generate-secret.vercel.app/64) e copie o valor gerado.

**Como gerar o BOT_SECRET_TOKEN:**
Use qualquer string longa que você inventar, ex: `JR2024AUTOPARTSsecretBotToken`

5. Clique em **"Create Web Service"**
6. Aguarde o deploy (~5 min)
7. Anote a URL gerada (ex: `https://jr-autoparts-api.onrender.com`)

### 3.3 — Popular o banco com dados iniciais

Após o deploy, vá na aba **"Shell"** do Render e rode:

```bash
node prisma/seed.js
```

Isso cria:
- Usuário admin: `admin@jrautoparts.com` / senha: `admin123`
- Usuário mecânico: `mecanico@jrautoparts.com` / senha: `jr2024`
- 8 serviços padrão

> ⚠️ **Importante:** Troque as senhas logo após o primeiro login!

---

## ETAPA 4 — Vercel (Frontend)

1. Acesse [vercel.com](https://vercel.com) e crie uma conta
2. Clique em **"New Project"**
3. Importe o repositório `jr-autoparts` do GitHub
4. Configure:
   - **Root Directory:** `frontend`
   - **Framework:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

5. Em **"Environment Variables"**, adicione:
   ```
   VITE_API_URL = https://jr-autoparts-api.onrender.com
   ```

6. Clique em **"Deploy"**
7. Aguarde o deploy (~3 min)

### 4.1 — Domínio Personalizado (jrautopartsmt.com.br)

1. No painel do Vercel, vá em **Settings → Domains**
2. Adicione: `app.jrautopartsmt.com.br`
3. O Vercel vai te dar um registro DNS para configurar no seu provedor (Registro.br)
4. Acesse [registro.br](https://registro.br) → seu domínio → DNS
5. Adicione o registro CNAME apontando para o Vercel
6. Aguarde propagação (até 24h, geralmente 5-10 min)

---

## ETAPA 5 — Cloudinary (Fotos de Produtos)

1. Acesse [cloudinary.com](https://cloudinary.com) e crie uma conta
2. No **Dashboard**, copie:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. Coloque essas 3 informações nas variáveis de ambiente do Render (passo 3.2)

---

## ETAPA 6 — Resend.com (Email)

1. Acesse [resend.com](https://resend.com) e crie uma conta
2. Vá em **"Domains"** → **"Add Domain"**
3. Adicione: `jrautopartsmt.com.br`
4. Siga as instruções para adicionar os registros DNS no Registro.br
5. Após verificar, vá em **"API Keys"** → **"Create API Key"**
6. Copie a chave e adicione no Render como `RESEND_API_KEY`

---

## ETAPA 7 — BotConversa (WhatsApp)

### 7.1 — Obter a API Key

1. Acesse [app.botconversa.com.br](https://app.botconversa.com.br)
2. Vá em **Configurações → API**
3. Copie a API Key e coloque no Render como `BOTCONVERSA_API_KEY`

### 7.2 — Configurar os Webhooks no Make.com

No Make.com, crie os seguintes cenários que vão acionar a API do sistema:

**Cenário: "Bot consulta produto"**
- Trigger: Webhook recebido do BotConversa
- Ação: HTTP Request para `https://jr-autoparts-api.onrender.com/api/bot/produtos`
  - Header: `x-bot-token: SEU_BOT_SECRET_TOKEN`
  - Body: `{ "q": "{{termo de busca}}" }`

**Cenário: "Bot consulta OS"**
- Trigger: Webhook recebido do BotConversa
- Ação: HTTP Request para `https://jr-autoparts-api.onrender.com/api/bot/consultar-os`
  - Header: `x-bot-token: SEU_BOT_SECRET_TOKEN`
  - Body: `{ "q": "{{placa ou CPF}}" }`

---

## ETAPA 8 — Primeiro Acesso

1. Acesse: `https://app.jrautopartsmt.com.br`
2. Login: `admin@jrautoparts.com`
3. Senha: `admin123`
4. **Imediatamente** vá em perfil e troque a senha
5. Cadastre os funcionários em **Configurações → Usuários**

---

## ✅ Checklist Final

- [ ] GitHub: repositório criado e código enviado
- [ ] Supabase: banco criado, URL copiada
- [ ] Render: backend online (teste: `https://SUA_URL.onrender.com/health`)
- [ ] Render: seed rodado (usuários e serviços criados)
- [ ] Vercel: frontend online
- [ ] Vercel: domínio `app.jrautopartsmt.com.br` configurado
- [ ] Cloudinary: conta criada, credenciais no Render
- [ ] Resend: domínio verificado, API Key no Render
- [ ] BotConversa: API Key no Render
- [ ] Make.com: cenários de bot configurados
- [ ] Senha admin trocada no primeiro login
- [ ] Funcionários cadastrados

---

## 🆘 Problemas Comuns

**Backend não inicia no Render:**
- Verifique se o `DATABASE_URL` está correto
- Verifique os logs na aba "Logs" do Render

**Erro de migração do banco:**
- O banco Supabase precisa estar rodando
- Tente acessar a aba Shell e rodar: `npx prisma migrate deploy`

**Frontend não conecta no backend:**
- Verifique se `VITE_API_URL` no Vercel está com a URL correta do Render
- No plano gratuito do Render, o backend "dorme" após 15 min sem uso. O primeiro acesso pode demorar ~30 segundos para "acordar".

**Fotos não aparecem:**
- Verifique as credenciais do Cloudinary no Render

**WhatsApp não envia:**
- Verifique a API Key do BotConversa
- O número do WhatsApp no `.env` deve estar no formato: `5565992812000` (sem +, sem espaços)

---

## 📞 Suporte Técnico

Domínio: jrautopartsmt.com.br
WhatsApp: (65) 99281-2000
Email: contato@jrautopartsmt.com.br
