# Automacao de Cobranca - Rastreamento

## Variaveis de ambiente

Defina no backend (Render):

- TRACKING_JOB_TOKEN=defina_um_token_forte
- BOTCONVERSA_API_URL
- BOTCONVERSA_API_KEY

## Endpoints de automacao

Todos aceitam autenticacao de usuario interno OU header:

- x-job-token: TRACKING_JOB_TOKEN

Endpoints:

- POST /api/tracking/jobs/generate
- POST /api/tracking/jobs/collect
- POST /api/tracking/jobs/run

Body opcional para gerar competencia especifica:

```json
{ "referenceMonth": "2026-03" }
```

## Exemplo Make.com (HTTP)

- Method: POST
- URL: https://jr-autoparts-v1.onrender.com/api/tracking/jobs/run
- Headers:
  - Content-Type: application/json
  - x-job-token: {{seu_token}}
- Body:

```json
{ "referenceMonth": "2026-03" }
```

## Frequencia recomendada

- Rodar 1x por dia, 08:00 (America/Cuiaba).

## Regras de envio implementadas

- Cobranca em marcos de atraso: 0, 1, 3, 7, 15, 30, 45, 60, 90 dias.
- Templates por faixa:
  - LIGHT (1-30)
  - INTENSIVE (31-60)
  - CRITICAL (61-90)
  - RECOVERY (+90)
- Anti-duplicidade: nao reenviar a mesma mensagem para o mesmo cliente em janela de 20h.
