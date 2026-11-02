/* Montador de arte: o cliente escreve o que quer, como numa conversa, e a arte
   aparece no boné. Nada aqui chama servidor nem inteligência artificial paga: é
   um intérprete de pedidos em português que roda no aparelho, com o dicionário
   do que se pede em boné (texto, cor, contorno, arco, estilo de letra, parte).

   A arte é feita de camadas, uma em cima da outra, empilhadas de cima para baixo:
     { id, tipo: "texto" | "logo", texto, estilo, cor, contorno: { cor, grossura } | null,
       curva, espaco, tamanho, maiuscula, visivel }
   A camada selecionada é a que recebe o próximo pedido ("selecione e peça").

   Este arquivo não mexe na tela: interpreta e compõe. A tela fica no configurador. */

import { ESTILOS_DE_LETRA, montarTexto, matrizSvg } from "./letras.js";

/* ---------- cores ---------- */

/* Os nomes que o cliente usa. Os compostos vêm primeiro: "azul marinho" antes de "azul". */
export const CORES = [
  { id: "azul-marinho", nome: "azul-marinho", hex: "#1B2A4A", fala: ["azul marinho", "azul-marinho", "marinho"] },
  { id: "azul-royal", nome: "azul royal", hex: "#2F5FD0", fala: ["azul royal", "azul forte", "azul agbones"] },
  { id: "azul-claro", nome: "azul-claro", hex: "#6FA8DC", fala: ["azul claro", "azul-claro", "azul bebe", "azul bebê", "celeste"] },
  { id: "verde-escuro", nome: "verde-escuro", hex: "#1F5130", fala: ["verde escuro", "verde-escuro", "verde musgo", "verde militar"] },
  { id: "verde-bandeira", nome: "verde-bandeira", hex: "#1E9A48", fala: ["verde bandeira", "verde-bandeira"] },
  { id: "verde-limao", nome: "verde-limão", hex: "#9BD12E", fala: ["verde limao", "verde limão", "verde-limão", "verde neon"] },
  { id: "vermelho-escuro", nome: "vinho", hex: "#7A1F2B", fala: ["vermelho escuro", "vinho", "bordo", "bordô", "marsala"] },
  { id: "cinza-escuro", nome: "cinza-chumbo", hex: "#3F444C", fala: ["cinza escuro", "chumbo", "grafite"] },
  { id: "azul", nome: "azul", hex: "#2F5FD0", fala: ["azul"] },
  { id: "verde", nome: "verde", hex: "#1E9A48", fala: ["verde"] },
  { id: "preto", nome: "preto", hex: "#12161D", fala: ["preto", "preta", "negro", "negra"] },
  { id: "branco", nome: "branco", hex: "#FFFFFF", fala: ["branco", "branca"] },
  { id: "vermelho", nome: "vermelho", hex: "#D22630", fala: ["vermelho", "vermelha"] },
  { id: "amarelo", nome: "amarelo", hex: "#F6C318", fala: ["amarelo", "amarela"] },
  { id: "dourado", nome: "dourado", hex: "#C9A13B", fala: ["dourado", "dourada", "ouro", "dourada"] },
  { id: "prata", nome: "prata", hex: "#B9BEC5", fala: ["prata", "prateado", "prateada"] },
  { id: "laranja", nome: "laranja", hex: "#F07A1A", fala: ["laranja"] },
  { id: "rosa", nome: "rosa", hex: "#E86AA6", fala: ["rosa", "pink"] },
  { id: "roxo", nome: "roxo", hex: "#6B3FA0", fala: ["roxo", "roxa", "lilas", "lilás"] },
  { id: "cinza", nome: "cinza", hex: "#8A9099", fala: ["cinza"] },
  { id: "marrom", nome: "marrom", hex: "#6B4226", fala: ["marrom", "cafe", "café", "caramelo"] },
  { id: "bege", nome: "bege", hex: "#D9C7A3", fala: ["bege", "areia", "creme", "caqui"] },
];

export function corPorId(id) {
  return CORES.find((cor) => cor.id === id) || CORES.find((cor) => cor.id === "preto");
}

/** Uma cor é clara quando o contorno que combina com ela é escuro. */
function corClara(id) {
  const hex = corPorId(id).hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/* ---------- partes e estilos, como o cliente fala ---------- */

const PARTES = [
  { id: "lateral-direita", fala: ["lateral direita", "lado direito", "na direita"] },
  { id: "lateral-esquerda", fala: ["lateral esquerda", "lado esquerdo", "na esquerda"] },
  { id: "lateral", fala: ["lateral", "do lado", "no lado"] },
  { id: "traseira", fala: ["traseira", "atras", "atrás", "tras", "trás", "costas", "parte de tras"] },
  { id: "aba", fala: ["na aba", "aba", "pala"] },
  { id: "frente", fala: ["frente", "frontal", "testa", "na frente"] },
];

const FALA_DO_ESTILO = {
  forte: ["forte", "grossa", "grosso", "impacto", "negrito", "bold", "alta"],
  moderna: ["moderna", "moderno", "limpa", "simples", "atual"],
  faroeste: ["faroeste", "vaquejada", "rodeio", "country", "cowboy", "vaqueiro", "western", "sertanej"],
  time: ["time", "futebol", "camisa de time", "esporte", "esportiva", "universitaria", "universitária", "college"],
  cursiva: ["cursiva", "manuscrita", "escrita a mao", "escrita à mão", "assinatura", "caligrafia", "letra de mao"],
  classica: ["classica", "clássica", "elegante", "serifa", "chique", "luxo", "sofisticada"],
};

export const GROSSURAS = { fino: 4, medio: 8, grosso: 14 };

/* ---------- o intérprete ---------- */

/** Minúsculas e sem acento, para comparar. O texto do cliente é guardado como ele escreveu. */
export function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const temPalavra = (frase, termo) => new RegExp(`(^|[^a-z0-9])${termo.replace(/[-]/g, "[- ]?")}`).test(frase);

/* Palavras que mandam escrever. O que vem depois delas é o texto. */
const MANDA_ESCREVER = /(?:^|\s)(?:escreva|escreve|escrever|escrito|coloca|coloque|colocar|bota|bote|botar|poe|ponha|por|quero|queria|faz|faca|fazer|texto|frase|nome|com o nome|adiciona|adicione|acrescenta|acrescente)\s+/;
const MANDA_TROCAR = /(?:^|\s)(?:troca|troque|trocar|muda|mude|mudar|altera|altere|corrige|corrija)\s+(?:o\s+)?(?:texto\s+|nome\s+|frase\s+)?(?:para|pra|por)\s+/;

/* Onde o texto do cliente termina e começa o jeito de fazer. */
const FIM_DO_TEXTO = /,|;|\s(?:em|com|na|no|nas|nos|de cor|cor|letra|estilo|contorno|borda|arco|curvo|curva|reto|maior|menor|grande|pequen[oa]|embaixo|em cima)(?:\s|$)/;

function textoEntreAspas(frase) {
  const achado = frase.match(/["“”«»']([^"“”«»']+)["“”«»']/);
  return achado ? achado[1].trim() : null;
}

/** Pega o texto que o cliente quer escrever, com as maiúsculas que ele usou. */
function extrairTexto(original) {
  const entreAspas = textoEntreAspas(original);
  if (entreAspas) return { texto: entreAspas, troca: MANDA_TROCAR.test(normalizar(original)), resto: original.replace(entreAspas, " ") };

  const comparar = normalizar(original);
  // sem acento e em minúsculas, mas com o mesmo tamanho do original: a posição achada
  // num vale no outro, e o texto sai com as maiúsculas e os acentos do cliente
  const semAcento = original.split("").map((c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().charAt(0) || c).join("");
  for (const [padrao, troca] of [[MANDA_TROCAR, true], [MANDA_ESCREVER, false]]) {
    const achado = semAcento.match(padrao);
    if (!achado) continue;
    const inicio = achado.index + achado[0].length;
    const depois = semAcento.slice(inicio);
    // "escreva em arco": depois da palavra já vem o jeito, não o texto
    if (/^(?:em|com|na|no|de|a|o|uma?|letra|cor)\s/.test(depois) && !troca) continue;
    const fim = depois.search(FIM_DO_TEXTO);
    const texto = original.slice(inicio, fim === -1 ? undefined : inicio + fim).trim();
    // "quero dourado" não é texto: é o jeito
    if (!texto || soJeito(texto)) continue;
    return { texto, troca, resto: normalizar(semAcento.slice(0, achado.index) + " " + (fim === -1 ? "" : depois.slice(fim))) };
  }
  return { texto: null, troca: false, resto: comparar };
}

const PALAVRAS_DE_JEITO = /\b(arco|reto|reta|maior|menor|letra|cor|contorno|borda|grosso|grossa|fino|fina|mais|menos|em|com|de|e|a|o|um|uma|bem|pouco)\b/g;

/** Diz se o trecho só descreve o jeito (cor, estilo, arco), sem texto para escrever. */
function soJeito(trecho) {
  let resto = ` ${normalizar(trecho)} `;
  for (const cor of CORES) for (const fala of cor.fala) resto = resto.split(` ${normalizar(fala)} `).join(" ");
  for (const falas of Object.values(FALA_DO_ESTILO)) for (const fala of falas) resto = resto.split(` ${normalizar(fala)} `).join(" ");
  return !resto.replace(PALAVRAS_DE_JEITO, " ").trim();
}

function acharCor(trecho) {
  for (const cor of CORES) {
    for (const fala of cor.fala) {
      if (temPalavra(trecho, normalizar(fala))) return cor.id;
    }
  }
  return null;
}

function acharEstilo(trecho) {
  for (const [id, falas] of Object.entries(FALA_DO_ESTILO)) {
    if (falas.some((fala) => temPalavra(trecho, normalizar(fala)))) return id;
  }
  return null;
}

function acharParte(trecho) {
  for (const parte of PARTES) {
    if (parte.fala.some((fala) => temPalavra(trecho, normalizar(fala)))) return parte.id;
  }
  return null;
}

let proximoId = 1;
export function novaCamadaDeTexto(texto, base = {}) {
  return {
    id: `c${Date.now().toString(36)}${proximoId++}`,
    tipo: "texto",
    texto,
    estilo: base.estilo || "forte",
    cor: base.cor || "branco",
    contorno: base.contorno === undefined ? { cor: "preto", grossura: "medio" } : base.contorno,
    curva: base.curva || 0,
    espaco: 0,
    tamanho: base.tamanho || 1,
    maiuscula: false,
    visivel: true,
  };
}

export function novaCamadaDeLogo() {
  return { id: `c${Date.now().toString(36)}${proximoId++}`, tipo: "logo", tamanho: 1, visivel: true };
}

/** Lê o pedido do cliente e devolve o novo estado da arte e a resposta.
    `estado`: { camadas, selecionada, temLogo }.
    Devolve { camadas, selecionada, parte, resposta, mudou, desfazer }. */
export function interpretarPedido(pedido, estado) {
  const original = String(pedido || "").trim();
  const camadas = estado.camadas.map((camada) => ({ ...camada, contorno: camada.contorno ? { ...camada.contorno } : null }));
  let selecionada = estado.selecionada;
  const feito = [];
  const resultado = (extra = {}) => ({ camadas, selecionada, parte: null, resposta: "", mudou: false, ...extra });

  if (!original) return resultado({ resposta: "Escreva o que você quer no boné. Por exemplo: escreva \"Fazenda Boa Vista\" em arco." });
  const frase = normalizar(original);

  if (/^(desfaz|desfazer|desfaca|volta|voltar|volte|ctrl ?z)\b/.test(frase)) {
    return resultado({ desfazer: true, resposta: "Voltei um passo." });
  }

  // qual camada: "a de cima", "a segunda linha", "a logo"
  const textos = camadas.filter((camada) => camada.tipo === "texto");
  if (/\b(a de cima|primeira linha|linha de cima|o de cima|a primeira)\b/.test(frase) && camadas.length) selecionada = camadas[0].id;
  if (/\b(a de baixo|segunda linha|linha de baixo|o de baixo|a ultima|a segunda)\b/.test(frase) && camadas.length) selecionada = camadas[camadas.length - 1].id;

  if (/\b(apaga|apague|apagar|tira|tire|tirar|remove|remova|remover|exclui|exclua|limpa|limpar)\b/.test(frase) &&
      !/\b(contorno|borda|arco|curva)\b/.test(frase)) {
    if (/\b(tudo|todas?|toda a arte|a arte)\b/.test(frase) || /^(limpa|limpar)\b/.test(frase)) {
      return resultado({ camadas: [], selecionada: null, mudou: camadas.length > 0, resposta: "Apaguei a arte desta parte. Pode começar de novo." });
    }
    if (/\b(logo)\b/.test(frase)) {
      const resto = camadas.filter((camada) => camada.tipo !== "logo");
      return resultado({ camadas: resto, selecionada: resto.length ? resto[0].id : null, mudou: resto.length !== camadas.length, resposta: "Tirei a logo." });
    }
    const alvo = camadas.find((camada) => camada.id === selecionada) || camadas[camadas.length - 1];
    if (!alvo) return resultado({ resposta: "Ainda não tem nada para apagar aqui." });
    const resto = camadas.filter((camada) => camada !== alvo);
    return resultado({
      camadas: resto,
      selecionada: resto.length ? resto[resto.length - 1].id : null,
      mudou: true,
      resposta: alvo.tipo === "logo" ? "Tirei a logo." : `Apaguei “${alvo.texto}”.`,
    });
  }

  let { texto, troca, resto } = extrairTexto(original);
  const parte = acharParte(resto);

  // logo
  let alvo = camadas.find((camada) => camada.id === selecionada) || null;
  if (/\b(minha logo|a logo|logomarca|logotipo|o logo|minha marca)\b/.test(frase) && !/\b(tira|tirar|apaga)\b/.test(frase)) {
    if (!estado.temLogo) {
      return resultado({ parte, resposta: "Para pôr a sua logo, mande o arquivo dela em “Sua logo”. Depois é só pedir de novo." });
    }
    let logo = camadas.find((camada) => camada.tipo === "logo");
    if (!logo) {
      logo = novaCamadaDeLogo();
      // "logo embaixo": vai por último; senão a logo vem em cima, o mais comum
      if (/\b(embaixo|abaixo|depois)\b/.test(frase)) camadas.push(logo);
      else camadas.unshift(logo);
      feito.push("pus a sua logo");
    }
    selecionada = logo.id;
    alvo = logo;
    if (texto && /^(minha |a |o )?(logo|logomarca|logotipo|marca)\b/i.test(normalizar(texto))) texto = null;
  }

  // texto novo ou trocado
  if (texto) {
    const alvoTexto = alvo && alvo.tipo === "texto" ? alvo : null;
    if (troca && alvoTexto) {
      alvoTexto.texto = texto;
      feito.push(`troquei o texto para “${texto}”`);
    } else {
      // herda o jeito da camada de texto anterior: a segunda linha combina com a primeira
      const modelo = alvoTexto || textos[textos.length - 1];
      const nova = novaCamadaDeTexto(texto, modelo
        ? { estilo: modelo.estilo, cor: modelo.cor, contorno: modelo.contorno ? { ...modelo.contorno } : null, tamanho: modelo.tamanho * 0.8 }
        : {});
      if (/\b(em cima|acima|antes)\b/.test(resto)) camadas.unshift(nova);
      else camadas.push(nova);
      feito.push(`escrevi “${texto}”`);
      alvo = nova;
    }
    selecionada = alvo.id;
  }

  // sem texto e nada para mudar: um pedido curto é o próprio texto
  if (!alvo && !texto) {
    const soModo = acharCor(frase) || acharEstilo(frase) || /\b(arco|contorno|maior|menor)\b/.test(frase);
    if (!soModo && !parte && original.length <= 40 && !/[?]$/.test(original)) {
      alvo = novaCamadaDeTexto(original);
      camadas.push(alvo);
      selecionada = alvo.id;
      feito.push(`escrevi “${original}”`);
      resto = "";
    } else if (!parte) {
      return resultado({ resposta: "Primeiro diga o que vai escrito. Por exemplo: escreva \"Rancho Santa Fé\"." });
    }
  }

  // cor, contorno, arco e letra são de texto: com a logo selecionada, vão para o texto mais perto
  if (alvo && alvo.tipo === "logo" && !texto && camadas.some((camada) => camada.tipo === "texto") &&
      (acharCor(resto) || /\b(contorno|borda|arco|curv|reto|letra|estilo|maiuscula|espac)/.test(resto))) {
    const posicao = camadas.indexOf(alvo);
    alvo = camadas.slice(posicao + 1).find((camada) => camada.tipo === "texto") ||
      [...camadas.slice(0, posicao)].reverse().find((camada) => camada.tipo === "texto");
    selecionada = alvo.id;
  }

  if (alvo) {
    const antes = JSON.stringify(alvo);
    aplicarJeito(alvo, resto, feito);
    if (JSON.stringify(alvo) === antes && !feito.length && !parte) {
      // nada de jeito no pedido: um pedido curto é mais uma linha de texto
      if (original.length <= 40 && !/[?]$/.test(original) && !soJeito(original)) {
        const modelo = alvo.tipo === "texto" ? alvo : null;
        const nova = novaCamadaDeTexto(original, modelo
          ? { estilo: modelo.estilo, cor: modelo.cor, contorno: modelo.contorno ? { ...modelo.contorno } : null, tamanho: modelo.tamanho * 0.8 }
          : {});
        camadas.push(nova);
        return resultado({ selecionada: nova.id, mudou: true, resposta: `Pronto: escrevi “${original}” embaixo.` });
      }
      return resultado({
        resposta: "Não entendi esse pedido. Dá para pedir assim: \"em arco\", \"dourado com contorno preto\", " +
          "\"letra de faroeste\", \"maior\", \"sem contorno\" ou escreva \"outro texto\".",
      });
    }
  }

  const resposta = feito.length ? `Pronto: ${juntar(feito)}.` : (parte ? "" : "Pronto.");
  return resultado({ selecionada, parte, mudou: feito.length > 0, resposta });
}

/** Cor, contorno, arco, tamanho, estilo e espaço. `trecho` já vem sem o texto do cliente. */
function aplicarJeito(camada, trecho, feito) {
  let resto = ` ${trecho} `;

  // contorno antes da cor: "dourado com contorno preto" tem duas cores
  if (/\b(sem contorno|sem borda|tira o contorno|tirar o contorno|tira a borda|sem a borda)\b/.test(resto)) {
    if (camada.contorno) feito.push("tirei o contorno");
    camada.contorno = null;
    resto = resto.replace(/\b(sem contorno|sem borda|tira o contorno|tirar o contorno|tira a borda|sem a borda)\b/g, " ");
  } else {
    // a descrição do contorno vai até a próxima instrução: "contorno preto grosso, letra..."
    const contorno = resto.match(/\b(contorno|borda|filete|sombra)\b((?:\s+(?!estilo\b|letra\b|em\b|arco\b|reto\b|maior\b|menor\b|e\b|com\b|na\b|no\b)[^\s,;]+){0,3})/);
    if (contorno) {
      const descricao = contorno[2];
      const cor = acharCor(descricao);
      let grossura = /\bgross|\bforte|\bgrande/.test(descricao) ? "grosso" : /\bfin|\bleve|\bpequen/.test(descricao) ? "fino" : null;
      if (camada.tipo === "texto") {
        const atual = camada.contorno || { cor: null, grossura: "medio" };
        atual.cor = cor || atual.cor || (corClara(camada.cor) ? "preto" : "branco");
        if (grossura) atual.grossura = grossura;
        camada.contorno = atual;
        feito.push(`contorno ${corPorId(atual.cor).nome}${grossura ? ` ${grossura}` : ""}`);
      }
      resto = resto.slice(0, contorno.index) + " " + resto.slice(contorno.index + contorno[0].length);
    }
  }

  if (camada.tipo === "texto") {
    const cor = acharCor(resto);
    if (cor) {
      camada.cor = cor;
      feito.push(`em ${corPorId(cor).nome}`);
      // letra e contorno da mesma cor some no boné: o contorno troca sozinho
      if (camada.contorno && camada.contorno.cor === cor) {
        camada.contorno.cor = corClara(cor) ? "preto" : "branco";
      }
    }

    // "Vaquejada 2026" é texto; "letra de vaquejada" é estilo
    const pedeEstilo = /\b(letra|estilo|fonte|tipo|jeito)\b/.test(resto) || Boolean(acharEstilo(resto) && soJeito(resto));
    const estilo = pedeEstilo ? acharEstilo(resto) : null;
    if (estilo) {
      camada.estilo = estilo;
      feito.push(`letra ${ESTILOS_DE_LETRA.find((item) => item.id === estilo).nome}`);
    }

    if (/\b(reto|reta|sem arco|sem curva|tira o arco|tirar o arco|na linha)\b/.test(resto)) {
      if (camada.curva) feito.push("deixei reto");
      camada.curva = 0;
    } else if (/\b(arco|curv|arquead|redond|sorriso|onda)/.test(resto)) {
      const paraBaixo = /\b(pra baixo|para baixo|invertid|sorriso|de baixo|ao contrario)/.test(resto);
      let graus = /\b(pouco|leve|suave|pequeno)\b/.test(resto) ? 35 : /\b(muito|bem|grande|forte|mais)\b/.test(resto) ? 110 : 70;
      if (/\bmais\b/.test(resto) && camada.curva) graus = Math.min(200, Math.abs(camada.curva) + 30);
      if (/\bmenos\b/.test(resto) && camada.curva) graus = Math.max(15, Math.abs(camada.curva) - 30);
      camada.curva = paraBaixo ? -graus : graus;
      feito.push(paraBaixo ? "em arco para baixo" : "em arco");
    }

    if (/\b(maiuscula|maiusculas|caixa alta|tudo grande)\b/.test(resto)) {
      camada.maiuscula = true;
      feito.push("em maiúsculas");
    } else if (/\b(minuscula|minusculas|como escrevi|normal)\b/.test(resto)) {
      camada.maiuscula = false;
    }

    if (/\b(espacad|separad|mais espaco|afastad)/.test(resto)) {
      camada.espaco = Math.min(200, (camada.espaco || 0) + 50);
      feito.push("mais espaço entre as letras");
    } else if (/\b(junt|colad|menos espaco|apertad)/.test(resto)) {
      camada.espaco = Math.max(-60, (camada.espaco || 0) - 30);
      feito.push("letras mais juntas");
    }
  }

  if (/\b(maior|aumenta|aumente|aumentar|grande|grandao|mais grande)\b/.test(resto) && !/\barco\s+(bem\s+)?grande\b/.test(resto)) {
    camada.tamanho = Math.min(2.5, camada.tamanho * 1.25);
    feito.push("maior");
  } else if (/\b(menor|diminui|diminua|diminuir|pequen|menorzinh)/.test(resto) && !/\barco\s+pequeno\b/.test(resto)) {
    camada.tamanho = Math.max(0.35, camada.tamanho / 1.25);
    feito.push("menor");
  }
}

function juntar(itens) {
  if (itens.length < 2) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Uma linha que diz o que a camada é, para a lista de camadas e para o pedido. */
export function descreverCamada(camada) {
  if (camada.tipo === "logo") return "Sua logo";
  const estilo = ESTILOS_DE_LETRA.find((item) => item.id === camada.estilo);
  const partes = [`letra ${estilo ? estilo.nome : camada.estilo}`, corPorId(camada.cor).nome];
  if (camada.contorno) partes.push(`contorno ${corPorId(camada.contorno.cor).nome}`);
  if (camada.curva) partes.push(camada.curva > 0 ? "em arco" : "arco para baixo");
  return `“${textoMostrado(camada)}” (${partes.join(", ")})`;
}

function textoMostrado(camada) {
  return camada.maiuscula ? camada.texto.toLocaleUpperCase("pt-BR") : camada.texto;
}

/* ---------- a composição ---------- */

const ALTURA_DA_LETRA = 100;   // altura da maiúscula com tamanho 1
const LARGURA_MAXIMA = 720;    // uma linha mais larga que isso encolhe
const ALTURA_DA_LOGO = 150;
const ENTRE_CAMADAS = 22;
const MARGEM = 12;

function escalar(s, m) {
  return [s * m[0], s * m[1], s * m[2], s * m[3], s * m[4], s * m[5]];
}

function escapar(texto) {
  return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Monta o SVG da arte inteira.
    `meios`: { letrasDe(estilo) → Promise<letras>, contornar(formas, grossura) → Promise,
               logo: { endereco, proporcao } | null }.
    Devolve { svg, largura, altura } ou null quando não há nada visível. */
export async function comporArte(camadas, meios) {
  const blocos = [];
  for (const camada of camadas) {
    if (!camada.visivel) continue;
    if (camada.tipo === "logo") {
      if (!meios.logo) continue;
      const altura = ALTURA_DA_LOGO * camada.tamanho;
      const largura = Math.min(LARGURA_MAXIMA, altura * (meios.logo.proporcao || 1));
      blocos.push({
        largura,
        altura: largura / (meios.logo.proporcao || 1),
        desenhar: (dx, dy, w, h) =>
          `<image href="${escapar(meios.logo.endereco)}" x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`,
      });
      continue;
    }
    const texto = textoMostrado(camada).trim();
    if (!texto) continue;
    const letras = await meios.letrasDe(camada.estilo);
    const { formas, caixa } = montarTexto(letras, texto, { curva: camada.curva, espaco: camada.espaco });
    if (!formas.length) continue;
    let s = (ALTURA_DA_LETRA * camada.tamanho) / letras.maiuscula;
    if (caixa.largura * s > LARGURA_MAXIMA) s = LARGURA_MAXIMA / caixa.largura;
    const escaladas = formas.map((forma) => ({ d: forma.d, matriz: escalar(s, forma.matriz) }));
    let x = caixa.x * s;
    let y = caixa.y * s;
    let largura = caixa.largura * s;
    let altura = caixa.altura * s;

    let borda = null;
    if (camada.contorno && meios.contornar) {
      const grossura = GROSSURAS[camada.contorno.grossura] || GROSSURAS.medio;
      const feito = await meios.contornar(escaladas, grossura * Math.sqrt(camada.tamanho));
      if (feito && feito.contorno) {
        borda = { d: feito.contorno, cor: corPorId(camada.contorno.cor).hex };
        x = feito.x;
        y = feito.y;
        largura = feito.largura;
        altura = feito.altura;
      }
    }
    const preenchimento = corPorId(camada.cor).hex;
    blocos.push({
      largura,
      altura,
      desenhar: (dx, dy) => {
        const mover = `translate(${(dx - x).toFixed(1)} ${(dy - y).toFixed(1)})`;
        const contorno = borda ? `<path d="${borda.d}" fill="${borda.cor}"/>` : "";
        const corpo = escaladas.map((forma) => `<path transform="matrix(${matrizSvg(forma.matriz)})" d="${forma.d}"/>`).join("");
        return `<g transform="${mover}">${contorno}<g fill="${preenchimento}">${corpo}</g></g>`;
      },
    });
  }
  if (!blocos.length) return null;

  const largura = Math.max(...blocos.map((bloco) => bloco.largura)) + MARGEM * 2;
  const altura = blocos.reduce((soma, bloco) => soma + bloco.altura, 0) + ENTRE_CAMADAS * (blocos.length - 1) + MARGEM * 2;
  let cursor = MARGEM;
  const corpo = blocos.map((bloco) => {
    const pedaco = bloco.desenhar((largura - bloco.largura) / 2, cursor, bloco.largura, bloco.altura);
    cursor += bloco.altura + ENTRE_CAMADAS;
    return pedaco;
  }).join("");
  const w = largura.toFixed(1);
  const h = altura.toFixed(1);
  return {
    largura,
    altura,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${corpo}</svg>`,
  };
}

/* ---------- sugestões ---------- */

/** As sugestões mudam com o que já existe: começa pelo texto, depois pelo jeito. */
export function sugestoes(estado) {
  const alvo = estado.camadas.find((camada) => camada.id === estado.selecionada);
  if (!estado.camadas.length) {
    const lista = ["Escreva “Fazenda Boa Vista”", "Escreva “Vaquejada 2026” em arco", "Escreva “Equipe Alfa” letra de time"];
    if (estado.temLogo) lista.unshift("Coloca a minha logo");
    return lista;
  }
  if (alvo && alvo.tipo === "logo") return ["Maior", "Menor", "Escreva um texto embaixo"];
  const lista = [];
  if (alvo && !alvo.curva) lista.push("Em arco");
  else lista.push("Reto");
  lista.push("Dourado com contorno preto", "Letra de faroeste", "Maior");
  if (alvo && alvo.contorno) lista.push("Sem contorno");
  lista.push("Escreva outra linha embaixo");
  if (estado.temLogo && !estado.camadas.some((camada) => camada.tipo === "logo")) lista.push("Coloca a minha logo em cima");
  return lista;
}
