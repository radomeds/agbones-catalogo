/* Faz o conteúdo aparecer conforme o cliente rola a página.
 *
 * O site antigo tinha isso pelo Elementor, que traz junto meia dúzia de
 * bibliotecas. Aqui é IntersectionObserver puro: o navegador avisa quando o
 * elemento entra na tela, a gente marca uma classe e o CSS cuida do resto.
 *
 * Três cuidados que decidem se a animação ajuda ou atrapalha:
 *
 * 1. Sem JavaScript — ou se ele falhar — o conteúdo tem que aparecer do mesmo
 *    jeito. Por isso quem esconde é a classe `entra`, posta por este arquivo,
 *    e não o CSS sozinho.
 * 2. Quem pediu menos movimento no aparelho não recebe animação nenhuma.
 * 3. O que já está na primeira tela aparece na hora, sem esperar rolagem:
 *    animar o que o cliente já está olhando parece defeito, não capricho.
 */

const MENOS_MOVIMENTO = window.matchMedia("(prefers-reduced-motion: reduce)");

/* Cada seção anima o que interessa nela. Um seletor por vez, para o efeito
   ser o de um bloco entrando — e não o de trinta coisas piscando juntas. */
/* Duas coisas ficam de fora de propósito. A faixa de marcas: os logos andam
   num trilho com overflow escondido, e boa parte deles nunca cruza a tela — o
   vigia nunca os liberaria e ficariam transparentes para sempre. E as fotos e
   depoimentos das tiras, pelo mesmo motivo: quem está deslocado para o lado,
   fora da janela da tira, não cruza a tela. Nesses casos quem entra é a tira
   inteira, de uma vez. */
const ALVOS = [
  ".secao__titulo",
  ".secao__linha",
  ".modelo",
  ".passo",
  ".cartao-condicao",
  ".fabrica__item",
  ".tira",
  ".insta__item",
  ".sobre",
  ".faq details",
  ".ficha__figura",
  ".ficha__texto",
  ".ficha__tecnicas",
];

export function prepararAnimacoes() {
  if (MENOS_MOVIMENTO.matches) return;

  const elementos = document.querySelectorAll(ALVOS.join(", "));
  if (!elementos.length) return;

  const vigia = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add("entrou");
      vigia.unobserve(entrada.target);
    });
  }, {
    // basta um fio do elemento aparecer. Com um limite maior, quem fica
    // colado no rodapé nunca chega a cruzá-lo e some da página para sempre
    threshold: 0,
    rootMargin: "0px 0px -24px 0px",
  });

  /* Rede de segurança: chegou ao fim da página, o que sobrou entra. Sem isto,
     um elemento que o vigia não pegou fica invisível e o cliente perde
     conteúdo — animação nunca pode esconder nada de verdade. */
  const liberarOResto = () => {
    const perto = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    if (!perto) return;
    document.querySelectorAll(".entra:not(.entrou)").forEach((elemento) => {
      elemento.classList.add("entrou");
      vigia.unobserve(elemento);
    });
    window.removeEventListener("scroll", liberarOResto);
  };
  window.addEventListener("scroll", liberarOResto, { passive: true });

  const alturaDaTela = window.innerHeight;
  elementos.forEach((elemento, indice) => {
    const jaVisivel = elemento.getBoundingClientRect().top < alturaDaTela;
    if (jaVisivel) {
      elemento.classList.add("entra", "entrou");
      return;
    }
    elemento.classList.add("entra");
    // vizinhos entram em fila, não todos de uma vez. O teto é baixo de
    // propósito: um cartão que demora meio segundo para chegar irrita
    const posicaoNaLinha = indice % 4;
    if (posicaoNaLinha) elemento.style.setProperty("--atraso", `${posicaoNaLinha * 70}ms`);
    vigia.observe(elemento);
  });
}

/* O título do topo ganha um traço desenhado por baixo da última palavra,
   como no site antigo. É um SVG, então acompanha a fonte em qualquer tamanho
   e não borra em tela grande. */
export function grifarTitulo(seletor, palavras = 1) {
  if (MENOS_MOVIMENTO.matches) return;
  const titulo = document.querySelector(seletor);
  if (!titulo || titulo.dataset.grifado) return;

  /* Mexe só no último pedaço de texto do título. Reescrever o título inteiro
     apagaria o que já estiver dentro dele — foi assim que o grifo engoliu a
     palavra que troca sozinha. */
  const ultimoTexto = [...titulo.childNodes]
    .reverse()
    .find((no) => no.nodeType === Node.TEXT_NODE && no.textContent.trim());
  if (!ultimoTexto) return;

  const pedacos = ultimoTexto.textContent.trim().split(/\s+/);
  if (pedacos.length <= palavras) return;
  const antes = pedacos.slice(0, -palavras).join(" ");
  const grifado = pedacos.slice(-palavras).join(" ");

  ultimoTexto.textContent = `${antes} `;
  const marca = document.createElement("span");
  marca.className = "grifo";
  marca.textContent = grifado;
  marca.insertAdjacentHTML("beforeend",
    '<svg class="grifo__traco" viewBox="0 0 300 22" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M4 14c48-7 96-10 146-9 47 1 94 5 146 12" fill="none" stroke="currentColor" ' +
    'stroke-width="7" stroke-linecap="round"/></svg>');
  ultimoTexto.after(marca);
  titulo.dataset.grifado = "sim";

  // o traço só é desenhado quando o título aparece, senão a animação passa
  // enquanto a página ainda está carregando e ninguém vê
  requestAnimationFrame(() => marca.classList.add("grifo--desenhado"));
}

/* ---------- Movimento contínuo ---------- */

/* A primeira palavra do título troca sozinha: bonés, chapéus, viseiras. É o
   "animated headline" do site antigo. O texto completo fica no HTML, então o
   Google e quem está sem JavaScript leem a frase inteira do mesmo jeito. */
export function rodizioDePalavras(seletor, segundos = 2.4) {
  const alvo = document.querySelector(seletor);
  if (!alvo) return;
  const palavras = (alvo.dataset.palavras || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (palavras.length < 2 || MENOS_MOVIMENTO.matches) return;

  /* Travar a largura na maior opção evita o título pular a cada troca. Só
     vale para palavra solta: se a opção tem mais de uma palavra, ela quebra
     em duas linhas e a largura travada empurraria o resto do título. */
  if (!palavras.some((palavra) => palavra.includes(" "))) {
    const medidor = document.createElement("span");
    medidor.className = alvo.className;
    medidor.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
    alvo.parentNode.append(medidor);
    let maior = 0;
    palavras.forEach((palavra) => {
      medidor.textContent = palavra;
      maior = Math.max(maior, medidor.offsetWidth);
    });
    medidor.remove();
    alvo.style.minWidth = `${Math.ceil(maior)}px`;
  }

  let atual = 0;
  setInterval(() => {
    alvo.classList.add("rodizio--saindo");
    setTimeout(() => {
      atual = (atual + 1) % palavras.length;
      alvo.textContent = palavras[atual];
      alvo.classList.remove("rodizio--saindo");
    }, 260);
  }, segundos * 1000);
}

/* Os números da primeira tela contam de zero até o valor. Chama atenção para
   o que a fábrica tem de melhor: 25 anos e 20 dias úteis. */
export function contarNumeros(seletor = "[data-contar]") {
  const numeros = document.querySelectorAll(seletor);
  if (!numeros.length) return;

  const animar = (elemento) => {
    const alvo = Number(elemento.dataset.contar);
    const sufixo = elemento.dataset.sufixo || "";
    if (!alvo || MENOS_MOVIMENTO.matches) return;
    const duracao = 900;
    const inicio = performance.now();
    const passo = (agora) => {
      const parte = Math.min(1, (agora - inicio) / duracao);
      // desacelera no fim: parar de supetão parece travamento
      const suave = 1 - Math.pow(1 - parte, 3);
      elemento.textContent = Math.round(alvo * suave) + sufixo;
      if (parte < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };

  const vigia = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      animar(entrada.target);
      vigia.unobserve(entrada.target);
    });
  }, { threshold: 0.5 });
  numeros.forEach((numero) => vigia.observe(numero));
}

/* A tira anda sozinha, devagar, e para assim que o cliente encosta nela.
   Sem a parada, quem tenta ler um depoimento fica brigando com a página. */
export function girarTira(seletor, segundos = 4.5) {
  const tira = document.querySelector(seletor);
  if (!tira || MENOS_MOVIMENTO.matches) return;

  let parado = false;
  ["pointerdown", "pointerenter", "focusin", "touchstart"].forEach((evento) =>
    tira.addEventListener(evento, () => { parado = true; }, { passive: true }));
  ["pointerleave", "focusout"].forEach((evento) =>
    tira.addEventListener(evento, () => { parado = false; }, { passive: true }));

  setInterval(() => {
    if (parado || document.hidden) return;
    // no desktop a tira não rola (vira grade): aí não há o que girar
    const sobra = tira.scrollWidth - tira.clientWidth;
    if (sobra < 20) return;
    const proximo = tira.scrollLeft + tira.clientWidth * 0.8;
    tira.scrollTo({ left: proximo >= sobra - 4 ? 0 : proximo, behavior: "smooth" });
  }, segundos * 1000);
}

/* A faixa de marcas desliza sem parar, como um letreiro. Para isso a lista é
   duplicada: quando a primeira cópia sai da tela, a segunda já está no lugar
   e o corte não aparece. */
export function desfilarMarcas(seletor) {
  const faixa = document.querySelector(seletor);
  if (!faixa || MENOS_MOVIMENTO.matches) return;
  if (faixa.dataset.desfilando) return;

  const originais = [...faixa.children];
  if (originais.length < 3) return;

  /* Quem anda é um trilho dentro da faixa, não a faixa. Com a faixa andando,
     ela precisava ser mais larga que a tela — e aí a página inteira ganhava
     barra de rolagem para o lado. */
  const trilho = document.createElement("div");
  trilho.className = "marcas__trilho";
  originais.forEach((logo) => trilho.append(logo));
  originais.forEach((logo) => {
    const copia = logo.cloneNode(true);
    copia.setAttribute("aria-hidden", "true");
    if (copia.alt !== undefined) copia.alt = "";
    trilho.append(copia);
  });
  faixa.append(trilho);
  faixa.dataset.desfilando = "sim";
  faixa.classList.add("marcas__faixa--desfila");
  // o tempo acompanha a quantidade de logos, para a velocidade não mudar
  // quando a fábrica acrescentar uma marca nova
  trilho.style.setProperty("--tempo-desfile", `${originais.length * 3.4}s`);
}

/* As dúvidas abrem e fecham deslizando. O <details> do navegador troca de
   estado de uma vez só — some e aparece, sem meio-termo. Aqui a altura é
   medida e animada, e o <details> continua sendo um <details>: quem chega
   pelo teclado, pelo leitor de tela ou pelo Ctrl+F encontra tudo igual. */
export function abrirDuvidasDeslizando(seletor = ".faq details") {
  const blocos = document.querySelectorAll(seletor);
  if (!blocos.length || MENOS_MOVIMENTO.matches) return;

  blocos.forEach((bloco) => {
    const resumo = bloco.querySelector("summary");
    const corpo = bloco.querySelector("summary + *");
    if (!resumo || !corpo) return;

    // o corpo precisa de um invólucro para a altura poder ser animada sem
    // mexer nas margens do texto
    const capa = document.createElement("div");
    capa.className = "faq__capa";
    corpo.replaceWith(capa);
    capa.append(corpo);

    let animando = false;

    resumo.addEventListener("click", (evento) => {
      if (animando) { evento.preventDefault(); return; }
      evento.preventDefault();
      animando = true;
      bloco.classList.add("faq--mexendo");

      const abrindo = !bloco.open;
      if (abrindo) bloco.open = true;

      const de = abrindo ? 0 : capa.scrollHeight;
      const para = abrindo ? capa.scrollHeight : 0;
      capa.style.height = `${de}px`;

      const fim = () => {
        capa.style.height = "";
        bloco.classList.remove("faq--mexendo");
        if (!abrindo) bloco.open = false;
        animando = false;
      };

      const passo = capa.animate(
        { height: [`${de}px`, `${para}px`], opacity: abrindo ? [0, 1] : [1, 0] },
        { duration: 260, easing: "cubic-bezier(.3,.7,.4,1)" },
      );
      passo.addEventListener("finish", fim);
      passo.addEventListener("cancel", fim);
    });
  });
}

/* Bolinhas embaixo da tira, uma por foto, marcando onde o cliente está. Sem
   elas não dá para saber que a tira anda nem quanto falta. */
export function pontosDaTira(seletor) {
  const tira = document.querySelector(seletor);
  if (!tira) return;
  const itens = [...tira.children];
  if (itens.length < 2) return;

  const trilha = document.createElement("div");
  trilha.className = "pontos";
  trilha.setAttribute("aria-hidden", "true");
  itens.forEach(() => {
    const ponto = document.createElement("span");
    ponto.className = "ponto";
    trilha.append(ponto);
  });
  tira.after(trilha);

  const marcar = () => {
    // no desktop a tira vira grade e não rola: aí as bolinhas não têm o que dizer
    const rola = tira.scrollWidth - tira.clientWidth > 20;
    trilha.classList.toggle("oculto", !rola);
    if (!rola) return;
    const meio = tira.scrollLeft + tira.clientWidth / 2;
    let maisPerto = 0;
    let menorDistancia = Infinity;
    itens.forEach((item, indice) => {
      const centro = item.offsetLeft + item.offsetWidth / 2;
      const distancia = Math.abs(centro - meio);
      if (distancia < menorDistancia) { menorDistancia = distancia; maisPerto = indice; }
    });
    trilha.querySelectorAll(".ponto").forEach((ponto, indice) => {
      ponto.classList.toggle("ponto--agora", indice === maisPerto);
    });
  };

  tira.addEventListener("scroll", () => {
    clearTimeout(tira.dataset.espera);
    tira.dataset.espera = setTimeout(marcar, 80);
  }, { passive: true });
  window.addEventListener("resize", marcar, { passive: true });
  marcar();
}
