# Profissional Edit: landing page + pagamento Mercado Pago

Este projeto já vem pronto para colocar no ar:

- **Versão A** em `/` e **versão B** em `/b/`, para o teste A/B nos anúncios.
- **Título adaptável ao vídeo do anúncio** pelo parâmetro `?v=`.
- **Checkout Pro do Mercado Pago**: Pix, cartão em até 12x e saldo/cartões salvos na conta Mercado Pago. O boleto fica desligado.
- **Checkout da Stripe (opcional)**: cartão, Apple Pay, Google Pay e Link, naquela tela de checkout limpa. Fica desligado até você ativar (passo 10).
- **Entrega automática:** o link de download aparece na página de obrigado e também vai por e-mail.
- **Pixel do Meta** com os eventos PageView, ViewContent, InitiateCheckout e Purchase.
- Modelos de termos de uso e política de privacidade.

Hospedagem: **Cloudflare Workers**, grátis, sem selo de propaganda e com uso comercial permitido. As páginas são servidas sem limite; a parte de pagamento tem até 100.000 requisições por dia no plano grátis.

---

## Estrutura

```
public/                 páginas (o que o visitante vê)
  index.html            versão A
  b/index.html          versão B
  obrigado/index.html   confirma o pagamento e libera o download
  termos/  privacidade/ textos legais
  assets/config.js      <- ID do Pixel e formas de pagamento
  assets/lp.js          título adaptável, links de compra e Pixel
  _headers              cabeçalhos (obrigado fora do Google)
src/worker.js           servidor: envia /api/* para os handlers e o resto para public/
src/handlers/           checkout, verify, webhook, stripe-checkout, stripe-webhook
src/lib/                funções em comum (Mercado Pago, Stripe, HMAC)
wrangler.jsonc          configuração da Cloudflare e valores públicos (PRICE etc.)
tests/run.mjs           testes (rode com: node tests/run.mjs)
```

---

## Passo a passo para colocar no ar

### 1. Mercado Pago (cerca de 10 min)
1. Entre em **mercadopago.com.br/developers**, depois em **Suas integrações > Criar aplicação**.
   - Tipo de solução: **Pagamentos on-line**, depois **Checkout Pro**.
2. Dentro da aplicação, abra **Credenciais de teste** e copie o **Access Token** (começa com `TEST-`). Ele serve para o teste do passo 7.
3. Depois, abra **Credenciais de produção**, ative-as e copie o **Access Token** de produção (começa com `APP_USR-`).

### 2. Arquivo da skill (5 min)
Suba o arquivo da skill (.zip com o guia de instalação dentro) no Google Drive ou no Dropbox e gere um link de compartilhamento do tipo **"qualquer pessoa com o link"**. Esse link é o `DOWNLOAD_URL` e só aparece para quem pagou.

### 3. Subir o projeto (Cloudflare)
1. Coloque estes arquivos num repositório do GitHub.
2. Em **dash.cloudflare.com**, vá em **Workers & Pages > Create > Import a repository**, conecte o GitHub e escolha o repositório.
3. Deixe o comando de deploy padrão (`npx wrangler deploy`). O `wrangler.jsonc` já diz tudo o que a Cloudflare precisa.
4. Cada push na branch `main` publica o site sozinho.

### 4. Variáveis
- **Valores públicos** (preço, e-mail de suporte, nome do produto) ficam no `wrangler.jsonc`, em `vars`. Para mudar o preço, edite `PRICE` ali e faça push.
- **Segredos** ficam só no painel: **Workers & Pages > profissional-edit > Settings > Variables and Secrets > Add**, com o tipo **Secret**:

| Segredo | Obrigatório | Exemplo |
|---|---|---|
| `MP_ACCESS_TOKEN` | sim | `APP_USR-...` |
| `MP_WEBHOOK_SECRET` | sim | assinatura do webhook (passo 6) |
| `DOWNLOAD_URL` | sim | link do arquivo da skill (fica fora do GitHub) |
| `RESEND_API_KEY` / `EMAIL_FROM` | para o e-mail | passo 8 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | só com Stripe | passo 10 |

Os segredos não somem quando o site é publicado de novo.

### 5. Domínio
No painel da Cloudflare, abra o Worker em **Settings > Domains & Routes > Add > Custom domain**. O domínio precisa estar na Cloudflare (dá para transferir o DNS de graça a partir do Registro.br). O HTTPS é ativado sozinho.

### 6. Webhook do Mercado Pago
1. Na sua aplicação do Mercado Pago, abra **Webhooks > Configurar notificações**.
2. Em **Modo produção**, use a URL `https://SEUDOMINIO/api/webhook`.
3. Marque o evento **Pagamentos** e salve.
4. Clique para revelar a **assinatura secreta**, copie e coloque em `MP_WEBHOOK_SECRET`. 

### 7. Teste antes de anunciar
1. Com o `MP_ACCESS_TOKEN` de **teste**, abra o site, clique em comprar e pague com um **cartão de teste** (a lista está na documentação do Checkout Pro) usando uma conta de comprador de teste.
2. Confira se você volta para `/obrigado/` e se o botão de download aparece.
3. Troque o token para o de **produção**, faça uma compra real de R$ 67 no Pix e confira a página de obrigado e o e-mail. Depois, devolva o valor pelo painel do Mercado Pago.

### 8. E-mail de entrega (Resend, grátis até 100 e-mails por dia)
1. Crie uma conta no **resend.com** e vá em **Domains > Add domain**, com o seu domínio. Adicione os registros DNS que ele mostra.
2. Em **API Keys**, crie uma chave e coloque em `RESEND_API_KEY`. Preencha também `EMAIL_FROM` com um endereço desse domínio.

Sem isso, o site funciona do mesmo jeito, mas quem pagar o Pix e fechar a aba antes de voltar ao site não recebe o link automaticamente. Nesse caso, você vê o pagamento no painel e envia o link à mão.

### 9. Pixel do Meta
1. Abra `public/assets/config.js` e coloque o ID do Pixel em `pixelId`.
2. No Gerenciador de Negócios, **verifique o domínio** e configure o evento **Purchase** como prioritário.
3. Use o **Meta Pixel Helper** (extensão do Chrome) para conferir os eventos.

### 10. Stripe: cartão, Apple Pay e Google Pay (opcional)
Dá para fazer depois do lançamento: até você ativar, a página usa só o Mercado Pago.

1. Crie a conta em **stripe.com/br** com o mesmo CPF ou CNPJ da sua conta bancária. A verificação pede documento e prova de vida, e o CPF/CNPJ **não pode ser trocado depois**. Por isso, decida antes se vai vender como pessoa física ou com CNPJ.
2. No painel, vá em **Configurações > Formas de pagamento** e confirme que **Cartões, Apple Pay, Google Pay e Link** estão ativos. No checkout hospedado da Stripe, Apple Pay e Google Pay não pedem configuração de domínio nem certificado.
3. Em **Desenvolvedores > Chaves de API**, copie a **chave secreta** para `STRIPE_SECRET_KEY`. Comece pela chave de teste (`sk_test_`).
4. Em **Desenvolvedores > Webhooks > Adicionar destino**, use a URL `https://SEUDOMINIO/api/stripe-webhook` com os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`. Copie a **chave de assinatura** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.
5. Em `public/assets/config.js`, troque para `providers: ['mercadopago', 'stripe']`. Ao clicar em comprar, o cliente escolhe entre **Pix** (Mercado Pago) e **Cartão, Apple Pay ou Google Pay** (Stripe).
6. Faça um novo deploy e teste com o cartão `4242 4242 4242 4242` (qualquer data futura e qualquer CVC) usando a chave de teste. Depois, troque para `sk_live_`.

Se a Stripe liberar o **Pix** na sua conta (hoje é só por convite), ele aparece sozinho no checkout dela. Aí você pode usar `providers: ['stripe']` e ficar só com a Stripe.

---

## Links para os anúncios

O parâmetro `v` troca o título para combinar com o vídeo do anúncio:

| Vídeo do anúncio | Versão A | Versão B |
|---|---|---|
| Geral | `https://SEUDOMINIO/` | `https://SEUDOMINIO/b/` |
| Jump cut | `/?v=jump-cut` | `/b/?v=jump-cut` |
| Cenário | `/?v=cenario` | `/b/?v=cenario` |
| Iluminação | `/?v=iluminacao` | `/b/?v=iluminacao` |
| Efeitos sonoros | `/?v=som` | `/b/?v=som` |

No campo **Parâmetros de URL** do anúncio no Meta, cole:
```
utm_source=meta&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```
A página, o vídeo e as UTMs ficam gravados no pagamento (em `metadata` e `external_reference`). Assim, dá para ver no Mercado Pago qual anúncio vendeu.

Para mudar os textos de cada variação, edite o bloco `window.LP_COPY` no fim de `index.html` e de `b/index.html`.

---

## O que ainda falta preencher
Procure por `[` nos arquivos HTML:
- plano do Claude necessário e se funciona no celular;
- nível de edição exigido (FAQ da versão A);
- bônus ou atualizações, se houver;
- nome ou empresa, CNPJ ou CPF e e-mail de suporte (rodapés, termos, privacidade, obrigado);
- data nos termos e na política de privacidade;
- `public/assets/demo.mp4` e `demo.jpg` (vídeo e capa da versão B). Até você adicionar, aparece um espaço reservado.

## Limitações conhecidas
- **Apple Pay e Google Pay só pela Stripe.** No Mercado Pago, o Apple Pay exige liberação pelo time comercial e o Google Pay só aparece documentado para lojas VTEX.
- **Na Stripe Brasil, o cartão aceita só Visa e Mastercard**, sem Elo, Amex ou Hipercard. Quem tiver outra bandeira paga pelo Mercado Pago.
- **O link de download pode ser repassado** por quem comprou, como acontece com qualquer arquivo digital.
- **Só o Pixel no navegador.** Bloqueadores de anúncio e o iOS perdem parte dos eventos. A API de Conversões do Meta é um próximo passo.
