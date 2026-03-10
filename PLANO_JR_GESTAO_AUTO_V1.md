# JR Gestao Auto - Plano Executavel V1

## 1) Escopo fechado da V1 (o que entra agora)

Objetivo da V1: gerar caixa, reduzir perda operacional e melhorar comunicacao com cliente.

Itens inclusos:

1. OS com quilometragem obrigatoria na abertura
2. Status operacionais da OS com historico de mudancas
3. Notificacao automatica de status da OS por WhatsApp (com trilha de envio)
4. Manutencao preventiva por km e por tempo (vence o primeiro)
5. Portal do cliente com:
   - historico por veiculo
   - proximas revisoes
   - itens vencidos/atencao
6. Usuarios internos com perfis e permissoes
7. Cadastro base: clientes, veiculos, produtos e servicos
8. Financeiro basico: contas a receber da OS e dashboard simples

Itens fora da V1 (V2+):

1. Guincho com rastreio em mapa
2. Locacao completa
3. E-commerce completo de 3000 produtos
4. Integracao completa com Olist ERP

---

## 2) Arquitetura recomendada (agora)

Manter stack atual e evoluir:

1. Frontend: React (Vercel)
2. Backend: Node + Express + Prisma (Render)
3. Banco: PostgreSQL (Supabase)
4. Mensageria: fila simples de notificacao (job interno no backend)
5. WhatsApp: BotConversa + API oficial da empresa

Motivo: menor risco e entrega mais rapida com o sistema ja em producao.

---

## 3) Modelo de permissao (RBAC)

Perfis:

1. `ADMIN`: acesso total
2. `GESTOR`: dashboards e relatorios consolidados
3. `ATENDIMENTO`: clientes, veiculos, abertura/edicao de OS, chamados
4. `TECNICO`: atualizacao tecnica de OS e manutencao
5. `FINANCEIRO`: contas, recebimentos, inadimplencia
6. `ESTOQUE` (opcional inicial): produtos e movimentacoes

Permissoes por modulo e acao:

1. `view`
2. `create`
3. `edit`
4. `delete`
5. `approve` (orcamento/status criticos)

---

## 4) Regras criticas de negocio V1

### 4.1 Ordem de servico

1. Nao permite abrir OS sem `entryKm`.
2. A cada mudanca de status, registrar:
   - status anterior/novo
   - usuario
   - data/hora
3. Status suportados:
   - `QUOTE`, `APPROVED`, `STARTED`, `IN_PROGRESS`, `WAITING_PART`, `THIRD_PARTY`, `RETIFICA`, `FINISHING`, `DONE`, `DELIVERED`

### 4.2 Notificacao WhatsApp da OS

1. Enviar automaticamente em eventos configurados
2. Registrar em `mensagens_os`:
   - conteudo
   - destinatario
   - status envio
   - id mensagem API
3. Evitar duplicidade por OS+status (com opcao de reenvio manual)

### 4.3 Manutencao preventiva

Para cada item monitorado:

1. calcular `proxima_troca_km = ultima_troca_km + intervalo_km`
2. calcular `proxima_troca_data = ultima_troca_data + intervalo_dias`
3. usar o que vencer primeiro
4. status:
   - `EM_DIA`
   - `ATENCAO_PROXIMA`
   - `VENCIDO`
   - `VENCIDO_CRITICO`

---

## 5) Banco de dados minimo para iniciar V1

Novas entidades prioritarias:

1. `roles` e `role_permissions` (ou tabela simples de perfil no inicio)
2. `os_status_logs` (ja existe, expandir status)
3. `mensagens_os`
4. `templates_mensagem`
5. `itens_monitorados_veiculo`
6. `historico_manutencao`
7. `contas_receber` (basico para OS)

---

## 6) Backlog tecnico por sprint

### Sprint 1 (7-10 dias)

1. Tornar KM obrigatorio na abertura da OS
2. Adicionar novos status OS (`WAITING_PART`, `THIRD_PARTY`, `RETIFICA`)
3. Criar RBAC basico por perfil
4. Criar estrutura `mensagens_os` + `templates_mensagem`
5. Disparar WhatsApp em mudanca de status

Entrega esperada: OS com fluxo operacional completo + comunicacao automatica.

### Sprint 2 (7-10 dias)

1. Implementar `itens_monitorados_veiculo`
2. Calculo de proxima revisao por km/tempo
3. Alertas no painel interno
4. Exibir previsao e historico no portal do cliente

Entrega esperada: manutencao preventiva funcional ponta a ponta.

### Sprint 3 (7-10 dias)

1. Contas a receber ligadas a OS
2. Dashboard basico (receita, aberto, vencido)
3. Melhorias de UX mobile
4. Auditoria e logs de acao de usuario

Entrega esperada: controle financeiro basico e operacao mais segura.

---

## 7) Integracoes

### WhatsApp oficial (prioridade alta)

1. Canal primario de notificacao e atendimento
2. BotConversa para fluxo inicial + transferencia humana
3. IA para classificacao de intencao e apoio comercial

### Olist ERP (prioridade media, apos V1)

1. Sincronizacao de produtos/precos/estoque
2. Importacao de pedidos para faturamento no sistema
3. Rotina de conciliacao para evitar divergencia

---

## 8) Indicadores de sucesso da V1

1. % de OS com notificacao enviada com sucesso
2. Tempo medio de atualizacao de status
3. % de veiculos com plano de manutencao ativo
4. Reducao de retornos por falta de comunicacao
5. Valor em aberto e taxa de inadimplencia mensal

---

## 9) Proximo passo imediato (execucao)

1. Congelar escopo da Sprint 1
2. Abrir tarefas tecnicas no backend/frontend
3. Criar migracoes Prisma das novas tabelas criticas
4. Subir ambiente de homologacao
5. Validar fluxo completo com 5 clientes reais antes de ampliar

---

## Referencia de rastreamento

Consulte tambem o plano detalhado de aproveitamento da plataforma Rastrek:

- `PLANO_APROVEITAMENTO_RASTREK.md`
