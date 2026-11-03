/* Ajuste fino do boné em 3D (uso interno do ADM).

   Cada régua muda uma medida do modelo escolhido. O que muda fica como
   rascunho neste navegador (a página "Monte seu boné" aberta aqui já mostra);
   para valer para todo mundo, o ajuste entra em dados/ajustes-3d.json. */

import {
  PalcoDoBone,
  DESENHOS,
  CAMPOS_DE_AJUSTE,
  RASCUNHO_DE_AJUSTES,
  carregarAjustes,
  medidasDe,
} from "./bone3d.js";

const $ = (id) => document.getElementById(id);
const NOMES_DOS_GRUPOS = { copa: "Copa", aba: "Aba", arte: "Logo" };

let palco;
let publicados = {};
let rascunho = {};
let catalogo = [];
let modelo = "trucker";
let logo = null;

function juntos() {
  const tudo = JSON.parse(JSON.stringify(publicados));
  Object.entries(rascunho).forEach(([id, grupos]) => {
    tudo[id] = tudo[id] || {};
    Object.entries(grupos).forEach(([grupo, campos]) => {
      tudo[id][grupo] = { ...(tudo[id][grupo] || {}), ...campos };
    });
  });
  return tudo;
}

function guardarRascunho() {
  try {
    if (Object.keys(rascunho).length) localStorage.setItem(RASCUNHO_DE_AJUSTES, JSON.stringify(rascunho));
    else localStorage.removeItem(RASCUNHO_DE_AJUSTES);
  } catch {
    // navegador sem armazenamento: o ajuste vale só até fechar a página
  }
  mostrarSituacao();
}

function mostrarSituacao() {
  const mexidos = Object.keys(rascunho).map((id) => nomeDe(id));
  const situacao = $("situacao");
  situacao.classList.toggle("tem-rascunho", mexidos.length > 0);
  situacao.textContent = mexidos.length
    ? `Rascunho neste navegador, ainda não publicado: ${mexidos.join(", ")}.`
    : "Sem rascunho. O que está na tela é o que os clientes veem.";
}

function nomeDe(id) {
  return (catalogo.find((p) => p.id === id) || {}).nome || id;
}

/* A logo de teste: a do ADM, se ele escolher uma; senão, um selo "SUA LOGO". */
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

function colocarLogo() {
  const imagem = logo || logoDeTeste();
  palco.colocarArte({ imagem, proporcao: imagem.width / imagem.height, escala: 1, acabamento: "plano" });
}

function montar() {
  palco.ajustes = juntos();
  palco.montar(modelo, { todo: $("cor").value });
  palco.pintar("todo", $("cor").value);
  colocarLogo();
  const produto = catalogo.find((p) => p.id === modelo);
  const foto = $("foto-do-modelo");
  if (produto && produto.imagem) foto.src = produto.imagem;
  foto.closest("figure").hidden = !(produto && produto.imagem);
}

function desenharReguas() {
  const tipo = DESENHOS[modelo].tipo;
  const atuais = medidasDe(modelo, juntos());
  const deFabrica = medidasDe(modelo, {});
  const caixa = $("reguas");
  caixa.textContent = "";
  const grupos = {};
  CAMPOS_DE_AJUSTE[tipo].forEach(([grupo, campo, rotulo, minimo, maximo, passo]) => {
    if (!grupos[grupo]) {
      const bloco = document.createElement("div");
      bloco.className = "aj-grupo";
      const titulo = document.createElement("h2");
      titulo.className = "aj-grupo__titulo";
      titulo.textContent = NOMES_DOS_GRUPOS[grupo] || grupo;
      bloco.append(titulo);
      caixa.append(bloco);
      grupos[grupo] = bloco;
    }
    const id = `r-${grupo}-${campo}`;
    const linha = document.createElement("div");
    linha.className = "aj-regua";
    const nome = document.createElement("label");
    nome.htmlFor = id;
    nome.textContent = rotulo;
    const valor = document.createElement("output");
    valor.htmlFor = id;
    const regua = document.createElement("input");
    regua.type = "range";
    regua.id = id;
    regua.min = minimo;
    regua.max = maximo;
    regua.step = passo;
    regua.value = atuais[grupo][campo];
    const mostrar = () => {
      valor.textContent = Number(regua.value).toFixed(2);
      linha.classList.toggle("mexida", Math.abs(Number(regua.value) - deFabrica[grupo][campo]) > 1e-6);
    };
    mostrar();
    regua.addEventListener("input", () => {
      mostrar();
      rascunho[modelo] = rascunho[modelo] || {};
      rascunho[modelo][grupo] = { ...(rascunho[modelo][grupo] || {}), [campo]: Number(regua.value) };
      guardarRascunho();
      montarDepois();
    });
    linha.append(nome, valor, regua);
    grupos[grupo].append(linha);
  });
}

// remontar a cada movimento da régua pesa no celular: espera o quadro seguinte
let pedidoDeMontagem = 0;
function montarDepois() {
  cancelAnimationFrame(pedidoDeMontagem);
  pedidoDeMontagem = requestAnimationFrame(montar);
}

/* Só o que difere do padrão de fábrica vai para o arquivo. */
function ajustesParaPublicar() {
  const tudo = juntos();
  const saida = {
    _leia: "Ajuste fino do boné em 3D, modelo a modelo. Gerado pela tela ajustes-3d.html; não edite à mão sem conferir lá.",
  };
  Object.keys(tudo).forEach((id) => {
    if (!DESENHOS[id]) return;
    const deFabrica = medidasDe(id, {});
    const doModelo = {};
    Object.entries(tudo[id]).forEach(([grupo, campos]) => {
      Object.entries(campos).forEach(([campo, valor]) => {
        if (!deFabrica[grupo] || Math.abs(valor - deFabrica[grupo][campo]) < 1e-6) return;
        doModelo[grupo] = doModelo[grupo] || {};
        doModelo[grupo][campo] = Number(Number(valor).toFixed(3));
      });
    });
    if (Object.keys(doModelo).length) saida[id] = doModelo;
  });
  return JSON.stringify(saida, null, 2) + "\n";
}

function ligar() {
  $("modelo").addEventListener("change", (e) => {
    modelo = e.target.value;
    desenharReguas();
    montar();
  });
  $("cor").addEventListener("input", (e) => palco.pintar("todo", e.target.value));
  $("logo").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(bitmap.width * escala);
    tela.height = Math.round(bitmap.height * escala);
    tela.getContext("2d").drawImage(bitmap, 0, 0, tela.width, tela.height);
    logo = tela;
    colocarLogo();
  });
  document.querySelectorAll("[data-vista]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const [azimute, elevacao] = botao.dataset.vista.split(",").map(Number);
      palco.vista(azimute, elevacao);
    });
  });
  $("padrao").addEventListener("click", () => {
    delete rascunho[modelo];
    // o publicado também volta ao padrão, no rascunho: grava os valores de fábrica por cima
    if (publicados[modelo]) {
      const deFabrica = medidasDe(modelo, {});
      rascunho[modelo] = {};
      Object.keys(publicados[modelo]).forEach((grupo) => {
        rascunho[modelo][grupo] = { ...deFabrica[grupo] };
      });
    }
    guardarRascunho();
    desenharReguas();
    montar();
  });
  $("descartar").addEventListener("click", () => {
    rascunho = {};
    guardarRascunho();
    desenharReguas();
    montar();
  });
  $("copiar").addEventListener("click", async () => {
    const texto = "Ajustes do 3D para publicar no site (dados/ajustes-3d.json):\n" + ajustesParaPublicar();
    try {
      await navigator.clipboard.writeText(texto);
      $("situacao").textContent = "Copiado. Cole na conversa com o Claude para publicar.";
    } catch {
      $("situacao").textContent = "Não deu para copiar aqui; use o botão Baixar.";
    }
  });
  $("baixar").addEventListener("click", () => {
    const arquivo = new Blob([ajustesParaPublicar()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(arquivo);
    link.download = "ajustes-3d.json";
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
  ({ publicados, rascunho } = await carregarAjustes());
  const escolha = $("modelo");
  Object.keys(DESENHOS).forEach((id) => {
    const opcao = document.createElement("option");
    opcao.value = id;
    opcao.textContent = nomeDe(id);
    escolha.append(opcao);
  });
  const pedido = new URLSearchParams(location.search).get("modelo");
  if (pedido && DESENHOS[pedido]) modelo = pedido;
  escolha.value = modelo;

  palco = new PalcoDoBone($("tela-3d"));
  palco.controles.autoRotate = false;
  window.palcoDeAjuste = palco; // para conferir pelo console
  ligar();
  desenharReguas();
  mostrarSituacao();
  montar();
  palco.vista(35, 14);
}

iniciar();
