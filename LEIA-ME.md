# Profissional Edit: landing page + pagamento Mercado Pago

Este projeto já vem pronto para colocar no ar:

- **Versão A** em `/` e **versão B** em `/b/`, para o teste A/B nos anúncios.
- **Título adaptável ao vídeo do anúncio** pelo parâmetro `?v=`.
- **Checkout Pro do Mercado Pago**: Pix, cartão em até 12x e saldo/cartões salvos na conta Mercado Pago. O boleto fica desligado.
- **Checkout da Stripe (opcional)**: cartão, Apple Pay, Google Pay e Link, naquela tela de checkout limpa. Fica desligado até você ativar (passo 10).
- **Entrega automática:** o link de download aparece na página de obrigado e também vai por e-mail.
- **Pixel do Meta** com os eventos PageView, ViewContent, InitiateCheckout e Purchase.
- Modelos de termos de uso e política de privacidade.

Hospedagem: **Netlify**, que é grátis e permite uso comercial no plano gratuito.

---

## Estrutura

```
public/                 páginas (o que o visitante vê)
  index.html            versão A
  b/index.html          versão B
  obrigado/index.html   confirma o pagamento e libera o download
  termos/  privacidade/ textos legais (modelos)
  assets/config.js      <- coloque aqui o ID do Pixel
  assets/lp.js          título adaptável, links de compra e Pixel
  assets/demo.mp4       <- (você adiciona) vídeo da versão B
netlify/functions/      servidor
  checkout.mjs          /api/checkout  cria o pagamento e manda o cliente ao Mercado Pago
  verify.mjs            /api/verify    confere o pagamento (Mercado Pago ou Stripe) antes de liberar o download
  webhook.mjs           /api/webhook   recebe o aviso do Mercado Pago e envia o e-mail
  stripe-checkout.mjs   /api/stripe-checkout  abre o checkout da Stripe
  stripe-webhook.mjs    /api/stripe-webhook   recebe o aviso da Stripe e envia o e-mail
netlify/lib/            funções em comum (shared.mjs, stripe.mjs)
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

### 3. Subir o projeto (15 min)
1. Crie uma conta no **github.com**, depois um repositório **privado** e, em seguida, use **Add file > Upload files**. Arraste o **conteúdo** desta pasta, sem a pasta em volta.
2. Crie uma conta no **netlify.com**, clique em **Add new project > Import an existing project > GitHub** e escolha o repositório.
3. Não mude nada nas configurações de build, porque o `netlify.toml` já cuida disso. Clique em **Deploy**.

> O "arrastar e soltar" do Netlify (Netlify Drop) **não** publica as funções de pagamento. Use o GitHub.

### 4. Variáveis de ambiente
No Netlify, vá em **Project configuration > Environment variables > Add a variable**:

| Variável | Obrigatória | Exemplo |
|---|---|---|
| `MP_ACCESS_TOKEN` | sim | `APP_USR-...` (ou `TEST-...` durante o teste) |
| `DOWNLOAD_URL` | sim | link do Drive do passo 2 |
| `PRICE` | não (padrão 67) | `67` |
| `MP_WEBHOOK_SECRET` | recomendada | chave do passo 6 |
| `RESEND_API_KEY` | para o e-mail | `re_...` (passo 8) |
| `EMAIL_FROM` | para o e-mail | `Profissional Edit <entrega@seudominio.com.br>` |
| `SUPPORT_EMAIL` | não | `suporte@seudominio.com.br` |
| `STATEMENT_DESCRIPTOR` | não | `PROFEDIT` (nome que aparece na fatura do cartão) |
| `STRIPE_SECRET_KEY` | só com Stripe | `sk_live_...` (passo 10) |
| `STRIPE_WEBHOOK_SECRET` | só com Stripe | `whsec_...` (passo 10) |

**Depois de mudar qualquer variável:** vá em **Deploys > Trigger deploy > Deploy site**.

### 5. Domínio
No Netlify, abra **Domain management > Add a domain** e siga as instruções de DNS que ele mostra para o seu registrador (Registro.br, por exemplo). O HTTPS é ativado sozinho.

### 6. Webhook do Mercado Pago
1. Na sua aplicação do Mercado Pago, abra **Webhooks > Configurar notificações**.
2. Em **Modo produção**, use a URL `https://SEUDOMINIO/api/webhook`.
3. Marque o evento **Pagamentos** e salve.
4. Clique para revelar a **assinatura secreta**, copie e coloque em `MP_WEBHOOK_SECRET`. Faça um novo deploy.

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
