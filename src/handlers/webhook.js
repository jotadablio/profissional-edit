// POST /api/webhook  (notificações do Mercado Pago)
// Quando um pagamento desta skill é aprovado, envia o link de download por e-mail (se o Resend estiver configurado).
// Isso cobre quem paga o Pix e fecha a aba antes de voltar ao site.
import { settings, getPayment, checkPayment, validSignature, sendDeliveryEmail, json } from '../lib/shared.js';

export default async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);

  let body = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }

  const type = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const dataId = url.searchParams.get('data.id') || body?.data?.id || '';

  // Assinatura do Mercado Pago. O ID vem na URL (data.id) ou só no corpo, conforme a origem do aviso,
  // então testamos os dois. Mesmo sem assinatura válida, nada é liberado com base no aviso:
  // o pagamento é sempre consultado direto na API com o nosso token. Por isso só registramos o alerta
  // em vez de recusar (recusar faria o Mercado Pago marcar a entrega como falha e tentar de novo).
  if (cfg.webhookSecret) {
    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');
    const candidates = [...new Set([url.searchParams.get('data.id') || '', String(body?.data?.id || '')])];
    let ok = false;
    for (const id of candidates) {
      if (await validSignature({ xSignature, xRequestId, dataId: id, secret: cfg.webhookSecret })) { ok = true; break; }
    }
    if (!ok) console.warn('webhook: assinatura não confere (conferindo o pagamento direto na API)', dataId);
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

