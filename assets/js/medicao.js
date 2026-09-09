/* Medição do funil: onde o cliente entra, o que ele monta e onde desiste.
   Sem isso a fábrica não tem como saber se o problema é a vitrine, o preço
   sob consulta ou a etapa da arte.

   Enquanto não houver conta configurada em dados/produtos.json → medicao,
   nada é carregado e nada é enviado. O site não fica mais pesado por existir
   esta camada. */

let configurada = false;
let temGoogle = false;
let temMeta = false;

function carregarScript(endereco) {
  const script = document.createElement("script");
  script.async = true;
  script.src = endereco;
  document.head.append(script);
}

/** Liga a medição com o que estiver preenchido no catálogo. */
export function prepararMedicao(catalogo) {
  if (configurada) return;
  configurada = true;

  const config = (catalogo && catalogo.medicao) || {};
  const google = (config.google_analytics || "").trim();
  const meta = (config.meta_pixel || "").trim();

  if (google) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", google);
    carregarScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google)}`);
    temGoogle = true;
  }

  if (meta) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", meta);
    window.fbq("track", "PageView");
    temMeta = true;
  }
}

/** Registra um passo do cliente. Nome em português, para o relatório ser
    lido por quem toca a fábrica, não por quem programa. */
export function registrar(nome, dados = {}) {
  if (temGoogle && window.gtag) window.gtag("event", nome, dados);
  if (temMeta && window.fbq) window.fbq("trackCustom", nome, dados);
}

/** O pedido enviado é a conversão: vale registrar como evento de negócio. */
export function registrarPedidoEnviado(pedido) {
  const pecas = pedido.itens.reduce((soma, item) => soma + item.quantidade, 0);
  const valor = pedido.itens.reduce((soma, item) => soma + (item.total || 0), 0);
  const semPreco = pedido.itens.some((item) => item.total === null);

  registrar("enviou_pedido_whatsapp", {
    itens: pedido.itens.length,
    pecas,
    valor: semPreco ? 0 : valor,
    sob_consulta: semPreco,
    modelos: pedido.itens.map((item) => item.id).join(","),
  });

  if (temMeta && window.fbq && !semPreco) {
    window.fbq("track", "Lead", { value: valor, currency: "BRL" });
  }
}
