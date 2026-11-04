/* Trabalhador do vetorizador próprio: roda o traço fora da tela, para o celular
   não travar. Motor em assets/wasm/vetorizador-agbones.wasm (Rust, sem build no
   site) — como refazer: ferramentas/vetorizador-wasm/LEIA-ME.md. Por dentro:
   VectorCraft Image Trace (ArtCraft, MIT ou Apache-2.0) e visioncortex, o motor
   do VTracer (MIT ou Apache-2.0). */

let motor = null;

async function carregarMotor() {
  if (motor) return motor;
  const endereco = new URL("../wasm/vetorizador-agbones.wasm", import.meta.url);
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
  const { pedido, pixels, largura, altura, opcoes } = evento.data;
  try {
    const m = await carregarMotor();
    const texto = new TextEncoder().encode(opcoes || "");
    const endereco = m.reservar(pixels.length);
    new Uint8Array(m.memory.buffer, endereco, pixels.length).set(pixels);
    const enderecoOpcoes = m.reservar(Math.max(1, texto.length));
    new Uint8Array(m.memory.buffer, enderecoOpcoes, texto.length).set(texto);
    const inicio = performance.now();
    const tamanho = m.vetorizar(endereco, largura, altura, enderecoOpcoes, texto.length);
    const ms = Math.round(performance.now() - inicio);
    m.liberar(endereco, pixels.length);
    m.liberar(enderecoOpcoes, Math.max(1, texto.length));
    const json = new TextDecoder().decode(new Uint8Array(m.memory.buffer, m.resultado_ptr(), tamanho));
    self.postMessage({ pedido, ms, ...JSON.parse(json) });
  } catch (erro) {
    self.postMessage({ pedido, svg: "", cores: [], nos: 0, avisos: [], erro: String(erro && erro.message || erro) });
  }
};
