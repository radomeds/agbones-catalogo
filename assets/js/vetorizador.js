/* Vetorizador próprio da AG Bonés: a arte do cliente vira vetor pronto para a
   produção, no aparelho dele. Nada é enviado: a imagem é lida em memória.

   Caminho: 1) pré-limpeza: ampliação (e, se o cliente pedir, a limpeza com IA,
   Real-ESRGAN); 2) cores: acha as cores chapadas e, se pedido, encaixa na cartela
   de bordado ou de silk; 3) traço: ArtCraft ou VTracer; 4) acabamento: some com o
   que é fino demais para a técnica, junta curvas e troca círculos pela forma exata.
   Os passos 2 a 4 são o motor em Rust (assets/wasm/vetorizador-agbones.wasm).
   Este arquivo é usado pela página vetorizador.html e pela régua de comparação
   (ferramentas/regua-vetor). */

/* Maior lado da imagem entregue ao traço. Arte pequena é ampliada até aqui: a
   borda fica mais fina que um pixel e o traço põe a curva no lugar certo. */
export const LADO_ALVO = 1200;
/* Acima disso a imagem é reduzida: o celular demora e o desenho não melhora. */
export const LADO_MAXIMO = 1600;
/* A IA amplia 4 vezes; a entrada é limitada para não levar minutos no celular. */
export const LADO_IA = 400;

function criarTrabalhador(arquivo) {
  let trabalhador = null;
  let ultimo = 0;
  const esperando = new Map();
  return (mensagem, transferir = [], aoAndar = null) => {
    if (!trabalhador) {
      trabalhador = new Worker(new URL(arquivo, import.meta.url), { type: "module" });
      trabalhador.onmessage = (evento) => {
        const pedido = esperando.get(evento.data.pedido);
        if (!pedido) return;
        if ("parte" in evento.data) {
          if (pedido.aoAndar) pedido.aoAndar(evento.data.parte);
          return;
        }
        esperando.delete(evento.data.pedido);
        pedido.resolver(evento.data);
      };
    }
    const pedido = ++ultimo;
    return new Promise((resolver) => {
      esperando.set(pedido, { resolver, aoAndar });
      trabalhador.postMessage({ pedido, ...mensagem }, transferir);
    });
  };
}

const pedirTraco = criarTrabalhador("./vetorizador-trabalhador.js");
const pedirIa = criarTrabalhador("./limpeza-ia-trabalhador.js");

export function vetorizadorDisponivel() {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

export async function lerImagem(fonte) {
  const endereco = typeof fonte === "string" ? fonte : URL.createObjectURL(fonte);
  try {
    return await new Promise((resolver, rejeitar) => {
      const elemento = new Image();
      elemento.onload = () => resolver(elemento);
      elemento.onerror = () => rejeitar(new Error("imagem ilegível"));
      elemento.src = endereco;
    });
  } finally {
    if (typeof fonte !== "string") setTimeout(() => URL.revokeObjectURL(endereco), 0);
  }
}

function tela(largura, altura) {
  const t = document.createElement("canvas");
  t.width = largura;
  t.height = altura;
  return t;
}

function pixelsDe(fonte, largura, altura) {
  const t = tela(largura, altura);
  const c = t.getContext("2d", { willReadFrequently: true });
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(fonte, 0, 0, largura, altura);
  return c.getImageData(0, 0, largura, altura);
}

/* Redimensiona em passos de no máximo 2 vezes: a ampliação fica mais lisa. */
function redimensionar(fonte, largura, altura) {
  let atual = fonte;
  let w = fonte.naturalWidth || fonte.width, h = fonte.naturalHeight || fonte.height;
  while (w * 2 < largura) {
    w *= 2; h *= 2;
    const t = tela(w, h);
    const c = t.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(atual, 0, 0, w, h);
    atual = t;
  }
  return pixelsDe(atual, largura, altura);
}

function temTransparencia(dados) {
  for (let i = 3; i < dados.length; i += 4) if (dados[i] < 250) return true;
  return false;
}

/** Prepara os pixels para o traço. `ia`: limpar e ampliar com o Real-ESRGAN.
    Devolve { pixels (Uint8Array RGBA), largura, altura, transparente, ia }. */
export async function prepararPixels(imagem, { ia = false, aoAndar = null } = {}) {
  const W = imagem.naturalWidth || imagem.width, H = imagem.naturalHeight || imagem.height;
  const maior = Math.max(W, H);
  const original = pixelsDe(imagem, W, H);
  const transparente = temTransparencia(original.data);
  let fonte = imagem;
  let infoIa = null;
  if (ia) {
    // a IA trabalha sobre fundo branco; a transparência volta depois, ampliada
    const e = Math.min(1, LADO_IA / maior);
    const w = Math.max(1, Math.round(W * e)), h = Math.max(1, Math.round(H * e));
    const t = tela(w, h);
    const c = t.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, w, h);
    c.imageSmoothingQuality = "high";
    c.drawImage(imagem, 0, 0, w, h);
    const entrada = new Uint8Array(c.getImageData(0, 0, w, h).data.buffer);
    const r = await pedirIa({ pixels: entrada, largura: w, altura: h }, [entrada.buffer], aoAndar);
    if (r.erro) throw new Error("a limpeza com IA falhou: " + r.erro);
    const saida = tela(r.largura, r.altura);
    saida.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.pixels.buffer), r.largura, r.altura), 0, 0);
    fonte = saida;
    infoIa = { provedor: r.provedor, ms: r.ms };
  }
  const fw = fonte.naturalWidth || fonte.width, fh = fonte.naturalHeight || fonte.height;
  const fm = Math.max(fw, fh);
  const alvo = fm < LADO_ALVO ? LADO_ALVO : Math.min(fm, LADO_MAXIMO);
  const largura = Math.max(1, Math.round(fw * alvo / fm)), altura = Math.max(1, Math.round(fh * alvo / fm));
  const dados = fm < alvo ? redimensionar(fonte, largura, altura) : pixelsDe(fonte, largura, altura);
  if (ia && transparente) {
    const alfa = redimensionar(imagem, largura, altura).data;
    for (let i = 3; i < dados.data.length; i += 4) dados.data[i] = alfa[i];
  }
  return { pixels: new Uint8Array(dados.data.buffer), largura, altura, transparente, ia: infoIa };
}

/** Monta o texto de opções do motor. */
export function montarOpcoes({ cores = 0, paleta = [], motor = "artcraft", minimo = 0, ignorarBranco = false, formas = true, tolerancia = 0.4, paletaPropria = false, plana = false } = {}) {
  return [
    `cores=${cores}`,
    `paleta=${paleta.join(",")}`,
    `motor=${motor}`,
    `minimo=${minimo.toFixed(2)}`,
    `ignorar_branco=${ignorarBranco ? 1 : 0}`,
    `formas=${formas ? 1 : 0}`,
    `tolerancia=${tolerancia}`,
    `paleta_propria=${paletaPropria ? 1 : 0}`,
    `plana=${plana ? 1 : 0}`,
  ].join(";");
}

/** Vetoriza pixels já preparados. Devolve o JSON do motor:
    { svg, cores, nos, nos_crus, caminhos, circulos, retas, finos, motor, avisos, erro, ms }. */
export function vetorizarPixels({ pixels, largura, altura }, opcoes) {
  const copia = new Uint8Array(pixels);
  return pedirTraco({ pixels: copia, largura, altura, opcoes: montarOpcoes(opcoes) }, [copia.buffer]);
}

/* Padrões medidos na régua (ferramentas/regua-vetor): a paleta achada por nós
   (a do ArtCraft inventa cores na borda do JPEG), curva suave e sujeira de até
   4 pixels tirada. */
export const PADRAO = { paletaPropria: true, tolerancia: 1, minimo: 4 };

/** Vetoriza dos dois jeitos (sobre a imagem com a borda suave e sobre a imagem
    achatada nas cores) e fica com o de menos nós. Cada arte ganha num jeito; a
    régua mostrou que o de menos nós é também o mais limpo. */
export async function vetorizarMelhor(dados, opcoes) {
  const o = { ...PADRAO, ...opcoes, minimo: Math.max(PADRAO.minimo, opcoes.minimo || 0) };
  const suave = await vetorizarPixels(dados, { ...o, plana: false });
  if (o.motor === "vtracer") return suave;
  const plana = await vetorizarPixels(dados, { ...o, plana: true, tolerancia: Math.max(o.tolerancia, 1.5) });
  if (plana.erro) return suave;
  const melhor = !suave.erro && suave.nos <= plana.nos ? suave : plana;
  return { ...melhor, ms: (suave.ms || 0) + (plana.ms || 0) };
}

/** Largura mínima de qualquer parte, em pixels da imagem, para a técnica e o tamanho no boné. */
export function minimoEmPixels(tracoMm, larguraMm, larguraPx) {
  if (!tracoMm || !larguraMm || !larguraPx) return 0;
  return tracoMm * larguraPx / larguraMm;
}
