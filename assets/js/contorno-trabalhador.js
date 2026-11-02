/* Trabalhador do contorno: cresce a arte para fora (a borda do texto no silk, a
   sobra do aplique, a borda do patch) sem travar a tela. O motor é o VectorCraft
   Path Operations, do ArtCraft (storytold, MIT ou Apache-2.0), compilado para
   WebAssembly em assets/wasm/arte-agbones.wasm — como refazer:
   ferramentas/arte-wasm/LEIA-ME.md */

let motor = null;

async function carregarMotor() {
  if (motor) return motor;
  const endereco = new URL("../wasm/arte-agbones.wasm", import.meta.url);
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
  const { pedido, linhas, distancia } = evento.data;
  try {
    const m = await carregarMotor();
    const bytes = new TextEncoder().encode(linhas);
    const endereco = m.reservar(bytes.length);
    new Uint8Array(m.memory.buffer, endereco, bytes.length).set(bytes);
    const tamanho = m.contornar(endereco, bytes.length, distancia);
    m.liberar(endereco, bytes.length);
    const texto = new TextDecoder().decode(new Uint8Array(m.memory.buffer, m.resultado_ptr(), tamanho));
    self.postMessage({ pedido, ...JSON.parse(texto) });
  } catch (erro) {
    self.postMessage({ pedido, erro: String((erro && erro.message) || erro) });
  }
};
