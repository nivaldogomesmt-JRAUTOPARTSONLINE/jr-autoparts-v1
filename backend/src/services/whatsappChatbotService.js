/**
 * Serviço de compatibilidade para respostas automáticas via WhatsApp.
 * Mantém a aplicação estável mesmo quando o chatbot não estiver configurado.
 */

async function handleIncomingMessage(_phone, _content) {
  // Sem resposta automática por padrão.
  // Retornar null evita envio indevido e mantém o fluxo do webhook funcional.
  return null;
}

module.exports = {
  handleIncomingMessage,
};

