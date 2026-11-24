// GET /api/checkout?src=a&v=jump-cut
// Cria uma preferência no Mercado Pago (Checkout Pro) e redireciona o comprador para pagar.
import { settings, PRODUCT_ID } from '../lib/shared.js';

const clean = (s, max = 40) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max);

export default async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);
  const origin = url.origin;

  if (!cfg.token) {
    return new Response('Checkout ainda não configurado: defina MP_ACCESS_TOKEN na Cloudflare.', { status: 500 });
  }

  const src = clean(url.searchParams.get('src')) || 'a';
  const v = clean(url.searchParams.get('v')) || 'geral';
  const utm = {};
  for (const k of ['utm_source', 'utm_campaign', 'utm_content', 'utm_term']) {
    const val = url.searchParams.get(k);
    if (val) utm[k] = String(val).slice(0, 60);
  }
  const orderId = crypto.randomUUID();

  const preference = {
    items: [{
      id: PRODUCT_ID,
      title: cfg.productName,
      description: 'Skill para o Claude: jump cut, efeitos de cenário, iluminação e efeitos sonoros',
      category_id: 'learnings',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: cfg.price
    }],
    external_reference: `${src}-${v}-${orderId}`,
    metadata: { product: PRODUCT_ID, page: src, video: v, order_id: orderId, ...utm },
    back_urls: {
      success: `${origin}/obrigado/`,
      pending: `${origin}/obrigado/`,
      failure: `${origin}/obrigado/`
    },
    auto_return: 'approved',
    notification_url: `${origin}/api/webhook?source_news=webhooks`,
    statement_descriptor: cfg.statementDescriptor,
    payment_methods: {
      // Boleto fica de fora: demora até 3 dias e quase ninguém conclui em produto de impulso.
      excluded_payment_types: [{ id: 'ticket' }],
      installments: 12
    },
    // A preferência vale por 24 horas.
    expires: true,
    expiration_date_to: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  };

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderId
    },
    body: JSON.stringify(preference)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Erro ao criar preferência', res.status, text);
    return new Response('Não foi possível abrir o pagamento agora. Tente novamente em instantes.', { status: 502 });
  }

  const data = await res.json();
  // Credenciais de teste devolvem só sandbox_init_point.
  const target = data.init_point || data.sandbox_init_point;
  return new Response(null, { status: 303, headers: { Location: target, 'cache-control': 'no-store' } });
};

