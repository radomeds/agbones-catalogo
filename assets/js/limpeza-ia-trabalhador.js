/* Limpeza com IA: amplia 4 vezes e tira o ruído (JPEG, foto, print) antes do traço.
   Modelo Real-ESRGAN realesr-general-x4v3 (Xintao Wang e outros, BSD-3-Clause),
   convertido para ONNX por ferramentas/limpeza-ia/converter-realesrgan.py.
   Roda com o ONNX Runtime Web (Microsoft, MIT): placa de vídeo (WebGPU) quando o
   aparelho tem, senão o processador (WebAssembly). Tudo é baixado só quando o
   cliente pede a limpeza, e nada sai do aparelho. */

import * as ort from "./terceiros/ort/ort.webgpu.min.mjs";

ort.env.wasm.wasmPaths = new URL("./terceiros/ort/", import.meta.url).href;
const MODELO = new URL("../modelos/realesr-general-x4v3.onnx", import.meta.url).href;

/* Pedaço processado de cada vez (mais a margem, que evita emenda visível). */
const PEDACO = 128;
const MARGEM = 8;
const ESCALA = 4;

let sessao = null;
let provedor = "";

async function abrir() {
  if (sessao) return sessao;
  if (self.navigator && navigator.gpu) {
    try {
      sessao = await ort.InferenceSession.create(MODELO, { executionProviders: ["webgpu"] });
      provedor = "webgpu";
      return sessao;
    } catch (erro) {
      sessao = null;
    }
  }
  sessao = await ort.InferenceSession.create(MODELO, { executionProviders: ["wasm"] });
  provedor = "wasm";
  return sessao;
}

/* pixels: RGBA já sobre fundo branco. Devolve RGB ×4 em RGBA (alpha 255). */
async function ampliar(pixels, largura, altura, avisar) {
  const s = await abrir();
  const L = largura * ESCALA;
  const saida = new Uint8ClampedArray(L * altura * ESCALA * 4);
  const pedacos = [];
  for (let y = 0; y < altura; y += PEDACO) for (let x = 0; x < largura; x += PEDACO) pedacos.push([x, y]);
  let feitos = 0;
  for (const [x, y] of pedacos) {
    const w = Math.min(PEDACO, largura - x), h = Math.min(PEDACO, altura - y);
    const x0 = Math.max(0, x - MARGEM), y0 = Math.max(0, y - MARGEM);
    const x1 = Math.min(largura, x + w + MARGEM), y1 = Math.min(altura, y + h + MARGEM);
    const tw = x1 - x0, th = y1 - y0;
    const entrada = new Float32Array(3 * tw * th);
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const k = ((y0 + j) * largura + x0 + i) * 4;
      const p = j * tw + i;
      entrada[p] = pixels[k] / 255;
      entrada[tw * th + p] = pixels[k + 1] / 255;
      entrada[2 * tw * th + p] = pixels[k + 2] / 255;
    }
    const r = await s.run({ entrada: new ort.Tensor("float32", entrada, [1, 3, th, tw]) });
    const dados = r.saida.data;
    const OW = tw * ESCALA, OH = th * ESCALA, area = OW * OH;
    for (let j = 0; j < h * ESCALA; j++) for (let i = 0; i < w * ESCALA; i++) {
      const oj = (y - y0) * ESCALA + j, oi = (x - x0) * ESCALA + i;
      const o = oj * OW + oi;
      const d = ((y * ESCALA + j) * L + x * ESCALA + i) * 4;
      saida[d] = dados[o] * 255;
      saida[d + 1] = dados[area + o] * 255;
      saida[d + 2] = dados[2 * area + o] * 255;
      saida[d + 3] = 255;
    }
    feitos++;
    avisar(feitos / pedacos.length);
  }
  return saida;
}

self.onmessage = async (evento) => {
  const { pedido, pixels, largura, altura } = evento.data;
  try {
    const inicio = performance.now();
    const saida = await ampliar(pixels, largura, altura, (parte) => self.postMessage({ pedido, parte }));
    self.postMessage(
      { pedido, pixels: saida, largura: largura * ESCALA, altura: altura * ESCALA, provedor, ms: Math.round(performance.now() - inicio) },
      [saida.buffer],
    );
  } catch (erro) {
    self.postMessage({ pedido, erro: String(erro && erro.message || erro) });
  }
};
