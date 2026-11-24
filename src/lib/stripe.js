// Chamadas à API da Stripe sem biblioteca externa.
import { PRODUCT_ID } from './shared.js';
import { hmacHex, safeEqual } from './crypto.js';

// Converte objeto aninhado no formato de formulário da Stripe: a[b][0][c]=valor
export function toForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') toForm(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeApi(path, secret, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${secret}` };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    body: body ? toForm(body).toString() : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// A sessão é desta skill, foi paga e no valor certo?
export function checkSession(s, price) {
  const isProduct = s?.metadata?.product === PRODUCT_ID;
  const amountOk = s?.currency === 'brl' && Number(s?.amount_total) >= Math.round(price * 100);
  return {
    isProduct,
    amountOk,
    paid: isProduct && amountOk && s?.payment_status === 'paid',
    // Pix e outros meios assíncronos: sessão concluída, pagamento ainda não caiu
    pending: s?.status === 'complete' && s?.payment_status === 'unpaid',
    expired: s?.status === 'expired'
  };
}

// Valida o cabeçalho Stripe-Signature: "t=<ts>,v1=<hmac>"; HMAC-SHA256 de "<ts>.<corpo cru>".
export async function validStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  let t = '';
  const v1s = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v;
    if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1s.some(v => safeEqual(expected, v));
}
