var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/crypto.js
var enc = new TextEncoder();
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");

// src/lib/shared.js
var PRODUCT_ID = "profissional-edit";
function settings(env = {}) {
  const get = /* @__PURE__ */ __name((name, fallback = "") => {
    const v = env[name];
    return v === void 0 || v === null || v === "" ? fallback : String(v);
  }, "get");
  return {
    token: get("MP_ACCESS_TOKEN"),
    price: Number(get("PRICE", "67")),
    productName: get("PRODUCT_NAME", "Profissional Edit - Skill de edi\xE7\xE3o de v\xEDdeo para Claude"),
    downloadUrl: get("DOWNLOAD_URL"),
    webhookSecret: get("MP_WEBHOOK_SECRET"),
    resendKey: get("RESEND_API_KEY"),
    emailFrom: get("EMAIL_FROM"),
    supportEmail: get("SUPPORT_EMAIL"),
    statementDescriptor: get("STATEMENT_DESCRIPTOR", "PROFEDIT"),
    stripeSecret: get("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: get("STRIPE_WEBHOOK_SECRET")
  };
}
__name(settings, "settings");
async function sendDeliveryEmail(cfg, { to, orderId, idempotencyKey }) {
  if (!(cfg.resendKey && cfg.emailFrom && cfg.downloadUrl && to)) {
    console.warn("pagamento aprovado, mas o e-mail de entrega n\xE3o est\xE1 configurado", orderId);
    return true;
  }
  const support = cfg.supportEmail ? `<p style="color:#555">D\xFAvidas ou reembolso (at\xE9 7 dias): ${cfg.supportEmail}</p>` : "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from: cfg.emailFrom,
      to: [to],
      reply_to: cfg.supportEmail || void 0,
      subject: "Seu acesso \xE0 Profissional Edit",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">Obrigado pela compra!</h2>
  <p>Seu pagamento foi aprovado. Baixe a skill e siga o passo a passo de instala\xE7\xE3o que est\xE1 no arquivo.</p>
  <p style="margin:24px 0"><a href="${cfg.downloadUrl}" style="background:#C6FF3D;color:#06080C;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Baixar a Profissional Edit</a></p>
  <p style="color:#555">Pedido: ${orderId}</p>
  ${support}
</div>`,
      text: `Obrigado pela compra!

Baixe a Profissional Edit aqui: ${cfg.downloadUrl}

Pedido: ${orderId}` + (cfg.supportEmail ? `
D\xFAvidas ou reembolso (7 dias): ${cfg.supportEmail}` : "")
    })
  });
  if (!res.ok && res.status !== 409) {
    console.error("falha no e-mail", res.status, await res.text());
    return false;
  }
  return true;
}
__name(sendDeliveryEmail, "sendDeliveryEmail");
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });
}
__name(json, "json");
async function getPayment(id, token) {
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
__name(getPayment, "getPayment");
function checkPayment(p, price) {
  const isProduct = p?.metadata?.product === PRODUCT_ID;
  const amountOk = Number(p?.transaction_amount) >= price - 0.01 && p?.currency_id === "BRL";
  return {
    isProduct,
    amountOk,
    status: p?.status,
    approved: isProduct && amountOk && p?.status === "approved"
  };
}
__name(checkPayment, "checkPayment");
async function validSignature({ xSignature, xRequestId, dataId, secret }) {
  if (!xSignature || !secret) return false;
  let ts = "", v1 = "";
  for (const part of xSignature.split(",")) {
    const [k, val] = part.split("=").map((s) => (s || "").trim());
    if (k === "ts") ts = val;
    if (k === "v1") v1 = val;
  }
  if (!ts || !v1) return false;
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(await hmacHex(secret, manifest), v1);
}
__name(validSignature, "validSignature");

// src/handlers/checkout.js
var clean = /* @__PURE__ */ __name((s, max = 40) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, max), "clean");
var checkout_default = /* @__PURE__ */ __name(async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);
  const origin = url.origin;
  if (!cfg.token) {
    return new Response("Checkout ainda n\xE3o configurado: defina MP_ACCESS_TOKEN na Cloudflare.", { status: 500 });
  }
  const src = clean(url.searchParams.get("src")) || "a";
  const v = clean(url.searchParams.get("v")) || "geral";
  const utm = {};
  for (const k of ["utm_source", "utm_campaign", "utm_content", "utm_term"]) {
    const val = url.searchParams.get(k);
    if (val) utm[k] = String(val).slice(0, 60);
  }
  const orderId = crypto.randomUUID();
  const preference = {
    items: [{
      id: PRODUCT_ID,
      title: cfg.productName,
      description: "Skill para o Claude: jump cut, efeitos de cen\xE1rio, ilumina\xE7\xE3o e efeitos sonoros",
      category_id: "learnings",
      quantity: 1,
      currency_id: "BRL",
      unit_price: cfg.price
    }],
    external_reference: `${src}-${v}-${orderId}`,
    metadata: { product: PRODUCT_ID, page: src, video: v, order_id: orderId, ...utm },
    back_urls: {
      success: `${origin}/obrigado/`,
      pending: `${origin}/obrigado/`,
      failure: `${origin}/obrigado/`
    },
    auto_return: "approved",
    notification_url: `${origin}/api/webhook?source_news=webhooks`,
    statement_descriptor: cfg.statementDescriptor,
    payment_methods: {
      // Boleto fica de fora: demora até 3 dias e quase ninguém conclui em produto de impulso.
      excluded_payment_types: [{ id: "ticket" }],
      installments: 12
    },
    // A preferência vale por 24 horas.
    expires: true,
    expiration_date_to: new Date(Date.now() + 24 * 3600 * 1e3).toISOString()
  };
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": orderId
    },
    body: JSON.stringify(preference)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Erro ao criar prefer\xEAncia", res.status, text);
    return new Response("N\xE3o foi poss\xEDvel abrir o pagamento agora. Tente novamente em instantes.", { status: 502 });
  }
  const data = await res.json();
  const target = data.init_point || data.sandbox_init_point;
  return new Response(null, { status: 303, headers: { Location: target, "cache-control": "no-store" } });
}, "default");

// src/lib/stripe.js
function toForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0 || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") toForm(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
__name(toForm, "toForm");
async function stripeApi(path, secret, { method = "GET", body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${secret}` };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    body: body ? toForm(body).toString() : void 0
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
__name(stripeApi, "stripeApi");
function checkSession(s, price) {
  const isProduct = s?.metadata?.product === PRODUCT_ID;
  const amountOk = s?.currency === "brl" && Number(s?.amount_total) >= Math.round(price * 100);
  return {
    isProduct,
    amountOk,
    paid: isProduct && amountOk && s?.payment_status === "paid",
    // Pix e outros meios assíncronos: sessão concluída, pagamento ainda não caiu
    pending: s?.status === "complete" && s?.payment_status === "unpaid",
    expired: s?.status === "expired"
  };
}
__name(checkSession, "checkSession");
async function validStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  let t = "";
  const v1s = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v;
    if (k === "v1") v1s.push(v);
  }
  if (!t || !v1s.length) return false;
  if (Math.abs(now / 1e3 - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1s.some((v) => safeEqual(expected, v));
}
__name(validStripeSignature, "validStripeSignature");

// src/handlers/verify.js
var verify_default = /* @__PURE__ */ __name(async (req, env) => {
  const cfg = settings(env);
  const q = new URL(req.url).searchParams;
  const sessionId = q.get("session_id");
  if (sessionId) return verifyStripe(cfg, sessionId);
  const id = q.get("payment_id") || "";
  if (!/^\d{1,20}$/.test(id)) return json({ status: "invalid" }, 400);
  if (!cfg.token) return json({ status: "error", message: "MP_ACCESS_TOKEN n\xE3o configurado" }, 500);
  let p;
  try {
    p = await getPayment(id, cfg.token);
  } catch (e) {
    return json({ status: e.status === 404 ? "not_found" : "error" }, e.status === 404 ? 404 : 502);
  }
  const check = checkPayment(p, cfg.price);
  if (!check.isProduct || !check.amountOk) return json({ status: "invalid" }, 403);
  if (check.approved) {
    return json({
      status: "approved",
      downloadUrl: cfg.downloadUrl || null,
      value: Number(p.transaction_amount),
      paymentId: String(p.id),
      emailHint: maskEmail(p.payer?.email)
    });
  }
  return json({ status: check.status || "unknown" });
}, "default");
async function verifyStripe(cfg, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return json({ status: "invalid" }, 400);
  if (!cfg.stripeSecret) return json({ status: "error", message: "STRIPE_SECRET_KEY n\xE3o configurado" }, 500);
  let s;
  try {
    s = await stripeApi(`checkout/sessions/${sessionId}`, cfg.stripeSecret);
  } catch (e) {
    return json({ status: e.status === 404 ? "not_found" : "error" }, e.status === 404 ? 404 : 502);
  }
  const check = checkSession(s, cfg.price);
  if (!check.isProduct || !check.amountOk) return json({ status: "invalid" }, 403);
  if (check.paid) {
    return json({
      status: "approved",
      downloadUrl: cfg.downloadUrl || null,
      value: s.amount_total / 100,
      paymentId: String(s.payment_intent || s.id),
      emailHint: maskEmail(s.customer_details?.email)
    });
  }
  if (check.expired) return json({ status: "cancelled" });
  return json({ status: "pending" });
}
__name(verifyStripe, "verifyStripe");
function maskEmail(e) {
  if (!e || !e.includes("@")) return null;
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}***@${d}`;
}
__name(maskEmail, "maskEmail");

// src/handlers/webhook.js
var webhook_default = /* @__PURE__ */ __name(async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);
  let body = {};
  try {
    body = await req.json();
  } catch {
  }
  const type = body.type || url.searchParams.get("type") || url.searchParams.get("topic");
  const dataId = url.searchParams.get("data.id") || body?.data?.id || "";
  if (cfg.webhookSecret) {
    const ok = await validSignature({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId: String(url.searchParams.get("data.id") || ""),
      secret: cfg.webhookSecret
    });
    if (!ok) return json({ ok: false, reason: "assinatura inv\xE1lida" }, 401);
  }
  if (type !== "payment" || !/^\d{1,20}$/.test(String(dataId))) return json({ ok: true, ignored: true });
  let p;
  try {
    p = await getPayment(dataId, cfg.token);
  } catch (e) {
    console.error("webhook: falha ao consultar pagamento", dataId, e.message);
    return json({ ok: false }, 500);
  }
  const check = checkPayment(p, cfg.price);
  console.log("webhook", JSON.stringify({ id: p.id, status: p.status, product: check.isProduct }));
  if (!check.approved) return json({ ok: true });
  const sent = await sendDeliveryEmail(cfg, {
    to: p.payer?.email,
    orderId: String(p.id),
    idempotencyKey: `pe-payment-${p.id}`
  });
  return sent ? json({ ok: true }) : json({ ok: false }, 500);
}, "default");

// src/handlers/stripe-checkout.js
var clean2 = /* @__PURE__ */ __name((s, max = 40) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, max), "clean");
var stripe_checkout_default = /* @__PURE__ */ __name(async (req, env) => {
  const cfg = settings(env);
  const url = new URL(req.url);
  const origin = url.origin;
  if (!cfg.stripeSecret) {
    return new Response("Checkout Stripe n\xE3o configurado: defina STRIPE_SECRET_KEY na Cloudflare.", { status: 500 });
  }
  const src = clean2(url.searchParams.get("src")) || "a";
  const v = clean2(url.searchParams.get("v")) || "geral";
  const metadata = { product: PRODUCT_ID, page: src, video: v };
  for (const k of ["utm_source", "utm_campaign", "utm_content", "utm_term"]) {
    const val = url.searchParams.get(k);
    if (val) metadata[k] = String(val).slice(0, 60);
  }
  const orderId = crypto.randomUUID();
  metadata.order_id = orderId;
  const backTo = `${origin}${src === "b" ? "/b/" : "/"}${v !== "geral" ? `?v=${v}` : ""}`;
  let session;
  try {
    session = await stripeApi("checkout/sessions", cfg.stripeSecret, {
      method: "POST",
      idempotencyKey: orderId,
      body: {
        mode: "payment",
        locale: "pt-BR",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: Math.round(cfg.price * 100),
            product_data: {
              name: cfg.productName,
              description: "Skill para o Claude: jump cut, efeitos de cen\xE1rio, ilumina\xE7\xE3o e efeitos sonoros"
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
    console.error("Erro ao criar sess\xE3o Stripe", e.status, e.message);
    return new Response("N\xE3o foi poss\xEDvel abrir o pagamento agora. Tente novamente em instantes.", { status: 502 });
  }
  return new Response(null, { status: 303, headers: { Location: session.url, "cache-control": "no-store" } });
}, "default");

// src/handlers/stripe-webhook.js
var stripe_webhook_default = /* @__PURE__ */ __name(async (req, env) => {
  const cfg = settings(env);
  const raw = await req.text();
  if (!await validStripeSignature(raw, req.headers.get("stripe-signature"), cfg.stripeWebhookSecret)) {
    return json({ ok: false, reason: "assinatura inv\xE1lida" }, 400);
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  const relevant = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (!relevant.includes(event.type)) return json({ ok: true, ignored: true });
  let s;
  try {
    s = await stripeApi(`checkout/sessions/${encodeURIComponent(event.data.object.id)}`, cfg.stripeSecret);
  } catch (e) {
    console.error("stripe-webhook: falha ao consultar sess\xE3o", e.message);
    return json({ ok: false }, 500);
  }
  const check = checkSession(s, cfg.price);
  console.log("stripe-webhook", JSON.stringify({ id: s.id, type: event.type, payment_status: s.payment_status, product: check.isProduct }));
  if (!check.paid) return json({ ok: true });
  const sent = await sendDeliveryEmail(cfg, {
    to: s.customer_details?.email,
    orderId: s.payment_intent || s.id,
    idempotencyKey: `pe-stripe-${s.id}`
  });
  return sent ? json({ ok: true }) : json({ ok: false }, 500);
}, "default");

// src/worker.js
var routes = {
  "/api/checkout": checkout_default,
  "/api/verify": verify_default,
  "/api/webhook": webhook_default,
  "/api/stripe-checkout": stripe_checkout_default,
  "/api/stripe-webhook": stripe_webhook_default
};
var worker_default = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const handler = routes[pathname.replace(/\/$/, "")];
    if (handler) {
      try {
        return await handler(request, env);
      } catch (e) {
        console.error("erro em", pathname, e && e.stack || e);
        return new Response("Erro interno. Tente novamente em instantes.", { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-A2nhzw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-A2nhzw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
