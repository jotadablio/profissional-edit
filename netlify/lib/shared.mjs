// Funções e configuração compartilhadas entre os endpoints.
import crypto from 'node:crypto';

export const PRODUCT_ID = 'profissional-edit';

export function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export function settings() {
  return {
    token: env('MP_ACCESS_TOKEN'),
    price: Number(env('PRICE', '67')),
    productName: env('PRODUCT_NAME', 'Profissional Edit - Skill de edição de vídeo para Claude'),
    downloadUrl: env('DOWNLOAD_URL'),
    webhookSecret: env('MP_WEBHOOK_SECRET'),
    resendKey: env('RESEND_API_KEY'),
    emailFrom: env('EMAIL_FROM'),
    supportEmail: env('SUPPORT_EMAIL'),
    statementDescriptor: env('STATEMENT_DESCRIPTOR', 'PROFEDIT'),
    stripeSecret: env('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET')
  };
}

// E-mail de entrega pelo Resend. A chave de idempotência evita envio duplicado em reenvios.
export async function sendDeliveryEmail(cfg, { to, orderId, idempotencyKey }) {
  if (!(cfg.resendKey && cfg.emailFrom && cfg.downloadUrl && to)) {
    console.warn('pagamento aprovado, mas o e-mail de entrega não está configurado', orderId);
    return true;
  }
  const support = cfg.supportEmail ? `<p style="color:#555">Dúvidas ou reembolso (até 7 dias): ${cfg.supportEmail}</p>` : '';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      from: cfg.emailFrom,
      to: [to],
      reply_to: cfg.supportEmail || undefined,
      subject: 'Seu acesso à Profissional Edit',
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">Obrigado pela compra!</h2>
  <p>Seu pagamento foi aprovado. Baixe a skill e siga o passo a passo de instalação que está no arquivo.</p>
  <p style="margin:24px 0"><a href="${cfg.downloadUrl}" style="background:#C6FF3D;color:#06080C;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Baixar a Profissional Edit</a></p>
  <p style="color:#555">Pedido: ${orderId}</p>
  ${support}
</div>`,
      text: `Obrigado pela compra!\n\nBaixe a Profissional Edit aqui: ${cfg.downloadUrl}\n\nPedido: ${orderId}` +
        (cfg.supportEmail ? `\nDúvidas ou reembolso (7 dias): ${cfg.supportEmail}` : '')
    })
  });
  if (!res.ok && res.status !== 409) {
    console.error('falha no e-mail', res.status, await res.text());
    return false;
  }
  return true;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

// Busca um pagamento na API do Mercado Pago (fonte da verdade, nunca confie no navegador).
export async function getPayment(id, token) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = new Error(`Mercado Pago respondeu ${res.status} ao consultar o pagamento`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// O pagamento é desta skill, foi aprovado e no valor certo?
export function checkPayment(p, price) {
  const isProduct = p?.metadata?.product === PRODUCT_ID;
  const amountOk = Number(p?.transaction_amount) >= price - 0.01 && p?.currency_id === 'BRL';
  return {
    isProduct,
    amountOk,
    status: p?.status,
    approved: isProduct && amountOk && p?.status === 'approved'
  };
}

// Valida o cabeçalho x-signature do webhook (documentação do Mercado Pago):
// manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"  ->  HMAC-SHA256 com a chave secreta.
export function validSignature({ xSignature, xRequestId, dataId, secret }) {
  if (!xSignature || !secret) return false;
  let ts = '', v1 = '';
  for (const part of xSignature.split(',')) {
    const [k, val] = part.split('=').map(s => (s || '').trim());
    if (k === 'ts') ts = val;
    if (k === 'v1') v1 = val;
  }
  if (!ts || !v1) return false;
  let manifest = '';
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
