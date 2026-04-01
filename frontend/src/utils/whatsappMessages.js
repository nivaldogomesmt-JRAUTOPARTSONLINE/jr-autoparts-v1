const FRIENDLY_WHATSAPP_ERRORS = [
  { test: (text) => text.includes('botconversa_api_key'), message: 'Falha ao enviar WhatsApp' },
  { test: (text) => text.includes('enotfound'), message: 'Falha ao enviar WhatsApp' },
  { test: (text) => text.includes('subscriber') && text.includes('not found'), message: 'Contato nao localizado no WhatsApp' },
  { test: (text) => text.includes('telefone do cliente invalido'), message: 'Telefone do cliente invalido' },
  { test: (text) => text.includes('api_url invalida'), message: 'Configuracao de WhatsApp invalida' },
  { test: (text) => text.includes('evolution_api_url') || text.includes('evolution_api_key'), message: 'Integracao de WhatsApp indisponivel' },
];

export function getFriendlyWhatsAppError(error) {
  const text = String(error || '').trim();
  if (!text) return '-';

  const normalized = text.toLowerCase();
  const match = FRIENDLY_WHATSAPP_ERRORS.find((item) => item.test(normalized));
  return match?.message || text;
}
