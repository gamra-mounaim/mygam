export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  filename?: string;
  fileBase64?: string;
}

export interface WhatsAppPayload {
  to: string;
  body: string;
  mediaUrl?: string;
}

export async function sendEmail(payload: EmailPayload) {
  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function sendWhatsApp(payload: WhatsAppPayload) {
  const response = await fetch('/api/send-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}
