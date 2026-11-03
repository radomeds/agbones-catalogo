/* As cores de uma logo, trazidas para as cores que a fábrica tem.
   Conta os pixels da imagem (sem o fundo), aproxima cada um da cor de tecido
   mais parecida e devolve as que mais aparecem. */

function separar(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function maisParecida(rgb, cores) {
  let melhor = null, menor = Infinity;
  for (const cor of cores) {
    const [r, g, b] = cor.rgb;
    // peso do olho: o verde conta mais que o azul
    const d = 2 * (rgb[0] - r) ** 2 + 4 * (rgb[1] - g) ** 2 + 3 * (rgb[2] - b) ** 2;
    if (d < menor) { menor = d; melhor = cor; }
  }
  return melhor;
}

export function luz(hex) {
  const [r, g, b] = separar(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** imagem: um <img> ou <canvas> já carregado. Devolve as cores do catálogo, da mais vista à menos. */
export function coresDaLogo(imagem, cores, { tirarFundo = true } = {}) {
  const lado = 96;
  const largura = imagem.naturalWidth || imagem.width;
  const altura = imagem.naturalHeight || imagem.height;
  if (!largura || !altura) return [];
  const escala = Math.min(1, lado / Math.max(largura, altura));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(largura * escala));
  tela.height = Math.max(1, Math.round(altura * escala));
  const c = tela.getContext("2d", { willReadFrequently: true });
  c.drawImage(imagem, 0, 0, tela.width, tela.height);
  const p = c.getImageData(0, 0, tela.width, tela.height).data;
  const comRgb = cores.map((cor) => ({ ...cor, rgb: separar(cor.hex) }));
  const contagem = new Map();
  let total = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 128) continue;
    if (tirarFundo && Math.min(p[i], p[i + 1], p[i + 2]) > 232) continue;
    const cor = maisParecida([p[i], p[i + 1], p[i + 2]], comRgb);
    contagem.set(cor.id, (contagem.get(cor.id) || 0) + 1);
    total++;
  }
  if (!total) return [];
  return [...contagem.entries()]
    .filter(([, n]) => n / total > 0.04) // ruído de borda não vira cor
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => cores.find((cor) => cor.id === id));
}

/**
 * Combinações que ficam bem com a logo: a logo precisa aparecer no tecido,
 * então a frente é de uma cor que contrasta com a cor mais forte da logo;
 * a tela (ou embaixo da aba) repete a cor da logo.
 */
export function combinacoesDaLogo(coresLogo, cores) {
  if (!coresLogo.length) return [];
  const destaque = coresLogo[0];
  const candidatas = [...coresLogo.slice(1), ...["preto", "branco", "azul-marinho", "chumbo", "bege"].map((id) => cores.find((c) => c.id === id)).filter(Boolean)];
  const vistas = new Set();
  const lista = [];
  for (const fundo of candidatas) {
    if (!fundo || vistas.has(fundo.id) || fundo.id === destaque.id) continue;
    vistas.add(fundo.id);
    if (Math.abs(luz(fundo.hex) - luz(destaque.hex)) < 0.28) continue;
    lista.push({ nome: `${fundo.nome} com detalhes ${destaque.nome.toLowerCase()}`, principal: fundo.id, contraste: destaque.id, daLogo: true });
    lista.push({ nome: `${fundo.nome} com aba ${destaque.nome.toLowerCase()}`, principal: fundo.id, contraste: fundo.id, aba: destaque.id, daLogo: true });
  }
  return lista;
}
