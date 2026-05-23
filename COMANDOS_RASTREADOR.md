# Comandos Rastreador (envio de SMS de configuracao/controle)

Pagina no sistema (menu **Comandos Rastreador**) para montar e enviar os comandos SMS
dos rastreadores (configuracao de APN/servidor, bloqueio/desbloqueio de motor,
reiniciar, reset de fabrica, localizacao/status), com envio automatico de 1 comando
a cada N segundos (padrao 20s).

## O que entra neste PR

**Frontend** (`frontend/src/pages/rastreador/`)
- `ComandosRastreadorPage.jsx` — a tela (busca de veiculo, modelo, operadora, comandos
  rapidos com confirmacao para acoes criticas, fila automatica com barra/log/pausar).
- `comandosData.js` — operadoras (APN), modelos e comandos por familia
  (Suntech ST300, Coban GPS103, GT06/Concox).
- `vehicles.data.js` — base inicial de veiculos (placa/cliente/modelo/chip/operadora),
  extraida das planilhas. Pode ser trocada depois por consulta ao banco via `vehiclesAPI`.
- Wiring: rota em `App.jsx` (`/rastreador-comandos`), item no menu `Layout.jsx`,
  `rastreadorAPI` em `services/api.js`. Permissao reutiliza o modulo `tracking`.

**Backend** (`backend/src/`)
- `services/smsGatewayService.js` — envia ao gateway configurado por env.
- `controllers/rastreadorController.js` — `status` e `enviar`.
- `routes/rastreadorRoutes.js` — `GET /api/rastreador/status`, `POST /api/rastreador/enviar`
  (auth + `requireModuleAction('tracking', ...)`), registrado em `index.js`.

## Como ativar o envio real (gateway por QR)

1. Suba um gateway de SMS (recomendado: android-sms-gateway, open-source) e **pareie um
   celular Android** da loja por QR/credencial — ele vira o disparador (envia do proprio
   numero, reconhecido pelos rastreadores como administrador). Ver
   `docker/sms-gateway.compose.example.yml`.
2. No servico `jr-backend`, defina as variaveis de ambiente:
   - `SMS_GATEWAY_URL` (ex.: `http://jr-sms-gateway:3000/message`)
   - `SMS_GATEWAY_USER` / `SMS_GATEWAY_PASS` (ou `SMS_GATEWAY_TOKEN`)
   - `SMS_GATEWAY_FORMAT=android` (ou `simple`)
3. Reinicie o backend. A tela passa de "modo demonstracao" para "envio real"
   automaticamente (via `GET /api/rastreador/status`).

Sem `SMS_GATEWAY_URL`, a tela funciona em **modo demonstracao** (mostra/gera os comandos,
botoes Copiar e "Abrir SMS" no celular funcionam; o automatico apenas simula).

## Seguranca

- Acoes criticas (bloquear motor, reset de fabrica) exigem confirmacao na tela.
- Nunca bloquear veiculo em movimento.
- Comandos por familia foram extraidos de manuais; confirme em bancada antes de uso em campo
  (cada modelo mostra um nivel de confianca).
