/* Trabalhador do vetorizador: roda o traço fora da tela, para o celular não
   travar enquanto a logo vira vetor. O motor é o VectorCraft Image Trace, do
   ArtCraft (storytold, MIT ou Apache-2.0), compilado para WebAssembly em
   assets/wasm/vetor-agbones.wasm — como refazer: ferramentas/vetor-wasm/LEIA-ME.md */

let motor = null;

async function carregarMotor() {
  if (motor) return motor;
  const endereco = new URL("../wasm/vetor-agbones.wasm", import.meta.url);
  let instancia;
  try {
    ({ instance: instancia } = await WebAssembly.instantiateStreaming(fetch(endereco), {}));
  } catch (erro) {
    // servidor que não diz "application/wasm": lê os bytes e monta do mesmo jeito
    const bytes = await (await fetch(endereco)).arrayBuffer();
    ({ instance: instancia } = await WebAssembly.instantiate(bytes, {}));
  }
  motor = instancia.exports;
  return motor;
}

self.onmessage = async (evento) => {
  const { pedido, pixels, largura, altura, cores, ignorarBranco } = evento.data;
  try {
    const m = await carregarMotor();
    const endereco = m.reservar(pixels.length);
    new Uint8Array(m.memory.buffer, endereco, pixels.length).set(pixels);
    const tamanho = m.vetorizar(endereco, largura, altura, cores, ignorarBranco ? 1 : 0);
    m.liberar(endereco, pixels.length);
    const texto = new TextDecoder().decode(new Uint8Array(m.memory.buffer, m.resultado_ptr(), tamanho));
    self.postMessage({ pedido, ...JSON.parse(texto) });
  } catch (erro) {
    self.postMessage({ pedido, svg: "", cores: [], formas: 0, pontos: 0, modo: "", erro: String(erro && erro.message || erro) });
  }
};
