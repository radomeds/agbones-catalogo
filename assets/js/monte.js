/* Monte seu boné — uma tela só.

   Em cima, a foto do boné de verdade mudando na hora (foto-bone.js); o 3D
   (bone3d.js) só carrega se o cliente tocar em 3D. Embaixo, três abas —
   Cores, Logo, Pedido — e uma barra fixa com o próximo passo. O modelo se
   troca a qualquer hora pelo botão do topo, que abre uma folha com todos.

   Os modelos, as cores, as técnicas e os mínimos vêm do dados/produtos.json;
   aqui só se liga a escolha do cliente ao boné. */

import {
  carregarCatalogo, linhaPorId, produtoPorId, construcaoDoProduto, tecnicasDaArea,
  minimoDoProduto, precoUnitario, formatarMoeda, calcularPrazo, formatarData, gerarReferencia,
} from "./comum.js";
import { abrirWhatsapp } from "./whatsapp.js";
import { ESTILOS_DE_LETRA, carregarLetras, montarTexto } from "./letras.js";
import { DESENHOS, partesDoDesenho } from "./desenhos.js";
import { FotoDoBone, carregarFotos } from "./foto-bone.js";

const ABAS = ["cores", "logo", "pedido"];
const ROTULO_DO_BOTAO = { cores: "Próximo: sua logo", logo: "Próximo: pedido" };
const GUARDA = "agbones-monte-v2";
const TECNICAS_A_MOSTRA = 3;

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

/* A área da logo (dados/produtos.json) e a parte do boné que a mostra. */
const PARTE_DA_AREA = {
  frente: "frente", "lateral-esquerda": "laterais", "lateral-direita": "laterais",
  traseira: "traseira", aba: "aba",
};

const estado = {
  aba: "cores",
  tipo: "todos",
  modelo: null,
  cores: {},
  parte: "todo",
  logo: null, // { tipo: "arquivo" | "nome", ... }
  tamanho: 1,
  lugar: null,
  tecnica: null,
  quantidade: null,
  cliente: "",
};

let catalogo;
let foto = null; // a foto do boné: a prévia principal
let palco3d = null; // o 3D, criado só quando o cliente pede
let em3d = false;
let ultimaArte = null; // a logo pronta, para o 3D receber a mesma quando abrir
let verTodasTecnicas = false;
let quemAbriuFolha = null;
const $ = (id) => document.getElementById(id);

/* ---------- guardar a escolha (o cliente pode fechar e voltar) ---------- */

function guardar() {
  try {
    const { logo, aba, ...resto } = estado;
    const logoLeve = logo && logo.tipo === "nome" ? logo : null;
    localStorage.setItem(GUARDA, JSON.stringify({ ...resto, logo: logoLeve }));
  } catch { /* sem armazenamento, segue sem lembrar */ }
}

function recuperar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(GUARDA) || "null");
    if (salvo && typeof salvo === "object") Object.assign(estado, salvo, { aba: "cores" });
    return !!(salvo && salvo.modelo);
  } catch { return false; }
}

/* ---------- ajudantes ---------- */

const corPorId = (id) => catalogo.cores.find((c) => c.id === id) || null;
const corPorHex = (hex) => catalogo.cores.find((c) => c.hex.toLowerCase() === String(hex).toLowerCase()) || null;
const produtoAtual = () => produtoPorId(catalogo, estado.modelo);
const partesAtuais = () => partesDoDesenho(estado.modelo);

function botao(classe, texto, aoTocar) {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.className = classe;
  if (texto) elemento.textContent = texto;
  elemento.addEventListener("click", aoTocar);
  return elemento;
}

function bolinha(hex) {
  const ponto = document.createElement("i");
  ponto.className = "cor-ponto";
  ponto.style.background = hex || "conic-gradient(#141414 0 25%, #fff 0 50%, #1B4FA0 0 75%, #B3202C 0)";
  return ponto;
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
    avisar("Essa parte não aparece nesta foto. Toque em 3D para ver.");
  }
}

/** A área principal da logo (a frente, ou a fita no chapéu de juta): a que a foto mostra. */
function areaPrincipal(produto) {
  return (produto.areas || [])[0] || { id: "frente", nome: "Frente" };
}

function areaEscolhida(produto) {
  return (produto.areas || []).find((a) => a.id === estado.lugar) || areaPrincipal(produto);
}

function minimoAtual() {
  return minimoDoProduto(catalogo, produtoAtual());
}

/* ---------- as abas ---------- */

function irPara(aba, { empurrar = true } = {}) {
  if (!ABAS.includes(aba)) aba = "cores";
  const mudou = estado.aba !== aba;
  estado.aba = aba;
  if (empurrar && mudou) history.pushState({ aba }, "");
  document.querySelectorAll(".etapa").forEach((secao) => { secao.hidden = secao.dataset.etapa !== aba; });
  document.querySelectorAll(".abas__item").forEach((item) => {
    item.setAttribute("aria-selected", String(item.dataset.aba === aba));
    item.tabIndex = item.dataset.aba === aba ? 0 : -1;
  });
  if (aba === "cores") desenharCores();
  if (aba === "logo") desenharLogo();
  if (aba === "pedido") desenharPedido();
  clearTimeout(avisoQueSome);
  if (!em3d) $("dica-giro").classList.add("sumiu");
  if (aba === "logo" && em3d && palco3d) palco3d.olharPara(PARTE_DA_AREA[estado.lugar] || "frente");
  atualizarBarra();
  if (mudou) levarAoTopoDoPainel();
  guardar();
}

/** Depois de trocar de aba, a escolha começa do topo, logo abaixo do boné. */
function levarAoTopoDoPainel() {
  $("painel").scrollTop = 0;
}

function atualizarMarcas() {
  $("marca-cores").classList.toggle("feito", !!estado.modelo);
  $("marca-logo").classList.toggle("feito", !!estado.logo);
  $("marca-pedido").classList.toggle("feito", false);
}

function atualizarBarra() {
  const produto = produtoAtual();
  const acao = $("proximo");
  atualizarMarcas();
  if (!produto) {
    $("info-barra").textContent = "";
    acao.textContent = "Escolher o modelo";
    acao.classList.remove("botao--zap");
    acao.disabled = false;
    return;
  }
  const minimo = minimoAtual();
  if (estado.aba === "pedido") {
    const quantidade = estado.quantidade || minimo;
    const { total } = valores();
    const info = document.createElement("strong");
    info.textContent = `${quantidade} un.`;
    $("info-barra").replaceChildren(info, total === null ? "valor sob consulta" : formatarMoeda(total));
    acao.textContent = "Enviar no WhatsApp";
    acao.classList.add("botao--zap");
    acao.disabled = quantidade < minimo;
  } else {
    const nome = document.createElement("strong");
    nome.textContent = produto.nome;
    $("info-barra").replaceChildren(nome, `mínimo ${minimo} unidades`);
    acao.textContent = ROTULO_DO_BOTAO[estado.aba];
    acao.classList.remove("botao--zap");
    acao.disabled = false;
  }
}

function aoTocarNaBarra() {
  if (!estado.modelo) return abrirFolha();
  if (estado.aba === "pedido") return enviarPedido();
  irPara(ABAS[ABAS.indexOf(estado.aba) + 1]);
}

/* ---------- a folha dos modelos ---------- */

function abrirFolha() {
  const folha = $("folha-modelos");
  if (!folha.hidden) return;
  quemAbriuFolha = document.activeElement;
  desenharTipos();
  desenharModelos();
  folha.hidden = false;
  document.body.classList.add("com-folha");
  $("trocar-modelo").setAttribute("aria-expanded", "true");
  history.pushState({ aba: estado.aba, folha: true }, "");
  const escolhido = folha.querySelector('.modelo[aria-pressed="true"]');
  (escolhido || $("fechar-modelos")).focus({ preventScroll: true });
  if (escolhido) escolhido.scrollIntoView({ block: "nearest" });
}

function fecharFolha({ peloHistorico = false } = {}) {
  const folha = $("folha-modelos");
  if (folha.hidden) return;
  folha.hidden = true;
  document.body.classList.remove("com-folha");
  $("trocar-modelo").setAttribute("aria-expanded", "false");
  if (!peloHistorico && history.state && history.state.folha) history.back();
  if (quemAbriuFolha && quemAbriuFolha.focus) quemAbriuFolha.focus({ preventScroll: true });
}

function desenharTipos() {
  const tipos = TIPOS.filter((tipo) => tipo.id === "todos" || catalogo.produtos.some((p) => p.categoria === tipo.id));
  $("filtro-tipo").replaceChildren(...tipos.map((tipo) => {
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
    const cartao = botao("modelo", "", () => {
      escolherModelo(produto.id);
      fecharFolha();
    });
    cartao.setAttribute("aria-pressed", String(estado.modelo === produto.id));
    const imagem = document.createElement("img");
    // a foto limpa da montagem (sem o "sua logo aqui"); se faltar, a do catálogo
    imagem.src = `assets/produtos/montagem/${produto.id}.webp`;
    imagem.addEventListener("error", () => { imagem.src = produto.imagem; }, { once: true });
    imagem.alt = "";
    imagem.loading = "lazy";
    imagem.decoding = "async";
    imagem.width = 320;
    imagem.height = 320;
    const nome = document.createElement("strong");
    nome.textContent = produto.nome;
    const detalhe = document.createElement("small");
    detalhe.textContent = `${linha ? linha.nome.replace(/^linha\s+/i, "") + " · " : ""}mín. ${minimoDoProduto(catalogo, produto)}`;
    cartao.append(imagem, nome, detalhe);
    return cartao;
  }));
}

function coresIniciais(id) {
  const cor = corPorId(COR_INICIAL[id] || "preto") || catalogo.cores[0];
  const cores = {};
  partesDoDesenho(id).forEach((parte) => { cores[parte.id] = cor.hex; });
  // a tela do trucker sai branca, como a maioria dos pedidos
  if (DESENHOS[id] && DESENHOS[id].tela) {
    cores.laterais = "#FFFFFF";
    cores.traseira = "#FFFFFF";
  }
  return cores;
}

function escolherModelo(id) {
  const trocou = estado.modelo !== id;
  estado.modelo = id;
  if (trocou) {
    estado.cores = coresIniciais(id);
    estado.parte = "todo";
    estado.lugar = null;
    estado.tecnica = null;
    estado.quantidade = null;
    verTodasTecnicas = false;
  }
  mostrarModelo();
  irPara(estado.aba, { empurrar: false });
}

function mostrarModelo() {
  const produto = produtoAtual();
  if (!produto) return;
  if (!estado.lugar || !(produto.areas || []).some((a) => a.id === estado.lugar)) {
    estado.lugar = areaPrincipal(produto).id;
  }
  $("nome-modelo").textContent = produto.nome;
  document.title = `Monte seu boné: ${produto.nome} — AG Bonés`;
  if (foto) {
    foto.montar(produto.id, estado.cores).then(() => {
      $("foto-reserva").hidden = true;
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
  const chave = $("girar-3d");
  if (!palco3d) {
    chave.disabled = true;
    $("girar-texto").textContent = "Abrindo…";
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
      chave.hidden = true;
      avisar("O 3D não abre neste aparelho. A foto mostra o boné do mesmo jeito.", 5000);
      return;
    } finally {
      chave.disabled = false;
    }
  }
  em3d = !em3d;
  $("girar-texto").textContent = em3d ? "Foto" : "3D";
  chave.setAttribute("aria-label", em3d ? "Voltar para a foto" : "Girar o boné em 3D");
  chave.setAttribute("aria-pressed", String(em3d));
  const fotoFalhou = !foto || !foto.pronto;
  $("tela-foto").hidden = em3d || fotoFalhou;
  $("foto-reserva").hidden = em3d || !fotoFalhou;
  $("tela-3d").hidden = !em3d;
  document.querySelector(".palco__vistas").hidden = !em3d;
  palco3d.pausar(!em3d);
  if (em3d) avisar("Arraste para girar", 4000);
  else $("dica-giro").classList.add("sumiu");
}

/* ---------- aba Cores ---------- */

function desenharCores() {
  const partes = partesAtuais();
  const varias = partes.length > 1;
  if (!varias) estado.parte = partes[0] ? partes[0].id : "todo";
  const lista = varias ? [{ id: "todo", nome: partes.length > 2 ? "Boné todo" : "Tudo" }, ...partes] : [];
  $("lista-partes").hidden = !varias;
  $("lista-partes").previousElementSibling.hidden = !varias;
  $("lista-partes").replaceChildren(...lista.map((parte) => {
    const ficha = botao("ficha", "", () => {
      estado.parte = parte.id;
      if (parte.id !== "todo") mostrarParte(parte.id);
      desenharCores();
    });
    ficha.append(bolinha(parte.id === "todo" ? null : estado.cores[parte.id]), parte.nome);
    ficha.setAttribute("aria-pressed", String(estado.parte === parte.id));
    return ficha;
  }));

  const corDaParte = estado.parte === "todo" ? null : estado.cores[estado.parte];
  const unica = [...new Set(partes.map((p) => String(estado.cores[p.id]).toLowerCase()))];
  const corDoTodo = estado.parte === "todo" && unica.length === 1 ? unica[0] : null;
  const marcada = (corDaParte || corDoTodo || "").toLowerCase();
  $("lista-cores").replaceChildren(...catalogo.cores.map((cor) => {
    const amostra = botao("amostra", "", () => pintar(cor));
    amostra.style.background = cor.hex;
    amostra.title = cor.nome;
    amostra.setAttribute("aria-label", cor.nome);
    amostra.setAttribute("aria-pressed", String(marcada === cor.hex.toLowerCase()));
    return amostra;
  }));

  const parte = varias ? lista.find((p) => p.id === estado.parte) : partes[0];
  const cor = corPorHex(corDaParte || corDoTodo || "");
  const rotulo = $("cor-escolhida");
  rotulo.replaceChildren(`Cor ${parte && parte.id !== "todo" ? `— ${parte.nome}` : varias ? "do boné todo" : ""}`);
  if (cor) {
    const forte = document.createElement("strong");
    forte.textContent = `: ${cor.nome}`;
    rotulo.append(forte);
  }

  const temCombinacao = partes.length > 2;
  $("bloco-combinacoes").hidden = !temCombinacao;
  if (temCombinacao) {
    $("lista-combinacoes").replaceChildren(...COMBINACOES.map((combinacao) => {
      const item = botao("ficha ficha--combinacao", "", () => aplicarCombinacao(combinacao));
      const par = document.createElement("span");
      par.className = "par";
      par.append(bolinha(corPorId(combinacao.principal).hex), bolinha(corPorId(combinacao.contraste).hex));
      item.append(par, combinacao.nome);
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
  const comTela = (DESENHOS[estado.modelo] || {}).tela;
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

/* ---------- aba Logo ---------- */

function desenharLogo() {
  const produto = produtoAtual();
  if (!produto) return;
  const logo = estado.logo;
  $("escolha-logo").hidden = !!logo;
  $("logo-atual").hidden = !logo;
  $("ajuste-nome").hidden = !(logo && logo.tipo === "nome");
  $("ajuste-logo").hidden = !(logo && logo.tipo === "arquivo");
  $("ajuste-lugar").hidden = !logo;
  $("trocar-logo").hidden = !(logo && logo.tipo === "arquivo");
  $("tamanho-logo").value = String(estado.tamanho);
  if (!logo) return;

  $("logo-atual-nome").textContent = logo.tipo === "arquivo" ? "Sua logo" : "Nome escrito";
  $("logo-atual-detalhe").textContent = logo.tipo === "arquivo"
    ? (logo.arquivo || "imagem enviada")
    : ((logo.texto || "").trim() || "escreva abaixo");

  if (logo.tipo === "nome") {
    if ($("texto-nome").value !== (logo.texto || "")) $("texto-nome").value = logo.texto || "";
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
      amostra.setAttribute("aria-pressed", String(String(logo.cor).toLowerCase() === cor.hex.toLowerCase()));
      return amostra;
    }));
  }

  // onde vai: as áreas do modelo; a foto só desenha a principal
  const areas = produto.areas || [];
  $("lista-lugares").replaceChildren(...areas.map((area) => {
    const ficha = botao("ficha", area.nome, () => {
      estado.lugar = area.id;
      desenharLogo();
      atualizarArte();
      if (PARTE_DA_AREA[area.id] && em3d) mostrarParte(PARTE_DA_AREA[area.id]);
      guardar();
    });
    ficha.setAttribute("aria-pressed", String(estado.lugar === area.id));
    return ficha;
  }));
  $("lista-lugares").previousElementSibling.hidden = areas.length <= 1;
  $("lista-lugares").hidden = areas.length <= 1;
  const naPrincipal = estado.lugar === areaPrincipal(produto).id;
  $("nota-lugar").hidden = naPrincipal;
  $("nota-lugar").textContent = naPrincipal ? ""
    : `A foto mostra a logo só na ${areaPrincipal(produto).nome.toLowerCase()}. ` +
      `Na ${areaEscolhida(produto).nome.toLowerCase()}, ela vai descrita no pedido e a fábrica manda a prova.`;
  $("campo-tamanho").hidden = !naPrincipal;

  // como vai ser feita: as técnicas que aquela área aceita, a mais pedida primeiro
  const construcao = construcaoDoProduto(produto);
  const { permitidas, recomendada } = tecnicasDaArea(catalogo, produto, construcao, areaEscolhida(produto));
  if (!estado.tecnica || !permitidas.some((t) => t.id === estado.tecnica)) {
    estado.tecnica = (recomendada || permitidas[0] || {}).id || null;
  }
  const ordem = [recomendada, permitidas.find((t) => t.id === estado.tecnica), ...permitidas].filter(Boolean);
  const unicas = [...new Map(ordem.map((t) => [t.id, t])).values()];
  const mostrar = verTodasTecnicas ? unicas : unicas.slice(0, TECNICAS_A_MOSTRA);
  $("lista-tecnicas").replaceChildren(...mostrar.map((tecnica) => {
    const item = botao("tecnica", "", () => {
      estado.tecnica = tecnica.id;
      desenharLogo();
      atualizarArte();
      guardar();
    });
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", String(estado.tecnica === tecnica.id));
    const nome = document.createElement("span");
    nome.textContent = tecnica.nome;
    item.append(nome);
    if (recomendada && recomendada.id === tecnica.id) {
      const selo = document.createElement("em");
      selo.textContent = "mais pedido";
      item.append(selo);
    }
    return item;
  }));
  const sobra = unicas.length - TECNICAS_A_MOSTRA;
  $("mais-tecnicas").hidden = sobra <= 0;
  $("mais-tecnicas").textContent = verTodasTecnicas ? "Mostrar menos" : `Ver mais ${sobra} forma${sobra > 1 ? "s" : ""}`;
  $("mais-tecnicas").setAttribute("aria-expanded", String(verTodasTecnicas));
  const escolhida = catalogo.tecnicas.find((t) => t.id === estado.tecnica);
  $("explica-tecnica").textContent = escolhida ? escolhida.explicacao || "" : "Essa área não aceita aplicação neste modelo.";
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

async function receberArquivo(evento) {
  const arquivo = evento.target.files && evento.target.files[0];
  if (!arquivo) return;
  try {
    const imagem = await lerImagem(arquivo);
    estado.logo = { tipo: "arquivo", imagem, arquivo: arquivo.name, tirarFundo: $("tirar-fundo").checked };
    desenharLogo();
    atualizarArte();
    atualizarMarcas();
    if (em3d && palco3d) palco3d.olharPara("frente");
  } catch {
    avisar("Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.", 5000);
  }
  evento.target.value = "";
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

/** A arte como ela fica pela técnica: aplique tem o tecido atrás, com a costura. */
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

/** A miniatura da logo na aba, num fundo da cor da frente, como fica no boné. */
function desenharMiniatura(imagem) {
  const tela = $("miniatura-logo");
  const c = tela.getContext("2d");
  c.clearRect(0, 0, tela.width, tela.height);
  c.fillStyle = estado.cores.frente || estado.cores.copa || Object.values(estado.cores)[0] || "#E8ECF3";
  c.fillRect(0, 0, tela.width, tela.height);
  if (!imagem) return;
  const folga = 10;
  const escala = Math.min((tela.width - folga * 2) / imagem.width, (tela.height - folga * 2) / imagem.height);
  const l = imagem.width * escala;
  const a = imagem.height * escala;
  c.drawImage(imagem, (tela.width - l) / 2, (tela.height - a) / 2, l, a);
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
  const produto = produtoAtual();
  const final = imagem ? acabarArte(imagem, estado.tecnica) : null;
  desenharMiniatura(final);
  // a foto só sabe desenhar a logo na área principal; nas outras ela vai descrita
  const naFoto = final && produto && estado.lugar === areaPrincipal(produto).id;
  if (!naFoto) {
    ultimaArte = null;
    emTodos((palco) => palco.colocarArte(null));
    return;
  }
  const relevo = ["bordado", "bordado-emborrachado", "silk-alto", "aplique-relevo", "aplique-silk"].includes(estado.tecnica);
  ultimaArte = { imagem: final, proporcao: final.width / final.height, escala: estado.tamanho, relevo };
  emTodos((palco) => palco.colocarArte(ultimaArte));
}

/* ---------- aba Pedido ---------- */

function desenharPedido() {
  const minimo = minimoAtual();
  if (!estado.quantidade) estado.quantidade = minimo;
  if (document.activeElement !== $("quantidade")) $("quantidade").value = String(estado.quantidade);
  const atalhos = [...new Set([minimo, 50, 100, 200, 500])].filter((n) => n >= minimo).sort((a, b) => a - b).slice(0, 4);
  $("atalhos-quantidade").replaceChildren(...atalhos.map((n) => {
    const ficha = botao("ficha", `${n}`, () => mudarQuantidade(n));
    ficha.setAttribute("aria-label", `${n} unidades`);
    ficha.setAttribute("aria-pressed", String(estado.quantidade === n));
    return ficha;
  }));
  const abaixo = estado.quantidade < minimo;
  $("aviso-minimo").hidden = !abaixo;
  $("aviso-minimo").textContent = `O pedido mínimo deste modelo é de ${minimo} unidades.`;
  if (document.activeElement !== $("nome-cliente")) $("nome-cliente").value = estado.cliente || "";
  desenharResumo();
  atualizarBarra();
}

function mudarQuantidade(n) {
  estado.quantidade = Math.max(1, Math.round(Number(n) || 0));
  desenharPedido();
  guardar();
}

function descreverCores() {
  const nomes = partesAtuais().map((parte) => {
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
  const quantidade = estado.quantidade || minimoAtual();
  const unitario = precoUnitario(catalogo, produto, quantidade);
  return { unitario, total: unitario === null ? null : unitario * quantidade };
}

function desenharResumo() {
  const produto = produtoAtual();
  const linha = linhaPorId(catalogo, produto.linha);
  const tecnica = catalogo.tecnicas.find((t) => t.id === estado.tecnica);
  const area = areaEscolhida(produto);
  const { unitario, total } = valores();
  const linhas = [
    ["Modelo", `${produto.nome}${linha ? ` · ${linha.nome}` : ""}`],
    ["Cores", descreverCores()],
    ["Logo", estado.logo ? `${descreverLogo()} · ${tecnica ? tecnica.nome : "a combinar"}, na ${area.nome.toLowerCase()}` : "sem logo por enquanto"],
    ["Valor", total === null ? "sob consulta — a fábrica manda o orçamento" : `${formatarMoeda(unitario)}/un · ${formatarMoeda(total)}`],
    ["Entrega", `20 dias úteis — até ${formatarData(calcularPrazo(20))}, se aprovar hoje`],
  ];
  $("resumo").replaceChildren(...linhas.map(([rotulo, valor]) => {
    const item = document.createElement("li");
    const nome = document.createElement("span");
    nome.textContent = rotulo;
    const texto = document.createElement("strong");
    texto.textContent = valor;
    item.append(nome, texto);
    return item;
  }));
}

function enviarPedido() {
  const produto = produtoAtual();
  const minimo = minimoAtual();
  if (!estado.quantidade) estado.quantidade = minimo;
  if (estado.quantidade < minimo) {
    irPara("pedido");
    return;
  }
  const tecnica = catalogo.tecnicas.find((t) => t.id === estado.tecnica);
  const area = areaEscolhida(produto);
  const { unitario, total } = valores();
  const logo = estado.logo;
  const pedido = {
    referencia: gerarReferencia(),
    cliente: estado.cliente,
    itens: [{
      nome: produto.nome,
      linha: produto.linha,
      quantidade: estado.quantidade,
      aplicacoes: logo ? [{
        parte: area.nome,
        tecnica: tecnica ? tecnica.nome : "a combinar",
        observacao: logo.tipo === "nome" ? descreverLogo() : "",
      }] : [],
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
    window.open(produtoAtual().imagem, "_blank", "noopener");
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
  document.querySelectorAll(".abas__item").forEach((item) => {
    item.addEventListener("click", () => irPara(item.dataset.aba));
  });
  // setas do teclado entre as abas, como pede o padrão de abas
  document.querySelector(".abas").addEventListener("keydown", (evento) => {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[evento.key];
    if (!passo) return;
    const proxima = ABAS[(ABAS.indexOf(estado.aba) + passo + ABAS.length) % ABAS.length];
    irPara(proxima);
    document.querySelector(`.abas__item[data-aba="${proxima}"]`).focus();
  });
  $("proximo").addEventListener("click", aoTocarNaBarra);
  $("trocar-modelo").addEventListener("click", abrirFolha);
  document.querySelectorAll("[data-fechar]").forEach((item) => item.addEventListener("click", () => fecharFolha()));
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !$("folha-modelos").hidden) fecharFolha();
  });
  window.addEventListener("popstate", (evento) => {
    const marca = evento.state || {};
    if (!marca.folha) fecharFolha({ peloHistorico: true });
    irPara(marca.aba || "cores", { empurrar: false });
  });

  document.querySelectorAll("[data-vista]").forEach((item) => {
    item.addEventListener("click", () => palco3d && palco3d.olharPara(item.dataset.vista));
  });
  $("girar-3d").addEventListener("click", alternar3d);
  $("tela-3d").addEventListener("pointerdown", () => $("dica-giro").classList.add("sumiu"));

  $("arquivo-logo").addEventListener("change", receberArquivo);
  $("arquivo-troca").addEventListener("change", receberArquivo);
  $("tirar-fundo").addEventListener("change", () => {
    if (estado.logo && estado.logo.tipo === "arquivo") {
      estado.logo.tirarFundo = $("tirar-fundo").checked;
      atualizarArte();
    }
  });
  $("botao-nome").addEventListener("click", () => {
    const principal = estado.cores.frente || estado.cores.copa || "#141414";
    const soma = parseInt(principal.slice(1, 3), 16) + parseInt(principal.slice(3, 5), 16) + parseInt(principal.slice(5, 7), 16);
    estado.logo = { tipo: "nome", texto: "", estilo: "forte", cor: soma > 500 ? "#141414" : "#FFFFFF" };
    desenharLogo();
    atualizarMarcas();
    $("texto-nome").focus();
    if (em3d && palco3d) palco3d.olharPara("frente");
  });
  $("texto-nome").addEventListener("input", () => {
    if (!estado.logo || estado.logo.tipo !== "nome") return;
    estado.logo.texto = $("texto-nome").value;
    $("logo-atual-detalhe").textContent = estado.logo.texto.trim() || "escreva abaixo";
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
    atualizarMarcas();
    guardar();
  });
  $("mais-tecnicas").addEventListener("click", () => {
    verTodasTecnicas = !verTodasTecnicas;
    desenharLogo();
  });

  $("menos").addEventListener("click", () => mudarQuantidade((estado.quantidade || 0) - 5));
  $("mais").addEventListener("click", () => mudarQuantidade((estado.quantidade || 0) + 5));
  $("quantidade").addEventListener("input", () => {
    const n = Math.round(Number($("quantidade").value));
    if (n > 0) {
      estado.quantidade = n;
      desenharPedido();
      guardar();
    }
  });
  $("quantidade").addEventListener("change", () => mudarQuantidade($("quantidade").value));
  $("nome-cliente").addEventListener("input", () => {
    estado.cliente = $("nome-cliente").value;
    guardar();
  });
  $("baixar-foto").addEventListener("click", baixarFoto);
}

async function iniciar() {
  const tinhaEscolha = recuperar();
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
  history.replaceState({ aba: "cores" }, "");
  const pedido = new URLSearchParams(location.search).get("modelo");
  if (pedido && produtoPorId(catalogo, pedido)) {
    escolherModelo(pedido);
  } else if (tinhaEscolha && produtoPorId(catalogo, estado.modelo)) {
    if (!Object.keys(estado.cores || {}).length) estado.cores = coresIniciais(estado.modelo);
    mostrarModelo();
    irPara("cores", { empurrar: false });
  } else {
    // primeira vez: um boné já aparece, e a folha abre para o cliente escolher o dele
    escolherModelo(catalogo.produtos[0].id);
    abrirFolha();
  }
}

iniciar().catch((erro) => {
  console.error(erro);
  $("info-barra").textContent = "Não consegui carregar os modelos. Confira a internet e recarregue a página.";
});
