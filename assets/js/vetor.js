/* A logo do cliente vira vetor no aparelho dele, com o motor de traço do
   ArtCraft. Serve para ele ver, antes de pedir, como a logo fica com poucas
   cores chapadas — que é como ela sai na serigrafia, no transfer e no bordado.
   Nada é enviado: a imagem é lida em memória e o resultado fica nesta aba.
   O motor só é baixado quando o cliente escolhe a logo, nunca na vitrine. */

/* Maior lado da imagem entregue ao traço: acima disso o celular demora e o
   resultado na tela do boné não melhora. */
const LADO_MAXIMO = 640;

let trabalhador = null;
let ultimoPedido = 0;
const esperando = new Map();

function obterTrabalhador() {
  if (trabalhador) return trabalhador;
  trabalhador = new Worker(new URL("./vetor-trabalhador.js", import.meta.url), { type: "module" });
  trabalhador.onmessage = (evento) => {
    const resolver = esperando.get(evento.data.pedido);
    esperando.delete(evento.data.pedido);
    if (resolver) resolver(evento.data);
  };
  return trabalhador;
}

/** Diz se o aparelho roda o vetorizador (navegador muito antigo não roda). */
export function vetorizadorDisponivel() {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

async function lerPixels(arquivo) {
  const endereco = URL.createObjectURL(arquivo);
  try {
    const imagem = await new Promise((resolver, rejeitar) => {
      const elemento = new Image();
      elemento.onload = () => resolver(elemento);
      elemento.onerror = () => rejeitar(new Error("imagem ilegível"));
      elemento.src = endereco;
    });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
    const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const pincel = tela.getContext("2d", { willReadFrequently: true });
    // com suavização: o traço de logo lê a borda meio-pixel e põe a curva no lugar certo
    pincel.imageSmoothingQuality = "high";
    pincel.drawImage(imagem, 0, 0, largura, altura);
    const pixels = new Uint8Array(pincel.getImageData(0, 0, largura, altura).data.buffer);
    let temTransparencia = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 250) { temTransparencia = true; break; }
    }
    return { pixels, largura, altura, temTransparencia };
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

/** Vetoriza a imagem em até `cores` cores.
    Devolve { svg, cores: ["#rrggbb"], formas, pontos, modo, erro }. */
export async function vetorizarArquivo(arquivo, cores) {
  const { pixels, largura, altura, temTransparencia } = await lerPixels(arquivo);
  const pedido = ++ultimoPedido;
  const resposta = new Promise((resolver) => esperando.set(pedido, resolver));
  // fundo sólido quase sempre é branco de JPEG: sai, para o boné aparecer por trás
  obterTrabalhador().postMessage(
    { pedido, pixels, largura, altura, cores, ignorarBranco: !temTransparencia },
    [pixels.buffer],
  );
  return resposta;
}

/** Endereço temporário do SVG, para desenhar no boné. */
export function enderecoDoVetor(svg) {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}
