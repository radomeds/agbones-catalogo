/* Ajuste fino da prévia pela foto (uso interno do ADM), aba Foto de ajustes-3d.html.

   Em cima da foto de cada modelo, o ADM arrasta o contorno de cada parte (aba,
   laterais, botão…), o vão debaixo da aba, as áreas que não se pintam e o lugar
   da logo. O que muda fica como rascunho neste navegador (a página "Monte seu
   boné" aberta aqui já mostra); para valer para todo mundo, o arquivo gerado
   aqui entra em dados/montagem-fotos.json.

   A aba 3D (ajustes-3d.js, com o three.js) só é baixada quando o ADM abre. */

import { DESENHOS, partesDoDesenho } from "./desenhos.js";
import { FotoDoBone, juntarFotos, parteDoResto, pontoDaArte, RASCUNHO_DAS_FOTOS, LADO } from "./foto-bone.js";

const $ = (id) => document.getElementById(id);
const GRAU = Math.PI / 180;

/* As cores das marcas por cima da foto, e as cores de teste de "cada parte de uma cor". */
const CORES_DAS_MARCAS = ["#2F5FD0", "#E0663A", "#1F9E6E", "#B03BB5", "#C9A21A", "#2BA3C4", "#D2384F"];
const COR_DO_CHAO = "#69738A";
const COR_DO_FIXO = "#12161D";
const CORES_DE_TESTE = ["#C23A3A", "#2F5FD0", "#E2B13C", "#1F8A5B", "#7B3FB5", "#E07A2E", "#3A3F4A"];

/* Réguas da logo: campo, rótulo, mínimo, máximo, passo (em pixels da foto de 640 e em graus). */
const REGUAS_DA_ARTE = [
  ["x", "Para o lado", 0, LADO, 1],
  ["y", "Para cima ou para baixo", 0, LADO, 1],
  ["largura", "Largura", 10, 480, 1],
  ["altura", "Altura", 10, 480, 1],
  ["giro", "Girar (graus)", -45, 45, 0.5],
  ["inclina", "Entortar (graus)", -40, 40, 0.5],
  ["fuga", "Um lado menor que o outro (o lado que foge)", -1, 1, 0.01],
  ["curva", "Curvar (o meio desce ou sobe)", -60, 60, 0.5],
  ["dobra", "Um lado mais estreito (o tecido faz a volta)", -1, 1, 0.01],
];
const ARTE_VAZIA = { x: LADO / 2, y: LADO / 2, largura: 120, altura: 120, giro: 0, inclina: 0, fuga: 0, curva: 0, dobra: 0 };

let foto;
let publicados = {};
let rascunho = {};
let leia = "";
let catalogo = [];
let modelo = "trucker";
let alvo = "arte";
let ponto = -1;
let logo = null;
let arrasto = null;
let carregou3d = false;

const copia = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));
const nomeDe = (id) => (catalogo.find((p) => p.id === id) || {}).nome || id;
const juntos = () => juntarFotos(publicados, rascunho);
const conf = () => juntos()[modelo] || {};

/* ---------- o rascunho ---------- */

function guardarRascunho() {
  try {
    if (Object.keys(rascunho).length) localStorage.setItem(RASCUNHO_DAS_FOTOS, JSON.stringify(rascunho));
    else localStorage.removeItem(RASCUNHO_DAS_FOTOS);
  } catch {
    // navegador sem armazenamento: o ajuste vale só até fechar a página
  }
  mostrarSituacao();
}

function mostrarSituacao() {
  const mexidos = Object.keys(rascunho).map(nomeDe);
  const situacao = $("f-situacao");
  situacao.classList.toggle("tem-rascunho", mexidos.length > 0);
  situacao.textContent = mexidos.length
    ? `Rascunho neste navegador, ainda não publicado: ${mexidos.join(", ")}.`
    : "Sem rascunho. O que está na tela é o que os clientes veem.";
}

/** Muda o ajuste do modelo: o rascunho guarda o modelo inteiro, já mudado. */
function mexer(muda, leve = false) {
  const atual = copia(conf());
  atual.partes = atual.partes || {};
  atual.arte = { ...ARTE_VAZIA, ...(atual.arte || {}) };
  muda(atual);
  rascunho[modelo] = atual;
  guardarRascunho();
  agendar(leve);
}

/* ---------- o que se mexe: a logo, as partes, o chão e o que não se pinta ---------- */

function alvos() {
  const c = conf();
  const resto = parteDoResto(modelo);
  const lista = [{ chave: "arte", nome: "Logo", cor: CORES_DAS_MARCAS[0] }];
  const partes = partesDoDesenho(modelo).filter((p) => p.id !== resto);
  Object.keys(c.partes || {}).forEach((id) => {
    if (id !== resto && !partes.some((p) => p.id === id)) partes.push({ id, nome: id });
  });
  partes.forEach((p, k) => {
    lista.push({ chave: `parte:${p.id}`, nome: p.nome, cor: CORES_DAS_MARCAS[(k + 1) % CORES_DAS_MARCAS.length] });
  });
  (c.chao || []).forEach((_, k) => lista.push({ chave: `chao:${k}`, nome: `Vão debaixo da aba ${k + 1}`, cor: COR_DO_CHAO }));
  (c.fixo || []).forEach((_, k) => lista.push({ chave: `fixo:${k}`, nome: `Área que não se pinta ${k + 1}`, cor: COR_DO_FIXO }));
  lista.forEach((a) => { a.pontos = poligonoDe(a.chave, c); });
  return lista;
}

function poligonoDe(chave, c = conf()) {
  const [tipo, nome] = chave.split(":");
  let pontos = null;
  if (tipo === "parte") pontos = (c.partes || {})[nome];
  if (tipo === "chao" || tipo === "fixo") pontos = (c[tipo] || [])[Number(nome)];
  return Array.isArray(pontos) && pontos.length >= 3 ? pontos : null;
}

function trocarPoligono(c, chave, pontos) {
  const [tipo, nome] = chave.split(":");
  if (tipo === "parte") c.partes[nome] = pontos;
  else c[tipo][Number(nome)] = pontos;
}

function escolher(chave) {
  alvo = chave;
  ponto = -1;
  desenharAlvos();
  desenharMarcas();
  const [tipo, nome] = chave.split(":");
  if (tipo === "parte" && foto.pronto) foto.olharPara(nome);
}

function desenharAlvos() {
  const lista = alvos();
  if (!lista.some((a) => a.chave === alvo)) alvo = "arte";
  $("f-alvos").replaceChildren(...lista.map((a) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.setAttribute("aria-pressed", String(a.chave === alvo));
    if (a.chave !== "arte" && !a.pontos) botao.classList.add("vazio");
    const bolinha = document.createElement("span");
    bolinha.className = "ajf-cor";
    bolinha.style.background = a.cor;
    botao.append(bolinha, a.nome + (a.chave !== "arte" && !a.pontos ? " (não marcada)" : ""));
    botao.addEventListener("click", () => escolher(a.chave));
    return botao;
  }));
  desenharAcoes();
  $("f-grupo-arte").hidden = alvo !== "arte";
  const ehParte = alvo.startsWith("parte:");
  $("f-grupo-escuro").hidden = !ehParte || !poligonoDe(alvo);
  if (ehParte) desenharReguaDoEscuro();
  $("f-dica").textContent = alvo === "arte"
    ? "Arraste o meio da logo para mudar o lugar. As bolinhas da direita e de baixo mudam a largura e a altura."
    : poligonoDe(alvo)
      ? "Arraste as bolinhas cheias até o contorno. A vazada, no meio de um lado, cria um ponto novo. Arrastando por dentro, move tudo."
      : "Esta parte ainda não está marcada nesta foto. Toque em Marcar esta parte, se ela aparece.";
}

function botaoDeAcao(texto, acao, desligado = false) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = texto;
  botao.disabled = desligado;
  botao.addEventListener("click", acao);
  return botao;
}

/** Um quadrado para começar, no meio da foto. */
function quadradoNovo(lado = 120, x = LADO / 2, y = LADO / 2) {
  const m = lado / 2;
  return [[x - m, y - m], [x + m, y - m], [x + m, y + m], [x - m, y + m]].map(([a, b]) => [Math.round(a), Math.round(b)]);
}

function desenharAcoes() {
  const acoes = [];
  const pontos = poligonoDe(alvo);
  const [tipo, nome] = alvo.split(":");
  if (tipo === "parte" && !pontos) {
    acoes.push(botaoDeAcao("Marcar esta parte", () => {
      mexer((c) => { c.partes[nome] = quadradoNovo(); });
      desenharAlvos();
      desenharMarcas();
    }));
  }
  if (pontos) {
    acoes.push(botaoDeAcao("Tirar o ponto", tirarPonto, ponto < 0 || pontos.length <= 3));
    acoes.push(botaoDeAcao(tipo === "parte" ? "Desmarcar esta parte" : "Apagar esta área", () => {
      mexer((c) => {
        if (tipo === "parte") c.partes[nome] = [];
        else c[tipo].splice(Number(nome), 1);
      });
      alvo = tipo === "parte" ? alvo : "arte";
      ponto = -1;
      desenharAlvos();
      desenharMarcas();
    }));
  }
  ["chao", "fixo"].forEach((lista) => {
    acoes.push(botaoDeAcao(lista === "chao" ? "+ Vão debaixo da aba" : "+ Área que não se pinta", () => {
      let indice = 0;
      mexer((c) => {
        c[lista] = Array.isArray(c[lista]) ? c[lista] : [];
        indice = c[lista].push(quadradoNovo(100)) - 1;
      });
      alvo = `${lista}:${indice}`;
      ponto = -1;
      desenharAlvos();
      desenharMarcas();
    }));
  });
  $("f-acoes").replaceChildren(...acoes);
}

function tirarPonto() {
  const pontos = poligonoDe(alvo);
  if (!pontos || ponto < 0 || pontos.length <= 3) return;
  mexer((c) => {
    const novos = copia(pontos);
    novos.splice(ponto, 1);
    trocarPoligono(c, alvo, novos);
  });
  ponto = -1;
  desenharAcoes();
  desenharMarcas();
}

/* ---------- as réguas ---------- */

const reguas = {};

function regua(caixa, chave, rotulo, minimo, maximo, passo, valor, publicado, casas, mudar) {
  const id = `f-r-${chave}`;
  const linha = document.createElement("div");
  linha.className = "aj-regua";
  const nome = document.createElement("label");
  nome.htmlFor = id;
  nome.textContent = rotulo;
  const saida = document.createElement("output");
  saida.htmlFor = id;
  const entrada = document.createElement("input");
  entrada.type = "range";
  entrada.id = id;
  entrada.min = minimo;
  entrada.max = maximo;
  entrada.step = passo;
  const mostrar = (v) => {
    entrada.value = v;
    saida.textContent = Number(v).toFixed(casas);
    linha.classList.toggle("mexida", Math.abs(Number(v) - publicado) > 1e-6);
  };
  mostrar(valor);
  entrada.addEventListener("input", () => {
    mostrar(entrada.value);
    mudar(Number(entrada.value));
  });
  linha.append(nome, saida, entrada);
  caixa.append(linha);
  reguas[chave] = mostrar;
}

function desenharReguas() {
  const c = conf();
  const doPublicado = publicados[modelo] || {};
  const arte = { ...ARTE_VAZIA, ...(c.arte || {}) };
  const arteDoPublicado = { ...ARTE_VAZIA, ...(doPublicado.arte || {}) };
  const caixa = $("f-reguas-arte");
  caixa.textContent = "";
  REGUAS_DA_ARTE.forEach(([campo, rotulo, minimo, maximo, passo]) => {
    regua(caixa, `arte-${campo}`, rotulo, minimo, maximo, passo, arte[campo], arteDoPublicado[campo], passo < 1 ? 2 : 0, (v) => {
      mexer((novo) => { novo.arte[campo] = v; }, true);
    });
  });
  const luz = $("f-reguas-luz");
  luz.textContent = "";
  regua(luz, "contraste", "Contraste da luz e da sombra", 0.3, 2, 0.05, Number(c.contraste) || 1, Number(doPublicado.contraste) || 1, 2, (v) => {
    mexer((novo) => { novo.contraste = v; });
  });
}

function desenharReguaDoEscuro() {
  const nome = alvo.split(":")[1];
  const caixa = $("f-reguas-escuro");
  caixa.textContent = "";
  const valor = (conf().escuros || {})[nome] || 0;
  const publicado = ((publicados[modelo] || {}).escuros || {})[nome] || 0;
  regua(caixa, "escuro", "Pinta só o que for mais escuro que isto (0 = tudo)", 0, 0.4, 0.005, valor, publicado, 3, (v) => {
    mexer((novo) => {
      novo.escuros = novo.escuros || {};
      if (v > 0) novo.escuros[nome] = v;
      else delete novo.escuros[nome];
    });
  });
}

function atualizarReguasDaArte() {
  const arte = { ...ARTE_VAZIA, ...(conf().arte || {}) };
  REGUAS_DA_ARTE.forEach(([campo]) => reguas[`arte-${campo}`] && reguas[`arte-${campo}`](arte[campo]));
}

/* ---------- a foto ---------- */

function logoDeTeste() {
  const tela = document.createElement("canvas");
  tela.width = 640;
  tela.height = 400;
  const c = tela.getContext("2d");
  c.fillStyle = "#ffffff";
  c.font = "800 150px Montserrat, Arial, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("SUA", 320, 120);
  c.fillText("LOGO", 320, 280);
  c.strokeStyle = "#ffffff";
  c.lineWidth = 10;
  c.strokeRect(12, 12, 616, 376);
  return tela;
}

function pintarCores() {
  const cadaUma = $("f-cada-cor").checked;
  (foto.nomes || []).forEach((nome, k) => {
    foto.cores[nome] = cadaUma ? CORES_DE_TESTE[k % CORES_DE_TESTE.length] : $("f-cor").value;
  });
}

let pedido = 0;
let pesado = false;
/** Redesenha a foto no quadro seguinte. `leve` = só a logo mudou. */
function agendar(leve) {
  if (!leve) pesado = true;
  desenharMarcas();
  cancelAnimationFrame(pedido);
  pedido = requestAnimationFrame(() => {
    if (!foto.pronto) return;
    foto.ajustes = juntos();
    if (pesado) {
      foto.preparar(modelo, foto.atuais);
      pintarCores();
      foto.desenharBone();
    }
    pesado = false;
    foto.desenharArte();
    foto.compor();
  });
}

async function trocarModelo() {
  alvo = "arte";
  ponto = -1;
  foto.ajustes = juntos();
  desenharAlvos();
  desenharReguas();
  desenharMarcas();
  try {
    await foto.montar(modelo, {});
  } catch {
    $("f-dica").textContent = "A foto preparada deste modelo não abriu (assets/produtos/montagem).";
    return;
  }
  pintarCores();
  foto.desenharBone();
  const imagem = logo || logoDeTeste();
  foto.colocarArte({ imagem, proporcao: imagem.width / imagem.height, escala: 1, relevo: false });
  desenharAlvos();
  desenharMarcas();
}

/* ---------- as marcas por cima da foto ---------- */

const marcas = () => $("f-marcas");
/** Quantos pixels da tela vale um pixel da foto. */
const escala = () => marcas().getBoundingClientRect().width / LADO || 1;
const raio = () => 8 / escala();

function contornoDaArte(arte) {
  const borda = [];
  const n = 16;
  for (let k = 0; k < n; k++) borda.push(pontoDaArte(arte, -0.5 + k / n, -0.5));
  for (let k = 0; k < n; k++) borda.push(pontoDaArte(arte, 0.5, -0.5 + k / n));
  for (let k = 0; k < n; k++) borda.push(pontoDaArte(arte, 0.5 - k / n, 0.5));
  for (let k = 0; k < n; k++) borda.push(pontoDaArte(arte, -0.5, 0.5 - k / n));
  return borda;
}

function alcasDaArte(arte) {
  return {
    mover: pontoDaArte(arte, 0, 0),
    largura: pontoDaArte(arte, 0.5, 0),
    altura: pontoDaArte(arte, 0, 0.5),
  };
}

function caminho(c, pontos) {
  c.beginPath();
  pontos.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

function bolinha(c, [x, y], r, cheia, cor) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = cheia ? cor : "rgba(255,255,255,.85)";
  c.fill();
  c.lineWidth = r * 0.3;
  c.strokeStyle = cheia ? "#fff" : cor;
  c.stroke();
}

function desenharMarcas() {
  const tela = marcas();
  const c = tela.getContext("2d");
  const k = tela.width / LADO;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, tela.width, tela.height);
  c.setTransform(k, 0, 0, k, 0, 0);
  const e = escala();
  const r = raio();
  const lista = alvos();
  const arte = { ...ARTE_VAZIA, ...(conf().arte || {}) };

  // os outros, de leve
  lista.forEach((a) => {
    if (a.chave === alvo) return;
    const pontos = a.chave === "arte" ? contornoDaArte(arte) : a.pontos;
    if (!pontos) return;
    caminho(c, pontos);
    c.setLineDash([6 / e, 4 / e]);
    c.lineWidth = 1.5 / e;
    c.strokeStyle = a.cor;
    c.stroke();
    c.setLineDash([]);
  });

  const escolhido = lista.find((a) => a.chave === alvo);
  if (!escolhido) return;
  if (alvo === "arte") {
    caminho(c, contornoDaArte(arte));
    c.fillStyle = "rgba(47,95,208,.10)";
    c.fill();
    c.lineWidth = 2.5 / e;
    c.strokeStyle = escolhido.cor;
    c.stroke();
    const alcas = alcasDaArte(arte);
    bolinha(c, alcas.largura, r, true, escolhido.cor);
    bolinha(c, alcas.altura, r, true, escolhido.cor);
    bolinha(c, alcas.mover, r * 1.25, true, escolhido.cor);
    // a cruz do meio: aqui se arrasta a logo
    const [x, y] = alcas.mover;
    c.beginPath();
    c.moveTo(x - r * 0.6, y);
    c.lineTo(x + r * 0.6, y);
    c.moveTo(x, y - r * 0.6);
    c.lineTo(x, y + r * 0.6);
    c.lineWidth = 2 / e;
    c.strokeStyle = "#fff";
    c.stroke();
    return;
  }
  const pontos = escolhido.pontos;
  if (!pontos) return;
  caminho(c, pontos);
  c.globalAlpha = 0.16;
  c.fillStyle = escolhido.cor;
  c.fill();
  c.globalAlpha = 1;
  c.lineWidth = 2.5 / e;
  c.strokeStyle = escolhido.cor;
  c.stroke();
  pontos.forEach((p, i) => {
    const q = pontos[(i + 1) % pontos.length];
    bolinha(c, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], r * 0.6, false, escolhido.cor);
  });
  pontos.forEach((p, i) => bolinha(c, p, i === ponto ? r * 1.3 : r, true, i === ponto ? "#12161D" : escolhido.cor));
}

/* ---------- arrastar ---------- */

function pontoDoToque(evento) {
  const caixa = marcas().getBoundingClientRect();
  return [((evento.clientX - caixa.left) / caixa.width) * LADO, ((evento.clientY - caixa.top) / caixa.height) * LADO];
}

const perto = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
const limitar = (v) => Math.max(0, Math.min(LADO, Math.round(v)));

function dentro(pontos, [x, y]) {
  let sim = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i];
    const [xj, yj] = pontos[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) sim = !sim;
  }
  return sim;
}

function comecar(evento) {
  const p = pontoDoToque(evento);
  const r = raio() * 1.5;
  const arte = { ...ARTE_VAZIA, ...(conf().arte || {}) };
  arrasto = null;
  if (alvo === "arte") {
    const alcas = alcasDaArte(arte);
    if (perto(p, alcas.largura, r)) arrasto = { modo: "largura" };
    else if (perto(p, alcas.altura, r)) arrasto = { modo: "altura" };
    else if (perto(p, alcas.mover, r) || dentro(contornoDaArte(arte), p)) arrasto = { modo: "arte", de: p, arte };
  } else {
    const pontos = poligonoDe(alvo);
    if (pontos) {
      const i = pontos.findIndex((q) => perto(p, q, r));
      if (i >= 0) {
        ponto = i;
        arrasto = { modo: "ponto" };
      } else {
        const meio = pontos.findIndex((q, k) => {
          const s = pontos[(k + 1) % pontos.length];
          return perto(p, [(q[0] + s[0]) / 2, (q[1] + s[1]) / 2], r);
        });
        if (meio >= 0) {
          mexer((c) => {
            const novos = copia(pontos);
            novos.splice(meio + 1, 0, [limitar(p[0]), limitar(p[1])]);
            trocarPoligono(c, alvo, novos);
          });
          ponto = meio + 1;
          arrasto = { modo: "ponto" };
        } else if (dentro(pontos, p)) {
          arrasto = { modo: "tudo", de: p, pontos: copia(pontos) };
        }
      }
    }
  }
  if (!arrasto) {
    // fora do escolhido: escolhe o que estiver debaixo do dedo
    const lista = alvos();
    const debaixo = lista.find((a) => a.chave === "arte" ? dentro(contornoDaArte(arte), p) : a.pontos && dentro(a.pontos, p));
    if (debaixo && debaixo.chave !== alvo) escolher(debaixo.chave);
    return;
  }
  marcas().setPointerCapture(evento.pointerId);
  marcas().focus({ preventScroll: true }); // as setas do teclado passam a mexer o ponto
  desenharAcoes();
  desenharMarcas();
  evento.preventDefault();
}

function arrastar(evento) {
  if (!arrasto) return;
  const p = pontoDoToque(evento);
  if (arrasto.modo === "arte") {
    const { de, arte } = arrasto;
    mexer((c) => {
      c.arte.x = limitar(arte.x + p[0] - de[0]);
      c.arte.y = limitar(arte.y + p[1] - de[1]);
    }, true);
    atualizarReguasDaArte();
  } else if (arrasto.modo === "largura" || arrasto.modo === "altura") {
    mexer((c) => {
      const giro = (c.arte.giro || 0) * GRAU;
      const dx = p[0] - c.arte.x;
      const dy = p[1] - c.arte.y;
      if (arrasto.modo === "largura") c.arte.largura = Math.max(10, Math.round(2 * Math.abs(dx * Math.cos(giro) + dy * Math.sin(giro))));
      else c.arte.altura = Math.max(10, Math.round(2 * Math.abs(-dx * Math.sin(giro) + dy * Math.cos(giro))));
    }, true);
    atualizarReguasDaArte();
  } else if (arrasto.modo === "ponto") {
    mexer((c) => {
      const novos = copia(poligonoDe(alvo, c));
      novos[ponto] = [limitar(p[0]), limitar(p[1])];
      trocarPoligono(c, alvo, novos);
    });
  } else if (arrasto.modo === "tudo") {
    const dx = p[0] - arrasto.de[0];
    const dy = p[1] - arrasto.de[1];
    mexer((c) => trocarPoligono(c, alvo, arrasto.pontos.map(([x, y]) => [limitar(x + dx), limitar(y + dy)])));
  }
}

function soltar() {
  arrasto = null;
}

function teclado(evento) {
  const passo = evento.shiftKey ? 10 : 1;
  const setas = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
  if ((evento.key === "Delete" || evento.key === "Backspace") && ponto >= 0) {
    tirarPonto();
    evento.preventDefault();
    return;
  }
  const seta = setas[evento.key];
  if (!seta) return;
  evento.preventDefault();
  if (alvo === "arte") {
    mexer((c) => {
      c.arte.x = limitar(c.arte.x + seta[0]);
      c.arte.y = limitar(c.arte.y + seta[1]);
    }, true);
    atualizarReguasDaArte();
  } else if (ponto >= 0 && poligonoDe(alvo)) {
    mexer((c) => {
      const novos = copia(poligonoDe(alvo, c));
      novos[ponto] = [limitar(novos[ponto][0] + seta[0]), limitar(novos[ponto][1] + seta[1])];
      trocarPoligono(c, alvo, novos);
    });
  }
}

/* ---------- publicar: o arquivo dados/montagem-fotos.json inteiro ---------- */

const redondo = (v, casas = 2) => Math.round(Number(v) * 10 ** casas) / 10 ** casas;
const poligonoLimpo = (pontos) => (Array.isArray(pontos) && pontos.length >= 3 ? pontos.map(([x, y]) => [Math.round(x), Math.round(y)]) : null);

function limparModelo(c) {
  const saida = {};
  // o mockup do ChatGPT: a foto e o mapa de partes vêm da ferramenta
  // integrar-mockup.py; o ADM não mexe, só guarda
  if (c.original) saida.original = c.original;
  if (c.mapa && c.mapa.imagem) saida.mapa = copia(c.mapa);
  if (c.mockup) saida.mockup = c.mockup;
  const partes = {};
  Object.entries(c.partes || {}).forEach(([nome, pontos]) => {
    const limpo = poligonoLimpo(pontos);
    if (limpo) partes[nome] = limpo;
  });
  if (Object.keys(partes).length) saida.partes = partes;
  const escuros = {};
  Object.entries(c.escuros || {}).forEach(([nome, v]) => {
    if (partes[nome] && Number(v) > 0) escuros[nome] = redondo(v, 3);
  });
  if (Object.keys(escuros).length) saida.escuros = escuros;
  const fixo = (c.fixo || []).map(poligonoLimpo).filter(Boolean);
  if (fixo.length) saida.fixo = fixo;
  if (c.arte) {
    saida.arte = {};
    Object.keys(ARTE_VAZIA).forEach((campo) => { saida.arte[campo] = redondo(c.arte[campo] ?? ARTE_VAZIA[campo]); });
  }
  saida.contraste = redondo(Number(c.contraste) || 1);
  const chao = (c.chao || []).map(poligonoLimpo).filter(Boolean);
  if (chao.length) saida.chao = chao;
  return saida;
}

/** O arquivo no mesmo jeito do publicado: cada ponto [x, y] numa linha. */
export function arquivoParaPublicar() {
  const tudo = juntos();
  const ordem = [...Object.keys(publicados), ...Object.keys(tudo).filter((id) => !(id in publicados))];
  const modelos = {};
  ordem.forEach((id) => {
    if (DESENHOS[id] && tudo[id]) modelos[id] = limparModelo(tudo[id]);
  });
  const texto = JSON.stringify({ _leia: leia, modelos }, null, 2);
  return texto.replace(/\[\n\s*(-?[\d.]+),\n\s*(-?[\d.]+)\n\s*\]/g, "[$1, $2]") + "\n";
}

/* ---------- abas ---------- */

function abrirAba(qual) {
  const ehFoto = qual !== "3d";
  $("aba-foto").hidden = !ehFoto;
  $("aba-3d").hidden = ehFoto;
  $("aba-botao-foto").setAttribute("aria-selected", String(ehFoto));
  $("aba-botao-3d").setAttribute("aria-selected", String(!ehFoto));
  const endereco = new URL(location.href);
  endereco.searchParams.set("modelo", modelo);
  if (ehFoto) endereco.searchParams.delete("aba");
  else endereco.searchParams.set("aba", "3d");
  history.replaceState(null, "", endereco);
  if (ehFoto) {
    desenharMarcas();
  } else if (carregou3d) {
    // o 3D já aberto acompanha o modelo escolhido aqui
    const escolha3d = $("modelo");
    if (escolha3d && escolha3d.value !== modelo) {
      escolha3d.value = modelo;
      escolha3d.dispatchEvent(new Event("change"));
    }
  } else {
    carregou3d = true;
    // o three.js só vem agora; o 3D lê o modelo do endereço
    import("./ajustes-3d.js").catch(() => {
      $("situacao").textContent = "O 3D não abriu neste navegador.";
    });
  }
}

/* ---------- começo ---------- */

function ligar() {
  $("aba-botao-foto").addEventListener("click", () => abrirAba("foto"));
  $("aba-botao-3d").addEventListener("click", () => abrirAba("3d"));
  $("f-modelo").addEventListener("change", (e) => {
    modelo = e.target.value;
    const endereco = new URL(location.href);
    endereco.searchParams.set("modelo", modelo);
    history.replaceState(null, "", endereco);
    trocarModelo();
  });
  $("f-cor").addEventListener("input", () => {
    $("f-cada-cor").checked = false;
    pintarCores();
    if (foto.pronto) {
      foto.desenharBone();
      foto.compor();
    }
  });
  $("f-cada-cor").addEventListener("change", () => {
    pintarCores();
    if (foto.pronto) {
      foto.desenharBone();
      foto.compor();
    }
  });
  $("f-logo").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const bitmap = await createImageBitmap(arquivo);
    const reduz = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(bitmap.width * reduz);
    tela.height = Math.round(bitmap.height * reduz);
    tela.getContext("2d").drawImage(bitmap, 0, 0, tela.width, tela.height);
    logo = tela;
    foto.colocarArte({ imagem: logo, proporcao: logo.width / logo.height, escala: 1, relevo: false });
  });

  const tela = marcas();
  tela.addEventListener("pointerdown", comecar);
  tela.addEventListener("pointermove", arrastar);
  tela.addEventListener("pointerup", soltar);
  tela.addEventListener("pointercancel", soltar);
  tela.addEventListener("keydown", teclado);
  window.addEventListener("resize", desenharMarcas);

  $("f-padrao").addEventListener("click", () => {
    delete rascunho[modelo];
    guardarRascunho();
    trocarModelo();
  });
  $("f-descartar").addEventListener("click", () => {
    rascunho = {};
    guardarRascunho();
    trocarModelo();
  });
  $("f-copiar").addEventListener("click", async () => {
    const texto = "Ajustes da foto para publicar no site (dados/montagem-fotos.json):\n" + arquivoParaPublicar();
    try {
      await navigator.clipboard.writeText(texto);
      $("f-situacao").textContent = "Copiado. Cole na conversa com o Claude para publicar.";
    } catch {
      $("f-situacao").textContent = "Não deu para copiar aqui; use o botão Baixar.";
    }
  });
  $("f-baixar").addEventListener("click", () => {
    const arquivo = new Blob([arquivoParaPublicar()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(arquivo);
    link.download = "montagem-fotos.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });
}

async function iniciar() {
  try {
    const resposta = await fetch("dados/produtos.json", { cache: "no-cache" });
    catalogo = (await resposta.json()).produtos || [];
  } catch {
    catalogo = [];
  }
  try {
    const resposta = await fetch("dados/montagem-fotos.json", { cache: "no-cache" });
    const arquivo = await resposta.json();
    publicados = arquivo.modelos || {};
    leia = arquivo._leia || "";
  } catch {
    publicados = {};
  }
  try {
    rascunho = JSON.parse(localStorage.getItem(RASCUNHO_DAS_FOTOS) || "{}") || {};
  } catch {
    rascunho = {};
  }

  const escolha = $("f-modelo");
  Object.keys(DESENHOS).forEach((id) => {
    const opcao = document.createElement("option");
    opcao.value = id;
    opcao.textContent = nomeDe(id);
    escolha.append(opcao);
  });
  const parametros = new URLSearchParams(location.search);
  const pedido = parametros.get("modelo");
  if (pedido && DESENHOS[pedido]) modelo = pedido;
  escolha.value = modelo;

  const tela = marcas();
  tela.width = LADO * 2;
  tela.height = LADO * 2;
  foto = new FotoDoBone($("f-tela"));
  window.fotoDeAjuste = foto; // para conferir pelo console
  ligar();
  mostrarSituacao();
  if (parametros.get("aba") === "3d") abrirAba("3d");
  await trocarModelo();
}

iniciar();
