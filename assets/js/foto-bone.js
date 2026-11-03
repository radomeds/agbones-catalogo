/* A prévia do boné pela foto de verdade: a foto de estúdio de cada modelo, com
   o fundo tirado e sem o "SUA LOGO AQUI" (ferramentas/preparar-fotos-montagem.py),
   tem cada parte pintada na cor que o cliente escolheu, guardando a luz, a
   sombra, a costura e o grão do tecido da foto. A logo entra no lugar da frente,
   curvada como o tecido e com a mesma luz.

   Onde fica cada parte e onde vai a logo está em dados/montagem-fotos.json,
   em pixels da foto de 640. O ADM ajusta isso na tela ajustes-3d.html, aba Foto.

   Mesma conversa do palco 3D (bone3d.js): montar, pintar, colocarArte,
   olharPara e foto. Não usa biblioteca nenhuma: é canvas 2D. */

import { DESENHOS } from "./desenhos.js";

export const RASCUNHO_DAS_FOTOS = "agbones-montagem-fotos-rascunho";
export const LADO = 640;
const PIXELS = LADO * LADO;
const GRAU = Math.PI / 180;

/* O que sobra do boné, fora das partes desenhadas, é desta parte. A palha não
   se pinta: só a fita e o debrum dela. */
const PARTE_DO_RESTO = { bone: "frente", viseira: "frente", chapeu: "copa" };

export function parteDoResto(id) {
  const desenho = DESENHOS[id];
  if (!desenho || desenho.palha) return null;
  return PARTE_DO_RESTO[desenho.tipo] || null;
}

/* ---------- os ajustes: o arquivo publicado e o rascunho do ADM ---------- */

/** Junta o rascunho do ADM por cima do publicado, modelo a modelo. */
export function juntarFotos(publicados, rascunho) {
  const juntos = {};
  new Set([...Object.keys(publicados || {}), ...Object.keys(rascunho || {})]).forEach((id) => {
    const base = (publicados || {})[id] || {};
    const fino = (rascunho || {})[id] || {};
    juntos[id] = {
      ...base,
      ...fino,
      partes: { ...(base.partes || {}), ...(fino.partes || {}) },
      escuros: { ...(base.escuros || {}), ...(fino.escuros || {}) },
      // fixo e chão são listas de polígonos: o rascunho troca a lista inteira;
      // o mapa do mockup vem inteiro do publicado (o ADM não desenha mapa)
      arte: { ...(base.arte || {}), ...(fino.arte || {}) },
    };
  });
  return juntos;
}

export async function carregarFotos({ comRascunho = true } = {}) {
  let publicados = {};
  try {
    const resposta = await fetch("dados/montagem-fotos.json", { cache: "no-cache" });
    if (resposta.ok) publicados = (await resposta.json()).modelos || {};
  } catch {
    // sem o arquivo o boné sai todo de uma cor só, sem logo no lugar
  }
  let rascunho = {};
  if (comRascunho) {
    try {
      rascunho = JSON.parse(localStorage.getItem(RASCUNHO_DAS_FOTOS) || "{}") || {};
    } catch {
      rascunho = {};
    }
  }
  return { publicados, rascunho, juntos: juntarFotos(publicados, rascunho) };
}

/* ---------- cor: as contas de luz se fazem em luz linear, não no sRGB ---------- */

const PARA_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  PARA_LINEAR[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
const PASSOS_DE_VOLTA = 4096;
const PARA_SRGB = new Uint8ClampedArray(PASSOS_DE_VOLTA + 1);
for (let i = 0; i <= PASSOS_DE_VOLTA; i++) {
  const v = i / PASSOS_DE_VOLTA;
  PARA_SRGB[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
}
const voltar = (v) => PARA_SRGB[v >= 1 ? PASSOS_DE_VOLTA : v <= 0 ? 0 : (v * PASSOS_DE_VOLTA) | 0];

function corLinear(hex) {
  const limpo = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(limpo)) return null;
  return [0, 2, 4].map((k) => PARA_LINEAR[parseInt(limpo.slice(k, k + 2), 16)]);
}

/** Quanto a luz da foto pesa na cor nova: tecido escuro tem pouca luz e muito
    ruído, então a variação dele é suavizada antes de ir para a cor clara. */
function curvaDaLuz(referencia, contraste = 1) {
  const base = referencia < 0.025 ? 0.5 : referencia < 0.1 ? 0.7 : referencia < 0.3 ? 0.9 : 1;
  return base * contraste;
}

/** Quanto do grão fino da foto passa para a cor nova. Na foto escura o grão é
    quase todo ruído da compressão: passa pouco, senão vira quadriculado. */
function pesoDoGrao(referencia) {
  return referencia < 0.025 ? 0.15 : referencia < 0.1 ? 0.55 : referencia < 0.3 ? 0.85 : 1;
}

/** Média dos vizinhos (raio em pixels), só com os pixels do boné. */
function borrar(valores, peso, raio) {
  const soma = new Float32Array(PIXELS);
  const conta = new Float32Array(PIXELS);
  const somaB = new Float32Array(PIXELS);
  const contaB = new Float32Array(PIXELS);
  for (let i = 0; i < PIXELS; i++) {
    soma[i] = valores[i] * peso[i];
    conta[i] = peso[i];
  }
  // na horizontal e depois na vertical, com soma corrida
  const passar = (de, deC, para, paraC, passo, linhas, salto) => {
    for (let l = 0; l < linhas; l++) {
      const base = l * salto;
      let a = 0;
      let b = 0;
      for (let k = -raio; k <= raio; k++) {
        const j = Math.min(LADO - 1, Math.max(0, k));
        a += de[base + j * passo];
        b += deC[base + j * passo];
      }
      for (let k = 0; k < LADO; k++) {
        para[base + k * passo] = a;
        paraC[base + k * passo] = b;
        const sai = base + Math.max(0, k - raio) * passo;
        const entra = base + Math.min(LADO - 1, k + raio + 1) * passo;
        a += de[entra] - de[sai];
        b += deC[entra] - deC[sai];
      }
    }
  };
  passar(soma, conta, somaB, contaB, 1, LADO, LADO);
  passar(somaB, contaB, soma, conta, LADO, LADO, 1);
  const saida = new Float32Array(PIXELS);
  for (let i = 0; i < PIXELS; i++) saida[i] = conta[i] > 1e-6 ? soma[i] / conta[i] : valores[i];
  return saida;
}

function mediana(valores, quantos) {
  if (!quantos) return 0.2;
  const caixas = new Uint32Array(1024);
  for (let i = 0; i < quantos; i++) caixas[Math.min(1023, (valores[i] * 1023) | 0)]++;
  let soma = 0;
  for (let k = 0; k < 1024; k++) {
    soma += caixas[k];
    if (soma >= quantos / 2) return Math.max(0.004, (k + 0.5) / 1023);
  }
  return 0.2;
}

/* ---------- desenho ---------- */

function quadro(largura = LADO, altura = largura) {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  return tela;
}

function carregarImagem(endereco) {
  return new Promise((resolver, recusar) => {
    const imagem = new Image();
    imagem.decoding = "async";
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => recusar(new Error(`não abriu ${endereco}`));
    imagem.src = endereco;
  });
}

function pixelsDe(imagem, { chapado = false } = {}) {
  const tela = quadro();
  const c = tela.getContext("2d", { willReadFrequently: true });
  // o mapa de partes não pode misturar cor na borda de uma parte com a outra
  c.imageSmoothingEnabled = !chapado;
  c.drawImage(imagem, 0, 0, LADO, LADO);
  return c.getImageData(0, 0, LADO, LADO);
}

/** Os pixels de dentro de um ou mais polígonos (cada um uma lista de [x, y]). */
function dentroDe(poligonos) {
  const tela = quadro();
  const c = tela.getContext("2d", { willReadFrequently: true });
  c.fillStyle = "#fff";
  poligonos.forEach((pontos) => {
    if (!Array.isArray(pontos) || pontos.length < 3) return;
    c.beginPath();
    pontos.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  });
  return c.getImageData(0, 0, LADO, LADO).data;
}

/** O ponto (u, v) da logo, de -0,5 a 0,5, no lugar dele na foto. Mesma conta
    da ferramenta que mediu o lugar da logo em cada foto. */
export function pontoDaArte(arte, u, v) {
  // a forma é a que o Rafael ajustou à mão no ADM, e só ela
  // dobra: o lado que foge da câmera encolhe na largura (o tecido faz a volta)
  const x = u * arte.largura * (1 + (arte.dobra || 0) * u);
  const y = v * arte.altura * (1 + (arte.fuga || 0) * u)
    + (arte.curva || 0) * (1 - 4 * u * u)
    + Math.tan((arte.inclina || 0) * GRAU) * x;
  const giro = (arte.giro || 0) * GRAU;
  return [
    arte.x + x * Math.cos(giro) - y * Math.sin(giro),
    arte.y + x * Math.sin(giro) + y * Math.cos(giro),
  ];
}

/** Um triângulo da imagem de origem esticado para o triângulo de destino. */
function triangulo(c, imagem, origem, destino) {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = origem;
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = destino;
  const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(den) < 1e-9) return;
  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / den;
  const b = ((sx1 - sx0) * (dx2 - dx0) - (sx2 - sx0) * (dx1 - dx0)) / den;
  const cc = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / den;
  const d = ((sx1 - sx0) * (dy2 - dy0) - (sx2 - sx0) * (dy1 - dy0)) / den;
  // o recorte sai um tico maior, para não aparecer a emenda entre os triângulos
  const mx = (dx0 + dx1 + dx2) / 3;
  const my = (dy0 + dy1 + dy2) / 3;
  c.save();
  c.beginPath();
  destino.forEach(([x, y], k) => {
    const dx = x - mx;
    const dy = y - my;
    const n = Math.hypot(dx, dy) || 1;
    const px = x + (dx / n) * 0.7;
    const py = y + (dy / n) * 0.7;
    if (k) c.lineTo(px, py);
    else c.moveTo(px, py);
  });
  c.closePath();
  c.clip();
  c.setTransform(a, cc, b, d, dx0 - a * sx0 - b * sy0, dy0 - cc * sx0 - d * sy0);
  c.drawImage(imagem, 0, 0);
  c.restore();
}

/** A malha da logo do mockup do Photoshop: a logo do cliente cabe no objeto
    inteligente (largura x altura) com a mesma folga do Mockup Fácil, passa pela
    deformação (envelope de Bézier, cúbico na largura e reto na altura) e pelo
    transformar (quadrilátero), que prende a caixa dos pontos da deformação. */
export function malhaDoPsd(malha, proporcao = 1, escala = 1, passos = 10) {
  const W = malha.largura;
  const H = malha.altura;
  const folga = malha.folga || 0.94;
  const lado = Math.min((W * folga) / proporcao, H * folga) * escala;
  const aw = lado * proporcao;
  const ah = lado;
  const grade = Array.isArray(malha.grade) && malha.grade.length >= 2
    ? malha.grade
    : [[[0, 0], [W / 3, 0], [(2 * W) / 3, 0], [W, 0]], [[0, H], [W / 3, H], [(2 * W) / 3, H], [W, H]]];
  const todos = grade.flat();
  const x0 = Math.min(...todos.map((v) => v[0]));
  const x1 = Math.max(...todos.map((v) => v[0]));
  const y0 = Math.min(...todos.map((v) => v[1]));
  const y1 = Math.max(...todos.map((v) => v[1]));
  const h = homografia([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0, 1, 2, 3].map((k) => [malha.quad[2 * k], malha.quad[2 * k + 1]]));
  const bez = (linha, s) => {
    const n = linha.length - 1;
    let x = 0;
    let y = 0;
    linha.forEach(([px, py], k) => {
      const b = binomial(n, k) * s ** k * (1 - s) ** (n - k);
      x += b * px;
      y += b * py;
    });
    return [x, y];
  };
  const pontos = [];
  for (let j = 0; j <= passos; j++) {
    const linha = [];
    const t = (H / 2 + (j / passos - 0.5) * ah) / H;
    for (let i = 0; i <= passos; i++) {
      const s = (W / 2 + (i / passos - 0.5) * aw) / W;
      // entre as linhas da grade, reto (a grade do PSD tem duas linhas)
      const faixa = Math.min(grade.length - 2, Math.max(0, Math.floor(t * (grade.length - 1))));
      const tt = t * (grade.length - 1) - faixa;
      const [ax, ay] = bez(grade[faixa], s);
      const [bx, by] = bez(grade[faixa + 1], s);
      linha.push(aplicarHomografia(h, ax + (bx - ax) * tt, ay + (by - ay) * tt));
    }
    pontos.push(linha);
  }
  return pontos;
}

function binomial(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** A homografia que leva os quatro pontos de origem nos quatro de destino. */
function homografia(de, para) {
  const a = [];
  const b = [];
  de.forEach(([x, y], k) => {
    const [u, v] = para[k];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  });
  // eliminação de Gauss com pivô
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 8; k++) a[r][k] -= f * a[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, k) => v / a[k][k]);
}

function aplicarHomografia(h, x, y) {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/* ---------- o palco da foto ---------- */

export class FotoDoBone {
  constructor(tela) {
    this.tela = tela;
    tela.width = LADO;
    tela.height = LADO;
    this.c = tela.getContext("2d");
    this.ajustes = {};
    this.cores = {};
    this.arte = null;
    this.id = null;
    this.pronto = false;
    this.imagens = new Map();
    this.pedido = 0;
    this.destaque = null;
  }

  /** Os nomes das partes que a foto mostra, para a tela saber o que dá para ver aqui. */
  partesVisiveis() {
    return this.pronto ? [...this.nomes] : [];
  }

  imagensDe(id) {
    if (!this.imagens.has(id)) {
      // o mockup novo (do ChatGPT) traz a própria foto de fundo branco e um mapa
      // com uma cor chapada por parte; os outros usam a foto do catálogo
      const conf = this.ajustes[id] || {};
      const mapa = conf.mapa && conf.mapa.imagem;
      const camadas = conf.camadas && Array.isArray(conf.camadas.mascaras) ? conf.camadas : null;
      const promessa = camadas ? Promise.all([
        carregarImagem(`assets/produtos/montagem/${id}.webp`),
        ...camadas.mascaras.map((m) => carregarImagem(m.imagem)),
      ]).then(([foto, ...mascaras]) => ({
        limpa: pixelsDe(foto),
        mascaras: mascaras.map((m, k) => ({ canais: camadas.mascaras[k].canais, dados: pixelsDe(m, { chapado: true }) })),
      })) : Promise.all([
        carregarImagem(conf.original || `assets/produtos/${id}.webp`),
        carregarImagem(`assets/produtos/montagem/${id}.webp`),
        mapa ? carregarImagem(mapa) : null,
      ]).then(([original, limpa, desenhoDoMapa]) => ({
        original: pixelsDe(original),
        limpa: pixelsDe(limpa),
        mapa: desenhoDoMapa ? pixelsDe(desenhoDoMapa, { chapado: true }) : null,
      }));
      promessa.catch(() => this.imagens.delete(id));
      this.imagens.set(id, promessa);
    }
    return this.imagens.get(id);
  }

  /** Troca o modelo. `cores` é { parte: "#hex" }. Resolve quando o boné está na tela. */
  async montar(id, cores = {}) {
    const numero = ++this.pedido;
    this.id = id;
    this.cores = { ...cores };
    this.pronto = false;
    const imagens = await this.imagensDe(id);
    if (numero !== this.pedido) return;
    this.preparar(id, imagens);
    this.pronto = true;
    this.desenharBone();
    this.desenharArte();
    this.compor();
  }

  /** Troca o ajuste (do ADM) e redesenha o que está na tela. */
  definirAjustes(ajustes) {
    this.ajustes = ajustes || {};
    if (this.id && this.pronto) {
      this.preparar(this.id, this.atuais);
      this.desenharBone();
      this.desenharArte();
      this.compor();
    }
  }

  preparar(id, imagens) {
    this.atuais = imagens;
    const conf = this.ajustes[id] || {};
    this.camadas = null;
    if (imagens.mascaras) {
      this.prepararCamadas(conf, imagens);
      return;
    }
    const limpa = imagens.limpa.data;
    const original = imagens.original.data;

    // a luz de cada pixel do boné limpo, em luz linear
    const luz = new Float32Array(PIXELS);
    for (let i = 0, p = 0; i < PIXELS; i++, p += 4) {
      luz[i] = 0.2126 * PARA_LINEAR[limpa[p]] + 0.7152 * PARA_LINEAR[limpa[p + 1]] + 0.0722 * PARA_LINEAR[limpa[p + 2]];
    }

    // de que parte é cada pixel (0 = não se pinta)
    const nomes = [];
    const rotulo = new Uint8Array(PIXELS);
    const resto = parteDoResto(id);
    if (resto) {
      nomes.push(resto);
      for (let i = 0; i < PIXELS; i++) if (limpa[i * 4 + 3] > 0) rotulo[i] = 1;
    }
    // o mapa de partes do mockup: cada pixel vai para a parte da cor mais perto
    if (imagens.mapa && conf.mapa && conf.mapa.cores) {
      const cores = Object.entries(conf.mapa.cores).map(([hex, parte]) => {
        const n = parseInt(String(hex).replace("#", ""), 16);
        let indice = 0;
        if (parte) {
          indice = nomes.indexOf(parte) + 1;
          if (!indice) indice = nomes.push(parte);
        }
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, indice];
      });
      const m = imagens.mapa.data;
      for (let i = 0, p = 0; i < PIXELS; i++, p += 4) {
        if (limpa[p + 3] === 0 || m[p + 3] < 128) continue;
        let melhor = -1;
        let menor = 3 * 90 * 90; // longe de toda cor do mapa: fica como estava
        cores.forEach(([r, g, b, indice]) => {
          const d = (m[p] - r) ** 2 + (m[p + 1] - g) ** 2 + (m[p + 2] - b) ** 2;
          if (d < menor) { menor = d; melhor = indice; }
        });
        if (melhor >= 0) rotulo[i] = melhor;
      }
    }
    Object.entries(conf.partes || {}).forEach(([parte, poligono]) => {
      if (!Array.isArray(poligono) || poligono.length < 3) return;
      let indice = nomes.indexOf(parte) + 1;
      if (!indice) indice = nomes.push(parte);
      const dentro = dentroDe([poligono]);
      const limite = conf.escuros && conf.escuros[parte];
      for (let i = 0; i < PIXELS; i++) {
        if (dentro[i * 4 + 3] < 128 || limpa[i * 4 + 3] === 0) continue;
        if (limite && luz[i] >= limite) continue;
        rotulo[i] = indice;
      }
    });
    // o que fica como na foto: o cordão, o couro, o lado de baixo da aba
    if (Array.isArray(conf.fixo) && conf.fixo.length) {
      const fixo = dentroDe(conf.fixo);
      for (let i = 0; i < PIXELS; i++) if (fixo[i * 4 + 3] >= 128) rotulo[i] = 0;
    }
    // o vão debaixo da aba: o que não tem cor (o chão, a sombra, o preto de baixo
    // da aba) vira sombra transparente, que desenha igual sobre qualquer fundo;
    // o que tem cor continua sendo boné
    const chao = new Uint8Array(PIXELS);
    if (Array.isArray(conf.chao) && conf.chao.length) {
      const vao = dentroDe(conf.chao);
      for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
        if (vao[q + 3] < 128) continue;
        const maior = Math.max(original[q], original[q + 1], original[q + 2]);
        const menor = Math.min(original[q], original[q + 1], original[q + 2]);
        // o preto do lado de baixo da aba (abaixo de 35) é boné na sombra, não chão
        if (maior > 35 && maior - menor < 40) {
          chao[i] = 1;
          rotulo[i] = 0;
        }
      }
    }

    // a luz larga (dobra, sombra, curva da copa) separada do grão fino do tecido
    const peso = new Float32Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) peso[i] = limpa[i * 4 + 3] > 128 && !chao[i] ? 1 : 0;
    const luzLarga = borrar(luz, peso, 2);
    // no tecido quase preto a compressão da foto deixa quadradinhos de 8 pixels
    const luzMuitoLarga = borrar(luz, peso, 6);

    // a luz do meio de cada parte; a sombra e o brilho são medidos contra ela
    const sombreado = new Float32Array(PIXELS);
    const amostra = new Float32Array(PIXELS);
    const contraste = Number(conf.contraste) || 1;
    nomes.forEach((_, k) => {
      const indice = k + 1;
      let quantos = 0;
      for (let i = 0; i < PIXELS; i++) {
        if (rotulo[i] === indice && limpa[i * 4 + 3] > 128) amostra[quantos++] = luz[i];
      }
      const referencia = mediana(amostra, quantos);
      const curva = curvaDaLuz(referencia, contraste);
      const grao = pesoDoGrao(referencia);
      const fonte = referencia < 0.025 ? luzMuitoLarga : luzLarga;
      // o lado de baixo da aba vive na sombra: quanto mais escuro na foto, mais
      // escura fica a cor nova (de um quarto da luz até a luz cheia)
      const naSombra = nomes[k] === "aba-baixo" ? Math.max(0.25, Math.min(1, Math.sqrt(referencia / 0.06))) : 1;
      for (let i = 0; i < PIXELS; i++) {
        if (rotulo[i] !== indice) continue;
        const larga = Math.max(1e-4, fonte[i]);
        const fino = Math.max(0.4, Math.min(2.2, luz[i] / larga)) ** grao;
        sombreado[i] = Math.min(3, (larga / referencia) ** curva * fino * naSombra);
      }
    });

    // a sombra do chão, tirada da foto original: vira preto com transparência,
    // que fica certo sobre qualquer fundo
    let fundo = 0;
    [0, LADO - 1, PIXELS - LADO, PIXELS - 1].forEach((i) => { fundo = Math.max(fundo, original[i * 4 + 1]); });
    fundo = Math.max(200, fundo);
    const sombra = new ImageData(LADO, LADO);
    for (let i = 0, p = 0; i < PIXELS; i++, p += 4) {
      const fora = chao[i] ? 1 : 1 - limpa[p + 3] / 255;
      if (fora <= 0) continue;
      const claro = (original[p] + original[p + 1] + original[p + 2]) / 3;
      const escuro = Math.max(0, Math.min(1, 1 - claro / fundo));
      sombra.data[p + 3] = Math.round(255 * escuro * fora);
    }
    this.camadaSombra = quadro();
    this.camadaSombra.getContext("2d").putImageData(sombra, 0, 0);

    this.nomes = nomes;
    this.rotulo = rotulo;
    this.luz = luz;
    this.luzLarga = luzLarga;
    this.prepararTecido(luz, luzLarga, peso);
    this.chao = chao;
    this.sombreado = sombreado;
    this.camadaBone = this.camadaBone || quadro();
  }

  /** O mockup feito no Photoshop (ferramentas/integrar-psd.py): uma máscara
      suave por parte, como as camadas de cor do PSD, e a trama que vai por cima
      da logo. Pinta igual ao Photoshop: foto x (1 - m + m x cor). */
  prepararCamadas(conf, imagens) {
    const mascaras = {};
    let trama = null;
    imagens.mascaras.forEach(({ canais, dados }) => {
      canais.forEach((nome, k) => {
        const m = new Float32Array(PIXELS);
        for (let i = 0; i < PIXELS; i++) m[i] = dados.data[i * 4 + k] / 255;
        if (nome === "textura") trama = m;
        else mascaras[nome] = m;
      });
    });
    const nomes = Object.keys(mascaras);
    // a parte de cada pixel, para acender e para saber o que a foto mostra:
    // a costura passa por cima do pano
    const rotulo = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) {
      let melhor = 0;
      let maior = 0.5;
      nomes.forEach((nome, k) => {
        const v = mascaras[nome][i] + (nome === "costura" ? 0.5 : 0);
        if (v > maior) { maior = v; melhor = k + 1; }
      });
      rotulo[i] = melhor;
    }
    // a luz da foto, para a logo pegar a sombra e as dobras do tecido
    const foto = imagens.limpa.data;
    const luz = new Float32Array(PIXELS);
    const peso = new Float32Array(PIXELS);
    for (let i = 0, p = 0; i < PIXELS; i++, p += 4) {
      luz[i] = 0.2126 * PARA_LINEAR[foto[p]] + 0.7152 * PARA_LINEAR[foto[p + 1]] + 0.0722 * PARA_LINEAR[foto[p + 2]];
      peso[i] = foto[p + 3] > 128 ? 1 : 0;
    }
    this.luz = luz;
    this.luzLarga = borrar(luz, peso, 2);
    this.prepararTecido(luz, this.luzLarga, peso);
    this.camadas = { mascaras, trama, forca: Number(conf.camadas.textura) || 0 };
    this.nomes = nomes;
    this.rotulo = rotulo;
    this.chao = new Uint8Array(PIXELS);
    this.camadaSombra = null;
    this.camadaBone = this.camadaBone || quadro();
  }

  /** O mapa de deslocamento, como o "Deslocar" do Photoshop: a luz da foto,
      borrada (para a logo dobrar e não rasgar), contra a luz bem larga. Onde o
      tecido faz dobra a luz muda, e a logo anda um tico junto. */
  prepararTecido(luz, luzLarga, peso) {
    const media = borrar(luz, peso, 1);
    const larga = borrar(luz, peso, 9);
    const relevo = new Float32Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) {
      if (!peso[i]) continue;
      // em luz que se vê (raiz), para a dobra no tecido escuro pesar igual
      const h = Math.sqrt(media[i]) - Math.sqrt(larga[i]);
      relevo[i] = Math.max(-1, Math.min(1, h / Math.max(0.05, Math.sqrt(larga[i]))));
    }
    this.dobras = relevo;
    this.superficie = null;
  }

  /** A parte onde a logo fica (a frente, a copa, a fita), como a máscara de
      recorte do PSD: a logo não passa da costura nem desce para a aba. A borda
      sai suave, de um pixel, para não ter cara de adesivo. */
  superficieDaArte(lugar) {
    const chave = `${this.id}|${Math.round(lugar.x)}|${Math.round(lugar.y)}`;
    if (this.superficie && this.superficie.chave === chave) return this.superficie.valores;
    const limpa = this.atuais.limpa.data;
    const contagem = new Uint32Array(this.nomes.length + 1);
    const cx = Math.round(lugar.x);
    const cy = Math.round(lugar.y);
    for (let y = cy - 6; y <= cy + 6; y++) {
      for (let x = cx - 6; x <= cx + 6; x++) {
        if (x < 0 || y < 0 || x >= LADO || y >= LADO) continue;
        const k = this.rotulo[y * LADO + x];
        if (k) contagem[k]++;
      }
    }
    let k = 0;
    for (let n = 1; n < contagem.length; n++) if (contagem[n] > contagem[k]) k = n;
    const nome = k ? this.nomes[k - 1] : null;
    const costura = this.nomes.indexOf("costura") + 1;
    const valores = new Float32Array(PIXELS);
    const mascaras = this.camadas && this.camadas.mascaras;
    for (let i = 0; i < PIXELS; i++) {
      if (limpa[i * 4 + 3] < 128 || this.chao[i]) continue;
      if (!nome) valores[i] = 1;
      else if (mascaras) valores[i] = Math.min(1, mascaras[nome][i] + (mascaras.costura ? mascaras.costura[i] : 0));
      // barra só as outras partes pintáveis (a aba, as laterais): o mapa de
      // partes é desenhado à mão e erra nos cantos sem cor; a costura do meio da
      // frente (boné de seis gomos) fica debaixo da logo
      else valores[i] = !this.rotulo[i] || this.rotulo[i] === k || this.rotulo[i] === costura ? 1 : 0;
    }
    const uns = new Float32Array(PIXELS).fill(1);
    const suave = borrar(valores, uns, 1);
    for (let i = 0; i < PIXELS; i++) suave[i] = Math.min(valores[i], suave[i]) * 0.5 + suave[i] * 0.5;
    this.superficie = { chave, valores: suave };
    return suave;
  }

  desenharCamadas() {
    const foto = this.atuais.limpa.data;
    const saida = new ImageData(new Uint8ClampedArray(foto), LADO, LADO);
    const p = saida.data;
    Object.entries(this.camadas.mascaras).forEach(([nome, m]) => {
      const limpo = String(this.cores[nome] || "").replace("#", "");
      // parte sem cor escolhida (a costura, de saída) fica como na foto
      if (!/^[0-9a-f]{6}$/i.test(limpo)) return;
      const cor = [0, 2, 4].map((k) => parseInt(limpo.slice(k, k + 2), 16) / 255);
      for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
        const v = m[i];
        if (!v) continue;
        p[q] *= 1 - v + v * cor[0];
        p[q + 1] *= 1 - v + v * cor[1];
        p[q + 2] *= 1 - v + v * cor[2];
      }
    });
    this.camadaBone.getContext("2d").putImageData(saida, 0, 0);
  }

  /** Pinta uma parte. Aceita "todo" para o boné inteiro. */
  pintar(parte, cor) {
    if (parte === "todo") {
      // a linha da costura tem cor própria: o boné todo não muda a linha
      (this.nomes || []).forEach((nome) => { if (nome !== "costura") this.cores[nome] = cor; });
      Object.keys(this.cores).forEach((nome) => { if (nome !== "costura") this.cores[nome] = cor; });
    } else {
      this.cores[parte] = cor;
    }
    if (!this.pronto) return;
    this.desenharBone();
    this.compor();
  }

  desenharBone() {
    if (this.camadas) {
      this.desenharCamadas();
      return;
    }
    const limpa = this.atuais.limpa.data;
    const saida = new ImageData(new Uint8ClampedArray(limpa), LADO, LADO);
    const p = saida.data;
    const cores = this.nomes.map((nome) => corLinear(this.cores[nome]));
    for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
      if (this.chao[i]) {
        p[q + 3] = 0;
        continue;
      }
      const indice = this.rotulo[i];
      if (!indice) continue;
      const cor = cores[indice - 1];
      if (!cor) continue;
      const s = this.sombreado[i];
      // o brilho da trama aparece até no tecido preto, como na foto
      const brilho = s > 1 ? (s - 1) * 0.035 : 0;
      p[q] = voltar(cor[0] * s + brilho);
      p[q + 1] = voltar(cor[1] * s + brilho);
      p[q + 2] = voltar(cor[2] * s + brilho);
    }
    this.camadaBone.getContext("2d").putImageData(saida, 0, 0);
  }

  /** Coloca a arte do cliente na frente. `arte` = { imagem (canvas), proporcao, escala, acabamento }. */
  colocarArte(arte) {
    this.arte = arte;
    if (!this.pronto) return;
    this.desenharArte();
    this.compor();
  }

  /** Os quatro cantos e a malha da logo no lugar: para desenhar e para a tela do ADM. */
  malhaDaArte(proporcao = 1, escala = 1, passos = 10) {
    const lugar = (this.ajustes[this.id] || {}).arte;
    if (lugar && lugar.malha && Array.isArray(lugar.malha.quad)) return malhaDoPsd(lugar.malha, proporcao, escala, passos);
    if (!lugar || !lugar.largura || !lugar.altura) return null;
    let fu = 1;
    let fv = 1;
    if (proporcao >= lugar.largura / lugar.altura) fv = lugar.largura / proporcao / lugar.altura;
    else fu = (lugar.altura * proporcao) / lugar.largura;
    const pontos = [];
    for (let j = 0; j <= passos; j++) {
      const linha = [];
      for (let i = 0; i <= passos; i++) {
        linha.push(pontoDaArte(lugar, (i / passos - 0.5) * fu * escala, (j / passos - 0.5) * fv * escala));
      }
      pontos.push(linha);
    }
    return pontos;
  }

  desenharArte() {
    this.camadaArte = null;
    this.camadaTrama = null;
    const arte = this.arte;
    if (!arte || !arte.imagem || !this.pronto) return;
    const imagem = arte.imagem;
    const passos = 20;
    const malha = this.malhaDaArte(arte.proporcao || imagem.width / imagem.height, arte.escala || 1, passos);
    if (!malha) return;
    const tela = quadro();
    const c = tela.getContext("2d", { willReadFrequently: true });
    const origem = (i, j) => [(i / passos) * imagem.width, (j / passos) * imagem.height];
    for (let j = 0; j < passos; j++) {
      for (let i = 0; i < passos; i++) {
        triangulo(c, imagem, [origem(i, j), origem(i + 1, j), origem(i + 1, j + 1)], [malha[j][i], malha[j][i + 1], malha[j + 1][i + 1]]);
        triangulo(c, imagem, [origem(i, j), origem(i + 1, j + 1), origem(i, j + 1)], [malha[j][i], malha[j + 1][i + 1], malha[j + 1][i]]);
      }
    }
    // só a área da logo, com folga para o deslocamento
    let x0 = LADO;
    let y0 = LADO;
    let x1 = 0;
    let y1 = 0;
    malha.forEach((linha) => linha.forEach(([x, y]) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }));
    x0 = Math.max(0, Math.floor(x0) - 4);
    y0 = Math.max(0, Math.floor(y0) - 4);
    x1 = Math.min(LADO - 1, Math.ceil(x1) + 4);
    y1 = Math.min(LADO - 1, Math.ceil(y1) + 4);
    if (x1 <= x0 || y1 <= y0) return;

    const dados = c.getImageData(0, 0, LADO, LADO);
    const p = dados.data;
    const fonte = new Uint8ClampedArray(p);
    const limpa = this.atuais.limpa.data;
    const lugar = (this.ajustes[this.id] || {}).arte || {};
    const superficie = this.superficieDaArte(lugar);

    // a luz do tecido debaixo da logo, medida contra o meio da própria logo
    const amostra = new Float32Array((x1 - x0 + 1) * (y1 - y0 + 1));
    let quantos = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * LADO + x;
        if (fonte[i * 4 + 3] > 128 && superficie[i] > 0.5) amostra[quantos++] = this.luzLarga[i];
      }
    }
    const referencia = mediana(amostra, quantos);
    // a espuma do trucker é lisa e clara: a luz pesa um pouco menos
    const curva = curvaDaLuz(referencia) * (this.camadas ? 0.7 : 0.8);
    /* O acabamento vem da técnica (dados/produtos.json):
       plano   — DTF, silk, pintura: tinta lisa por cima, sem o grão do tecido;
       relevo  — silk alto, emborrachado, aplique: um degrau, com borda de luz e sombra;
       bordado — a linha costurada, com o brilho dos pontos;
       tecido  — sublimação: a tinta entra no fio, então a trama aparece. */
    const acabamento = arte.acabamento || "plano";
    const noTecido = acabamento === "tecido";
    const grao = noTecido ? pesoDoGrao(referencia) * 0.5 : 0;
    // só a sublimação anda com o fio; nas outras, a logo segue a dobra pela malha
    const deslocar = noTecido ? 1 : 0;
    // a luz das dobras sem o grão do tecido, para tinta, linha e borracha
    if (!noTecido && this.luzLisaDe !== this.luzLarga) {
      this.luzLisa = borrar(this.luzLarga, new Float32Array(PIXELS).fill(1), 4);
      this.luzLisaDe = this.luzLarga;
    }
    const luzDaArte = noTecido ? this.luzLarga : this.luzLisa;
    // a altura da logo (o degrau): a borda da arte, amaciada
    let altura = null;
    if (acabamento === "relevo" || acabamento === "bordado") {
      const alfa = new Float32Array(PIXELS);
      for (let i = 0; i < PIXELS; i++) alfa[i] = fonte[i * 4 + 3] / 255;
      const um = new Float32Array(PIXELS).fill(1);
      const raio = acabamento === "relevo" ? 2 : 1;
      altura = borrar(borrar(alfa, um, raio), um, raio);
    }
    const forcaDaBorda = acabamento === "relevo" ? 1.6 : 1.1;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * LADO + x;
        const q = i * 4;
        const dentro = superficie[i];
        if (dentro <= 0.01) {
          p[q + 3] = 0;
          continue;
        }
        // o "Deslocar": pega a arte um tico ao lado, conforme a dobra
        const d = this.dobras[i] * deslocar;
        const sx = Math.max(0, Math.min(LADO - 1.001, x - d));
        const sy = Math.max(0, Math.min(LADO - 1.001, y - d * 0.6));
        const ix = sx | 0;
        const iy = sy | 0;
        const fx = sx - ix;
        const fy = sy - iy;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]].forEach(([ox, oy, w]) => {
          const k = ((iy + oy) * LADO + ix + ox) * 4;
          const wa = w * fonte[k + 3];
          r += PARA_LINEAR[fonte[k]] * wa;
          g += PARA_LINEAR[fonte[k + 1]] * wa;
          b += PARA_LINEAR[fonte[k + 2]] * wa;
          a += wa;
        });
        if (a < 0.5) {
          p[q + 3] = 0;
          continue;
        }
        r /= a;
        g /= a;
        b /= a;
        // a luz e a sombra da foto: multiplicar na sombra, clarear no brilho
        const larga = Math.max(1e-4, luzDaArte[i]);
        const fino = grao ? Math.max(0.5, Math.min(1.8, this.luz[i] / Math.max(1e-4, this.luzLarga[i]))) ** grao : 1;
        let s = Math.max(0.4, Math.min(1.35, (larga / referencia) ** curva * fino));
        let lustro = 0;
        if (altura && x > 1 && y > 1 && x < LADO - 2 && y < LADO - 2) {
          // a luz vem de cima e um pouco da esquerda: a borda de cima acende e a de baixo escurece
          const gy = altura[i + LADO] - altura[i - LADO];
          const gx = altura[i + 1] - altura[i - 1];
          s *= Math.max(0.55, Math.min(1.45, 1 + (gy + gx * 0.4) * forcaDaBorda));
          if (acabamento === "bordado") {
            // os pontos de cetim: fios em diagonal, cada um com o seu brilho
            const fio = 0.5 + 0.5 * Math.sin((x + y) * 2.2 + Math.sin(x * 0.13 - y * 0.07) * 1.5);
            s *= 0.86 + 0.24 * fio;
            lustro = fio * fio * 0.06;
          }
        }
        const brilho = (s > 1 ? (s - 1) * 0.08 : 0) + lustro;
        p[q] = voltar(r * s + brilho * (1 - r));
        p[q + 1] = voltar(g * s + brilho * (1 - g));
        p[q + 2] = voltar(b * s + brilho * (1 - b));
        // a logo não sai da parte dela nem do boné
        p[q + 3] = Math.round(a * dentro * (limpa[q + 3] / 255));
      }
    }
    c.putImageData(dados, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    // o que ficou fora da área (não deveria ter nada) sai
    c.clearRect(0, 0, LADO, y0);
    c.clearRect(0, y1 + 1, LADO, LADO);
    c.clearRect(0, 0, x0, LADO);
    c.clearRect(x1 + 1, 0, LADO, LADO);
    this.camadaArte = tela;
    // a trama do PSD por cima da logo só na sublimação, onde a tinta é o próprio tecido
    if (this.camadas && noTecido) this.acabarArteDasCamadas(p);
  }

  /** Como no PSD do trucker: a trama do tecido escurece a logo (a camada de
      textura em multiplicar, só onde há logo). */
  acabarArteDasCamadas(p) {
    const { trama, forca } = this.camadas;
    if (!trama || !forca) return;
    const sombra = new ImageData(LADO, LADO);
    for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
      if (p[q + 3]) sombra.data[q + 3] = Math.round(p[q + 3] * forca * trama[i]);
    }
    this.camadaTrama = quadro();
    this.camadaTrama.getContext("2d").putImageData(sombra, 0, 0);
  }

  compor(alvo = this.c, comDestaque = true) {
    alvo.clearRect(0, 0, LADO, LADO);
    if (!this.pronto) return;
    if (this.camadaSombra) alvo.drawImage(this.camadaSombra, 0, 0);
    alvo.drawImage(this.camadaBone, 0, 0);
    if (this.camadaArte) {
      alvo.save();
      // o degrau projeta sombra no tecido; tinta lisa não
      const acabamento = this.arte && this.arte.acabamento;
      if (acabamento === "relevo" || acabamento === "bordado") {
        alvo.shadowColor = acabamento === "relevo" ? "rgba(0,0,0,.42)" : "rgba(0,0,0,.32)";
        alvo.shadowOffsetX = acabamento === "relevo" ? 0.8 : 0.4;
        alvo.shadowOffsetY = acabamento === "relevo" ? 2.4 : 1.4;
        alvo.shadowBlur = acabamento === "relevo" ? 3 : 2;
      }
      alvo.drawImage(this.camadaArte, 0, 0);
      alvo.restore();
      if (this.camadas && this.camadaTrama) alvo.drawImage(this.camadaTrama, 0, 0);
    }
    if (comDestaque && this.destaque) {
      alvo.save();
      alvo.globalAlpha = this.destaque.forca;
      alvo.drawImage(this.destaque.camada, 0, 0);
      alvo.restore();
    }
  }

  /** Acende a parte por um instante, para o cliente ver o que vai pintar.
      Devolve false quando a foto não mostra aquela parte (a traseira, por exemplo). */
  olharPara(parte) {
    if (!this.pronto) return true;
    const indice = this.nomes.indexOf(parte) + 1;
    if (!indice) return false;
    const marca = new ImageData(LADO, LADO);
    let tem = false;
    const mascara = this.camadas && this.camadas.mascaras[parte];
    for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
      if (mascara ? mascara[i] < 0.35 : this.rotulo[i] !== indice) continue;
      marca.data[q] = 102;
      marca.data[q + 1] = 153;
      marca.data[q + 2] = 255;
      marca.data[q + 3] = 150;
      tem = true;
    }
    if (!tem) return false;
    const camada = quadro();
    camada.getContext("2d").putImageData(marca, 0, 0);
    const inicio = performance.now();
    const destaque = { camada, forca: 0 };
    this.destaque = destaque;
    const passo = (agora) => {
      if (this.destaque !== destaque) return;
      const t = (agora - inicio) / 900;
      if (t >= 1) {
        this.destaque = null;
        this.compor();
        return;
      }
      destaque.forca = Math.sin(Math.PI * t);
      this.compor();
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return true;
  }

  /** A foto do boné como está na tela, em fundo branco, para mandar com o pedido. */
  async foto() {
    const tela = quadro();
    const c = tela.getContext("2d");
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, LADO, LADO);
    const camada = quadro();
    this.compor(camada.getContext("2d"), false);
    c.drawImage(camada, 0, 0);
    return new Promise((resolver) => tela.toBlob(resolver, "image/png"));
  }
}
