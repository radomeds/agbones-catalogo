/* Arquivo de produção e conferidor, feitos no aparelho do cliente, sem servidor.

   - Arquivo: a arte montada em "Criar arte" ou a logo de "Sua logo" sai em PDF, EPS ou DXF,
     no tamanho de verdade (milímetros), pelo VectorCraft (ArtCraft, storytold, MIT ou Apache-2.0)
     compilado para WebAssembly em assets/wasm/producao-agbones.wasm. Esse motor é pesado
     (cerca de 3,8 MB compactado), então só baixa no primeiro toque num dos botões.
     Como refazer: ferramentas/producao-wasm/LEIA-ME.md.
   - Conferidor: área de cada cor (base para o orçamento, sem preço) e partes finas demais para
     a técnica, pelo motor pequeno do contorno (assets/wasm/arte-agbones.wasm).

   As medidas de partida (largura por parte, traço mínimo por técnica) vêm de
   dados/produtos.json, bloco "producao". Estão marcadas como provisórias até a fábrica
   confirmar. */

const NS = "http://www.w3.org/2000/svg";
const FORMATOS = { pdf: 0, eps: 1, dxf: 2 };
const TIPOS = { pdf: "application/pdf", eps: "application/postscript", dxf: "image/vnd.dxf" };

/* ---------- trabalhadores ---------- */

const trabalhadores = {};
let ultimoPedido = 0;
const esperando = new Map();

function obterTrabalhador(arquivo) {
  if (trabalhadores[arquivo]) return trabalhadores[arquivo];
  const trabalhador = new Worker(new URL(arquivo, import.meta.url), { type: "module" });
  trabalhador.onmessage = (evento) => {
    const resolver = esperando.get(evento.data.pedido);
    esperando.delete(evento.data.pedido);
    if (resolver) resolver(evento.data);
  };
  trabalhadores[arquivo] = trabalhador;
  return trabalhador;
}

function pedir(arquivo, mensagem, transferir = []) {
  const pedido = ++ultimoPedido;
  const resposta = new Promise((resolver) => esperando.set(pedido, resolver));
  obterTrabalhador(arquivo).postMessage({ pedido, ...mensagem }, transferir);
  return resposta;
}

/** Diz se o aparelho roda os motores (Worker e WebAssembly). */
export function producaoDisponivel() {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof DOMParser !== "undefined";
}

/* ---------- a arte em milímetros ---------- */

function lerDataUrl(endereco) {
  const virgula = endereco.indexOf(",");
  const cabeca = endereco.slice(0, virgula);
  const corpo = endereco.slice(virgula + 1);
  if (/;base64/i.test(cabeca)) {
    const binario = atob(corpo);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(corpo);
}

function caixaDoSvg(svg) {
  const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return vb;
  const w = parseFloat(svg.getAttribute("width")) || 100;
  const h = parseFloat(svg.getAttribute("height")) || 100;
  return [0, 0, w, h];
}

/** Troca a imagem de uma logo em vetor (SVG dentro de data:) pelos caminhos dela, para o
    arquivo sair todo em curvas. Imagem de pixels fica como está. */
function abrirLogosEmVetor(documento) {
  let temImagem = false;
  documento.querySelectorAll("image").forEach((imagem) => {
    const href = imagem.getAttribute("href") || imagem.getAttribute("xlink:href") || "";
    if (!/^data:image\/svg\+xml/i.test(href)) {
      temImagem = true;
      return;
    }
    let interno;
    try {
      interno = new DOMParser().parseFromString(lerDataUrl(href), "image/svg+xml").documentElement;
    } catch (erro) {
      temImagem = true;
      return;
    }
    if (!interno || interno.nodeName !== "svg") {
      temImagem = true;
      return;
    }
    const [vx, vy, vw, vh] = caixaDoSvg(interno);
    const x = parseFloat(imagem.getAttribute("x")) || 0;
    const y = parseFloat(imagem.getAttribute("y")) || 0;
    const w = parseFloat(imagem.getAttribute("width")) || vw;
    const h = parseFloat(imagem.getAttribute("height")) || vh;
    // preserveAspectRatio="xMidYMid meet", o padrão do montador
    const escala = Math.min(w / vw, h / vh);
    const dx = x + (w - vw * escala) / 2 - vx * escala;
    const dy = y + (h - vh * escala) / 2 - vy * escala;
    const grupo = documento.createElementNS(NS, "g");
    grupo.setAttribute("transform", `matrix(${escala} 0 0 ${escala} ${dx} ${dy})`);
    Array.from(interno.childNodes).forEach((filho) => {
      if (filho.nodeType === 1 && !/^(title|desc|metadata)$/i.test(filho.nodeName)) {
        grupo.append(documento.importNode(filho, true));
      }
    });
    imagem.replaceWith(grupo);
  });
  return temImagem;
}

/** A arte em milímetros: o SVG ganha largura e altura em mm (a proporção não muda) e a logo em
    vetor vira caminhos. Devolve { svg, largura, altura, temImagem, semImagem } — semImagem é a
    versão sem as imagens de pixels, para o DXF, que é só linha. */
export function arteEmMilimetros(svgTexto, larguraMm) {
  const documento = new DOMParser().parseFromString(svgTexto, "image/svg+xml");
  const raiz = documento.documentElement;
  const [, , vw, vh] = caixaDoSvg(raiz);
  if (!raiz.getAttribute("viewBox")) raiz.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  const largura = Math.max(1, Number(larguraMm) || 100);
  const altura = Math.round((largura * vh / vw) * 10) / 10;
  raiz.setAttribute("width", `${largura}mm`);
  raiz.setAttribute("height", `${altura}mm`);
  const temImagem = abrirLogosEmVetor(documento);
  const serializar = () => new XMLSerializer().serializeToString(documento);
  const svg = serializar();
  documento.querySelectorAll("image").forEach((imagem) => imagem.remove());
  return { svg, semImagem: serializar(), largura, altura, temImagem };
}

/* ---------- o arquivo ---------- */

/** Gera o arquivo de produção. Devolve um Blob ou lança o erro do motor. */
export async function gerarArquivo(arte, formato) {
  const svg = formato === "dxf" ? arte.semImagem : arte.svg;
  const resposta = await pedir("./producao-trabalhador.js", { svg, formato: FORMATOS[formato] });
  if (resposta.erro) throw new Error(resposta.erro);
  return new Blob([resposta.bytes], { type: TIPOS[formato] });
}

function baixarBlob(blob, nome) {
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 4000);
}

/* ---------- o conferidor ---------- */

function corEmHex(cor) {
  const n = String(cor).match(/[\d.]+/g);
  if (!n || n.length < 3) return null;
  return "#" + n.slice(0, 3).map((v) => Math.round(Number(v)).toString(16).padStart(2, "0")).join("");
}

function caminhoDe(elemento) {
  const num = (nome) => parseFloat(elemento.getAttribute(nome)) || 0;
  switch (elemento.nodeName) {
    case "path": return elemento.getAttribute("d") || "";
    case "rect": {
      const x = num("x"), y = num("y"), w = num("width"), h = num("height");
      return w > 0 && h > 0 ? `M${x} ${y}H${x + w}V${y + h}H${x}Z` : "";
    }
    case "circle":
    case "ellipse": {
      const cx = num("cx"), cy = num("cy");
      const rx = elemento.nodeName === "circle" ? num("r") : num("rx");
      const ry = elemento.nodeName === "circle" ? num("r") : num("ry");
      return rx > 0 && ry > 0
        ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` : "";
    }
    case "polygon":
    case "polyline": {
      const p = (elemento.getAttribute("points") || "").trim();
      return p ? `M${p}${elemento.nodeName === "polygon" ? "Z" : ""}` : "";
    }
    default: return "";
  }
}

/** As formas da arte, em mm, na ordem de pintura: `cor;matriz;regra;largura;caminho`.
    O navegador resolve as transformações e as cores herdadas: a arte vai para a página,
    escondida, com 1 unidade da tela = 1 mm. */
function formasEmMilimetros(arte) {
  const caixa = document.createElement("div");
  caixa.style.cssText = "position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none";
  caixa.setAttribute("aria-hidden", "true");
  caixa.innerHTML = arte.semImagem;
  const svg = caixa.querySelector("svg");
  svg.setAttribute("width", arte.largura);
  svg.setAttribute("height", arte.altura);
  document.body.append(caixa);
  const linhas = [];
  try {
    svg.querySelectorAll("path, rect, circle, ellipse, polygon, polyline").forEach((elemento) => {
      if (elemento.closest("defs, clipPath, mask, pattern, symbol")) return;
      const d = caminhoDe(elemento);
      const m = elemento.getCTM && elemento.getCTM();
      if (!d || !m) return;
      const estilo = getComputedStyle(elemento);
      if (estilo.display === "none" || estilo.visibility === "hidden") return;
      const matriz = [m.a, m.b, m.c, m.d, m.e, m.f].map((n) => Math.round(n * 1e5) / 1e5).join(" ");
      const regra = estilo.fillRule === "evenodd" ? "e" : "n";
      const preenche = estilo.fill && estilo.fill !== "none" && Number(estilo.fillOpacity) !== 0 && elemento.nodeName !== "polyline";
      const corPreenche = preenche ? corEmHex(estilo.fill) : null;
      if (corPreenche) linhas.push(`${corPreenche};${matriz};${regra};0;${d}`);
      const largura = parseFloat(estilo.strokeWidth) || 0;
      const corTraco = estilo.stroke && estilo.stroke !== "none" && largura > 0 ? corEmHex(estilo.stroke) : null;
      if (corTraco) linhas.push(`${corTraco};${matriz};n;${largura};${d}`);
    });
  } finally {
    caixa.remove();
  }
  return linhas.join("\n");
}

/** Confere a arte para a técnica: { cores: [{cor, area}], silhueta: {area, corte, largura,
    altura}, fino: {area, partes, caminho} } em mm² e mm, ou { erro }. */
export async function conferirProducao(arte, minimoMm, pelaSilhueta) {
  const linhas = formasEmMilimetros(arte);
  if (!linhas) return { erro: "nada para conferir" };
  return pedir("./contorno-trabalhador.js", {
    tipo: "conferir",
    linhas,
    minimo: Math.max(0, Math.round(minimoMm * 100)),
    modo: pelaSilhueta ? 1 : 0,
  });
}

/* ---------- o bloco na tela ---------- */

const numero = (n, casas = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function medidaDaTecnica(producao, tecnicaId) {
  const regras = (producao && producao.tecnicas) || {};
  const regra = regras[tecnicaId] || {};
  const padrao = (producao && producao.padrao) || {};
  return {
    minimo: Number(regra.traco_minimo_mm || padrao.traco_minimo_mm || 1),
    corte: Boolean(regra.corte),
  };
}

/** Largura de partida da parte (mm), de produtos.json; o cliente pode mudar. */
export function larguraDaParte(producao, parteId) {
  const larguras = (producao && producao.largura_mm) || {};
  return Number(larguras[parteId] || larguras.padrao || 80);
}

/** Monta o bloco "Arquivo para a produção". Opções:
    obterSvg: async () => texto SVG da arte (ou null quando ainda não há arte);
    nomeBase: começo do nome do arquivo; larguraInicial: mm; tecnicaInicial: id;
    tecnicas: a lista de técnicas do catálogo; producao: o bloco "producao" do catálogo;
    aoAvisar(texto): mensagem curta para o cliente; aoBaixar(formato): para a medição. */
export function montarBlocoDeProducao(opcoes) {
  const { producao, tecnicas = [] } = opcoes;
  const bloco = document.createElement("details");
  bloco.className = "producao";

  const resumo = document.createElement("summary");
  resumo.className = "producao__titulo";
  resumo.textContent = "Arquivo para a produção (PDF, EPS, DXF)";

  const apoio = document.createElement("p");
  apoio.className = "painel__apoio";
  apoio.textContent = "A arte no tamanho de verdade, em curvas, para a fábrica e o laser. " +
    "Tudo é feito aqui no seu aparelho.";

  const campos = document.createElement("div");
  campos.className = "producao__campos";

  const rotuloLargura = document.createElement("label");
  rotuloLargura.className = "producao__campo";
  rotuloLargura.textContent = "Largura (mm)";
  const largura = document.createElement("input");
  largura.type = "number";
  largura.inputMode = "decimal";
  largura.min = "5";
  largura.max = "400";
  largura.step = "1";
  largura.value = String(Math.round(opcoes.larguraInicial || 80));
  rotuloLargura.append(largura);

  const rotuloTecnica = document.createElement("label");
  rotuloTecnica.className = "producao__campo";
  rotuloTecnica.textContent = "Técnica";
  const tecnica = document.createElement("select");
  const comRegra = tecnicas.filter((t) => producao && producao.tecnicas && producao.tecnicas[t.id]);
  (comRegra.length ? comRegra : tecnicas).forEach((t) => {
    const opcao = document.createElement("option");
    opcao.value = t.id;
    opcao.textContent = t.nome;
    tecnica.append(opcao);
  });
  if (opcoes.tecnicaInicial && Array.from(tecnica.options).some((o) => o.value === opcoes.tecnicaInicial)) {
    tecnica.value = opcoes.tecnicaInicial;
  }
  rotuloTecnica.append(tecnica);
  campos.append(rotuloLargura, rotuloTecnica);

  const botoes = document.createElement("div");
  botoes.className = "producao__botoes";
  const situacao = document.createElement("p");
  situacao.className = "producao__situacao";
  situacao.setAttribute("aria-live", "polite");
  const resultado = document.createElement("div");
  resultado.className = "producao__resultado";

  const credito = document.createElement("p");
  credito.className = "vetor-credito";
  credito.textContent = "Arquivos e conferência feitos com o VectorCraft, do ArtCraft (storytold), " +
    "licença MIT ou Apache-2.0. O primeiro arquivo baixa o motor (cerca de 4 MB, uma vez só). " +
    "As medidas de referência são provisórias: a fábrica confirma no atendimento.";

  async function arteAtual() {
    const svg = await opcoes.obterSvg();
    if (!svg) {
      situacao.textContent = "Ainda não tem arte aqui. Monte a arte primeiro.";
      return null;
    }
    return arteEmMilimetros(svg, Number(largura.value.replace(",", ".")) || opcoes.larguraInicial || 80);
  }

  let ocupado = false;
  async function baixar(formato, botao) {
    if (ocupado) return;
    ocupado = true;
    botao.setAttribute("aria-busy", "true");
    try {
      const arte = await arteAtual();
      if (!arte) return;
      situacao.textContent = trabalhadores["./producao-trabalhador.js"]
        ? `Gerando o ${formato.toUpperCase()}…`
        : `Baixando o motor e gerando o ${formato.toUpperCase()} (só demora na primeira vez)…`;
      const blob = await gerarArquivo(arte, formato);
      const nome = `${opcoes.nomeBase || "arte"}-${Math.round(arte.largura)}mm.${formato}`;
      baixarBlob(blob, nome);
      let texto = `Baixei ${nome} (${numero(arte.largura, 0)} × ${numero(arte.altura)} mm).`;
      if (arte.temImagem && formato === "dxf") {
        texto += " A logo em imagem não entra no DXF, que é só linha: vetorize em \"Sua logo\".";
      } else if (arte.temImagem) {
        texto += " A logo foi como imagem: para sair em curvas, vetorize em \"Sua logo\".";
      }
      situacao.textContent = texto;
      if (opcoes.aoBaixar) opcoes.aoBaixar(formato);
    } catch (erro) {
      situacao.textContent = "Não deu para gerar o arquivo aqui. Mande a arte em SVG, que a fábrica converte.";
    } finally {
      ocupado = false;
      botao.removeAttribute("aria-busy");
    }
  }

  ["pdf", "eps", "dxf"].forEach((formato) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao botao--vazado producao__botao";
    botao.textContent = formato.toUpperCase();
    botao.setAttribute("aria-label", `Baixar a arte em ${formato.toUpperCase()}`);
    botao.addEventListener("click", () => baixar(formato, botao));
    botoes.append(botao);
  });

  let vezDaConferencia = 0;
  async function conferir() {
    const vez = ++vezDaConferencia;
    const arte = await arteAtual();
    if (!arte || vez !== vezDaConferencia) return;
    const regra = medidaDaTecnica(producao, tecnica.value);
    const nomeTecnica = (tecnica.selectedOptions[0] || {}).textContent || "a técnica";
    resultado.textContent = "";
    situacao.textContent = "Conferindo…";
    let r;
    try {
      r = await conferirProducao(arte, regra.minimo, regra.corte);
    } catch (erro) {
      r = { erro: String(erro) };
    }
    if (vez !== vezDaConferencia) return;
    if (!r || r.erro) {
      situacao.textContent = arte.temImagem
        ? "A logo em imagem não dá para medir aqui. " + (opcoes.dicaImagem ||
          "O PDF e o EPS levam a imagem como está; a fábrica vetoriza no atendimento.")
        : "Não deu para conferir esta arte aqui.";
      return;
    }
    situacao.textContent = "";
    mostrarConferencia(resultado, arte, r, regra, nomeTecnica);
  }

  const conferirBotao = document.createElement("button");
  conferirBotao.type = "button";
  conferirBotao.className = "botao botao--texto producao__conferir";
  conferirBotao.textContent = "Conferir de novo";
  conferirBotao.addEventListener("click", conferir);

  largura.addEventListener("change", conferir);
  tecnica.addEventListener("change", conferir);
  bloco.addEventListener("toggle", () => {
    if (bloco.open) conferir();
  });

  bloco.append(resumo, apoio, campos, botoes, situacao, resultado, conferirBotao, credito);
  bloco.conferir = () => { if (bloco.open) conferir(); };
  /** A tela mudou o lugar ou a técnica: o bloco acompanha (a largura só se o cliente não mexeu). */
  let larguraMexida = false;
  largura.addEventListener("input", () => { larguraMexida = true; });
  bloco.ajustar = ({ larguraInicial, tecnicaInicial } = {}) => {
    let mudou = false;
    if (larguraInicial && !larguraMexida && Number(largura.value) !== Math.round(larguraInicial)) {
      largura.value = String(Math.round(larguraInicial));
      mudou = true;
    }
    if (tecnicaInicial && tecnica.value !== tecnicaInicial &&
        Array.from(tecnica.options).some((o) => o.value === tecnicaInicial)) {
      tecnica.value = tecnicaInicial;
      mudou = true;
    }
    if (mudou) bloco.conferir();
  };
  return bloco;
}

function mostrarConferencia(alvo, arte, r, regra, nomeTecnica) {
  alvo.textContent = "";

  // prévia com as partes finas em vermelho
  if (r.fino && r.fino.partes > 0) {
    const aviso = document.createElement("p");
    aviso.className = "producao__aviso";
    aviso.textContent = `${r.fino.partes === 1 ? "Uma parte está" : `${r.fino.partes} partes estão`} ` +
      `mais fina${r.fino.partes === 1 ? "" : "s"} que ${numero(regra.minimo)} mm, o mínimo de referência ` +
      `para ${nomeTecnica.toLowerCase()}${regra.corte ? " (linha de corte)" : ""}. Em vermelho na prévia. ` +
      "Aumente a largura ou engrosse a letra.";
    alvo.append(aviso);
  } else {
    const certo = document.createElement("p");
    certo.className = "producao__certo";
    certo.textContent = `Nenhum traço abaixo de ${numero(regra.minimo)} mm para ${nomeTecnica.toLowerCase()}.`;
    alvo.append(certo);
  }

  const previa = document.createElementNS(NS, "svg");
  previa.setAttribute("viewBox", `0 0 ${arte.largura} ${arte.altura}`);
  previa.setAttribute("class", "producao__previa");
  previa.setAttribute("role", "img");
  previa.setAttribute("aria-label", "Prévia da arte com as partes finas em vermelho");
  const imagem = document.createElementNS(NS, "image");
  imagem.setAttribute("href", URL.createObjectURL(new Blob([arte.svg], { type: "image/svg+xml" })));
  imagem.setAttribute("width", arte.largura);
  imagem.setAttribute("height", arte.altura);
  imagem.addEventListener("load", () => URL.revokeObjectURL(imagem.getAttribute("href")), { once: true });
  previa.append(imagem);
  if (r.fino && r.fino.caminho) {
    const fino = document.createElementNS(NS, "path");
    fino.setAttribute("d", r.fino.caminho);
    fino.setAttribute("class", "producao__fino");
    previa.append(fino);
  }
  alvo.append(previa);

  const lista = document.createElement("ul");
  lista.className = "producao__cores";
  r.cores.forEach((item) => {
    const linha = document.createElement("li");
    const amostra = document.createElement("span");
    amostra.className = "vetor-paleta__cor producao__amostra";
    amostra.style.background = item.cor;
    amostra.title = item.cor;
    const texto = document.createElement("span");
    texto.textContent = `${item.cor.toUpperCase()} · ${numero(item.area / 100, 2)} cm²`;
    linha.append(amostra, texto);
    lista.append(linha);
  });
  alvo.append(lista);

  const total = document.createElement("p");
  total.className = "producao__total";
  const s = r.silhueta;
  total.textContent = `Peça: ${numero(s.largura)} × ${numero(s.altura)} mm, ${numero(s.area / 100, 2)} cm² no total, ` +
    `${r.cores.length} ${r.cores.length === 1 ? "cor" : "cores"}. Linha de corte em volta: ${numero(s.corte / 10)} cm. ` +
    "É a medida para o orçamento; o preço vem no atendimento.";
  alvo.append(total);
}
