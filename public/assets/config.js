// Configuração da landing page. Edite só este arquivo.
window.LP_CONFIG = {
  // ID do seu Pixel do Meta (Gerenciador de Eventos > Fontes de dados). Deixe '' para desligar.
  pixelId: '',
  // Preço exibido e enviado ao Pixel. O preço cobrado de verdade fica na variável PRICE do servidor.
  price: 67,
  currency: 'BRL',
  // Formas de pagamento oferecidas no botão de compra:
  //   ['mercadopago']            -> vai direto para o Mercado Pago (Pix e cartão)
  //   ['mercadopago', 'stripe']  -> abre uma escolha: Pix (Mercado Pago) ou cartão/Apple Pay/Google Pay (Stripe)
  //   ['stripe']                 -> vai direto para a Stripe
  providers: ['mercadopago']
};
