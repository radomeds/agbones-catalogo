/* Texto em curvas para o montador de arte.
   Cada estilo de letra é um arquivo pronto em assets/fontes/arte/ (gerado por
   ferramentas/gerar-letras.py): o desenho de cada letra, a largura e o ajuste
   entre pares. Aqui só se soma, se encaixa no arco e se devolve o desenho.
   O arquivo do estilo só é baixado quando o cliente escolhe aquele estilo. */

/* Estilos que o cliente escolhe, com o nome que ele entende.
   As fontes são de licença livre (OFL): ver ferramentas/fontes-arte/LICENCAS.md. */
export const ESTILOS_DE_LETRA = [
  { id: "forte", nome: "Forte", descricao: "grossa e alta, lê de longe" },
  { id: "moderna", nome: "Moderna", descricao: "limpa e encorpada" },
  { id: "faroeste", nome: "Faroeste", descricao: "vaquejada, rodeio, fazenda" },
  { id: "time", nome: "Time", descricao: "letra de camisa de time" },
  { id: "cursiva", nome: "Cursiva", descricao: "escrita à mão" },
  { id: "classica", nome: "Clássica", descricao: "elegante, com serifa" },
];

const guardadas = new Map();

/** Baixa (uma vez só) as letras de um estilo. */
export function carregarLetras(estilo) {
  if (!guardadas.has(estilo)) {
    const endereco = new URL(`../fontes/arte/${estilo}.json`, import.meta.url);
    const pedido = fetch(endereco).then((resposta) => {
      if (!resposta.ok) throw new Error(`estilo ${estilo} não carregou`);
      return resposta.json();
    });
    pedido.catch(() => guardadas.delete(estilo));
    guardadas.set(estilo, pedido);
  }
  return guardadas.get(estilo);
}

function aplicar(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function multiplicar(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const mover = (x, y) => [1, 0, 0, 1, x, y];
const girar = (angulo) => [Math.cos(angulo), Math.sin(angulo), -Math.sin(angulo), Math.cos(angulo), 0, 0];

/** Monta o texto em curvas.
    `curva` em graus: 0 é reto; positivo, arco para cima (o meio mais alto, o clássico
    de boné); negativo, arco para baixo. `espaco` é o espaço extra entre letras, em
    milésimos da letra.
    Devolve { formas: [{ matriz, d }], caixa: { x, y, largura, altura } }, em unidades
    em que a letra tem 1000 de corpo; a linha de base passa em y = 0. */
export function montarTexto(letras, texto, { curva = 0, espaco = 0 } = {}) {
  const caracteres = Array.from(texto.replace(/\s+/g, " ").trim());
  const colocadas = [];
  let cursor = 0;
  caracteres.forEach((caractere, indice) => {
    const letra = letras.letras[caractere] || letras.letras[caractere.toUpperCase()] || letras.letras["?"];
    if (!letra) return;
    if (indice > 0) cursor += (letras.pares[caracteres[indice - 1] + caractere] || 0) + espaco;
    colocadas.push({ letra, x: cursor });
    cursor += letra.a;
  });
  const largura = Math.max(1, cursor);
  const angulo = (Math.max(-300, Math.min(300, curva)) * Math.PI) / 180;
  const raio = Math.abs(angulo) > 1e-3 ? largura / Math.abs(angulo) : 0;

  const formas = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { letra, x } of colocadas) {
    const meio = x + letra.a / 2;
    let lugar;
    if (!raio) {
      lugar = mover(meio, 0);
    } else {
      // a linha de base corre num círculo; cada letra gira para ficar em pé nele
      const teta = (meio - largura / 2) / raio;
      const sinal = Math.sign(angulo);
      const px = largura / 2 + raio * Math.sin(teta);
      const py = sinal * raio * (1 - Math.cos(teta));
      lugar = multiplicar(mover(px, py), girar(sinal * teta));
    }
    const matriz = multiplicar(lugar, mover(-letra.a / 2, 0));
    if (letra.d) formas.push({ matriz, d: letra.d });
    if (letra.c) {
      const [a, b, c, d] = letra.c;
      for (const [px, py] of [[a, b], [c, b], [a, d], [c, d]]) {
        const [tx, ty] = aplicar(matriz, px, py);
        x0 = Math.min(x0, tx);
        y0 = Math.min(y0, ty);
        x1 = Math.max(x1, tx);
        y1 = Math.max(y1, ty);
      }
    }
  }
  if (!formas.length) return { formas, caixa: { x: 0, y: 0, largura: 0, altura: 0 } };
  return { formas, caixa: { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 } };
}

/** Matriz no formato do SVG, com poucas casas. */
export function matrizSvg(m) {
  return m.map((n) => Math.round(n * 1000) / 1000).join(" ");
}

/* ---------- contorno, pelo motor do ArtCraft ---------- */

let trabalhador = null;
let ultimoPedido = 0;
const esperando = new Map();

function obterTrabalhador() {
  if (trabalhador) return trabalhador;
  trabalhador = new Worker(new URL("./contorno-trabalhador.js", import.meta.url), { type: "module" });
  trabalhador.onmessage = (evento) => {
    const resolver = esperando.get(evento.data.pedido);
    esperando.delete(evento.data.pedido);
    if (resolver) resolver(evento.data);
  };
  return trabalhador;
}

/** Diz se o aparelho roda o motor do contorno. */
export function contornoDisponivel() {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

/** Contorno em volta das formas (cada uma com a sua matriz), com `grossura` nas
    mesmas unidades. Devolve { contorno, x, y, largura, altura } ou { erro }. */
export function contornar(formas, grossura) {
  const linhas = formas.map((forma) => `${matrizSvg(forma.matriz)};${forma.d}`).join("\n");
  const pedido = ++ultimoPedido;
  const resposta = new Promise((resolver) => esperando.set(pedido, resolver));
  obterTrabalhador().postMessage({ pedido, linhas, distancia: Math.max(1, Math.round(grossura * 10)) });
  return resposta;
}
