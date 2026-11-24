// GET /api/stripe-checkout?src=a&v=jump-cut
// Abre o checkout da Stripe: cartão, Apple Pay, Google Pay e Link (e Pix, se a sua conta tiver o convite).
// Os meios de pagamento exibidos são os ativados no painel da Stripe (Configurações > Formas de pagamento).
import { settings, PRODUCT_ID } from '../lib/shared.js';
import { stripeApi } from '../lib/stripe.js';

const clean = (s, max = 40) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max);

export default async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);
  const origin = url.origin;

  if (!cfg.stripeSecret) {
    return new Response('Checkout Stripe não configurado: defina STRIPE_SECRET_KEY na Cloudflare.', { status: 500 });
  }

  const src = clean(url.searchParams.get('src')) || 'a';
  const v = clean(url.searchParams.get('v')) || 'geral';
  const metadata = { product: PRODUCT_ID, page: src, video: v };
  for (const k of ['utm_source', 'utm_campaign', 'utm_content', 'utm_term']) {
    const val = url.searchParams.get(k);
    if (val) metadata[k] = String(val).slice(0, 60);
  }
  const orderId = crypto.randomUUID();
  metadata.order_id = orderId;
  const backTo = `${origin}${src === 'b' ? '/b/' : '/'}${v !== 'geral' ? `?v=${v}` : ''}`;

  let session;
  try {
    session = await stripeApi('checkout/sessions', cfg.stripeSecret, {
      method: 'POST',
      idempotencyKey: orderId,
      body: {
        mode: 'payment',
        locale: 'pt-BR',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(cfg.price * 100),
            product_data: {
              name: cfg.productName,
              description: 'Skill para o Claude: jump cut, efeitos de cenário, iluminação e efeitos sonoros'
            }
          }
        }],
        client_reference_id: `${src}-${v}-${orderId}`,
        metadata,
        payment_intent_data: { metadata },
        success_url: `${origin}/obrigado/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: backTo
      }
    });
  } catch (e) {
    console.error('Erro ao criar sessão Stripe', e.status, e.message);
    return new Response('Não foi possível abrir o pagamento agora. Tente novamente em instantes.', { status: 502 });
  }

  return new Response(null, { status: 303, headers: { Location: session.url, 'cache-control': 'no-store' } });
};

