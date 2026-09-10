/* Vitrine: monta a grade de modelos, os minimos e o rodape a partir do JSON. */

import {
  carregarCatalogo,
  montarCartaoModelo,
  preencherDadosEmpresa,
  calcularPrazo,
  formatarData,
} from "./comum.js";

import { prepararMedicao, registrar } from "./medicao.js";
import {
  prepararAnimacoes,
  grifarTitulo,
  rodizioDePalavras,
  contarNumeros,
  girarTira,
  desfilarMarcas,
  abrirDuvidasDeslizando,
  pontosDaTira,
  barraDeLeitura,
} from "./animacao.js";

const grade = document.getElementById("grade-modelos");
const filtros = document.getElementById("filtros-categoria");
const filtrosLinha = document.getElementById("filtros-linha");

/* Duas perguntas diferentes: "quero boné ou chapéu?" e "quero premium ou
   promocional?". Quem chega na vitrine faz a primeira; separar as duas evita
   uma fileira de sete botões que ninguém lê. */
const CATEGORIAS = [
  { id: "bone", nome: "Bonés" },
  { id: "chapeu", nome: "Chapéus" },
  { id: "viseira", nome: "Viseiras" },
];

let filtroCategoria = "todas";
let filtroLinha = "todas";

function montarUmGrupo(alvo, campo, opcoes, aoTocar) {
  alvo.textContent = "";
  opcoes.forEach((opcao, indice) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "filtro";
    botao.textContent = opcao.nome;
    botao.dataset[campo] = opcao.id;
    botao.setAttribute("aria-pressed", indice === 0 ? "true" : "false");
    botao.addEventListener("click", () => aoTocar(opcao.id));
    alvo.append(botao);
  });
}

function montarFiltros(catalogo) {
  const categorias = CATEGORIAS.filter((categoria) =>
    catalogo.produtos.some((produto) => produto.categoria === categoria.id));
  montarUmGrupo(filtros, "categoria",
    [{ id: "todas", nome: "Tudo" }, ...categorias],
    (id) => { filtroCategoria = id; aplicarFiltro(); });

  if (filtrosLinha) {
    // "Linha Premium" em botão é palavra desperdiçada: o grupo já diz do que
    // se trata, e no celular o rótulo curto mantém tudo numa fileira só
    const linhas = linhasParaMostrar(catalogo).map((linha) => ({
      id: linha.id,
      nome: linha.nome.replace(/^Linha\s+/i, ""),
    }));
    montarUmGrupo(filtrosLinha, "linha",
      [{ id: "todas", nome: "Todas" }, ...linhas],
      (id) => { filtroLinha = id; aplicarFiltro(); });
  }
}

function aplicarFiltro() {
  filtros.querySelectorAll(".filtro").forEach((botao) => {
    botao.setAttribute("aria-pressed", String(botao.dataset.categoria === filtroCategoria));
  });
  if (filtrosLinha) {
    filtrosLinha.querySelectorAll(".filtro").forEach((botao) => {
      botao.setAttribute("aria-pressed", String(botao.dataset.linha === filtroLinha));
    });
  }

  let quantos = 0;
  grade.querySelectorAll(".modelo").forEach((cartao) => {
    const mostrar =
      (filtroCategoria === "todas" || cartao.dataset.categoria === filtroCategoria) &&
      (filtroLinha === "todas" || cartao.dataset.linha === filtroLinha);
    cartao.classList.toggle("oculto", !mostrar);
    if (mostrar) quantos += 1;
  });

  // combinação sem nenhum modelo deixava a vitrine em branco, sem explicação
  const vazio = document.getElementById("vitrine-vazia");
  if (vazio) vazio.classList.toggle("oculto", quantos > 0);

  registrar("filtrou_vitrine", { categoria: filtroCategoria, linha: filtroLinha });
}

function montarGrade(catalogo) {
  grade.textContent = "";
  catalogo.produtos.forEach((produto) => {
    grade.append(
      montarCartaoModelo(catalogo, produto, {
        como: "link",
        href: `catalogo.html?modelo=${encodeURIComponent(produto.id)}`,
      }),
    );
  });
}

/** Linha que ainda não tem mínimo definido ou nenhum modelo não pode
    aparecer para o cliente — vira "a partir de null unidades" na tela. */
function linhasParaMostrar(catalogo) {
  return catalogo.linhas.filter((linha) =>
    typeof linha.minimo === "number" &&
    catalogo.produtos.some((produto) => produto.linha === linha.id));
}

/** Links para a ficha de cada modelo. Serve ao cliente que quer ler sobre o
    modelo e ao Google, que precisa de link interno para chegar nas fichas. */
function montarModelosDoRodape(catalogo) {
  const lista = document.getElementById("rodape-modelos");
  if (!lista) return;
  lista.textContent = "";
  catalogo.produtos.forEach((produto) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `modelos/${produto.id}.html`;
    link.textContent = produto.nome;
    item.append(link);
    lista.append(item);
  });
}

/** Duas respostas se montam a partir do catálogo, para não envelhecerem
    quando a fábrica mudar mínimo ou técnica. */
function textoDaResposta(catalogo, texto) {
  if (texto === "AUTOMATICA_MINIMOS") {
    const lista = linhasParaMostrar(catalogo)
      .map((linha) => `${linha.nome.toLowerCase()} a partir de ${linha.minimo} unidades`)
      .join(", ");
    const chapeu = (catalogo.minimo_por_categoria || {}).chapeu;
    const extra = chapeu ? ` Chapéu sai de ${chapeu} unidades.` : "";
    return `Trabalhamos com pedido mínimo por linha: ${lista}.${extra} ` +
      "Abaixo disso não conseguimos produzir com preço de fábrica.";
  }
  if (texto === "AUTOMATICA_TECNICAS") {
    // sem toLowerCase(): DTF é sigla e viraria "dtf"
    const nomes = catalogo.tecnicas.map((tecnica) => tecnica.nome).join(", ");
    return `Fazemos: ${nomes}. O que cabe depende do modelo e da parte do boné: ` +
      "tela vazada não aceita silk, e frente com costura no meio não aceita " +
      "alto-relevo em cima do vinco. No configurador aparecem só as formas " +
      "que aquela parte aceita.";
  }
  return texto;
}

/** A home mostra as perguntas em destaque; duvidas.html mostra todas. */
async function montarFaq(catalogo) {
  const alvo = document.getElementById("faq");
  if (!alvo) return;
  let duvidas;
  try {
    const resposta = await fetch("dados/duvidas.json", { cache: "no-cache" });
    duvidas = await resposta.json();
  } catch (erro) {
    return;
  }

  alvo.textContent = "";
  duvidas.perguntas.filter((item) => item.destaque).forEach((item, indice) => {
    const bloco = document.createElement("details");
    if (indice === 0) bloco.open = true;
    const titulo = document.createElement("summary");
    titulo.textContent = item.pergunta;
    const texto = document.createElement("p");
    texto.textContent = textoDaResposta(catalogo, item.resposta);
    bloco.append(titulo, texto);
    alvo.append(bloco);
  });
}

/** Logos de quem já produziu com a AG Bonés. */
function montarMarcas(catalogo) {
  const faixa = document.getElementById("marcas-faixa");
  const titulo = document.getElementById("marcas-titulo");
  const marcas = catalogo.marcas;
  if (!faixa || !marcas || !marcas.valores.length) return;

  titulo.textContent = marcas.titulo;
  faixa.textContent = "";
  marcas.valores.forEach((marca) => {
    const foto = document.createElement("img");
    foto.className = "marcas__logo";
    foto.src = marca.imagem;
    foto.alt = marca.nome;
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 200;
    foto.height = 200;
    faixa.append(foto);
  });
}

/** Gente usando a peça. A primeira foto já está no topo, então entra a partir
    da segunda: repetir a mesma imagem duas vezes na página não convence. */
function montarUso(catalogo) {
  const tira = document.getElementById("tira-uso");
  if (!tira || !catalogo.uso) return;
  tira.textContent = "";
  catalogo.uso.fotos.slice(1).forEach((endereco) => {
    const foto = document.createElement("img");
    foto.className = "tira__foto";
    foto.src = endereco;
    foto.alt = "Pessoa usando peça personalizada da AG Bonés";
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 640;
    foto.height = 800;
    tira.append(foto);
  });
}

function montarFabrica(catalogo) {
  const alvo = document.getElementById("fabrica-fotos");
  if (!alvo || !catalogo.fabrica) return;
  alvo.textContent = "";
  catalogo.fabrica.fotos.forEach((item) => {
    const figura = document.createElement("figure");
    figura.className = "fabrica__item";
    const foto = document.createElement("img");
    foto.src = item.imagem;
    foto.alt = item.texto;
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 760;
    foto.height = 570;
    const legenda = document.createElement("figcaption");
    legenda.textContent = item.texto;
    figura.append(foto, legenda);
    alvo.append(figura);
  });
}

/** Avaliações públicas do Google. Texto do cliente, sem retoque nosso. */
function montarDepoimentos(catalogo) {
  const alvo = document.getElementById("lista-depoimentos");
  const nota = document.getElementById("depoimentos-nota");
  const dados = catalogo.depoimentos;
  if (!alvo || !dados || !dados.valores.length) return;

  nota.textContent = `${dados.nota} no ${dados.fonte}, com ${dados.quantidade} avaliações.`;
  alvo.textContent = "";
  dados.valores.forEach((depoimento) => {
    const cartao = document.createElement("figure");
    cartao.className = "depoimento";

    const estrelas = document.createElement("div");
    estrelas.className = "depoimento__estrelas";
    estrelas.setAttribute("aria-label", "5 de 5");
    estrelas.textContent = "★★★★★";

    const texto = document.createElement("blockquote");
    texto.className = "depoimento__texto";
    texto.textContent = depoimento.texto;

    const autor = document.createElement("figcaption");
    autor.className = "depoimento__autor";
    autor.textContent = depoimento.nome;

    cartao.append(estrelas, texto, autor);
    alvo.append(cartao);
  });
}

/** Últimos posts do perfil. Imagem nossa, link para o post — nada de widget. */
function montarInstagram(catalogo) {
  const alvo = document.getElementById("insta-posts");
  const dados = catalogo.instagram;
  if (!alvo || !dados || !dados.posts.length) return;
  alvo.textContent = "";
  dados.posts.forEach((post, indice) => {
    const link = document.createElement("a");
    link.className = "insta__item";
    link.href = post.link;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Ver publicação ${indice + 1} de @${dados.perfil} no Instagram`);

    const foto = document.createElement("img");
    foto.src = post.imagem;
    foto.alt = "";
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 420;
    foto.height = 420;

    const marca = document.createElement("span");
    marca.className = "insta__marca";
    marca.setAttribute("aria-hidden", "true");
    marca.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.86s-.01 3.6-.07 4.86c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.86.07s-3.6-.01-4.86-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.21 15.6 2.2 15.22 2.2 12s.01-3.6.07-4.86c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.46 2.21 8.84 2.2 12 2.2Zm0 3.13a6.67 6.67 0 1 0 0 13.34 6.67 6.67 0 0 0 0-13.34Zm0 11a4.33 4.33 0 1 1 0-8.66 4.33 4.33 0 0 1 0 8.66Zm8.49-11.26a1.56 1.56 0 1 1-3.11 0 1.56 1.56 0 0 1 3.11 0Z"/></svg>';

    link.append(foto, marca);
    alvo.append(link);
  });
}

/** Missão e valores, do jeito que a empresa já os escreve. */
function montarSobre(catalogo) {
  const lista = document.getElementById("sobre-valores");
  const valores = catalogo.empresa.valores || [];
  if (!lista || !valores.length) return;
  lista.textContent = "";
  valores.forEach((valor) => {
    const item = document.createElement("li");
    item.textContent = valor;
    lista.append(item);
  });
}

function montarCondicoes(catalogo) {
  const linhas = linhasParaMostrar(catalogo);
  const lista = document.getElementById("minimos-linhas");
  lista.textContent = "";
  linhas.forEach((linha) => {
    const item = document.createElement("li");
    item.textContent = `${linha.nome}: a partir de ${linha.minimo} unidades.`;
    lista.append(item);
  });

  const previsao = document.querySelector("[data-previsao-entrega]");
  if (previsao) previsao.textContent = formatarData(calcularPrazo(20));

  const total = document.querySelector("[data-total-modelos]");
  if (total) total.textContent = String(catalogo.produtos.length);
}

async function iniciar() {
  document.getElementById("ano").textContent = String(new Date().getFullYear());
  try {
    const catalogo = await carregarCatalogo();
    prepararMedicao(catalogo);
    montarFiltros(catalogo);
    montarGrade(catalogo);
    montarMarcas(catalogo);
    montarUso(catalogo);
    montarFabrica(catalogo);
    montarDepoimentos(catalogo);
    montarSobre(catalogo);
    montarInstagram(catalogo);
    montarCondicoes(catalogo);
    montarModelosDoRodape(catalogo);
    await montarFaq(catalogo);
    preencherDadosEmpresa(catalogo);
    // por último: as seções já estão montadas, então o vigia enxerga tudo
    grifarTitulo(".hero h1", 2);
    rodizioDePalavras("#rodizio-peca");
    contarNumeros();
    desfilarMarcas("#marcas-faixa");
    girarTira("#tira-uso", 5);
    girarTira("#lista-depoimentos", 6.5);
    pontosDaTira("#tira-uso");
    pontosDaTira("#lista-depoimentos");
    abrirDuvidasDeslizando();
    barraDeLeitura();
    prepararAnimacoes();
  } catch (erro) {
    grade.innerHTML =
      '<p class="aviso aviso--erro">Não foi possível carregar o catálogo. ' +
      'Se você abriu o arquivo direto do disco, use um servidor local (py -m http.server 5500).</p>';
    console.error(erro);
  }
}

iniciar();
