/* Tela do vetorizador próprio (vetorizador.html). O trabalho pesado está em
   vetorizador.js e nos trabalhadores; aqui ficam só as escolhas do cliente. */

import { lerImagem, prepararPixels, vetorizarMelhor, minimoEmPixels, vetorizadorDisponivel } from "./vetorizador.js";

const $ = (id) => document.getElementById(id);
const el = {
  arquivo: $("vz-arquivo"), enviar: $("vz-enviar"), painel: $("vz-painel"),
  original: $("vz-original"), vetor: $("vz-vetor"), quadroVetor: $("vz-quadro-vetor"),
  situacao: $("vz-situacao"), barra: $("vz-barra"), barraCheia: $("vz-barra-cheia"),
  tecnica: $("vz-tecnica"), cores: $("vz-cores"), largura: $("vz-largura"),
  fundo: $("vz-fundo"), ia: $("vz-ia"), motor: $("vz-motor"), formas: $("vz-formas"), fino: $("vz-fino"),
  resumo: $("vz-resumo"), paleta: $("vz-paleta"), avisos: $("vz-avisos"),
  baixarSvg: $("vz-baixar-svg"), baixarPng: $("vz-baixar-png"),
};

const estado = {
  dados: null, imagem: null, nome: "logo", preparados: new Map(),
  tecnica: "bordado", cores: 0, resultado: null, caixa: null, rodada: 0,
};

const TECNICAS = [
  { id: "bordado", nome: "Bordado", cartela: "bordado", producao: "bordado" },
  { id: "silk", nome: "Silk", cartela: "silk", producao: "silk-direto" },
  { id: "livre", nome: "Cores da arte", cartela: null, producao: null },
];

function fichas(caixa, itens, atual, escolher) {
  caixa.textContent = "";
  for (const item of itens) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vz-ficha";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(item.id === atual));
    b.textContent = item.nome;
    b.addEventListener("click", () => {
      caixa.querySelectorAll(".vz-ficha").forEach((o) => o.setAttribute("aria-checked", String(o === b)));
      escolher(item.id);
    });
    caixa.append(b);
  }
}

/* Caixa do desenho (sem o fundo), em pixels: é ela que mede a largura no boné. */
function caixaDoDesenho({ pixels, largura, altura }) {
  let x0 = largura, y0 = altura, x1 = -1, y1 = -1;
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const k = (y * largura + x) * 4;
    const fundo = pixels[k + 3] < 128 || (pixels[k] > 235 && pixels[k + 1] > 235 && pixels[k + 2] > 235);
    if (fundo) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x: 0, y: 0, w: largura, h: altura } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function avisar(texto) { el.situacao.textContent = texto; }
function barra(parte) {
  el.barra.hidden = parte === null;
  if (parte !== null) el.barraCheia.style.width = `${Math.round(parte * 100)}%`;
}

async function preparados() {
  const chave = el.ia.checked ? "ia" : "simples";
  if (!estado.preparados.has(chave)) {
    if (el.ia.checked) {
      avisar("Limpando e ampliando com IA… (a primeira vez baixa o modelo)");
      barra(0);
    }
    const p = await prepararPixels(estado.imagem, { ia: el.ia.checked, aoAndar: barra });
    p.caixa = caixaDoDesenho(p);
    estado.preparados.set(chave, p);
  }
  return estado.preparados.get(chave);
}

async function vetorizar() {
  if (!estado.imagem) return;
  const rodada = ++estado.rodada;
  el.quadroVetor.classList.add("vz-quadro--trabalhando");
  el.baixarSvg.disabled = el.baixarPng.disabled = true;
  let p;
  try {
    p = await preparados();
  } catch (erro) {
    el.ia.checked = false;
    avisar(`${erro.message}. Seguimos sem a IA.`);
    p = await preparados();
  }
  if (rodada !== estado.rodada) return;
  barra(null);
  avisar("Vetorizando no seu aparelho…");
  const tec = TECNICAS.find((t) => t.id === estado.tecnica);
  const cartela = tec.cartela ? (estado.dados?.cartelas?.[tec.cartela] || []) : [];
  const traco = tec.producao ? (estado.dados?.producao?.tecnicas?.[tec.producao]?.traco_minimo_mm || 0) : 0;
  const larguraMm = Math.max(5, Number(el.largura.value) * 10 || 100);
  const minimo = el.fino.checked ? minimoEmPixels(traco, larguraMm, p.caixa.w) : 0;
  const r = await vetorizarMelhor(p, {
    cores: estado.cores, paleta: cartela.map((c) => c.hex), motor: el.motor.value, minimo,
    ignorarBranco: el.fundo.checked, formas: el.formas.checked,
  });
  if (rodada !== estado.rodada) return;
  el.quadroVetor.classList.remove("vz-quadro--trabalhando");
  if (r.erro) {
    avisar(`Não deu para vetorizar: ${r.erro}.`);
    return;
  }
  estado.resultado = { ...r, larguraMm, caixa: p.caixa, largura: p.largura, altura: p.altura, cartela };
  if (el.vetor.src) URL.revokeObjectURL(el.vetor.src);
  el.vetor.src = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml" }));
  avisar(`Pronto em ${((r.ms || 0) / 1000).toFixed(1)} s.`);
  const partes = [`${r.cores.length} ${r.cores.length === 1 ? "cor" : "cores"}`, `${r.nos} nós`];
  if (r.circulos) partes.push(`${r.circulos} ${r.circulos === 1 ? "círculo exato" : "círculos exatos"}`);
  if (p.ia) partes.push(`IA pela ${p.ia.provedor === "webgpu" ? "placa de vídeo" : "CPU"}`);
  el.resumo.textContent = partes.join(" · ");
  el.paleta.textContent = "";
  for (const hex of r.cores) {
    const nome = cartela.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.nome;
    const s = document.createElement("span");
    s.className = "vz-cor";
    const bola = document.createElement("i");
    bola.style.background = hex;
    s.append(bola, document.createTextNode(nome ? `${nome}` : hex.toUpperCase()));
    el.paleta.append(s);
  }
  el.avisos.textContent = "";
  for (const a of r.avisos) {
    const li = document.createElement("li");
    li.textContent = a;
    el.avisos.append(li);
  }
  el.baixarSvg.disabled = el.baixarPng.disabled = false;
}

let espera = 0;
function revetorizar() {
  clearTimeout(espera);
  espera = setTimeout(vetorizar, 250);
}

/* O SVG baixado leva a medida real: a largura do desenho vira a largura pedida no boné. */
function svgComMedida() {
  const r = estado.resultado;
  const mmPorPx = r.larguraMm / r.caixa.w;
  const w = (r.largura * mmPorPx).toFixed(1), h = (r.altura * mmPorPx).toFixed(1);
  return r.svg.replace(/width='\d+' height='\d+'/, `width='${w}mm' height='${h}mm'`);
}

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

el.baixarSvg.addEventListener("click", () => {
  baixar(new Blob([svgComMedida()], { type: "image/svg+xml" }), `${estado.nome}-vetor.svg`);
});
el.baixarPng.addEventListener("click", async () => {
  const r = estado.resultado;
  const img = await lerImagem(el.vetor.src);
  const t = document.createElement("canvas");
  t.width = r.largura * 2;
  t.height = r.altura * 2;
  t.getContext("2d").drawImage(img, 0, 0, t.width, t.height);
  t.toBlob((b) => baixar(b, `${estado.nome}-vetor.png`), "image/png");
});

el.arquivo.addEventListener("change", async () => {
  const arquivo = el.arquivo.files[0];
  if (!arquivo) return;
  estado.rodada++;
  estado.resultado = null;
  avisar("Lendo a imagem…");
  estado.nome = arquivo.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 40) || "logo";
  try {
    estado.imagem = await lerImagem(arquivo);
  } catch {
    el.painel.hidden = false;
    avisar("Não conseguimos ler essa imagem. Tente um PNG ou JPG.");
    return;
  }
  estado.preparados.clear();
  el.original.src = estado.imagem.src;
  el.painel.hidden = false;
  el.enviar.classList.add("vz-enviar--pequeno");
  // imagem pequena costuma ser print: a IA fica em destaque, mas não liga sozinha (na régua ela ajuda em umas artes e atrapalha em outras)
  const maior = Math.max(estado.imagem.naturalWidth, estado.imagem.naturalHeight);
  el.ia.checked = false;
  el.ia.closest("label")?.classList.toggle("vz-sugerido", maior < 500);
  // fundo transparente: não há fundo branco para tirar
  el.fundo.checked = !temAlfa(estado.imagem);
  vetorizar();
});

function temAlfa(imagem) {
  const t = document.createElement("canvas");
  t.width = Math.min(200, imagem.naturalWidth);
  t.height = Math.min(200, imagem.naturalHeight);
  const c = t.getContext("2d", { willReadFrequently: true });
  c.drawImage(imagem, 0, 0, t.width, t.height);
  const d = c.getImageData(0, 0, t.width, t.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

for (const campo of [el.largura, el.fundo, el.ia, el.motor, el.formas, el.fino]) campo.addEventListener("change", revetorizar);

async function iniciar() {
  if (!vetorizadorDisponivel()) {
    avisar("Este navegador é antigo demais para vetorizar. Mande a imagem pelo WhatsApp que a gente vetoriza.");
    el.enviar.hidden = true;
    el.painel.hidden = false;
    return;
  }
  try {
    estado.dados = await (await fetch("dados/produtos.json")).json();
    const larguraFrente = estado.dados?.producao?.largura_mm?.frente;
    if (larguraFrente) el.largura.value = String(larguraFrente / 10);
  } catch {
    estado.dados = null;
  }
  fichas(el.tecnica, TECNICAS, estado.tecnica, (id) => { estado.tecnica = id; revetorizar(); });
  fichas(el.cores, [0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: n, nome: n === 0 ? "Auto" : String(n) })), estado.cores,
    (n) => { estado.cores = n; revetorizar(); });
}

iniciar();
