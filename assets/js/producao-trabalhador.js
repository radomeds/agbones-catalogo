/* Trabalhador do arquivo de produção: lê a arte em SVG (em milímetros) e devolve o PDF,
   o EPS ou o DXF, sem travar a tela. O motor é o VectorCraft (svg, pdf, eps e cad), do
   ArtCraft (storytold, MIT ou Apache-2.0), compilado para WebAssembly em
   assets/wasm/producao-agbones.wasm — como refazer: ferramentas/producao-wasm/LEIA-ME.md.
   O motor é grande, então só é baixado quando o cliente pede o primeiro arquivo. */

let motor = null;

async function carregarMotor() {
  if (motor) return motor;
  const endereco = new URL("../wasm/producao-agbones.wasm", import.meta.url);
  let instancia;
  try {
    ({ instance: instancia } = await WebAssembly.instantiateStreaming(fetch(endereco), {}));
  } catch (erro) {
    const bytes = await (await fetch(endereco)).arrayBuffer();
    ({ instance: instancia } = await WebAssembly.instantiate(bytes, {}));
  }
  motor = instancia.exports;
  return motor;
}

self.onmessage = async (evento) => {
  const { pedido, svg, formato } = evento.data;
  try {
    const m = await carregarMotor();
    const entrada = new TextEncoder().encode(svg);
    const endereco = m.reservar(entrada.length);
    new Uint8Array(m.memory.buffer, endereco, entrada.length).set(entrada);
    const tamanho = m.exportar(endereco, entrada.length, formato);
    m.liberar(endereco, entrada.length);
    // copia para fora da memória do motor antes de mandar
    const bytes = new Uint8Array(m.memory.buffer, m.resultado_ptr(), tamanho).slice();
    const cabeca = new TextDecoder().decode(bytes.subarray(0, 5));
    if (cabeca === "ERRO:") {
      self.postMessage({ pedido, erro: new TextDecoder().decode(bytes.subarray(5)).trim() });
      return;
    }
    self.postMessage({ pedido, bytes: bytes.buffer }, [bytes.buffer]);
  } catch (erro) {
    self.postMessage({ pedido, erro: String((erro && erro.message) || erro) });
  }
};
