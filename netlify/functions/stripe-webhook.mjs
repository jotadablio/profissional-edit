// POST /api/stripe-webhook  (eventos da Stripe)
// Ouça os eventos: checkout.session.completed e checkout.session.async_payment_succeeded.
import { settings, sendDeliveryEmail, json } from '../lib/shared.mjs';
import { stripeApi, checkSession, validStripeSignature } from '../lib/stripe.mjs';

export default async (req) => {
  const cfg = settings();
  const raw = await req.text();

  if (!validStripeSignature(raw, req.headers.get('stripe-signature'), cfg.stripeWebhookSecret)) {
    return json({ ok: false, reason: 'assinatura inválida' }, 400);
  }

  let event;
  try { event = JSON.parse(raw); } catch { return json({ ok: false }, 400); }

  const relevant = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (!relevant.includes(event.type)) return json({ ok: true, ignored: true });

  let s;
  try {
    // Busca a sessão de novo na API em vez de confiar só no corpo do evento.
    s = await stripeApi(`checkout/sessions/${encodeURIComponent(event.data.object.id)}`, cfg.stripeSecret);
  } catch (e) {
    console.error('stripe-webhook: falha ao consultar sessão', e.message);
    return json({ ok: false }, 500);
  }

  const check = checkSession(s, cfg.price);
  console.log('stripe-webhook', JSON.stringify({ id: s.id, type: event.type, payment_status: s.payment_status, product: check.isProduct }));
  if (!check.paid) return json({ ok: true });

  const sent = await sendDeliveryEmail(cfg, {
    to: s.customer_details?.email,
    orderId: s.payment_intent || s.id,
    idempotencyKey: `pe-stripe-${s.id}`
  });
  return sent ? json({ ok: true }) : json({ ok: false }, 500);
};

export const config = { path: '/api/stripe-webhook' };
