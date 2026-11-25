// Título adaptável ao anúncio, links de checkout e eventos do Pixel.
(function () {
  var cfg = window.LP_CONFIG || {};
  var params = new URLSearchParams(location.search);

  // 1. Pixel do Meta
  if (cfg.pixelId) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', cfg.pixelId);
    fbq('track', 'PageView');
  }
  function track(name, data, opts) {
    if (window.fbq) fbq('track', name, data || {}, opts || {});
  }
  window.LP_TRACK = track;

  // Páginas sem título adaptável (obrigado, termos) param aqui.
  var page = document.body.getAttribute('data-page');
  if (!page) return;

  // 2. Título conforme o anúncio: ?v=jump-cut | cenario | iluminacao | som
  var copy = window.LP_COPY || {};
  var v = (params.get('v') || '').toLowerCase();
  if (!copy[v]) v = 'geral';
  var c = copy[v];
  if (c) {
    Object.keys(c).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = c[id];
    });
  }

  // 3. Links de compra levam a página, o vídeo e as UTMs para o checkout
  var q = new URLSearchParams();
  q.set('src', page);
  q.set('v', v);
  ['utm_source', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
    if (params.get(k)) q.set(k, params.get(k).slice(0, 60));
  });
  var endpoints = { mercadopago: '/api/checkout?', stripe: '/api/stripe-checkout?' };
  var providers = (cfg.providers || ['mercadopago']).filter(function (p) { return endpoints[p]; });
  if (!providers.length) providers = ['mercadopago'];
  var urlFor = function (p) { return endpoints[p] + q.toString(); };
  var initiate = function (method) {
    track('InitiateCheckout', { value: cfg.price, currency: cfg.currency, content_name: 'Profissional Edit', payment_method: method });
  };

  var sheet = providers.length > 1 ? buildSheet() : null;
  document.querySelectorAll('a[data-buy]').forEach(function (a) {
    a.setAttribute('href', urlFor(providers[0]));
    a.addEventListener('click', function (e) {
      if (sheet) { e.preventDefault(); sheet.open(a); return; }
      initiate(providers[0]);
    });
  });

  // Janela de escolha: Pix (Mercado Pago) ou cartão/Apple Pay/Google Pay (Stripe)
  function buildSheet() {
    var css = document.createElement('style');
    css.textContent =
      '.pay-sheet{position:fixed;inset:0;z-index:50;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px)}' +
      '.pay-sheet.open{display:flex}' +
      '.pay-box{width:100%;max-width:460px;background:var(--card,#111);border:1px solid var(--line2,#333);border-radius:16px 16px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;font-family:Inter,system-ui,sans-serif;color:var(--ink,#fff)}' +
      '@media(min-width:600px){.pay-sheet{align-items:center}.pay-box{border-radius:16px}}' +
      '.pay-box h2{margin:0 0 4px;font-family:"Space Grotesk",sans-serif;font-size:22px;text-align:left}' +
      '.pay-opt{display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;border:1px solid var(--line2,#333);border-radius:10px;padding:16px;min-height:44px;transition:border-color .15s}' +
      '.pay-opt:hover,.pay-opt:focus-visible{border-color:var(--buy,#C6FF3D);outline:none}' +
      '.pay-opt.main{border-color:var(--buy,#C6FF3D)}' +
      '.pay-opt strong{display:block;font-size:17px}.pay-opt small{display:block;color:var(--dim,#999);font-size:14px}' +
      '.pay-opt svg{flex:none}' +
      '.pay-x{align-self:center;background:none;border:0;color:var(--dim,#999);font-size:15px;padding:12px;cursor:pointer}';
    document.head.appendChild(css);

    var labels = {
      mercadopago: ['Pix', 'Aprovação na hora · também aceita cartão',
        '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 9-9 9-9-9z"/><path d="M8.5 12l3.5-3.5 3.5 3.5-3.5 3.5z"/></svg>'],
      stripe: ['Cartão, Apple Pay ou Google Pay', 'Visa e Mastercard · pagamento em um toque',
        '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>']
    };

    var el = document.createElement('div');
    el.className = 'pay-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'pay-title');
    var html = '<div class="pay-box"><h2 id="pay-title">Como você prefere pagar?</h2>';
    providers.forEach(function (p, i) {
      html += '<a class="pay-opt' + (i === 0 ? ' main' : '') + '" data-provider="' + p + '" href="' + urlFor(p) + '">' +
        labels[p][2] + '<span><strong>' + labels[p][0] + '</strong><small>' + labels[p][1] + '</small></span></a>';
    });
    html += '<button type="button" class="pay-x">Voltar</button></div>';
    el.innerHTML = html;
    document.body.appendChild(el);

    var lastFocus = null;
    var close = function () { el.classList.remove('open'); if (lastFocus) lastFocus.focus(); };
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    el.querySelector('.pay-x').addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    el.querySelectorAll('.pay-opt').forEach(function (o) {
      o.addEventListener('click', function () { initiate(o.getAttribute('data-provider')); });
    });
    return {
      open: function (from) {
        lastFocus = from;
        el.classList.add('open');
        el.querySelector('.pay-opt').focus();
      }
    };
  }

  // 4. Barra fixa de compra no celular aparece depois que o primeiro botão sai da tela
  var sticky = document.querySelector('.sticky');
  if (sticky) {
    var onScroll = function () { sticky.classList.toggle('show', window.scrollY > 700); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  track('ViewContent', { value: cfg.price, currency: cfg.currency, content_name: 'Profissional Edit' });
})();
