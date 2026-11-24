// POST /api/webhook  (notificações do Mercado Pago)
// Quando um pagamento desta skill é aprovado, envia o link de download por e-mail (se o Resend estiver configurado).
// Isso cobre quem paga o Pix e fecha a aba antes de voltar ao site.
import { settings, getPayment, checkPayment, validSignature, sendDeliveryEmail, json } from '../lib/shared.mjs';

export default async (req) => {
  const cfg = settings();
  const url = new URL(req.url);

  let body = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }

  const type = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const dataId = url.searchParams.get('data.id') || body?.data?.id || '';

  // Assinatura: obrigatória quando MP_WEBHOOK_SECRET estiver definido.
  if (cfg.webhookSecret) {
    const ok = validSignature({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId: String(url.searchParams.get('data.id') || ''),
      secret: cfg.webhookSecret
    });
    if (!ok) return json({ ok: false, reason: 'assinatura inválida' }, 401);
  }

  if (type !== 'payment' || !/^\d{1,20}$/.test(String(dataId))) return json({ ok: true, ignored: true });

  let p;
  try {
    // Nunca confiamos no corpo da notificação: o pagamento é consultado direto na API.
    p = await getPayment(dataId, cfg.token);
  } catch (e) {
    console.error('webhook: falha ao consultar pagamento', dataId, e.message);
    return json({ ok: false }, 500); // 500 faz o Mercado Pago tentar de novo
  }

  const check = checkPayment(p, cfg.price);
  console.log('webhook', JSON.stringify({ id: p.id, status: p.status, product: check.isProduct }));
  if (!check.approved) return json({ ok: true });

  const sent = await sendDeliveryEmail(cfg, {
    to: p.payer?.email,
    orderId: String(p.id),
    idempotencyKey: `pe-payment-${p.id}`
  });
  return sent ? json({ ok: true }) : json({ ok: false }, 500);
};

export const config = { path: '/api/webhook' };
