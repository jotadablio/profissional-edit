// Entrada do Worker da Cloudflare.
// As páginas (pasta public/) são servidas direto pela Cloudflare; só /api/* chega aqui.
import checkout from './handlers/checkout.js';
import verify from './handlers/verify.js';
import webhook from './handlers/webhook.js';
import stripeCheckout from './handlers/stripe-checkout.js';
import stripeWebhook from './handlers/stripe-webhook.js';

const routes = {
  '/api/checkout': checkout,
  '/api/verify': verify,
  '/api/webhook': webhook,
  '/api/stripe-checkout': stripeCheckout,
  '/api/stripe-webhook': stripeWebhook
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const handler = routes[pathname.replace(/\/$/, '')];
    if (handler) {
      try {
        return await handler(request, env);
      } catch (e) {
        console.error('erro em', pathname, e && e.stack || e);
        return new Response('Erro interno. Tente novamente em instantes.', { status: 500 });
      }
    }
    // Qualquer outro caminho: arquivos da pasta public/
    return env.ASSETS.fetch(request);
  }
};
