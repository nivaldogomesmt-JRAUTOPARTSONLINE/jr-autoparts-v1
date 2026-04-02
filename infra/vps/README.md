# Migracao da JR Auto Parts para a VPS

Este pacote prepara uma implantacao paralela na VPS, sem desligar o ambiente atual.

## Estrategia recomendada

1. Manter o sistema atual funcionando em Vercel + Render + Supabase.
2. Subir a nova stack da VPS em portas separadas.
3. Validar login, API, portal, OS e integracoes no endereco paralelo.
4. So depois do checklist aprovado fazer o cutover de dominio.

## O que vai para a VPS nesta fase

- `jr-backend` em Docker
- `jr-frontend` em Docker
- `jr-nginx` como proxy reverso
- backup automatico do banco atual no Supabase

## O que continua fora da VPS por enquanto

- banco principal no Supabase
- ambiente atual em producao, sem interrupcao

## Arquivos

- `docker-compose.prod.yml`: stack paralela da VPS
- `.env.vps.example`: modelo das variaveis
- `nginx/jr.conf`: proxy reverso para frontend + API
- `scripts/deploy-jr.sh`: deploy/redeploy da stack
- `scripts/backup-jr.sh`: dump do banco e copia opcional para rclone

## Implantacao inicial

### 1. Preparar a pasta na VPS

```bash
mkdir -p /opt/jr-autoparts
cd /opt/jr-autoparts
git clone <repo> .
cp infra/vps/.env.vps.example infra/vps/.env
```

### 2. Preencher segredos reais

Editar `infra/vps/.env` com:

- `DATABASE_URL`
- `JWT_SECRET`
- `BOT_SECRET_TOKEN`
- credenciais Cloudinary
- credenciais Resend
- credenciais BotConversa
- credenciais Efí
- `OPENAI_API_KEY` se o backend usar IA
- `MAINTENANCE_RECALC_ENABLED=false` na homologacao paralela
- `MAINTENANCE_NOTIFY_ENABLED=false` na homologacao paralela

### 3. Subir em paralelo

```bash
cd /opt/jr-autoparts
sh infra/vps/scripts/deploy-jr.sh
```

### 4. Testar sem risco

Homologacao inicial em:

- `http://IP_DA_VPS:8088`
- `http://IP_DA_VPS:8088/health`

## Checklist antes do cutover

- login administrativo funcionando
- login do cliente funcionando
- dashboard abrindo
- veiculos e OS abrindo
- boletos e rotas do bot respondendo
- upload de imagem funcionando
- notificacoes sem erro 500

## Cutover recomendado

Quando a homologacao paralela estiver aprovada:

1. apontar `api.jrautopartsmt.com.br` para a VPS
2. opcionalmente apontar `app.jrautopartsmt.com.br` para a VPS
3. manter Vercel/Render ativos por alguns dias como rollback
4. so depois descontinuar Render

## Backup

O script `backup-jr.sh` gera:

- dump `.sql` do banco
- tar.gz da configuracao da stack

Se `RCLONE_REMOTE` estiver definido no `.env`, ele tambem envia os backups para drive externo.
