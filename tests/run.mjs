// Testes locais sem internet: simula a API do Mercado Pago e do Resend.
// Rode com:  node tests/run.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MP_ACCESS_TOKEN = 'TEST-token';
process.env.PRICE = '67';
process.env.DOWNLOAD_URL = 'https://exemplo.com/skill.zip';
process.env.MP_WEBHOOK_SECRET = 'segredo123';
process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_FROM = 'Profissional Edit <entrega@exemplo.com>';

const calls = [];
const payments = {
  '111': { id: 111, status: 'approved', transaction_amount: 67, currency_id: 'BRL', metadata: { product: 'profissional-edit' }, payer: { email: 'cliente@gmail.com' } },
  '222': { id: 222, status: 'pending', transaction_amount: 67, currency_id: 'BRL', metadata: { product: 'profissional-edit' } },
  '333': { id: 333, status: 'approved', transaction_amount: 5, currency_id: 'BRL', metadata: { product: 'outro' } }
};
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  const u = String(url);
  if (u === 'https://api.mercadopago.com/checkout/preferences') {
    const body = JSON.parse(opts.body);
    return new Response(JSON.stringify({ id: 'pref1', init_point: 'https://mp.test/pay?pref=pref1', _echo: body }), { status: 201 });
  }
  const m = u.match(/v1\/payments\/(\d+)/);
  if (m) {
    const p = payments[m[1]];
    return p ? new Response(JSON.stringify(p), { status: 200 }) : new Response('{}', { status: 404 });
  }
  if (u === 'https://api.resend.com/emails') return new Response('{"id":"e1"}', { status: 200 });
  throw new Error('fetch inesperado: ' + u);
};

const checkout = (await import('../netlify/functions/checkout.mjs')).default;
const verify = (await import('../netlify/functions/verify.mjs')).default;
const webhook = (await import('../netlify/functions/webhook.mjs')).default;
const { validSignature } = await import('../netlify/lib/shared.mjs');

// 1. Checkout cria a preferência certa e redireciona
let res = await checkout(new Request('https://site.com/api/checkout?src=b&v=jump-cut&utm_campaign=teste'));
assert.equal(res.status, 303);
assert.equal(res.headers.get('location'), 'https://mp.test/pay?pref=pref1');
const pref = JSON.parse(calls.at(-1).opts.body);
assert.equal(pref.items[0].unit_price, 67);
assert.equal(pref.items[0].currency_id, 'BRL');
assert.equal(pref.metadata.product, 'profissional-edit');
assert.equal(pref.metadata.video, 'jump-cut');
assert.equal(pref.metadata.utm_campaign, 'teste');
assert.equal(pref.back_urls.success, 'https://site.com/obrigado/');
assert.equal(pref.notification_url, 'https://site.com/api/webhook?source_news=webhooks');
assert.equal(pref.auto_return, 'approved');
assert.ok(pref.external_reference.startsWith('b-jump-cut-'));
console.log('ok  checkout');

// Parâmetros maliciosos são limpos
await checkout(new Request('https://site.com/api/checkout?src=<script>&v=../../x'));
const pref2 = JSON.parse(calls.at(-1).opts.body);
assert.equal(pref2.metadata.page, 'script');
assert.equal(pref2.metadata.video, 'x');
console.log('ok  checkout limpa parâmetros');

// 2. Verify
let d = await (await verify(new Request('https://site.com/api/verify?payment_id=111'))).json();
assert.equal(d.status, 'approved');
assert.equal(d.downloadUrl, 'https://exemplo.com/skill.zip');
assert.equal(d.emailHint, 'cl***@gmail.com');
d = await (await verify(new Request('https://site.com/api/verify?payment_id=222'))).json();
assert.equal(d.status, 'pending');
assert.equal(d.downloadUrl, undefined);
res = await verify(new Request('https://site.com/api/verify?payment_id=333'));
assert.equal(res.status, 403);
assert.equal((await res.json()).downloadUrl, undefined);
res = await verify(new Request('https://site.com/api/verify?payment_id=abc'));
assert.equal(res.status, 400);
res = await verify(new Request('https://site.com/api/verify?payment_id=999'));
assert.equal(res.status, 404);
console.log('ok  verify (aprovado, pendente, outro produto, inválido, inexistente)');

// 3. Assinatura do webhook, com o exemplo da documentação montado à mão
function sign(dataId, reqId, ts, secret) {
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  return `ts=${ts},v1=` + crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}
const sig = sign('111', 'req-abc', '1704908010', 'segredo123');
assert.equal(validSignature({ xSignature: sig, xRequestId: 'req-abc', dataId: '111', secret: 'segredo123' }), true);
assert.equal(validSignature({ xSignature: sig, xRequestId: 'req-abc', dataId: '112', secret: 'segredo123' }), false);
assert.equal(validSignature({ xSignature: sig, xRequestId: 'req-abc', dataId: '111', secret: 'errado' }), false);
assert.equal(validSignature({ xSignature: 'lixo', xRequestId: 'x', dataId: '1', secret: 's' }), false);
console.log('ok  assinatura do webhook');

// 4. Webhook aprovado -> envia e-mail com idempotência
const before = calls.length;
res = await webhook(new Request('https://site.com/api/webhook?source_news=webhooks&data.id=111&type=payment', {
  method: 'POST',
  headers: { 'x-signature': sig, 'x-request-id': 'req-abc', 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '111' } })
}));
assert.equal(res.status, 200);
const mail = calls.slice(before).find(c => c.url.includes('resend'));
assert.ok(mail, 'deveria enviar e-mail');
assert.equal(mail.opts.headers['Idempotency-Key'], 'pe-payment-111');
const mailBody = JSON.parse(mail.opts.body);
assert.deepEqual(mailBody.to, ['cliente@gmail.com']);
assert.ok(mailBody.html.includes('https://exemplo.com/skill.zip'));
console.log('ok  webhook aprovado envia e-mail');

// Webhook com assinatura errada é recusado
res = await webhook(new Request('https://site.com/api/webhook?data.id=111&type=payment', {
  method: 'POST', headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r' }, body: '{"type":"payment"}'
}));
assert.equal(res.status, 401);

// Webhook pendente não envia e-mail
const before2 = calls.length;
const sig2 = sign('222', 'r2', '1700000000', 'segredo123');
res = await webhook(new Request('https://site.com/api/webhook?data.id=222&type=payment', {
  method: 'POST', headers: { 'x-signature': sig2, 'x-request-id': 'r2' }, body: '{"type":"payment","data":{"id":"222"}}'
}));
assert.equal(res.status, 200);
assert.equal(calls.slice(before2).some(c => c.url.includes('resend')), false);
console.log('ok  webhook recusa assinatura falsa e ignora pendente');

// ---------------- Stripe ----------------
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
const { validStripeSignature, toForm } = await import('../netlify/lib/stripe.mjs');
const sessions = {
  cs_test_paidpaidpaid: { id: 'cs_test_paidpaidpaid', status: 'complete', payment_status: 'paid', currency: 'brl', amount_total: 6700, metadata: { product: 'profissional-edit' }, customer_details: { email: 'ana@gmail.com' }, payment_intent: 'pi_1' },
  cs_test_pixpendente: { id: 'cs_test_pixpendente', status: 'complete', payment_status: 'unpaid', currency: 'brl', amount_total: 6700, metadata: { product: 'profissional-edit' } },
  cs_test_baratobarato: { id: 'cs_test_baratobarato', status: 'complete', payment_status: 'paid', currency: 'brl', amount_total: 100, metadata: { product: 'profissional-edit' } }
};
const mpFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === 'https://api.stripe.com/v1/checkout/sessions') {
    calls.push({ url: u, opts });
    return new Response(JSON.stringify({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new' }), { status: 200 });
  }
  const m = u.match(/api\.stripe\.com\/v1\/checkout\/sessions\/(.+)$/);
  if (m) {
    calls.push({ url: u, opts });
    const s = sessions[m[1]];
    return s ? new Response(JSON.stringify(s), { status: 200 }) : new Response('{"error":{"message":"No such session"}}', { status: 404 });
  }
  return mpFetch(url, opts);
};

assert.equal(toForm({ a: [{ b: { c: 1 } }], d: 'x' }).toString(), 'a%5B0%5D%5Bb%5D%5Bc%5D=1&d=x');

const stripeCheckout = (await import('../netlify/functions/stripe-checkout.mjs')).default;
const stripeWebhook = (await import('../netlify/functions/stripe-webhook.mjs')).default;
res = await stripeCheckout(new Request('https://site.com/api/stripe-checkout?src=b&v=som&utm_content=ad1'));
assert.equal(res.status, 303);
assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_new');
const form = new URLSearchParams(calls.at(-1).opts.body);
assert.equal(form.get('mode'), 'payment');
assert.equal(form.get('line_items[0][price_data][currency]'), 'brl');
assert.equal(form.get('line_items[0][price_data][unit_amount]'), '6700');
assert.equal(form.get('metadata[product]'), 'profissional-edit');
assert.equal(form.get('metadata[video]'), 'som');
assert.equal(form.get('metadata[utm_content]'), 'ad1');
assert.equal(form.get('success_url'), 'https://site.com/obrigado/?session_id={CHECKOUT_SESSION_ID}');
assert.equal(form.get('cancel_url'), 'https://site.com/b/?v=som');
assert.equal(calls.at(-1).opts.headers.Authorization, 'Bearer sk_test_x');
console.log('ok  stripe checkout');

d = await (await verify(new Request('https://site.com/api/verify?session_id=cs_test_paidpaidpaid'))).json();
assert.equal(d.status, 'approved');
assert.equal(d.value, 67);
assert.equal(d.downloadUrl, 'https://exemplo.com/skill.zip');
d = await (await verify(new Request('https://site.com/api/verify?session_id=cs_test_pixpendente'))).json();
assert.equal(d.status, 'pending');
res = await verify(new Request('https://site.com/api/verify?session_id=cs_test_baratobarato'));
assert.equal(res.status, 403);
res = await verify(new Request('https://site.com/api/verify?session_id=../../v1/charges'));
assert.equal(res.status, 400);
console.log('ok  stripe verify (pago, pendente, valor errado, id malicioso)');

function stripeSign(body, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=` + crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}
const evt = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_paidpaidpaid' } } });
assert.equal(validStripeSignature(evt, stripeSign(evt, 'whsec_teste'), 'whsec_teste'), true);
assert.equal(validStripeSignature(evt + ' ', stripeSign(evt, 'whsec_teste'), 'whsec_teste'), false);
assert.equal(validStripeSignature(evt, stripeSign(evt, 'whsec_teste', 1000), 'whsec_teste'), false); // muito antigo

const b3 = calls.length;
res = await stripeWebhook(new Request('https://site.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': stripeSign(evt, 'whsec_teste') }, body: evt }));
assert.equal(res.status, 200);
const smail = calls.slice(b3).find(c => c.url.includes('resend'));
assert.ok(smail, 'stripe pago deveria enviar e-mail');
assert.deepEqual(JSON.parse(smail.opts.body).to, ['ana@gmail.com']);
assert.equal(smail.opts.headers['Idempotency-Key'], 'pe-stripe-cs_test_paidpaidpaid');

res = await stripeWebhook(new Request('https://site.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=abc' }, body: evt }));
assert.equal(res.status, 400);

const evt2 = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_pixpendente' } } });
const b4 = calls.length;
res = await stripeWebhook(new Request('https://site.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': stripeSign(evt2, 'whsec_teste') }, body: evt2 }));
assert.equal(res.status, 200);
assert.equal(calls.slice(b4).some(c => c.url.includes('resend')), false);
console.log('ok  stripe webhook (e-mail no pago, recusa assinatura, ignora pendente)');

console.log('\nTodos os testes passaram.');
