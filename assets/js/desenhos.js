/* Os modelos de boné como dados: o tipo de cada um, as partes que o cliente
   pinta e as medidas do desenho em 3D. Não depende do motor 3D, para a página
   "Monte seu boné" abrir sem baixar o three.js (ele só vem quando o cliente
   pede para girar o boné). */

/* ---------- catálogo de formas: o que muda de um modelo para o outro ---------- */

/* As medidas de partida de cada tipo de peça. Cada modelo muda só o que é dele
   (em DESENHOS), e a tela de ajustes (ajustes-3d.html) muda por cima, modelo a
   modelo, gravando em dados/ajustes-3d.json. */
export const MEDIDAS_PADRAO = {
  bone: {
    copa: { largura: 0.8, fundura: 1, altura: 1.05, frente: 2.8, tras: 1.9, topo: -0.12 },
    aba: { comprimento: 0.72, largura: 1.06, curva: 0.3, inclinacao: 0.24, ponta: 2.4 },
    arte: { altura: 0.5, lado: 0, tamanho: 0.6, giro: 0 },
  },
  viseira: {
    copa: { largura: 0.8, fundura: 1, faixa: 0.42 },
    aba: { comprimento: 0.74, largura: 1.08, curva: 0.26, inclinacao: 0.2, ponta: 2.4 },
    arte: { altura: 0.5, lado: 0, tamanho: 0.42, giro: 0 },
  },
  chapeu: {
    copa: { escala: 0.82 },
    arte: { altura: 0.5, lado: 0, tamanho: 0.5, giro: 0 },
  },
};

/* O que a tela de ajustes mostra para mexer: grupo, campo, rótulo, mínimo,
   máximo e passo. Rótulos na língua de quem faz boné. */
export const CAMPOS_DE_AJUSTE = {
  bone: [
    ["copa", "altura", "Altura da copa", 0.7, 1.4, 0.01],
    ["copa", "largura", "Largura da copa", 0.65, 0.95, 0.01],
    ["copa", "fundura", "Fundo da copa", 0.85, 1.15, 0.01],
    ["copa", "frente", "Frente em pé (estruturada)", 1.6, 4, 0.05],
    ["copa", "tras", "Traseira em pé", 1.4, 3.2, 0.05],
    ["copa", "topo", "Botão mais para trás ou para a frente", -0.4, 0.2, 0.01],
    ["aba", "comprimento", "Comprimento da aba", 0.4, 1.1, 0.01],
    ["aba", "largura", "Largura da aba", 0.85, 1.35, 0.01],
    ["aba", "curva", "Curva da aba (lados descendo)", 0, 0.7, 0.01],
    ["aba", "inclinacao", "Aba descendo para a frente", -0.1, 0.6, 0.01],
    ["aba", "ponta", "Ponta da aba mais quadrada", 1.6, 4, 0.05],
    ["arte", "altura", "Altura da logo", 0.15, 0.9, 0.01],
    ["arte", "lado", "Logo para o lado", -0.6, 0.6, 0.01],
    ["arte", "tamanho", "Tamanho da logo", 0.25, 1.1, 0.01],
    ["arte", "giro", "Logo girada", -0.5, 0.5, 0.01],
  ],
  viseira: [
    ["copa", "faixa", "Altura da faixa", 0.25, 0.7, 0.01],
    ["aba", "comprimento", "Comprimento da aba", 0.4, 1.1, 0.01],
    ["aba", "largura", "Largura da aba", 0.85, 1.35, 0.01],
    ["aba", "curva", "Curva da aba (lados descendo)", 0, 0.7, 0.01],
    ["aba", "inclinacao", "Aba descendo para a frente", -0.1, 0.6, 0.01],
    ["arte", "altura", "Altura da logo", 0.1, 0.9, 0.01],
    ["arte", "lado", "Logo para o lado", -0.6, 0.6, 0.01],
    ["arte", "tamanho", "Tamanho da logo", 0.15, 0.8, 0.01],
    ["arte", "giro", "Logo girada", -0.5, 0.5, 0.01],
  ],
  chapeu: [
    ["copa", "escala", "Tamanho do chapéu", 0.6, 1, 0.01],
    ["arte", "altura", "Altura da logo", 0.05, 0.95, 0.01],
    ["arte", "lado", "Logo para o lado", -0.6, 0.6, 0.01],
    ["arte", "tamanho", "Tamanho da logo", 0.15, 0.9, 0.01],
    ["arte", "giro", "Logo girada", -0.5, 0.5, 0.01],
  ],
};

/* Cada modelo do produtos.json aponta para um desenho daqui. `medidas` muda só
   o que foge do padrão do tipo (medido nas fotos dos bonés da fábrica). */
export const DESENHOS = {
  "trucker": {
    // o boné modelado no Blender (ferramentas/modelar-trucker.py); sem ele, o montado em código
    glb: "assets/3d/trucker.glb",
    // montado no Photoshop (TRUCKER.psd): tem suador e linha da costura à parte
    tipo: "bone", gomos: 5, tela: true, fecho: "snap", sanduiche: true, suador: true, costura: true,
    medidas: { copa: { altura: 1.12, frente: 3.1, tras: 2.0 }, aba: { curva: 0.34 }, arte: { altura: 0.45, tamanho: 0.66 } },
  },
  "americano-tela": {
    tipo: "bone", gomos: 6, tela: true, fecho: "snap", sanduiche: true,
    medidas: { copa: { altura: 1.04, frente: 2.7 } },
  },
  "americano": {
    tipo: "bone", gomos: 6, tela: false, fecho: "snap",
    medidas: { copa: { altura: 1.04, frente: 2.7 } },
  },
  "dad-hat": {
    tipo: "bone", gomos: 6, tela: false, fecho: "fivela", mole: true,
    medidas: { copa: { altura: 0.9, frente: 2.0, tras: 1.8, topo: -0.06 }, aba: { curva: 0.38, inclinacao: 0.3, comprimento: 0.7 }, arte: { altura: 0.46, tamanho: 0.5 } },
  },
  "flex": {
    tipo: "bone", gomos: 6, tela: false, fecho: "fechado",
    medidas: { copa: { altura: 1.02, frente: 2.6 } },
  },
  "aba-reta": {
    tipo: "bone", gomos: 6, tela: false, fecho: "snap",
    medidas: { copa: { altura: 1.18, frente: 3.4, tras: 2.4, topo: -0.08 }, aba: { comprimento: 0.76, largura: 1.1, curva: 0, inclinacao: 0.05, ponta: 2.8 }, arte: { altura: 0.5, tamanho: 0.62 } },
  },
  "japones": {
    tipo: "bone", gomos: 6, tela: false, fecho: "snap",
    medidas: { copa: { altura: 0.96, frente: 2.4, tras: 1.9 }, aba: { curva: 0.34 } },
  },
  "gomos-5-6": {
    tipo: "bone", gomos: 5, tela: false, fecho: "snap",
    medidas: { copa: { altura: 1.0, frente: 2.6 } },
  },
  "viseira": { tipo: "viseira" },
  "viseira-sport": { tipo: "viseira", larga: true, medidas: { copa: { faixa: 0.5 }, aba: { comprimento: 0.86 } } },
  "viseira-malha": { tipo: "viseira", malha: true },
  "bucket": { tipo: "chapeu", perfil: "bucket" },
  "cumbuca": { tipo: "chapeu", perfil: "cumbuca" },
  "chapeu-australiano": { tipo: "chapeu", perfil: "australiano", cordao: true },
  "chapeu-juta": { tipo: "chapeu", perfil: "cowboy", palha: "juta", fita: true, medidas: { arte: { tamanho: 0.32 } } },
  "chapeu-palha": { tipo: "chapeu", perfil: "praia", palha: "palha", cordao: true, debrum: true },
};

/** As medidas de um modelo: o padrão do tipo, o que é do modelo e, por cima, o
    ajuste fino que o ADM gravou. */
export function medidasDe(id, ajustes = {}) {
  const d = DESENHOS[id];
  if (!d) return null;
  const base = MEDIDAS_PADRAO[d.tipo];
  const proprio = d.medidas || {};
  const fino = ajustes[id] || {};
  const juntas = {};
  Object.keys(base).forEach((grupo) => {
    juntas[grupo] = { ...base[grupo], ...(proprio[grupo] || {}), ...(fino[grupo] || {}) };
  });
  return juntas;
}

/* Onde o ajuste fino mora: o arquivo publicado vale para todo mundo; o
   rascunho do navegador do ADM vale só nele, para conferir antes de publicar. */
export const RASCUNHO_DE_AJUSTES = "agbones-ajustes-3d-rascunho";

export async function carregarAjustes({ comRascunho = true } = {}) {
  let publicados = {};
  try {
    const resposta = await fetch("dados/ajustes-3d.json", { cache: "no-cache" });
    if (resposta.ok) publicados = await resposta.json();
  } catch {
    // sem o arquivo, ficam as medidas de fábrica
  }
  delete publicados._leia;
  let rascunho = {};
  if (comRascunho) {
    try {
      rascunho = JSON.parse(localStorage.getItem(RASCUNHO_DE_AJUSTES) || "{}") || {};
    } catch {
      rascunho = {};
    }
  }
  const juntos = { ...publicados };
  Object.entries(rascunho).forEach(([id, grupos]) => {
    juntos[id] = { ...(juntos[id] || {}) };
    Object.entries(grupos).forEach(([grupo, campos]) => {
      juntos[id][grupo] = { ...(juntos[id][grupo] || {}), ...campos };
    });
  });
  return { publicados, rascunho, juntos };
}

/** As partes que cada desenho tem, na ordem em que o cliente escolhe cor. */
export function partesDoDesenho(id) {
  const d = DESENHOS[id];
  if (!d) return [];
  if (d.tipo === "bone") {
    return [
      { id: "frente", nome: "Frente" },
      { id: "laterais", nome: d.tela ? "Tela das laterais" : "Laterais" },
      { id: "traseira", nome: d.tela ? "Tela de trás" : "Traseira" },
      { id: "aba", nome: "Aba" },
      { id: "aba-baixo", nome: "Embaixo da aba" },
      // a beirada colorida entre a aba de cima e a de baixo
      ...(d.sanduiche ? [{ id: "aba-sanduiche", nome: "Aba sanduíche" }] : []),
      { id: "botao", nome: "Botão" },
      ...(d.suador ? [{ id: "suador", nome: "Suador" }] : []),
      // a linha não entra no "boné todo": sem cor escolhida, segue o tecido
      ...(d.costura ? [{ id: "costura", nome: "Linha da costura", propria: true }] : []),
    ];
  }
  if (d.tipo === "viseira") {
    return [
      { id: "frente", nome: "Faixa" },
      { id: "aba", nome: "Aba" },
      { id: "aba-baixo", nome: "Embaixo da aba" },
    ];
  }
  if (d.palha) {
    return d.fita ? [{ id: "fita", nome: "Fita" }] : [{ id: "debrum", nome: "Debrum" }];
  }
  return [
    { id: "copa", nome: "Copa" },
    { id: "aba", nome: "Aba" },
  ];
}
