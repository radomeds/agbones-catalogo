/* Página inicial (refeita em 03/11/2026).
   Tudo o que muda — modelos, mínimos, prazo, nota, fotos, números — sai de
   dados/produtos.json e dados/duvidas.json. O HTML só tem o texto de venda.
   Movimento: só o letreiro de marcas. Nada de rodízio, contagem ou foto
   flutuando: o cliente veio para montar o boné, não para ver a página dançar. */

import {
  carregarCatalogo,
  minimoDoProduto,
  preencherDadosEmpresa,
  calcularPrazo,
  formatarData,
  linhaPorId,
} from "./comum.js";
import { linkWhatsapp } from "./whatsapp.js";
import { prepararMedicao, registrar } from "./medicao.js";
import { desfilarMarcas } from "./animacao.js";

const CATEGORIAS = [
  { id: "bone", nome: "Bonés" },
  { id: "chapeu", nome: "Chapéus" },
  { id: "viseira", nome: "Viseiras" },
];

const PRAZO_DIAS = 20;

/* Cada botão de WhatsApp chega com a primeira frase escrita: o cliente só
   aperta enviar. Conversa que começa com contexto é atendida mais rápido. */
const FRASES_WHATSAPP = {
  padrao: "Olá, AG Bonés! Vim pelo site e quero fazer bonés personalizados com a minha marca.",
  rodape: "Olá, AG Bonés! Vim pelo site e tenho uma dúvida.",
};

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function enderecoDoEditor(idModelo) {
  return `monte.html?modelo=${encodeURIComponent(idModelo)}`;
}

/** Linha sem mínimo ou sem modelo não aparece: viraria "a partir de null". */
function linhasParaMostrar(catalogo) {
  return catalogo.linhas.filter((linha) =>
    typeof linha.minimo === "number" &&
    catalogo.produtos.some((produto) => produto.linha === linha.id));
}

/* ---------- Topo e chamadas ---------- */

function prepararChamadas(catalogo) {
  const vitrine = catalogo.vitrine || {};
  const destaque = catalogo.produtos.find((produto) => produto.id === vitrine.modelo_destaque)
    || catalogo.produtos[0];
  document.querySelectorAll("[data-modelo-destaque], [data-cta='topo']").forEach((link) => {
    link.href = enderecoDoEditor(destaque.id);
  });

  document.querySelectorAll("[data-cta]").forEach((link) => {
    link.addEventListener("click", () => registrar("clicou_criar", { onde: link.dataset.cta }));
  });

  // depois do preencherDadosEmpresa: troca o wa.me seco pelo que já tem texto
  document.querySelectorAll("[data-zap]").forEach((link) => {
    const frase = FRASES_WHATSAPP[link.dataset.zap] || FRASES_WHATSAPP.padrao;
    link.href = linkWhatsapp(catalogo.empresa.whatsapp, frase);
    link.addEventListener("click", () => registrar("clicou_whatsapp", { onde: link.dataset.zap }));
  });
}

function preencherNumeros(catalogo) {
  const trocar = (seletor, valor) =>
    document.querySelectorAll(seletor).forEach((alvo) => { alvo.textContent = String(valor); });

  if (catalogo.empresa.anos) trocar("[data-anos]", catalogo.empresa.anos);
  trocar("[data-total-modelos]", catalogo.produtos.length);
  trocar("[data-prazo-dias]", PRAZO_DIAS);
  trocar("[data-previsao-entrega]", formatarData(calcularPrazo(PRAZO_DIAS)));
  trocar("[data-total-tecnicas]", catalogo.tecnicas.length);

  const faixas = catalogo.faixas_quantidade || [];
  if (faixas.length) trocar("[data-faixas]", faixas[0].min);

  const tecnicas = document.getElementById("lista-tecnicas");
  if (tecnicas) {
    const nomes = catalogo.tecnicas.map((tecnica) => tecnica.nome);
    tecnicas.textContent = nomes.length > 1
      ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}. A equipe indica a melhor para o seu modelo.`
      : nomes.join("");
  }

  // a nota do Google no canto da foto: prova perto do botão
  const dep = catalogo.depoimentos;
  const nota = document.getElementById("nota-google");
  if (nota && dep && dep.nota) {
    nota.querySelector("[data-nota]").textContent = dep.nota;
    nota.append(criar("span", "", `${dep.quantidade} avaliações`));
    nota.classList.remove("oculto");
  }
}

/** Números que só a fábrica sabe. Valor null = escondido; nunca estimado. */
function montarNumerosDaFabrica(catalogo) {
  const alvo = document.getElementById("numeros-fabrica");
  const numeros = ((catalogo.vitrine || {}).numeros || [])
    .filter((item) => typeof item.valor === "number" && item.valor > 0);
  if (!alvo || !numeros.length) return;
  alvo.textContent = "";
  numeros.forEach((item) => {
    const bloco = criar("div");
    bloco.append(
      criar("dt", "", `${item.valor.toLocaleString("pt-BR")}${item.sufixo || ""}`),
      criar("dd", "", item.rotulo),
    );
    alvo.append(bloco);
  });
  alvo.classList.remove("oculto");
}

/* ---------- Vitrine ---------- */

function montarCartao(catalogo, produto) {
  const cartao = criar("a", "cartao-modelo");
  cartao.href = enderecoDoEditor(produto.id);
  cartao.dataset.categoria = produto.categoria;
  cartao.dataset.produto = produto.id;
  cartao.addEventListener("click", () => registrar("escolheu_modelo", { modelo: produto.id }));

  const moldura = criar("div", "cartao-modelo__foto");
  const foto = criar("img");
  foto.src = produto.imagem.replace("assets/produtos/", "assets/produtos/mini/");
  foto.alt = produto.categoria === "bone" ? `Boné modelo ${produto.nome}` : produto.nome;
  foto.loading = "lazy";
  foto.decoding = "async";
  foto.width = 360;
  foto.height = 360;
  moldura.append(foto);
  cartao.append(moldura);

  const linha = linhaPorId(catalogo, produto.linha);
  if (linha && linha.selo) {
    cartao.append(criar("span", `cartao-modelo__selo cartao-modelo__selo--${linha.id}`, linha.selo.texto));
  }

  const corpo = criar("div", "cartao-modelo__corpo");
  corpo.append(criar("span", "cartao-modelo__nome", produto.nome));
  const minimo = minimoDoProduto(catalogo, produto);
  if (minimo) corpo.append(criar("span", "cartao-modelo__minimo", `a partir de ${minimo} un.`));
  corpo.append(criar("span", "cartao-modelo__acao", "Personalizar"));
  cartao.append(corpo);
  return cartao;
}

function montarVitrine(catalogo) {
  const vitrine = document.getElementById("vitrine");
  const abas = document.getElementById("abas-categoria");
  vitrine.textContent = "";
  catalogo.produtos.forEach((produto) => vitrine.append(montarCartao(catalogo, produto)));

  const categorias = CATEGORIAS.filter((categoria) =>
    catalogo.produtos.some((produto) => produto.categoria === categoria.id));
  const opcoes = [{ id: "todas", nome: "Todos" }, ...categorias];
  abas.textContent = "";
  opcoes.forEach((opcao, indice) => {
    const quantos = opcao.id === "todas"
      ? catalogo.produtos.length
      : catalogo.produtos.filter((produto) => produto.categoria === opcao.id).length;
    const botao = criar("button", "aba", `${opcao.nome} (${quantos})`);
    botao.type = "button";
    botao.dataset.categoria = opcao.id;
    botao.setAttribute("aria-pressed", indice === 0 ? "true" : "false");
    botao.addEventListener("click", () => {
      abas.querySelectorAll(".aba").forEach((outro) =>
        outro.setAttribute("aria-pressed", String(outro === botao)));
      vitrine.querySelectorAll(".cartao-modelo").forEach((cartao) => {
        cartao.classList.toggle("oculto", opcao.id !== "todas" && cartao.dataset.categoria !== opcao.id);
      });
      registrar("filtrou_vitrine", { categoria: opcao.id });
    });
    abas.append(botao);
  });
}

/* ---------- Prova e conteúdo ---------- */

function montarMarcas(catalogo) {
  const faixa = document.getElementById("marcas-faixa");
  const marcas = catalogo.marcas;
  if (!faixa || !marcas || !marcas.valores.length) return;
  if (marcas.titulo) document.getElementById("marcas-titulo").textContent = marcas.titulo;
  faixa.textContent = "";
  marcas.valores.forEach((marca) => {
    const foto = criar("img", "marcas__logo");
    foto.src = marca.imagem;
    foto.alt = marca.nome;
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 200;
    foto.height = 200;
    faixa.append(foto);
  });
}

/** Fotos de gente usando. A que já está no topo não se repete aqui. */
function montarGaleria(catalogo) {
  const alvo = document.getElementById("galeria-uso");
  if (!alvo || !catalogo.uso) return;
  const doTopo = (document.querySelector(".heroi__foto img") || {}).getAttribute?.("src");
  alvo.textContent = "";
  catalogo.uso.fotos.filter((endereco) => endereco !== doTopo).forEach((endereco) => {
    const foto = criar("img");
    foto.src = endereco;
    foto.alt = "Cliente usando peça personalizada da AG Bonés";
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 640;
    foto.height = 800;
    alvo.append(foto);
  });
}

/** O Google guarda o nome como o cliente digitou; aqui só a primeira letra
    de cada palavra sobe, para ler como nome de gente. */
function nomeBonito(nome) {
  return nome.trim().split(/\s+/)
    .map((parte) => parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1))
    .join(" ");
}

/** Avaliações públicas do Google, palavra por palavra. */
function montarDepoimentos(catalogo) {
  const alvo = document.getElementById("lista-depoimentos");
  const nota = document.getElementById("depoimentos-nota");
  const dados = catalogo.depoimentos;
  if (!alvo || !dados || !dados.valores.length) return;

  nota.textContent = `Nota “${dados.nota}” no ${dados.fonte}, com ${dados.quantidade} avaliações. Abaixo, o que os clientes escreveram.`;
  alvo.textContent = "";
  dados.valores.forEach((depoimento) => {
    const cartao = criar("figure", "depoimento");
    const estrelas = criar("div", "estrelas", "★★★★★");
    estrelas.setAttribute("aria-label", "5 de 5 estrelas");
    const texto = criar("blockquote", "", depoimento.texto);
    const autor = criar("figcaption");
    const nome = nomeBonito(depoimento.nome);
    const inicial = criar("span", "depoimento__inicial", nome.charAt(0));
    inicial.setAttribute("aria-hidden", "true");
    const quem = criar("span");
    quem.append(nome, document.createElement("br"), criar("span", "depoimento__fonte", `via ${dados.fonte}`));
    autor.append(inicial, quem);
    cartao.append(estrelas, texto, autor);
    alvo.append(cartao);
  });
}

function montarFabrica(catalogo) {
  const alvo = document.getElementById("fabrica-fotos");
  if (!alvo || !catalogo.fabrica) return;
  alvo.textContent = "";
  catalogo.fabrica.fotos.forEach((item) => {
    const figura = criar("figure");
    const foto = criar("img");
    foto.src = item.imagem;
    foto.alt = item.texto;
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 760;
    foto.height = 570;
    figura.append(foto, criar("figcaption", "", item.texto));
    alvo.append(figura);
  });
}

function montarMinimos(catalogo) {
  const lista = document.getElementById("minimos-linhas");
  lista.textContent = "";
  linhasParaMostrar(catalogo).forEach((linha) => {
    lista.append(criar("li", "", `${linha.nome}: a partir de ${linha.minimo} unidades.`));
  });
  const chapeu = (catalogo.minimo_por_categoria || {}).chapeu;
  if (chapeu) lista.append(criar("li", "", `Chapéus: a partir de ${chapeu} unidades.`));
  lista.append(criar("li", "", "Pode misturar cores dentro do mesmo pedido."));
}

/** Duas respostas se montam do catálogo para não envelhecerem. */
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
    const nomes = catalogo.tecnicas.map((tecnica) => tecnica.nome).join(", ");
    return `Fazemos: ${nomes}. O que cabe depende do modelo e da parte do boné: ` +
      "tela vazada não aceita silk, e frente com costura no meio não aceita " +
      "alto-relevo em cima do vinco. No editor aparecem só as formas " +
      "que aquela parte aceita.";
  }
  return texto;
}

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
    const bloco = criar("details");
    if (indice === 0) bloco.open = true;
    bloco.append(criar("summary", "", item.pergunta), criar("p", "", textoDaResposta(catalogo, item.resposta)));
    bloco.addEventListener("toggle", () => {
      if (bloco.open) registrar("abriu_duvida", { pergunta: item.pergunta });
    });
    alvo.append(bloco);
  });
}

/** Últimos posts: imagem nossa com link para o post, sem widget. */
function montarInstagram(catalogo) {
  const alvo = document.getElementById("insta-posts");
  const dados = catalogo.instagram;
  if (!alvo || !dados || !dados.posts.length) return;
  alvo.textContent = "";
  dados.posts.forEach((post, indice) => {
    const link = criar("a", "insta__item");
    link.href = post.link;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Ver publicação ${indice + 1} de @${dados.perfil} no Instagram`);
    const foto = criar("img");
    foto.src = post.imagem;
    foto.alt = "";
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 420;
    foto.height = 420;
    const marca = criar("span", "insta__marca");
    marca.setAttribute("aria-hidden", "true");
    marca.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.86s-.01 3.6-.07 4.86c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.86.07s-3.6-.01-4.86-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.21 15.6 2.2 15.22 2.2 12s.01-3.6.07-4.86c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.46 2.21 8.84 2.2 12 2.2Zm0 3.13a6.67 6.67 0 1 0 0 13.34 6.67 6.67 0 0 0 0-13.34Zm0 11a4.33 4.33 0 1 1 0-8.66 4.33 4.33 0 0 1 0 8.66Zm8.49-11.26a1.56 1.56 0 1 1-3.11 0 1.56 1.56 0 0 1 3.11 0Z"/></svg>';
    link.append(foto, marca);
    alvo.append(link);
  });
}

/** Links para a ficha de cada modelo: o Google chega nas fichas por aqui. */
function montarModelosDoRodape(catalogo) {
  const lista = document.getElementById("rodape-modelos");
  if (!lista) return;
  lista.textContent = "";
  catalogo.produtos.forEach((produto) => {
    const item = criar("li");
    const link = criar("a", "", produto.nome);
    link.href = `modelos/${produto.id}.html`;
    item.append(link);
    lista.append(item);
  });
}

/** No celular a barra com o botão aparece quando o botão do topo sai da tela. */
function prepararBarraFixa() {
  const barra = document.getElementById("barra-fixa");
  const alvo = document.querySelector(".heroi__acoes");
  if (!barra || !alvo) return;
  if (!("IntersectionObserver" in window)) {
    barra.classList.add("barra-fixa--visivel");
    return;
  }
  new IntersectionObserver(([entrada]) => {
    barra.classList.toggle("barra-fixa--visivel", !entrada.isIntersecting && entrada.boundingClientRect.top < 0);
  }).observe(alvo);
}

async function iniciar() {
  document.getElementById("ano").textContent = String(new Date().getFullYear());
  prepararBarraFixa();
  try {
    const catalogo = await carregarCatalogo();
    prepararMedicao(catalogo);
    preencherDadosEmpresa(catalogo);
    prepararChamadas(catalogo);
    preencherNumeros(catalogo);
    montarNumerosDaFabrica(catalogo);
    montarVitrine(catalogo);
    montarMarcas(catalogo);
    montarGaleria(catalogo);
    montarDepoimentos(catalogo);
    montarFabrica(catalogo);
    montarMinimos(catalogo);
    montarInstagram(catalogo);
    montarModelosDoRodape(catalogo);
    await montarFaq(catalogo);
    desfilarMarcas("#marcas-faixa");
  } catch (erro) {
    document.getElementById("vitrine").innerHTML =
      '<p class="secao__linha">Não foi possível carregar o catálogo. ' +
      'Chame a gente no WhatsApp que mandamos os modelos por lá.</p>';
    console.error(erro);
  }
}

iniciar();
