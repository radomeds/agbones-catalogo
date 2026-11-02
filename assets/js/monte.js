/* Monte seu boné: quatro passos (modelo, cores, logo, pedido) com a foto do
   boné de verdade mudando na hora (foto-bone.js). O 3D (bone3d.js) só carrega
   se o cliente tocar em "Girar em 3D", e os dois mostram a mesma escolha. Os modelos, as cores, as técnicas e os mínimos vêm do
   dados/produtos.json; aqui só se liga a escolha do cliente ao boné. */

import {
  carregarCatalogo, linhaPorId, produtoPorId, construcaoDoProduto, tecnicasDaArea,
  minimoDoProduto, precoUnitario, formatarMoeda, calcularPrazo, formatarData, gerarReferencia,
} from "./comum.js";
import { abrirWhatsapp } from "./whatsapp.js";
import { ESTILOS_DE_LETRA, carregarLetras, montarTexto } from "./letras.js";
import { DESENHOS, partesDoDesenho } from "./desenhos.js";
import { FotoDoBone, carregarFotos } from "./foto-bone.js";

const ETAPAS = ["modelo", "cores", "logo", "pedido"];
const ROTULO_PROXIMO = { modelo: "Próximo: cores", cores: "Próximo: sua logo", logo: "Próximo: quantidade" };
const GUARDA = "agbones-monte-v1";

const TIPOS = [
  { id: "todos", nome: "Todos" },
  { id: "bone", nome: "Bonés" },
  { id: "viseira", nome: "Viseiras" },
  { id: "chapeu", nome: "Chapéus" },
];

/* A cor com que cada modelo aparece primeiro: a mesma da foto do catálogo,
   para o cliente reconhecer o que tocou. */
const COR_INICIAL = {
  trucker: "verde-bandeira", "americano-tela": "preto", "dad-hat": "vermelho", flex: "laranja",
  "aba-reta": "azul-royal", japones: "bege", "gomos-5-6": "verde-musgo", americano: "azul-marinho",
  viseira: "laranja", "viseira-sport": "preto", "viseira-malha": "preto",
  bucket: "preto", cumbuca: "bege", "chapeu-australiano": "caqui",
};

/* Combinações prontas: a cor principal e a de contraste (a tela, ou a aba). */
const COMBINACOES = [
  { nome: "Todo preto", principal: "preto", contraste: "preto" },
  { nome: "Preto e branco", principal: "preto", contraste: "branco" },
  { nome: "Marinho e branco", principal: "azul-marinho", contraste: "branco" },
  { nome: "Royal e branco", principal: "azul-royal", contraste: "branco" },
  { nome: "Vermelho e preto", principal: "vermelho", contraste: "preto" },
  { nome: "Verde e branco", principal: "verde-bandeira", contraste: "branco" },
  { nome: "Bege e marrom", principal: "bege", contraste: "caqui" },
  { nome: "Cinza e preto", principal: "chumbo", contraste: "preto" },
];

const estado = {
  etapa: "modelo",
  tipo: "todos",
  modelo: null,
  cores: {},
  parte: "todo",
  logo: null, // { tipo: "arquivo" | "nome", ... }
  tamanho: 1,
  tecnica: null,
  quantidade: null,
  cliente: "",
};

let catalogo;
let foto = null; // a foto do boné: a prévia principal
let palco3d = null; // o 3D, criado só quando o cliente pede
let em3d = false;
let ultimaArte = null; // a logo pronta, para o 3D receber a mesma quando abrir
const $ = (id) => document.getElementById(id);

/* ---------- guardar a escolha (o cliente pode fechar e voltar) ---------- */

function guardar() {
  try {
    const { logo, ...resto } = estado;
    const logoLeve = logo && logo.tipo === "nome" ? logo : null;
    localStorage.setItem(GUARDA, JSON.stringify({ ...resto, logo: logoLeve }));
  } catch { /* sem armazenamento, segue sem lembrar */ }
}

function recuperar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(GUARDA) || "null");
    if (salvo && typeof salvo === "object") Object.assign(estado, salvo, { etapa: "modelo" });
  } catch { /* começa do zero */ }
}

/* ---------- ajudantes ---------- */

const corPorId = (id) => catalogo.cores.find((c) => c.id === id) || null;
const corPorHex = (hex) => catalogo.cores.find((c) => c.hex.toLowerCase() === String(hex).toLowerCase()) || null;
const produtoAtual = () => produtoPorId(catalogo, estado.modelo);

function botao(classe, texto, aoTocar) {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.className = classe;
  if (texto) elemento.textContent = texto;
  elemento.addEventListener("click", aoTocar);
  return elemento;
}

function partesAtuais() {
  return partesDoDesenho(estado.modelo);
}

/** Faz a mesma coisa na foto e no 3D, para os dois mostrarem a mesma escolha. */
function emTodos(acao) {
  [foto, palco3d].forEach((palco) => { if (palco) acao(palco); });
}

let avisoQueSome = 0;
function avisar(texto, tempo = 3200) {
  const dica = $("dica-giro");
  dica.textContent = texto;
  dica.classList.remove("sumiu");
  clearTimeout(avisoQueSome);
  avisoQueSome = setTimeout(() => dica.classList.add("sumiu"), tempo);
}

/** Mostra a parte: na foto ela acende; no 3D o boné vira para ela. */
function mostrarParte(parte) {
  if (em3d && palco3d) {
    palco3d.olharPara(parte);
    return;
  }
  if (foto && foto.olharPara(parte) === false) {
    avisar("Essa parte não aparece nesta foto. Toque em Girar em 3D para ver.");
  }
}

/** A área de arte principal do modelo (a frente, ou a fita no chapéu de juta). */
function areaDaLogo(produto) {
  return (produto.areas || [])[0] || { id: "frente", nome: "Frente" };
}

/* ---------- passo a passo ---------- */

function irPara(etapa) {
  if (!estado.modelo && etapa !== "modelo") etapa = "modelo";
  estado.etapa = etapa;
  document.querySelectorAll(".etapa").forEach((secao) => {
    secao.hidden = secao.dataset.etapa !== etapa;
  });
  const indice = ETAPAS.indexOf(etapa);
  document.querySelectorAll(".passos__item").forEach((item) => {
    const posicao = ETAPAS.indexOf(item.dataset.ir);
    if (posicao === indice) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.classList.toggle("feito", posicao < indice);
  });
  $("voltar").hidden = indice === 0;
  $("proximo").hidden = etapa === "pedido";
  $("proximo").textContent = ROTULO_PROXIMO[etapa] || "Próximo";
  $("proximo").disabled = !estado.modelo;
  if (etapa === "cores") desenharCores();
  if (etapa === "logo") desenharLogo();
  if (etapa === "pedido") desenharPedido();
  // o aviso de um passo não fica por cima do boné no passo seguinte
  clearTimeout(avisoQueSome);
  if (!em3d) $("dica-giro").classList.add("sumiu");
  if (etapa === "logo" && em3d && palco3d) palco3d.olharPara("frente");
  if (etapa === "cores" && estado.parte !== "todo") mostrarParte(estado.parte);
  const painel = $("painel");
  if (window.matchMedia("(min-width: 900px)").matches) painel.scrollTop = 0;
  else if (painel.getBoundingClientRect().top < 0) painel.scrollIntoView({ block: "start" });
  guardar();
}

/* ---------- passo 1: modelo ---------- */

function desenharTipos() {
  const lugar = $("filtro-tipo");
  lugar.replaceChildren(...TIPOS.map((tipo) => {
    const ficha = botao("ficha", tipo.nome, () => {
      estado.tipo = tipo.id;
      desenharTipos();
      desenharModelos();
    });
    ficha.setAttribute("aria-pressed", String(estado.tipo === tipo.id));
    return ficha;
  }));
}

function desenharModelos() {
  const lista = catalogo.produtos.filter((p) => estado.tipo === "todos" || p.categoria === estado.tipo);
  $("lista-modelos").replaceChildren(...lista.map((produto) => {
    const linha = linhaPorId(catalogo, produto.linha);
    const cartao = botao("modelo", "", () => escolherModelo(produto.id));
    cartao.setAttribute("aria-pressed", String(estado.modelo === produto.id));
    const foto = document.createElement("img");
    foto.src = produto.imagem;
    foto.alt = "";
    foto.loading = "lazy";
    foto.width = 320;
    foto.height = 320;
    const nome = document.createElement("strong");
    nome.textContent = produto.nome;
    const detalhe = document.createElement("small");
    detalhe.textContent = `${linha ? linha.nome : ""} · a partir de ${minimoDoProduto(catalogo, produto)} un.`;
    cartao.append(foto, nome, detalhe);
    return cartao;
  }));
}

function coresIniciais(id) {
  const cor = corPorId(COR_INICIAL[id] || "preto") || catalogo.cores[0];
  const cores = {};
  partesAtuaisDe(id).forEach((parte) => { cores[parte.id] = cor.hex; });
  // a tela do trucker sai branca, como a maioria dos pedidos
  if (id === "trucker" || id === "americano-tela") {
    cores.laterais = "#FFFFFF";
    cores.traseira = "#FFFFFF";
  }
  return cores;
}

function partesAtuaisDe(id) {
  return partesDoDesenho(id);
}

function escolherModelo(id) {
  const trocou = estado.modelo !== id;
  estado.modelo = id;
  if (trocou) {
    estado.cores = coresIniciais(id);
    estado.parte = "todo";
    estado.tecnica = null;
    estado.quantidade = null;
  }
  desenharModelos();
  mostrarModelo();
  $("proximo").disabled = false;
  guardar();
}

function mostrarModelo() {
  const produto = produtoAtual();
  if (!produto) return;
  const linha = linhaPorId(catalogo, produto.linha);
  $("nome-modelo").innerHTML = "";
  $("nome-modelo").append(produto.nome);
  const sub = document.createElement("small");
  sub.textContent = linha ? linha.nome : "";
  $("nome-modelo").append(sub);
  const reserva = $("foto-reserva");
  if (foto) {
    foto.montar(produto.id, estado.cores).then(() => {
      reserva.hidden = true;
      $("tela-foto").hidden = em3d;
    }).catch((erro) => {
      // a foto preparada não abriu: fica a foto do catálogo, e o resto funciona
      console.warn("Foto da montagem indisponível:", erro);
      mostrarReserva(produto);
    });
  } else {
    mostrarReserva(produto);
  }
  if (palco3d) palco3d.montar(produto.id, estado.cores);
  atualizarArte();
}

function mostrarReserva(produto) {
  const reserva = $("foto-reserva");
  reserva.src = produto.imagem;
  reserva.alt = produto.nome;
  reserva.hidden = em3d;
  $("tela-foto").hidden = true;
}

/* ---------- o 3D, só quando o cliente pede ---------- */

async function alternar3d() {
  const botao = $("girar-3d");
  if (!palco3d) {
    botao.disabled = true;
    botao.textContent = "Abrindo o 3D…";
    try {
      const modulo = await import("./bone3d.js");
      palco3d = new modulo.PalcoDoBone($("tela-3d"));
      // o ajuste fino do ADM (dados/ajustes-3d.json, e o rascunho dele neste navegador)
      const { juntos } = await modulo.carregarAjustes();
      palco3d.ajustes = juntos;
      palco3d.montar(estado.modelo, estado.cores);
      if (ultimaArte) palco3d.colocarArte(ultimaArte);
    } catch (erro) {
      console.warn("Boné em 3D indisponível:", erro);
      palco3d = null;
      botao.hidden = true;
      avisar("O 3D não abre neste aparelho. A foto mostra o boné do mesmo jeito.", 5000);
      return;
    } finally {
      botao.disabled = false;
    }
  }
  em3d = !em3d;
  botao.textContent = em3d ? "Ver a foto" : "Girar em 3D";
  botao.setAttribute("aria-pressed", String(em3d));
  const fotoFalhou = !foto || !foto.pronto;
  $("tela-foto").hidden = em3d || fotoFalhou;
  $("foto-reserva").hidden = em3d || !fotoFalhou;
  $("tela-3d").hidden = !em3d;
  document.querySelector(".palco__vistas").hidden = !em3d;
  palco3d.pausar(!em3d);
  if (em3d) avisar("Arraste para girar", 5000);
  else $("dica-giro").classList.add("sumiu");
}

/* ---------- passo 2: cores ---------- */

function desenharCores() {
  const partes = partesAtuais();
  const lista = [{ id: "todo", nome: partes.length > 2 ? "Boné todo" : "Tudo" }, ...partes];
  if (partes.length <= 1) estado.parte = partes[0] ? partes[0].id : "todo";
  $("lista-partes").replaceChildren(...(partes.length <= 1 ? partes : lista).map((parte) => {
    const ficha = botao("ficha", "", () => {
      estado.parte = parte.id;
      if (parte.id !== "todo") mostrarParte(parte.id);
      desenharCores();
    });
    const ponto = document.createElement("i");
    ponto.className = "ficha__ponto";
    const hex = parte.id === "todo" ? null : estado.cores[parte.id];
    if (hex) ponto.style.background = hex;
    else ponto.style.background = "conic-gradient(#141414 0 25%, #fff 0 50%, #1B4FA0 0 75%, #B3202C 0)";
    ficha.append(ponto, parte.nome);
    ficha.setAttribute("aria-pressed", String(estado.parte === parte.id));
    return ficha;
  }));

  const corDaParte = estado.parte === "todo" ? null : estado.cores[estado.parte];
  $("lista-cores").replaceChildren(...catalogo.cores.map((cor) => {
    const amostra = botao("amostra", "", () => pintar(cor));
    amostra.style.background = cor.hex;
    amostra.title = cor.nome;
    amostra.setAttribute("aria-label", cor.nome);
    amostra.setAttribute("aria-pressed", String(!!corDaParte && corDaParte.toLowerCase() === cor.hex.toLowerCase()));
    return amostra;
  }));

  const parte = lista.find((p) => p.id === estado.parte);
  const cor = corDaParte ? corPorHex(corDaParte) : null;
  $("cor-escolhida").innerHTML = "";
  if (parte && cor) {
    const forte = document.createElement("strong");
    forte.textContent = cor.nome;
    $("cor-escolhida").append(`${parte.nome}: `, forte);
  } else {
    $("cor-escolhida").textContent = "Tocando numa cor, o boné todo fica dela.";
  }

  const temCombinacao = partes.length > 2;
  $("lista-combinacoes").previousElementSibling.hidden = !temCombinacao;
  $("lista-combinacoes").hidden = !temCombinacao;
  if (temCombinacao) {
    $("lista-combinacoes").replaceChildren(...COMBINACOES.map((combinacao) => {
      const item = botao("combinacao", "", () => aplicarCombinacao(combinacao));
      const bolinhas = document.createElement("span");
      bolinhas.className = "combinacao__cores";
      [combinacao.principal, combinacao.contraste].forEach((id) => {
        const bolinha = document.createElement("i");
        bolinha.style.background = corPorId(id).hex;
        bolinhas.append(bolinha);
      });
      item.append(bolinhas, combinacao.nome);
      return item;
    }));
  }
}

function pintar(cor) {
  if (estado.parte === "todo") {
    partesAtuais().forEach((parte) => { estado.cores[parte.id] = cor.hex; });
    emTodos((palco) => palco.pintar("todo", cor.hex));
  } else {
    estado.cores[estado.parte] = cor.hex;
    emTodos((palco) => palco.pintar(estado.parte, cor.hex));
  }
  desenharCores();
  guardar();
}

function aplicarCombinacao(combinacao) {
  const principal = corPorId(combinacao.principal).hex;
  const contraste = corPorId(combinacao.contraste).hex;
  const desenho = DESENHOS[estado.modelo] || {};
  const comTela = desenho.tela;
  partesAtuais().forEach((parte) => {
    let cor = principal;
    if (comTela && (parte.id === "laterais" || parte.id === "traseira")) cor = contraste;
    if (!comTela && (parte.id === "aba-baixo" || parte.id === "botao")) cor = contraste;
    estado.cores[parte.id] = cor;
    emTodos((palco) => palco.pintar(parte.id, cor));
  });
  estado.parte = "todo";
  desenharCores();
  guardar();
}

/* ---------- passo 3: logo ---------- */

function desenharLogo() {
  const produto = produtoAtual();
  const logo = estado.logo;
  $("botao-enviar").setAttribute("aria-pressed", String(!!logo && logo.tipo === "arquivo"));
  $("botao-nome").setAttribute("aria-pressed", String(!!logo && logo.tipo === "nome"));
  $("ajuste-nome").hidden = !(logo && logo.tipo === "nome");
  $("ajuste-logo").hidden = !(logo && logo.tipo === "arquivo");
  $("ajuste-tamanho").hidden = !logo;
  $("tamanho-logo").value = String(estado.tamanho);

  if (logo && logo.tipo === "nome") {
    $("texto-nome").value = logo.texto || "";
    $("lista-letras").replaceChildren(...ESTILOS_DE_LETRA.map((estilo) => {
      const ficha = botao("ficha", estilo.nome, () => {
        logo.estilo = estilo.id;
        desenharLogo();
        atualizarArte();
        guardar();
      });
      ficha.title = estilo.descricao;
      ficha.setAttribute("aria-pressed", String(logo.estilo === estilo.id));
      return ficha;
    }));
    $("cores-nome").replaceChildren(...catalogo.cores.map((cor) => {
      const amostra = botao("amostra", "", () => {
        logo.cor = cor.hex;
        desenharLogo();
        atualizarArte();
        guardar();
      });
      amostra.style.background = cor.hex;
      amostra.setAttribute("aria-label", `Letra ${cor.nome}`);
      amostra.title = cor.nome;
      amostra.setAttribute("aria-pressed", String(logo.cor === cor.hex));
      return amostra;
    }));
  }

  // as técnicas que aquela parte aceita, a da linha primeiro
  const construcao = construcaoDoProduto(produto);
  const { permitidas, recomendada } = tecnicasDaArea(catalogo, produto, construcao, areaDaLogo(produto));
  if (!estado.tecnica || !permitidas.some((t) => t.id === estado.tecnica)) {
    estado.tecnica = (recomendada || permitidas[0] || {}).id || null;
  }
  $("lista-tecnicas").replaceChildren(...permitidas.map((tecnica) => {
    const item = botao("tecnica", "", () => {
      estado.tecnica = tecnica.id;
      desenharLogo();
      atualizarArte();
      guardar();
    });
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", String(estado.tecnica === tecnica.id));
    const nome = document.createElement("strong");
    nome.textContent = tecnica.nome;
    if (recomendada && recomendada.id === tecnica.id) {
      const selo = document.createElement("em");
      selo.textContent = "mais pedido";
      nome.append(selo);
    }
    const explicacao = document.createElement("small");
    explicacao.textContent = tecnica.explicacao || "";
    item.append(nome, explicacao);
    return item;
  }));
}

function lerImagem(arquivo) {
  return new Promise((resolver, recusar) => {
    const endereco = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => recusar(new Error("imagem não abriu"));
    imagem.src = endereco;
  });
}

/** Põe a imagem num quadro, tira o fundo branco se pedido e corta a sobra. */
function prepararImagem(imagem, tirarFundo) {
  const lado = 900;
  const escala = Math.min(1, lado / Math.max(imagem.naturalWidth, imagem.naturalHeight));
  const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
  const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const c = tela.getContext("2d");
  c.drawImage(imagem, 0, 0, largura, altura);
  const dados = c.getImageData(0, 0, largura, altura);
  const p = dados.data;
  // imagem que já vem sem fundo (PNG transparente) não perde o branco: pode ser a letra
  let transparentes = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] < 20) transparentes++;
  const jaSemFundo = transparentes > (p.length / 4) * 0.05;
  let x0 = largura, y0 = altura, x1 = 0, y1 = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (tirarFundo && !jaSemFundo) {
      const claro = Math.min(p[i], p[i + 1], p[i + 2]);
      // perto do branco some; na borda do desenho fica meio transparente
      if (claro > 238) p[i + 3] = 0;
      else if (claro > 215) p[i + 3] = Math.round(p[i + 3] * (238 - claro) / 23);
    }
    if (p[i + 3] > 20) {
      const pixel = i / 4;
      const x = pixel % largura;
      const y = (pixel - x) / largura;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  c.putImageData(dados, 0, 0);
  if (x1 <= x0 || y1 <= y0) return tela;
  const cortada = document.createElement("canvas");
  cortada.width = x1 - x0 + 1;
  cortada.height = y1 - y0 + 1;
  cortada.getContext("2d").drawImage(tela, x0, y0, cortada.width, cortada.height, 0, 0, cortada.width, cortada.height);
  return cortada;
}

async function desenharNome(logo) {
  const texto = (logo.texto || "").trim();
  if (!texto) return null;
  const letras = await carregarLetras(logo.estilo || "forte");
  const { formas, caixa } = montarTexto(letras, texto, { curva: texto.length > 6 ? 18 : 0 });
  if (!formas.length || !caixa.largura) return null;
  const margem = 20;
  const escala = Math.min(1400 / caixa.largura, 600 / caixa.altura);
  const tela = document.createElement("canvas");
  tela.width = Math.ceil(caixa.largura * escala + margem * 2);
  tela.height = Math.ceil(caixa.altura * escala + margem * 2);
  const c = tela.getContext("2d");
  c.fillStyle = logo.cor || "#FFFFFF";
  formas.forEach(({ matriz, d }) => {
    c.setTransform(escala, 0, 0, escala, margem - caixa.x * escala, margem - caixa.y * escala);
    c.transform(...matriz);
    c.fill(new Path2D(d));
  });
  return tela;
}

/** A arte como ela fica pela técnica: bordado tem relevo, aplique tem o tecido atrás. */
function acabarArte(imagem, tecnica) {
  const ehAplique = tecnica && tecnica.startsWith("aplique");
  if (!ehAplique) return imagem;
  const folga = Math.round(Math.max(imagem.width, imagem.height) * 0.08);
  const tela = document.createElement("canvas");
  tela.width = imagem.width + folga * 2;
  tela.height = imagem.height + folga * 2;
  const c = tela.getContext("2d");
  const raio = folga * 1.2;
  c.beginPath();
  c.roundRect(4, 4, tela.width - 8, tela.height - 8, raio);
  c.fillStyle = "#EFE8DA";
  c.fill();
  c.setLineDash([folga * 0.35, folga * 0.25]);
  c.lineWidth = Math.max(3, folga * 0.12);
  c.strokeStyle = "rgba(0,0,0,.35)";
  c.beginPath();
  c.roundRect(folga * 0.45, folga * 0.45, tela.width - folga * 0.9, tela.height - folga * 0.9, raio * 0.7);
  c.stroke();
  c.drawImage(imagem, folga, folga);
  return tela;
}

let pedidoDeArte = 0;
async function atualizarArte() {
  const numero = ++pedidoDeArte;
  const logo = estado.logo;
  let imagem = null;
  if (logo && logo.tipo === "arquivo" && logo.imagem) imagem = prepararImagem(logo.imagem, logo.tirarFundo);
  if (logo && logo.tipo === "nome") {
    try { imagem = await desenharNome(logo); } catch { imagem = null; }
  }
  if (numero !== pedidoDeArte) return;
  if (!imagem) {
    ultimaArte = null;
    emTodos((palco) => palco.colocarArte(null));
    return;
  }
  const final = acabarArte(imagem, estado.tecnica);
  const relevo = ["bordado", "bordado-emborrachado", "silk-alto", "aplique-relevo", "aplique-silk"].includes(estado.tecnica);
  ultimaArte = { imagem: final, proporcao: final.width / final.height, escala: estado.tamanho, relevo };
  emTodos((palco) => palco.colocarArte(ultimaArte));
}

/* ---------- passo 4: pedido ---------- */

function desenharPedido() {
  const produto = produtoAtual();
  const minimo = minimoDoProduto(catalogo, produto);
  if (!estado.quantidade) estado.quantidade = minimo;
  $("quantidade").value = String(estado.quantidade);
  $("quantidade").min = "1";
  const atalhos = [...new Set([minimo, 50, 100, 200, 500])].filter((n) => n >= minimo).sort((a, b) => a - b).slice(0, 4);
  $("atalhos-quantidade").replaceChildren(...atalhos.map((n) => {
    const ficha = botao("ficha", `${n} un.`, () => mudarQuantidade(n));
    ficha.setAttribute("aria-pressed", String(estado.quantidade === n));
    return ficha;
  }));
  const abaixo = estado.quantidade < minimo;
  $("aviso-minimo").hidden = !abaixo;
  $("aviso-minimo").textContent = `O pedido mínimo deste modelo é de ${minimo} unidades.`;
  $("enviar-whatsapp").disabled = abaixo;
  $("nome-cliente").value = estado.cliente || "";
  desenharResumo();
}

function mudarQuantidade(n) {
  estado.quantidade = Math.max(1, Math.round(Number(n) || 0));
  desenharPedido();
  guardar();
}

function descreverCores() {
  const partes = partesAtuais();
  const nomes = partes.map((parte) => {
    const cor = corPorHex(estado.cores[parte.id]);
    return { parte: parte.nome, cor: cor ? cor.nome : estado.cores[parte.id] };
  }).filter((item) => item.cor);
  const unicas = [...new Set(nomes.map((n) => n.cor))];
  if (unicas.length === 1) return `${unicas[0]} (todo)`;
  return nomes.map((n) => `${n.parte} ${n.cor}`).join(", ");
}

function descreverLogo() {
  const logo = estado.logo;
  if (!logo) return "sem logo por enquanto";
  if (logo.tipo === "arquivo") return `minha logo (${logo.arquivo || "imagem enviada"})`;
  const estilo = ESTILOS_DE_LETRA.find((e) => e.id === logo.estilo);
  const cor = corPorHex(logo.cor);
  return `nome escrito: "${(logo.texto || "").trim()}" — letra ${estilo ? estilo.nome : ""}${cor ? `, cor ${cor.nome}` : ""}`;
}

function valores() {
  const produto = produtoAtual();
  const unitario = precoUnitario(catalogo, produto, estado.quantidade);
  return { unitario, total: unitario === null ? null : unitario * estado.quantidade };
}

function desenharResumo() {
  const produto = produtoAtual();
  const tecnica = catalogo.tecnicas.find((t) => t.id === estado.tecnica);
  const { unitario, total } = valores();
  const linhas = [
    ["Modelo", produto.nome],
    ["Cores", descreverCores()],
    ["Logo", descreverLogo()],
    ["Feita em", tecnica ? tecnica.nome : "a combinar"],
    ["Quantidade", `${estado.quantidade} unidades`],
    ["Valor", total === null ? "sob consulta — a fábrica manda o orçamento" : `${formatarMoeda(unitario)}/un · ${formatarMoeda(total)}`],
    ["Entrega", `cerca de 20 dias úteis (${formatarData(calcularPrazo(20))}, se aprovar hoje)`],
  ];
  $("resumo").replaceChildren(...linhas.flatMap(([rotulo, valor]) => {
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    return [dt, dd];
  }));
}

function enviarPedido() {
  const produto = produtoAtual();
  const tecnica = catalogo.tecnicas.find((t) => t.id === estado.tecnica);
  const area = areaDaLogo(produto);
  const { unitario, total } = valores();
  const logo = estado.logo;
  const pedido = {
    referencia: gerarReferencia(),
    cliente: estado.cliente,
    itens: [{
      nome: produto.nome,
      linha: produto.linha,
      quantidade: estado.quantidade,
      aplicacoes: [{
        parte: area.nome,
        tecnica: tecnica ? tecnica.nome : "a combinar",
        observacao: logo && logo.tipo === "nome" ? descreverLogo() : "",
      }],
      cores: descreverCores(),
      variacoes: {},
      arte: logo && logo.tipo === "arquivo"
        ? { origem: `logo enviada no site (${logo.arquivo || "imagem"})`, redesenho: false }
        : null,
      observacoes: "Montei o boné no site e vou anexar a foto dele aqui.",
      unitario,
      total,
    }],
  };
  abrirWhatsapp(catalogo, pedido);
}

async function baixarFoto() {
  const palco = em3d && palco3d ? palco3d : foto && foto.pronto ? foto : null;
  if (!palco) {
    const produto = produtoAtual();
    window.open(produto.imagem, "_blank", "noopener");
    return;
  }
  const blob = await palco.foto();
  if (!blob) return;
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = `meu-bone-${estado.modelo}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 4000);
}

/* ---------- ligar a tela ---------- */

function ligarEventos() {
  document.querySelectorAll(".passos__item").forEach((item) => {
    item.addEventListener("click", () => irPara(item.dataset.ir));
  });
  $("proximo").addEventListener("click", () => irPara(ETAPAS[ETAPAS.indexOf(estado.etapa) + 1]));
  $("voltar").addEventListener("click", () => irPara(ETAPAS[Math.max(0, ETAPAS.indexOf(estado.etapa) - 1)]));
  document.querySelectorAll("[data-vista]").forEach((item) => {
    item.addEventListener("click", () => palco3d && palco3d.olharPara(item.dataset.vista));
  });
  $("girar-3d").addEventListener("click", alternar3d);

  $("arquivo-logo").addEventListener("change", async (evento) => {
    const arquivo = evento.target.files && evento.target.files[0];
    if (!arquivo) return;
    try {
      const imagem = await lerImagem(arquivo);
      estado.logo = { tipo: "arquivo", imagem, arquivo: arquivo.name, tirarFundo: $("tirar-fundo").checked };
      desenharLogo();
      atualizarArte();
      if (em3d && palco3d) palco3d.olharPara("frente");
    } catch {
      alert("Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.");
    }
    evento.target.value = "";
  });
  $("tirar-fundo").addEventListener("change", () => {
    if (estado.logo && estado.logo.tipo === "arquivo") {
      estado.logo.tirarFundo = $("tirar-fundo").checked;
      atualizarArte();
    }
  });
  $("botao-nome").addEventListener("click", () => {
    if (!estado.logo || estado.logo.tipo !== "nome") {
      const principal = estado.cores.frente || estado.cores.copa || "#141414";
      const claro = parseInt(principal.slice(1, 3), 16) + parseInt(principal.slice(3, 5), 16) + parseInt(principal.slice(5, 7), 16) > 500;
      estado.logo = { tipo: "nome", texto: "", estilo: "forte", cor: claro ? "#141414" : "#FFFFFF" };
    }
    desenharLogo();
    $("texto-nome").focus();
    if (em3d && palco3d) palco3d.olharPara("frente");
  });
  $("texto-nome").addEventListener("input", () => {
    if (!estado.logo || estado.logo.tipo !== "nome") return;
    estado.logo.texto = $("texto-nome").value;
    atualizarArte();
    guardar();
  });
  $("tamanho-logo").addEventListener("input", () => {
    estado.tamanho = Number($("tamanho-logo").value);
    atualizarArte();
    guardar();
  });
  $("tirar-logo").addEventListener("click", () => {
    estado.logo = null;
    desenharLogo();
    atualizarArte();
    guardar();
  });

  $("menos").addEventListener("click", () => mudarQuantidade((estado.quantidade || 0) - 5));
  $("mais").addEventListener("click", () => mudarQuantidade((estado.quantidade || 0) + 5));
  $("quantidade").addEventListener("change", () => mudarQuantidade($("quantidade").value));
  $("nome-cliente").addEventListener("input", () => {
    estado.cliente = $("nome-cliente").value;
    guardar();
  });
  $("enviar-whatsapp").addEventListener("click", enviarPedido);
  $("baixar-foto").addEventListener("click", baixarFoto);

  $("tela-3d").addEventListener("pointerdown", () => $("dica-giro").classList.add("sumiu"));
}

async function iniciar() {
  recuperar();
  catalogo = await carregarCatalogo();
  try {
    foto = new FotoDoBone($("tela-foto"));
    // onde fica cada parte e a logo em cada foto (dados/montagem-fotos.json, e o rascunho do ADM)
    const { juntos } = await carregarFotos();
    foto.definirAjustes(juntos);
  } catch (erro) {
    // navegador sem canvas: fica a foto do catálogo, e o resto funciona
    console.warn("Prévia pela foto indisponível:", erro);
    foto = null;
  }
  ligarEventos();
  desenharTipos();
  const pedido = new URLSearchParams(location.search).get("modelo");
  if (pedido && produtoPorId(catalogo, pedido)) escolherModelo(pedido);
  else if (!estado.modelo || !produtoPorId(catalogo, estado.modelo)) escolherModelo(catalogo.produtos[0].id);
  else {
    if (!Object.keys(estado.cores || {}).length) estado.cores = coresIniciais(estado.modelo);
    desenharModelos();
    mostrarModelo();
  }
  irPara("modelo");
}

iniciar().catch((erro) => {
  console.error(erro);
  $("lista-modelos").textContent = "Não consegui carregar os modelos. Confira a internet e recarregue a página.";
});
