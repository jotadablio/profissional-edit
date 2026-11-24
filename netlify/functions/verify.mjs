// GET /api/verify?payment_id=123        (Mercado Pago)
// GET /api/verify?session_id=cs_live_…  (Stripe)
// Chamada pela página de obrigado. Consulta o pagamento na API e só libera o download se estiver aprovado.
import { settings, getPayment, checkPayment, json } from '../lib/shared.mjs';
import { stripeApi, checkSession } from '../lib/stripe.mjs';

export default async (req) => {
  const cfg = settings();
  const q = new URL(req.url).searchParams;
  const sessionId = q.get('session_id');
  if (sessionId) return verifyStripe(cfg, sessionId);

  const id = q.get('payment_id') || '';
  if (!/^\d{1,20}$/.test(id)) return json({ status: 'invalid' }, 400);
  if (!cfg.token) return json({ status: 'error', message: 'MP_ACCESS_TOKEN não configurado' }, 500);

  let p;
  try {
    p = await getPayment(id, cfg.token);
  } catch (e) {
    return json({ status: e.status === 404 ? 'not_found' : 'error' }, e.status === 404 ? 404 : 502);
  }

  const check = checkPayment(p, cfg.price);
  if (!check.isProduct || !check.amountOk) return json({ status: 'invalid' }, 403);

  if (check.approved) {
    return json({
      status: 'approved',
      downloadUrl: cfg.downloadUrl || null,
      value: Number(p.transaction_amount),
      paymentId: String(p.id),
      emailHint: maskEmail(p.payer?.email)
    });
  }
  // pending, in_process, rejected, cancelled...
  return json({ status: check.status || 'unknown' });
};

async function verifyStripe(cfg, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return json({ status: 'invalid' }, 400);
  if (!cfg.stripeSecret) return json({ status: 'error', message: 'STRIPE_SECRET_KEY não configurado' }, 500);

  let s;
  try {
    s = await stripeApi(`checkout/sessions/${sessionId}`, cfg.stripeSecret);
  } catch (e) {
    return json({ status: e.status === 404 ? 'not_found' : 'error' }, e.status === 404 ? 404 : 502);
  }

  const check = checkSession(s, cfg.price);
  if (!check.isProduct || !check.amountOk) return json({ status: 'invalid' }, 403);
  if (check.paid) {
    return json({
      status: 'approved',
      downloadUrl: cfg.downloadUrl || null,
      value: s.amount_total / 100,
      paymentId: String(s.payment_intent || s.id),
      emailHint: maskEmail(s.customer_details?.email)
    });
  }
  if (check.expired) return json({ status: 'cancelled' });
  return json({ status: 'pending' });
}

function maskEmail(e) {
  if (!e || !e.includes('@')) return null;
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

export const config = { path: '/api/verify' };
