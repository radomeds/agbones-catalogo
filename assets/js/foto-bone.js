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
      // fixo e chão são listas de polígonos: o rascunho troca a lista inteira
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

function pixelsDe(imagem) {
  const tela = quadro();
  const c = tela.getContext("2d", { willReadFrequently: true });
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
  const x = u * arte.largura;
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
      const promessa = Promise.all([
        carregarImagem(`assets/produtos/${id}.webp`),
        carregarImagem(`assets/produtos/montagem/${id}.webp`),
      ]).then(([original, limpa]) => ({ original: pixelsDe(original), limpa: pixelsDe(limpa) }));
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
    this.chao = chao;
    this.sombreado = sombreado;
    this.camadaBone = this.camadaBone || quadro();
  }

  /** Pinta uma parte. Aceita "todo" para o boné inteiro. */
  pintar(parte, cor) {
    if (parte === "todo") {
      (this.nomes || []).forEach((nome) => { this.cores[nome] = cor; });
      Object.keys(this.cores).forEach((nome) => { this.cores[nome] = cor; });
    } else {
      this.cores[parte] = cor;
    }
    if (!this.pronto) return;
    this.desenharBone();
    this.compor();
  }

  desenharBone() {
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

  /** Coloca a arte do cliente na frente. `arte` = { imagem (canvas), proporcao, escala, relevo }. */
  colocarArte(arte) {
    this.arte = arte;
    if (!this.pronto) return;
    this.desenharArte();
    this.compor();
  }

  /** Os quatro cantos e a malha da logo no lugar: para desenhar e para a tela do ADM. */
  malhaDaArte(proporcao = 1, escala = 1, passos = 10) {
    const lugar = (this.ajustes[this.id] || {}).arte;
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
    const arte = this.arte;
    if (!arte || !arte.imagem || !this.pronto) return;
    const imagem = arte.imagem;
    const passos = 10;
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

    // a luz do tecido debaixo da logo, medida contra o meio da própria logo
    const dados = c.getImageData(0, 0, LADO, LADO);
    const p = dados.data;
    const limpa = this.atuais.limpa.data;
    const amostra = new Float32Array(PIXELS);
    let quantos = 0;
    for (let i = 0; i < PIXELS; i++) if (p[i * 4 + 3] > 128) amostra[quantos++] = this.luzLarga[i];
    const referencia = mediana(amostra, quantos);
    const curva = curvaDaLuz(referencia) * 0.8;
    // a tinta e a linha cobrem o grão do tecido: passa só um pouco dele
    const grao = pesoDoGrao(referencia) * (arte.relevo ? 0.25 : 0.4);
    const alfa = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) alfa[i] = p[i * 4 + 3];
    for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
      if (!p[q + 3]) continue;
      const larga = Math.max(1e-4, this.luzLarga[i]);
      const fino = Math.max(0.5, Math.min(1.8, this.luz[i] / larga)) ** grao;
      let s = Math.max(0.45, Math.min(1.3, (larga / referencia) ** curva * fino));
      if (arte.relevo) {
        // bordado e aplique: a borda de cima pega luz e a de baixo faz sombra
        const x = i % LADO;
        const y = (i - x) / LADO;
        if (x > 1 && y > 1 && x < LADO - 2 && y < LADO - 2) {
          const subida = (alfa[i - LADO - 1] - alfa[i + LADO + 1]) / 255;
          s *= 1 - subida * 0.35;
        }
      }
      p[q] = voltar(PARA_LINEAR[p[q]] * s);
      p[q + 1] = voltar(PARA_LINEAR[p[q + 1]] * s);
      p[q + 2] = voltar(PARA_LINEAR[p[q + 2]] * s);
      // a logo não sai do boné
      p[q + 3] = this.chao[i] ? 0 : Math.round((p[q + 3] * limpa[q + 3]) / 255);
    }
    c.putImageData(dados, 0, 0);
    this.camadaArte = tela;
  }

  compor(alvo = this.c, comDestaque = true) {
    alvo.clearRect(0, 0, LADO, LADO);
    if (!this.pronto) return;
    alvo.drawImage(this.camadaSombra, 0, 0);
    alvo.drawImage(this.camadaBone, 0, 0);
    if (this.camadaArte) {
      alvo.save();
      if (this.arte && this.arte.relevo) {
        alvo.shadowColor = "rgba(0,0,0,.35)";
        alvo.shadowOffsetY = 1.5;
        alvo.shadowBlur = 2.5;
      }
      alvo.drawImage(this.camadaArte, 0, 0);
      alvo.restore();
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
    for (let i = 0, q = 0; i < PIXELS; i++, q += 4) {
      if (this.rotulo[i] !== indice) continue;
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
