/* Editor de boné: o produto fica no centro da tela e as ferramentas abrem
   em painel, sem tirar o cliente de onde ele está e sem rolagem longa.

   A ideia central: cada parte do boné (frente, laterais, traseira, aba)
   recebe a sua arte, e o cliente precisa ver onde está mexendo. As técnicas
   oferecidas dependem da linha do modelo — promocional é DTF, premium tem
   silk alto-relevo e bordado com borracha. */

import {
  carregarCatalogo,
  montarCartaoModelo,
  preencherDadosEmpresa,
  produtoPorId,
  linhaPorId,
  minimoDoProduto,
  precoUnitario,
  formatarMoeda,
  formatarData,
  calcularPrazo,
  gerarReferencia,
  construcaoDoProduto,
  tecnicasDaArea,
  tecnicaPorId,
  fechosDaConstrucao,
} from "./comum.js";

import { montarMensagemWhatsapp, abrirWhatsapp } from "./whatsapp.js";
import { conferirArte, enderecoParaMostrar, podeMostrarNaTela } from "./arte.js";
import { prepararMedicao, registrar, registrarPedidoEnviado } from "./medicao.js";

const CHAVE_ARMAZENAMENTO = "agbones.pedido";
const ULTIMO_PASSO = 3;

const PASSOS = [
  { numero: 1, nome: "Modelo" },
  { numero: 2, nome: "Montar" },
  { numero: 3, nome: "Enviar" },
];

/* Onde cada marcador fica sobre o desenho. Área sem lugar aqui — a fita do
   chapéu de juta, por exemplo — aparece só na lista, e isso é de propósito:
   marcador em lugar errado engana mais do que ajuda. */
/* Posições no desenho de perfil. A "lateral" é uma só no desenho: qual das
   duas ela representa depende do lado que está sendo mostrado. */
const LUGARES = {
  "frente": { x: 34, y: 48 },
  "lateral": { x: 54, y: 40 },
  "traseira": { x: 74, y: 52 },
  "aba": { x: 16, y: 82 },
  "lado-a": { x: 34, y: 48 },
  "lado-b": { x: 74, y: 52 },
};

/** Qual área ocupa cada posição do desenho, conforme o lado visível. */
function parteDaPosicao(posicao) {
  if (posicao !== "lateral") return posicao;
  return ladoDireito ? "lateral-direita" : "lateral-esquerda";
}

/** As áreas deste produto, vindas da ficha técnica. */
function areasDoProduto() {
  return (produtoEscolhido && produtoEscolhido.areas) || [];
}

function areaPorId(id) {
  return areasDoProduto().find((area) => area.id === id) || null;
}

/** A construção que o cliente escolheu, ou a padrão da ficha. */
function construcaoAtual() {
  return produtoEscolhido ? construcaoDoProduto(produtoEscolhido, montagem.construcao) : null;
}

/** No lado direito o desenho é espelhado, então o x também vira. */
function pontoNoPalco(posicao) {
  const lugar = LUGARES[posicao];
  if (!lugar) return null;
  return { x: ladoDireito ? 100 - lugar.x : lugar.x, y: lugar.y };
}

/* Onde a logo do cliente é desenhada em cada parte, e o tamanho dela em % do
   palco. A lateral direita não aparece de perfil: fica só na lista. */
const APLICACAO = {
  "frente": { x: 34, y: 50, largura: 17 },
  "lateral": { x: 55, y: 44, largura: 13 },
  "traseira": { x: 75, y: 55, largura: 11 },
  "aba": { x: 17, y: 82, largura: 12 },
  "lado-a": { x: 34, y: 50, largura: 17 },
  "lado-b": { x: 75, y: 55, largura: 13 },
};

const ICONES = {
  agulha: '<path d="M4 20 20 4M14 4h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  tinta: '<path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  relevo: '<path d="M4 18h16M7 18V9l5-5 5 5v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  aplique: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  arte: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v10M7 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cor: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor"/>',
  fecho: '<rect x="3" y="9" width="18" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v7" stroke="currentColor" stroke-width="2"/>',
  numero: '<path d="M5 8h4v11M13 8h6v5h-6v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  logo: '<path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

let catalogo = null;
let produtoEscolhido = null;
/* Mostra o outro lado do boné: a lateral direita não existe na vista de
   perfil, e sem isso o cliente não vê onde está aplicando. */
let ladoDireito = false;
/* Evita que o popstate refaça o histórico que ele mesmo desfez. */
let voltandoPeloHistorico = false;
/* Para devolver o foco a quem abriu o painel, quando ele fecha. */
let quemAbriuOPainel = null;
let itens = lerPedidoSalvo();
let passoAtual = 1;
let arteConferida = null;

/* O boné que está sendo montado agora. */
let montagem = criarMontagemVazia();

function criarMontagemVazia() {
  return {
    // o mapa pede técnicas simultâneas: "Aplique + Bordado + DTF"
    partes: {},          // { frente: { tecnicas: [ids], observacao } }
    construcao: null,    // com tela, todo em tecido...
    cores: [],
    variacoes: {},       // { fecho: "Fecho plástico" }
    quantidade: null,
    observacoes: "",
    arte: { origem: "", redesenho: false, arquivo: "", nivel: "" },
  };
}

/* A imagem da logo vive só nesta aba, para desenhar no boné. Não entra no
   pedido salvo: uma imagem em base64 estoura a cota do localStorage. */
let logoNaTela = null;

function trocarLogoNaTela(arquivo) {
  if (logoNaTela) URL.revokeObjectURL(logoNaTela.endereco);
  const endereco = enderecoParaMostrar(arquivo);
  logoNaTela = endereco ? { endereco, nome: arquivo.name } : null;
}

const elementos = {
  etapas: document.querySelectorAll(".etapa"),
  progressoPreenchido: document.getElementById("progresso-preenchido"),
  progressoPassos: document.getElementById("progresso-passos"),
  filtros: document.getElementById("filtros-linha"),
  grade: document.getElementById("grade-modelos"),
  editorModelo: document.getElementById("editor-modelo"),
  editorLinha: document.getElementById("editor-linha"),
  editorSobre: document.getElementById("editor-sobre"),
  botaoTrocar: document.getElementById("botao-trocar-modelo"),
  palco: document.querySelector(".palco"),
  botaoVirar: document.getElementById("botao-virar"),
  palcoFoto: document.getElementById("palco-foto"),
  marcadores: document.getElementById("palco-marcadores"),
  aplicacoes: document.getElementById("palco-aplicacoes"),
  palcoNota: document.getElementById("palco-nota"),
  palcoDica: document.getElementById("palco-dica"),
  listaPartes: document.getElementById("lista-partes"),
  ferramentas: document.getElementById("ferramentas"),
  painel: document.getElementById("painel"),
  painelFundo: document.getElementById("painel-fundo"),
  painelFechar: document.getElementById("painel-fechar"),
  painelTitulo: document.getElementById("painel-titulo"),
  painelCorpo: document.getElementById("painel-corpo"),
  painelAcoes: document.getElementById("painel-acoes"),
  lista: document.getElementById("lista-itens"),
  vazio: document.getElementById("resumo-vazio"),
  totalPecas: document.getElementById("total-pecas"),
  totalPrazo: document.getElementById("total-prazo"),
  totalValor: document.getElementById("total-valor"),
  lembreteAnexos: document.getElementById("lembrete-anexos"),
  cliente: document.getElementById("campo-cliente"),
  botaoWhatsapp: document.getElementById("botao-whatsapp"),
  botaoOutro: document.getElementById("botao-outro"),
  botaoCopiar: document.getElementById("botao-copiar"),
  botaoLimpar: document.getElementById("botao-limpar"),
  avisoCopia: document.getElementById("aviso-copia"),
  botaoVoltar: document.getElementById("botao-voltar"),
  botaoAvancar: document.getElementById("botao-avancar"),
  barraTitulo: document.getElementById("barra-titulo"),
  barraDetalhe: document.getElementById("barra-detalhe"),
};

/* ---------- Armazenamento local ---------- */

function lerPedidoSalvo() {
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    const salvo = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(salvo) ? salvo : [];
  } catch (erro) {
    return [];
  }
}

function salvarPedido() {
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(itens));
  } catch (erro) {
    /* navegador sem armazenamento: o pedido vale so nesta aba */
  }
}

/* ---------- Ajudas do catalogo ---------- */

function icone(nome, classe = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (classe) svg.setAttribute("class", classe);
  svg.innerHTML = ICONES[nome] || "";
  return svg;
}

function partesComArte() {
  return Object.entries(montagem.partes)
    .filter(([, valor]) => valor && valor.tecnicas && valor.tecnicas.length);
}

/* ---------- Painel ---------- */

let aoFecharPainel = null;

function painelEstaAberto() {
  return !elementos.painel.classList.contains("oculto");
}

function abrirPainel(titulo, montarCorpo, acoes = []) {
  quemAbriuOPainel = document.activeElement;
  // o botão voltar do celular precisa fechar o painel, não sair do site
  history.pushState({ painel: true, passo: passoAtual }, "");

  elementos.painelTitulo.textContent = titulo;
  elementos.painelCorpo.textContent = "";
  elementos.painelAcoes.textContent = "";
  montarCorpo(elementos.painelCorpo);

  acoes.forEach((acao) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = `botao botao--largo ${acao.classe || ""}`;
    botao.textContent = acao.texto;
    botao.addEventListener("click", acao.aoTocar);
    elementos.painelAcoes.append(botao);
  });

  elementos.painel.classList.remove("oculto");
  document.body.classList.add("com-painel");
  requestAnimationFrame(() => {
    elementos.painel.classList.add("painel--aberto");
    // quem navega por teclado ou leitor de tela precisa entrar no painel
    elementos.painelTitulo.focus();
  });
}

function fecharPainel({ mexerNoHistorico = true } = {}) {
  if (!painelEstaAberto()) return;

  elementos.painel.classList.remove("painel--aberto");
  document.body.classList.remove("com-painel");
  setTimeout(() => elementos.painel.classList.add("oculto"), 200);

  if (quemAbriuOPainel && quemAbriuOPainel.isConnected) quemAbriuOPainel.focus();
  quemAbriuOPainel = null;

  // fechar pelo X ou pelo fundo também desfaz o passo do histórico, senão o
  // botão voltar do celular precisaria de dois toques para sair da tela
  if (mexerNoHistorico && history.state && history.state.painel) {
    voltandoPeloHistorico = true;
    history.back();
  }

  if (aoFecharPainel) {
    const acao = aoFecharPainel;
    aoFecharPainel = null;
    acao();
  }
}

/* ---------- Passo 1: modelos ---------- */

function montarFiltros() {
  // linha sem nenhum modelo não vira filtro vazio na tela
  const comProdutos = catalogo.linhas.filter((linha) =>
    catalogo.produtos.some((produto) => produto.linha === linha.id));
  const opcoes = [{ id: "todas", nome: "Todos" }, ...comProdutos];

  elementos.filtros.textContent = "";
  opcoes.forEach((opcao, indice) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "filtro";
    botao.textContent = opcao.nome.replace("Linha ", "");
    botao.dataset.linha = opcao.id;
    botao.setAttribute("aria-pressed", indice === 0 ? "true" : "false");
    botao.addEventListener("click", () => aplicarFiltro(opcao.id));
    elementos.filtros.append(botao);
  });
}

function aplicarFiltro(linhaId) {
  elementos.filtros.querySelectorAll(".filtro").forEach((botao) => {
    botao.setAttribute("aria-pressed", String(botao.dataset.linha === linhaId));
  });
  elementos.grade.querySelectorAll(".modelo").forEach((cartao) => {
    cartao.classList.toggle("oculto", linhaId !== "todas" && cartao.dataset.linha !== linhaId);
  });
}

function montarGrade() {
  elementos.grade.textContent = "";
  catalogo.produtos.forEach((produto) => {
    const cartao = montarCartaoModelo(catalogo, produto, { como: "botao" });
    cartao.addEventListener("click", () => escolherModelo(produto.id, { seguir: true }));
    elementos.grade.append(cartao);
  });
}

function escolherModelo(id, { seguir = false } = {}) {
  const trocou = !produtoEscolhido || produtoEscolhido.id !== id;
  if (trocou && partesComArte().length) {
    // as técnicas de uma linha não valem na outra, então a montagem recomeça:
    // avisar antes, senão o cliente perde o que fez sem entender por quê
    const certeza = confirm(
      "Trocar de modelo apaga a arte que você já colocou neste boné, porque " +
      "cada linha tem as suas formas de aplicação. Quer trocar mesmo assim?",
    );
    if (!certeza) return;
  }

  produtoEscolhido = produtoPorId(catalogo, id);
  if (trocou) {
    montagem = criarMontagemVazia();
    registrar("escolheu_modelo", { modelo: id, linha: produtoEscolhido.linha });
  }

  const minimo = minimoDoProduto(catalogo, produtoEscolhido);
  if (!montagem.quantidade || montagem.quantidade < minimo) montagem.quantidade = minimo;

  elementos.grade.querySelectorAll(".modelo").forEach((cartao) => {
    cartao.setAttribute("aria-pressed", String(cartao.dataset.produto === id));
  });

  desenharEditor();
  if (seguir) setTimeout(() => irParaPasso(2), 160);
}

/* ---------- Passo 2: o editor ---------- */

function desenharEditor() {
  if (!produtoEscolhido) return;
  const linha = linhaPorId(catalogo, produtoEscolhido.linha);

  elementos.editorModelo.textContent = produtoEscolhido.nome;
  elementos.editorLinha.textContent = linha ? linha.nome : "";

  // o que a fábrica diz da peça: é o que o cliente leigo não sabe perguntar
  const sobre = produtoEscolhido.estrutura || (produtoEscolhido.observacoes || [])[0] || "";
  elementos.editorSobre.textContent = sobre;
  elementos.editorSobre.classList.toggle("oculto", !sobre);
  // a miniatura do palco tem 90px: a foto da ficha aqui é peso à toa
  elementos.palcoFoto.src = produtoEscolhido.imagem.replace("assets/produtos/", "assets/produtos/mini/");
  elementos.palcoFoto.alt = `Boné ${produtoEscolhido.nome}`;

  ajustarFechoDaConstrucao();
  desenharMarcadores();
  desenharAplicacoes();
  desenharPartes();
  montarFerramentas();
  atualizarBarra();
}

/** A construção pode ter um fecho só — o trucker com tela, por exemplo. Nesse
    caso a ferramenta nem aparece, então o fecho é gravado aqui: senão o pedido
    chegaria à fábrica sem dizer qual é. E se o fecho escolhido não existir mais
    na construção nova, ele sai. */
function ajustarFechoDaConstrucao() {
  const fechos = fechosDaConstrucao(catalogo, construcaoAtual());
  if (fechos.length === 1) {
    montagem.variacoes.fecho = fechos[0].nome;
    return;
  }
  const atual = montagem.variacoes.fecho;
  if (atual && !fechos.some((fecho) => fecho.nome === atual)) {
    delete montagem.variacoes.fecho;
  }
}

function virarOBone() {
  ladoDireito = !ladoDireito;
  elementos.palco.classList.toggle("palco--direito", ladoDireito);
  elementos.botaoVirar.textContent = ladoDireito ? "Ver o lado esquerdo" : "Ver o lado direito";
  desenharMarcadores();
  desenharAplicacoes();
}

/** Mostra a logo do cliente nas partes onde ele aplicou arte.
    É uma ideia de como fica, não o layout final — o texto diz isso. */
function desenharAplicacoes() {
  elementos.aplicacoes.textContent = "";
  if (!logoNaTela) return;

  Object.keys(APLICACAO).forEach((posicao) => {
    const parteId = parteDaPosicao(posicao);
    if (!areaPorId(parteId)) return;
    const escolhida = montagem.partes[parteId];
    if (!escolhida || !escolhida.tecnicas || !escolhida.tecnicas.length) return;

    const lugar = APLICACAO[posicao];
    const imagem = document.createElement("img");
    imagem.className = "aplicacao";
    imagem.src = logoNaTela.endereco;
    imagem.alt = "";
    imagem.style.left = `${ladoDireito ? 100 - lugar.x : lugar.x}%`;
    imagem.style.top = `${lugar.y}%`;
    imagem.style.width = `${lugar.largura}%`;
    elementos.aplicacoes.append(imagem);
  });
}

function desenharMarcadores() {
  elementos.marcadores.textContent = "";
  Object.keys(LUGARES).forEach((posicao) => {
    const parte = areaPorId(parteDaPosicao(posicao));
    if (!parte) return;
    const ponto = pontoNoPalco(posicao);

    const marcador = document.createElement("button");
    marcador.type = "button";
    marcador.className = "marcador";
    marcador.style.left = `${ponto.x}%`;
    marcador.style.top = `${ponto.y}%`;
    marcador.dataset.parte = parte.id;
    marcador.setAttribute("aria-label", `Arte na ${parte.nome.toLowerCase()}`);

    const escolhida = montagem.partes[parte.id];
    const temArte = Boolean(escolhida && escolhida.tecnicas && escolhida.tecnicas.length);
    // com a logo desenhada, o marcador vira um anel vazado: senão ele
    // cobriria justamente a arte que o cliente quer ver
    const mostrandoLogo = temArte && Boolean(logoNaTela) && Boolean(APLICACAO[posicao]);
    marcador.classList.toggle("marcador--preenchido", temArte && !mostrandoLogo);
    marcador.classList.toggle("marcador--vazado", mostrandoLogo);
    marcador.textContent = mostrandoLogo ? "" : (temArte ? "✓" : "+");

    marcador.addEventListener("click", () => abrirPainelDaParte(parte));
    elementos.marcadores.append(marcador);
  });
}

function desenharPartes() {
  elementos.listaPartes.textContent = "";
  areasDoProduto().forEach((parte) => {
    const escolhida = montagem.partes[parte.id];
    const nomes = escolhida
      ? (escolhida.tecnicas || []).map((id) => {
          const tecnica = tecnicaPorId(catalogo, id);
          return tecnica ? tecnica.nome : id;
        })
      : [];

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "parte";
    botao.dataset.parte = parte.id;
    botao.classList.toggle("parte--preenchida", nomes.length > 0);

    const nome = document.createElement("span");
    nome.className = "parte__nome";
    nome.textContent = parte.nome;

    const valor = document.createElement("span");
    valor.className = "parte__valor";
    valor.textContent = nomes.length ? nomes.join(" + ") : "sem arte";

    const acao = document.createElement("span");
    acao.className = "parte__acao";
    acao.textContent = nomes.length ? "trocar" : "adicionar";

    botao.append(nome, valor, acao);
    botao.addEventListener("click", () => abrirPainelDaParte(parte));
    elementos.listaPartes.append(botao);
  });

  const quantas = partesComArte().length;
  elementos.palcoDica.textContent = quantas
    ? `${quantas} ${quantas === 1 ? "parte" : "partes"} com arte. Toque para trocar.`
    : "Toque numa parte do boné para colocar sua arte.";
  atualizarNotaDoPalco();
}

/** Expectativa alinhada: o desenho é uma ideia, não o layout de produção. */
function atualizarNotaDoPalco() {
  const mostrando = Boolean(logoNaTela) && partesComArte().length > 0;
  elementos.palcoNota.classList.toggle("oculto", !mostrando);
  if (mostrando) {
    elementos.palcoNota.textContent =
      "É só para você ter uma ideia de onde a arte vai. O layout de verdade, " +
      "com a sua logo tratada, a gente manda para aprovar antes de produzir.";
  }
}

/** Painel de uma área: o que vai ali, respeitando a construção da peça. */
function abrirPainelDaParte(parte) {
  const atual = montagem.partes[parte.id] || { tecnicas: [], observacao: "" };
  let escolhidas = [...atual.tecnicas];
  let observacao = atual.observacao;

  const construcao = construcaoAtual();
  const { permitidas, recomendada, restricao, material } =
    tecnicasDaArea(catalogo, produtoEscolhido, construcao, parte);

  abrirPainel(`O que vai na ${parte.nome.toLowerCase()}?`, (corpo) => {
    // por que estas e não outras: o material daquela parte manda
    const explicacao = document.createElement("p");
    explicacao.className = "painel__apoio";
    const materialNome = material
      ? (catalogo.materiais.find((item) => item.id === material) || {}).nome
      : null;
    explicacao.textContent = materialNome
      ? `Esta parte é em ${materialNome.toLowerCase()}. Aparecem só as formas de aplicação que funcionam nela.`
      : "Escolha a forma de aplicação. Pode marcar mais de uma.";
    corpo.append(explicacao);

    // costura, vinco ou fita estreita: dito antes de o cliente escolher
    if (restricao) {
      const aviso = document.createElement("div");
      aviso.className = "restricao";
      const titulo = document.createElement("strong");
      titulo.textContent = "Atenção à construção desta peça. ";
      const texto = document.createElement("span");
      texto.textContent = restricao.texto +
        (restricao.alternativa ? ` ${restricao.alternativa}` : "");
      aviso.append(titulo, texto);
      corpo.append(aviso);
    }

    if (parte.limite) {
      const limite = document.createElement("div");
      limite.className = "restricao";
      limite.textContent = parte.limite.texto;
      corpo.append(limite);
    }

    if (!permitidas.length) {
      const vazio = document.createElement("p");
      vazio.className = "painel__apoio";
      vazio.textContent =
        "Ainda não temos forma de aplicação cadastrada para esta parte. " +
        "Peça assim mesmo: a gente confirma no atendimento.";
      corpo.append(vazio);
      return;
    }

    const lista = document.createElement("div");
    lista.className = "cartoes-escolha cartoes-escolha--lista";

    permitidas.forEach((tecnica) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-escolha";

      // o mapa pede técnicas simultâneas: aplique + bordado + DTF
      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      caixa.value = tecnica.id;
      caixa.className = "oculto-visual";
      caixa.checked = escolhidas.includes(tecnica.id);
      caixa.addEventListener("change", () => {
        escolhidas = caixa.checked
          ? [...escolhidas, tecnica.id]
          : escolhidas.filter((id) => id !== tecnica.id);
      });

      const desenho = icone(tecnica.icone, "cartao-escolha__icone");

      const texto = document.createElement("span");
      texto.className = "cartao-escolha__texto";
      const nome = document.createElement("span");
      nome.className = "cartao-escolha__nome";
      nome.textContent = tecnica.nome;
      // com uma opcao so, dizer "recomendado" nao ajuda ninguem
      if (recomendada && permitidas.length > 1 && tecnica.id === recomendada.id) {
        const selo = document.createElement("span");
        selo.className = "selo-recomendado";
        selo.textContent = "recomendado";
        nome.append(" ", selo);
      }
      const ajuda = document.createElement("span");
      ajuda.className = "cartao-escolha__ajuda";
      ajuda.textContent = (recomendada && permitidas.length > 1 && tecnica.id === recomendada.id && parte.motivo)
        ? `${tecnica.explicacao} ${parte.motivo}`
        : tecnica.explicacao;
      texto.append(nome, ajuda);

      const marca = document.createElement("span");
      marca.className = "cartao-escolha__marca";
      marca.setAttribute("aria-hidden", "true");

      rotulo.append(caixa, desenho, texto, marca);
      lista.append(rotulo);
    });
    corpo.append(lista);

    const campo = document.createElement("label");
    campo.className = "campo";
    const rotuloCampo = document.createElement("span");
    rotuloCampo.className = "campo__rotulo";
    rotuloCampo.textContent = "O que vai aqui? ";
    const dica = document.createElement("span");
    dica.className = "campo__dica";
    dica.textContent = "opcional";
    rotuloCampo.append(dica);
    const entrada = document.createElement("input");
    entrada.type = "text";
    entrada.value = observacao;
    entrada.placeholder = "Ex.: logo da empresa, nome do time";
    entrada.addEventListener("input", () => { observacao = entrada.value; });
    campo.append(rotuloCampo, entrada);
    corpo.append(campo);
  }, [
    {
      texto: "Aplicar",
      classe: "botao--grande",
      aoTocar: () => {
        if (escolhidas.length) {
          montagem.partes[parte.id] = { tecnicas: escolhidas, observacao: observacao.trim() };
          registrar("aplicou_arte", { parte: parte.id, tecnicas: escolhidas.join("+") });
        } else {
          delete montagem.partes[parte.id];
        }
        fecharPainel();
        desenharMarcadores();
        desenharAplicacoes();
        desenharPartes();
        atualizarBarra();
      },
    },
    ...(atual.tecnicas.length ? [{
      texto: "Tirar a arte desta parte",
      classe: "botao--texto",
      aoTocar: () => {
        delete montagem.partes[parte.id];
        fecharPainel();
        desenharMarcadores();
        desenharAplicacoes();
        desenharPartes();
        atualizarBarra();
      },
    }] : []),
  ]);
}

/* ---------- Ferramentas ---------- */

function montarFerramentas() {
  const lista = [];

  // Construção primeiro: ela decide material, fecho e técnicas de tudo
  if ((produtoEscolhido.construcoes || []).length > 1) {
    lista.push({ id: "construcao", nome: "Construção", icone: "relevo", aoTocar: abrirPainelDeConstrucao });
  }

  lista.push({ id: "cores", nome: "Cores", icone: "cor", aoTocar: abrirPainelDeCores });

  // Só oferece fecho quando o modelo tem escolha de verdade
  const fechos = fechosDaConstrucao(catalogo, construcaoAtual());
  if (fechos.length > 1) {
    lista.push({ id: "fecho", nome: "Fecho", icone: "fecho", aoTocar: abrirPainelDeFecho });
  }

  // Opções que a ficha do modelo declara: aba, botão, saia, cordão, fita...
  (produtoEscolhido.opcoes || []).forEach((opcao) => {
    const definicao = OPCOES[opcao];
    if (!definicao || !definicao.valores(catalogo).length) return;
    lista.push({
      id: opcao,
      nome: definicao.nome,
      icone: definicao.icone,
      aoTocar: () => abrirPainelDeOpcao(opcao, definicao),
    });
  });

  lista.push({ id: "logo", nome: "Sua logo", icone: "logo", aoTocar: abrirPainelDaLogo });
  lista.push({ id: "quantidade", nome: "Quantidade", icone: "numero", aoTocar: abrirPainelDeQuantidade });

  elementos.ferramentas.textContent = "";
  lista.forEach((ferramenta) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "ferramenta";
    botao.dataset.ferramenta = ferramenta.id;
    botao.append(icone(ferramenta.icone, "ferramenta__icone"));
    const nome = document.createElement("span");
    nome.className = "ferramenta__nome";
    nome.textContent = ferramenta.nome;
    botao.append(nome);
    botao.addEventListener("click", ferramenta.aoTocar);
    elementos.ferramentas.append(botao);
  });
  marcarFerramentas();
}

/** Acende o pontinho na ferramenta que ja foi resolvida, para o cliente saber
    o que falta sem precisar abrir cada painel. */
function marcarFerramentas() {
  const minimo = produtoEscolhido ? minimoDoProduto(catalogo, produtoEscolhido) : 0;
  const pronta = {
    construcao: Boolean(montagem.construcao),
    cores: montagem.cores.length > 0,
    fecho: Boolean(montagem.variacoes.fecho),
    logo: Boolean(montagem.arte.origem),
    quantidade: Boolean(montagem.quantidade) && montagem.quantidade >= minimo,
  };
  elementos.ferramentas.querySelectorAll(".ferramenta").forEach((botao) => {
    const id = botao.dataset.ferramenta;
    // as opcoes da ficha (aba, saia, cordao...) guardam o valor em variacoes
    const feita = id in pronta ? pronta[id] : Boolean(montagem.variacoes[id]);
    botao.classList.toggle("ferramenta--preenchida", feita);
  });
}

/* As opções que cada modelo pode ter, conforme a ficha técnica. Tudo sai do
   catálogo: acrescentar uma opção nova é editar o JSON, não o código. */
const OPCOES = {
  aba: { nome: "Aba", icone: "relevo", valores: (c) => (c.abas || {}).valores || [] },
  acabamentos: { nome: "Acabamento", icone: "aplique", valores: (c) => (c.acabamentos || {}).valores || [], varias: true },
  fita: { nome: "Cor da fita", icone: "cor", valores: (c) => (c.fitas || {}).valores || [] },
  saia: { nome: "Saia", icone: "aplique", valores: (c) => (c.saias || {}).valores || [] },
  cordao: { nome: "Cordão", icone: "aplique", valores: (c) => (c.cordoes || {}).valores || [] },
  "botao-topo": {
    nome: "Botão do topo", icone: "cor",
    valores: () => [{ id: "com", nome: "Com botão no topo" }, { id: "sem", nome: "Sem botão no topo" }],
  },
  "botao-aba": { nome: "Botão da aba", icone: "cor", valores: (c) => (c.botoes_aba || {}).valores || [] },
};

/** Trocar a construção muda material, fecho e técnicas: a arte já posta pode
    deixar de ser possível, então ela é revista na hora. */
/** Quando a ficha não escreve nada, o resumo sai dos próprios materiais: o
    cliente precisa saber o que muda de uma construção para a outra. */
function resumoDaConstrucao(construcao) {
  const materiais = Object.values(construcao.materiais || {});
  if (!materiais.length) return "";
  const nome = (id) => {
    const achado = catalogo.materiais.find((item) => item.id === id);
    return achado ? achado.nome.toLowerCase() : id;
  };
  const unicos = [...new Set(materiais)];
  if (unicos.length === 1) return `A peça inteira em ${nome(unicos[0])}.`;
  return `${unicos.map(nome).join(" e ")} na mesma peça.`;
}

function abrirPainelDeConstrucao() {
  let escolhida = (construcaoAtual() || {}).id;

  abrirPainel("Como é a peça?", (corpo) => {
    const apoio = document.createElement("p");
    apoio.className = "painel__apoio";
    apoio.textContent = "A construção muda o material de cada parte — e com ele o que dá para aplicar.";
    corpo.append(apoio);

    const lista = document.createElement("div");
    lista.className = "cartoes-escolha cartoes-escolha--lista";
    produtoEscolhido.construcoes.forEach((construcao) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-escolha";

      const marcador = document.createElement("input");
      marcador.type = "radio";
      marcador.name = "construcao";
      marcador.value = construcao.id;
      marcador.className = "oculto-visual";
      marcador.checked = construcao.id === escolhida;
      marcador.addEventListener("change", () => { escolhida = construcao.id; });

      const texto = document.createElement("span");
      texto.className = "cartao-escolha__texto";
      const nome = document.createElement("span");
      nome.className = "cartao-escolha__nome";
      nome.textContent = construcao.nome;
      texto.append(nome);
      const explicacao = construcao.nota || resumoDaConstrucao(construcao);
      if (explicacao) {
        const ajuda = document.createElement("span");
        ajuda.className = "cartao-escolha__ajuda";
        ajuda.textContent = explicacao;
        texto.append(ajuda);
      }

      const marca = document.createElement("span");
      marca.className = "cartao-escolha__marca";
      marca.setAttribute("aria-hidden", "true");

      rotulo.append(marcador, texto, marca);
      lista.append(rotulo);
    });
    corpo.append(lista);
  }, [{
    texto: "Pronto",
    classe: "botao--grande",
    aoTocar: () => {
      const mudou = escolhida !== (construcaoAtual() || {}).id;
      montagem.construcao = escolhida;
      if (mudou) limparArteImpossivel();
      fecharPainel();
      desenharEditor();
    },
  }]);
}

/** Depois de trocar a construção, tira a arte que aquela peça não aceita mais.
    Sem isto o pedido sairia com uma combinação que a fábrica não produz. */
function limparArteImpossivel() {
  ajustarFechoDaConstrucao();
  const construcao = construcaoAtual();
  let removidas = 0;
  areasDoProduto().forEach((area) => {
    const escolha = montagem.partes[area.id];
    if (!escolha) return;
    const { permitidas } = tecnicasDaArea(catalogo, produtoEscolhido, construcao, area);
    const ids = permitidas.map((tecnica) => tecnica.id);
    const restantes = escolha.tecnicas.filter((id) => ids.includes(id));
    if (restantes.length !== escolha.tecnicas.length) removidas += 1;
    if (restantes.length) montagem.partes[area.id] = { ...escolha, tecnicas: restantes };
    else delete montagem.partes[area.id];
  });
  if (removidas) {
    alert("Algumas artes foram tiradas: essa construção não aceita a forma de aplicação que estava escolhida.");
  }
}

function abrirPainelDeFecho() {
  const fechos = fechosDaConstrucao(catalogo, construcaoAtual());
  let escolhido = montagem.variacoes.fecho || "";

  abrirPainel("Fecho", (corpo) => {
    const lista = document.createElement("div");
    lista.className = "cartoes-escolha cartoes-escolha--lista";
    fechos.forEach((fecho) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-escolha";
      const marcador = document.createElement("input");
      marcador.type = "radio";
      marcador.name = "fecho";
      marcador.value = fecho.id;
      marcador.className = "oculto-visual";
      marcador.checked = fecho.nome === escolhido;
      marcador.addEventListener("change", () => { escolhido = fecho.nome; });

      const texto = document.createElement("span");
      texto.className = "cartao-escolha__texto";
      const nome = document.createElement("span");
      nome.className = "cartao-escolha__nome";
      nome.textContent = fecho.nome;
      texto.append(nome);

      const marca = document.createElement("span");
      marca.className = "cartao-escolha__marca";
      marca.setAttribute("aria-hidden", "true");

      rotulo.append(marcador, texto, marca);
      lista.append(rotulo);
    });
    corpo.append(lista);
  }, [{
    texto: "Pronto",
    classe: "botao--grande",
    aoTocar: () => {
      if (escolhido) montagem.variacoes.fecho = escolhido;
      fecharPainel();
      marcarFerramentas();
      atualizarBarra();
    },
  }]);
}

/** Painel genérico das opções do modelo (aba, saia, cordão, botão, fita). */
function abrirPainelDeOpcao(id, definicao) {
  const valores = definicao.valores(catalogo);
  const atual = montagem.variacoes[id];
  let escolhido = definicao.varias ? [...(atual || [])] : (atual || "");

  abrirPainel(definicao.nome, (corpo) => {
    const lista = document.createElement("div");
    lista.className = "cartoes-escolha cartoes-escolha--lista";
    valores.forEach((valor) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-escolha";

      const marcador = document.createElement("input");
      marcador.type = definicao.varias ? "checkbox" : "radio";
      marcador.name = `opcao-${id}`;
      marcador.value = valor.id;
      marcador.className = "oculto-visual";
      marcador.checked = definicao.varias
        ? escolhido.includes(valor.nome)
        : escolhido === valor.nome;
      marcador.addEventListener("change", () => {
        if (definicao.varias) {
          escolhido = marcador.checked
            ? [...escolhido, valor.nome]
            : escolhido.filter((nome) => nome !== valor.nome);
        } else {
          escolhido = valor.nome;
        }
      });

      const texto = document.createElement("span");
      texto.className = "cartao-escolha__texto";
      const nome = document.createElement("span");
      nome.className = "cartao-escolha__nome";
      nome.textContent = valor.nome;
      texto.append(nome);

      const marca = document.createElement("span");
      marca.className = "cartao-escolha__marca";
      marca.setAttribute("aria-hidden", "true");

      rotulo.append(marcador, texto, marca);
      lista.append(rotulo);
    });
    corpo.append(lista);
  }, [{
    texto: "Pronto",
    classe: "botao--grande",
    aoTocar: () => {
      const vazio = definicao.varias ? !escolhido.length : !escolhido;
      if (vazio) delete montagem.variacoes[id];
      else montagem.variacoes[id] = definicao.varias ? [...escolhido] : escolhido;
      fecharPainel();
      marcarFerramentas();
      atualizarBarra();
    },
  }]);
}

function abrirPainelDeCores() {
  abrirPainel("De que cor você quer o boné?", (corpo) => {
    const apoio = document.createElement("p");
    apoio.className = "painel__apoio";
    apoio.textContent = "Toque nas cores que você gostou. Pode ser mais de uma.";
    corpo.append(apoio);

    const grade = document.createElement("div");
    grade.className = "cores";
    catalogo.cores.forEach((cor) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cor";

      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      caixa.className = "oculto-visual";
      caixa.value = cor.id;
      caixa.checked = montagem.cores.includes(cor.nome);
      caixa.addEventListener("change", () => {
        montagem.cores = caixa.checked
          ? [...montagem.cores, cor.nome]
          : montagem.cores.filter((nome) => nome !== cor.nome);
        marcarFerramentas();
        atualizarBarra();
      });

      const amostra = document.createElement("span");
      amostra.className = "cor__amostra";
      amostra.style.background = cor.hex;

      const nome = document.createElement("span");
      nome.className = "cor__nome";
      nome.textContent = cor.nome;

      rotulo.append(caixa, amostra, nome);
      grade.append(rotulo);
    });
    corpo.append(grade);
  }, [{ texto: "Pronto", classe: "botao--grande", aoTocar: fecharPainel }]);
}

function abrirPainelDaLogo() {
  let origem = montagem.arte.origem;
  abrirPainel("Você tem a sua logo?", (corpo) => {
    const apoio = document.createElement("p");
    apoio.className = "painel__apoio";
    apoio.textContent = "É o que mais atrasa pedido. Responder aqui já resolve.";
    corpo.append(apoio);

    const lista = document.createElement("div");
    lista.className = "cartoes-escolha cartoes-escolha--lista";
    catalogo.arte.origens.forEach((opcao, indice) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-escolha";

      const marcador = document.createElement("input");
      marcador.type = "radio";
      marcador.name = "origem-arte";
      marcador.value = opcao.id;
      marcador.className = "oculto-visual";
      marcador.checked = origem ? opcao.nome === origem : indice === 0;
      if (marcador.checked) origem = opcao.nome;
      marcador.addEventListener("change", () => {
        origem = opcao.nome;
        montagem.arte.redesenho = Boolean(opcao.redesenho);
        blocoArquivo.classList.toggle("oculto", opcao.id === "criar");
      });

      const texto = document.createElement("span");
      texto.className = "cartao-escolha__texto";
      const nome = document.createElement("span");
      nome.className = "cartao-escolha__nome";
      nome.textContent = opcao.nome;
      const ajuda = document.createElement("span");
      ajuda.className = "cartao-escolha__ajuda";
      ajuda.textContent = opcao.ajuda;
      texto.append(nome, ajuda);

      const marca = document.createElement("span");
      marca.className = "cartao-escolha__marca";
      marca.setAttribute("aria-hidden", "true");

      rotulo.append(marcador, texto, marca);
      lista.append(rotulo);
    });
    corpo.append(lista);

    const blocoArquivo = document.createElement("div");
    blocoArquivo.className = "bloco-arquivo";

    const titulo = document.createElement("h3");
    titulo.className = "painel__subtitulo";
    titulo.textContent = "Quer conferir seu arquivo agora?";
    const nota = document.createElement("p");
    nota.className = "painel__apoio";
    nota.textContent = "A gente olha o arquivo aqui mesmo. Nada é enviado — ele não sai do seu aparelho.";

    const area = document.createElement("label");
    area.className = "area-arquivo";
    area.append(icone("logo", "area-arquivo__icone"));
    const textoArea = document.createElement("span");
    textoArea.className = "area-arquivo__texto";
    textoArea.textContent = "Escolher arquivo";
    const dicaArea = document.createElement("span");
    dicaArea.className = "area-arquivo__dica";
    dicaArea.textContent = "foto, print, PNG, PDF ou arquivo do designer";
    area.append(textoArea, dicaArea);

    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.className = "oculto-visual";
    entrada.accept = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,.cdr,.eps";
    area.append(entrada);

    const veredito = document.createElement("div");
    veredito.className = "veredito oculto";

    entrada.addEventListener("change", async () => {
      const arquivo = entrada.files[0];
      if (!arquivo) return;

      // o mockup é o motivo de o cliente subir o arquivo bom: aparece já.
      // os marcadores precisam ser redesenhados junto, senão continuam
      // sólidos e tapam exatamente a arte que ele quer ver
      trocarLogoNaTela(arquivo);
      desenharAplicacoes();
      desenharMarcadores();
      atualizarNotaDoPalco();

      mostrarVeredito(veredito, {
        nivel: "conferindo",
        titulo: "Conferindo o arquivo…",
        detalhe: "A conferência acontece no seu aparelho.",
      });
      const resultado = await conferirArte(catalogo, arquivo);
      if (entrada.files[0] !== arquivo) return;
      arteConferida = resultado;
      mostrarVeredito(veredito, resultado);
      // este é o número que diz quanto do atraso vem de arquivo ruim
      registrar("conferiu_arquivo", { resultado: resultado.nivel });

      if (!podeMostrarNaTela(arquivo)) {
        const nota = document.createElement("div");
        nota.className = "veredito__detalhe veredito__extra";
        nota.textContent = "Esse tipo de arquivo não dá para desenhar aqui na tela, " +
          "mas serve para produzir. O layout com sua logo vem no atendimento.";
        veredito.append(nota);
      }
    });

    blocoArquivo.append(titulo, nota, area, veredito);
    corpo.append(blocoArquivo);

    if (arteConferida) mostrarVeredito(veredito, arteConferida);
  }, [{
    texto: "Pronto",
    classe: "botao--grande",
    aoTocar: () => {
      montagem.arte.origem = origem;
      if (arteConferida) {
        montagem.arte.arquivo = arteConferida.resumo;
        montagem.arte.nivel = arteConferida.nivel;
      }
      fecharPainel();
      marcarFerramentas();
      atualizarBarra();
    },
  }]);
}

function mostrarVeredito(alvo, resultado) {
  alvo.className = `veredito veredito--${resultado.nivel}`;
  alvo.dataset.nivel = resultado.nivel;
  alvo.textContent = "";

  const titulo = document.createElement("div");
  titulo.className = "veredito__titulo";
  titulo.textContent = resultado.titulo;

  const detalhe = document.createElement("div");
  detalhe.className = "veredito__detalhe";
  detalhe.textContent = resultado.detalhe;

  alvo.append(titulo, detalhe);
}

function abrirPainelDeQuantidade() {
  const minimo = minimoDoProduto(catalogo, produtoEscolhido);
  let quantidade = montagem.quantidade || minimo;

  abrirPainel("Quantos bonés?", (corpo) => {
    const apoio = document.createElement("p");
    apoio.className = "painel__apoio";
    apoio.textContent = `Nesta linha o pedido começa em ${minimo} bonés.`;
    corpo.append(apoio);

    const campo = document.createElement("input");
    campo.type = "number";
    campo.className = "contador__campo";
    campo.min = String(minimo);
    campo.value = String(quantidade);
    campo.setAttribute("aria-label", "Quantidade de bonés");

    const atalhos = document.createElement("div");
    atalhos.className = "atalhos-quantidade";
    const sugestoes = [...new Set([minimo, 50, 100, 200, 300].filter((n) => n >= minimo))].slice(0, 5);

    function marcar() {
      atalhos.querySelectorAll(".atalho").forEach((botao) => {
        botao.setAttribute("aria-pressed", String(Number(botao.dataset.quantidade) === quantidade));
      });
      aviso.classList.toggle("oculto", quantidade >= minimo);
    }

    sugestoes.forEach((numero) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "atalho";
      botao.dataset.quantidade = String(numero);
      botao.textContent = numero === minimo ? `${numero} (mínimo)` : String(numero);
      botao.addEventListener("click", () => {
        quantidade = numero;
        campo.value = String(numero);
        marcar();
      });
      atalhos.append(botao);
    });
    corpo.append(atalhos);

    const contador = document.createElement("div");
    contador.className = "contador";
    const menos = document.createElement("button");
    menos.type = "button";
    menos.className = "contador__botao";
    menos.textContent = "−";
    menos.setAttribute("aria-label", "Diminuir");
    const mais = document.createElement("button");
    mais.type = "button";
    mais.className = "contador__botao";
    mais.textContent = "+";
    mais.setAttribute("aria-label", "Aumentar");

    menos.addEventListener("click", () => {
      quantidade = Math.max(minimo, quantidade - 25);
      campo.value = String(quantidade);
      marcar();
    });
    mais.addEventListener("click", () => {
      quantidade += 25;
      campo.value = String(quantidade);
      marcar();
    });
    campo.addEventListener("input", () => {
      quantidade = Number(campo.value) || 0;
      marcar();
    });

    contador.append(menos, campo, mais);
    corpo.append(contador);

    const aviso = document.createElement("p");
    aviso.className = "aviso aviso--erro oculto";
    aviso.textContent = `O pedido mínimo desta linha é ${minimo} bonés.`;
    corpo.append(aviso);

    marcar();
  }, [{
    texto: "Pronto",
    classe: "botao--grande",
    aoTocar: () => {
      const minimoDaLinha = minimoDoProduto(catalogo, produtoEscolhido);
      montagem.quantidade = Math.max(minimoDaLinha, quantidade);
      fecharPainel();
      marcarFerramentas();
      atualizarBarra();
    },
  }]);
}

/* ---------- Preço e item ---------- */

/** Soma os acréscimos das partes personalizadas.
    null quando alguma técnica ainda não tem valor na tabela. */
function acrescimoDasPartes() {
  let total = 0;
  for (const [, escolha] of partesComArte()) {
    for (const id of escolha.tecnicas) {
      const tecnica = tecnicaPorId(catalogo, id);
      if (!tecnica || typeof tecnica.acrescimo_unidade !== "number") return null;
      total += tecnica.acrescimo_unidade;
    }
  }
  return total;
}

function previaDoItem() {
  if (!produtoEscolhido || !montagem.quantidade) return { unitario: null, total: null };
  const base = precoUnitario(catalogo, produtoEscolhido, montagem.quantidade);
  const acrescimo = acrescimoDasPartes();
  const temPreco = base !== null && acrescimo !== null;
  const unitario = temPreco ? base + acrescimo : null;
  return { unitario, total: unitario === null ? null : unitario * montagem.quantidade };
}

function montarItemAtual() {
  const { unitario, total } = previaDoItem();
  const linha = linhaPorId(catalogo, produtoEscolhido.linha);

  return {
    id: produtoEscolhido.id,
    nome: produtoEscolhido.nome,
    linha: produtoEscolhido.linha,
    imagem: produtoEscolhido.imagem,
    quantidade: montagem.quantidade,
    aplicacoes: partesComArte().map(([parteId, escolha]) => {
      const parte = areaPorId(parteId);
      return {
        parte: parte ? parte.nome : parteId,
        tecnica: escolha.tecnicas
          .map((id) => (tecnicaPorId(catalogo, id) || {}).nome || id)
          .join(" + "),
        observacao: escolha.observacao || "",
      };
    }),
    construcao: (construcaoAtual() || {}).nome || "",
    cores: montagem.cores.join(", "),
    variacoes: { ...montagem.variacoes },
    arte: { ...montagem.arte },
    observacoes: montagem.observacoes,
    linhaNome: linha ? linha.nome : "",
    unitario,
    total,
  };
}

function validarMontagem() {
  if (!produtoEscolhido) return "Escolha um modelo para continuar.";
  const minimo = minimoDoProduto(catalogo, produtoEscolhido);
  if (!montagem.quantidade || montagem.quantidade < minimo) {
    return `Diga a quantidade: o mínimo desta linha é ${minimo} bonés.`;
  }
  return "";
}

/* ---------- Navegacao ---------- */

function montarTrilhaDoProgresso() {
  elementos.progressoPassos.textContent = "";
  PASSOS.forEach((passo) => {
    const item = document.createElement("li");
    item.className = "progresso__passo";
    item.dataset.passo = String(passo.numero);
    item.textContent = passo.nome;
    elementos.progressoPassos.append(item);
  });
}

function irParaPasso(numero, { mexerNoHistorico = true } = {}) {
  const novoPasso = Math.min(Math.max(numero, 1), ULTIMO_PASSO);
  if (mexerNoHistorico && novoPasso !== passoAtual) {
    history.pushState({ passo: novoPasso }, "");
  }
  passoAtual = novoPasso;

  elementos.etapas.forEach((etapa) => {
    etapa.classList.toggle("oculto", Number(etapa.dataset.passo) !== passoAtual);
  });

  elementos.progressoPreenchido.style.width = `${(passoAtual / ULTIMO_PASSO) * 100}%`;
  elementos.progressoPassos.querySelectorAll(".progresso__passo").forEach((item) => {
    const numeroDoItem = Number(item.dataset.passo);
    item.classList.toggle("progresso__passo--atual", numeroDoItem === passoAtual);
    item.classList.toggle("progresso__passo--feito", numeroDoItem < passoAtual);
  });

  elementos.ferramentas.classList.toggle("oculto", passoAtual !== 2);
  document.body.classList.toggle("com-ferramentas", passoAtual === 2);
  document.body.classList.toggle("sem-barra", passoAtual === ULTIMO_PASSO);
  elementos.botaoVoltar.classList.toggle("invisivel", passoAtual === 1);

  if (passoAtual === 3) desenharPedido();
  atualizarBarra();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function avancar() {
  if (passoAtual === 1) {
    if (!produtoEscolhido) return piscarAviso("Toque em um modelo para continuar.");
    return irParaPasso(2);
  }
  if (passoAtual === 2) {
    const erro = validarMontagem();
    if (erro) {
      piscarAviso(erro);
      abrirPainelDeQuantidade();
      return;
    }
    const item = montarItemAtual();
    itens.push(item);
    registrar("adicionou_ao_pedido", {
      modelo: item.id,
      quantidade: item.quantidade,
      artes: item.aplicacoes.length,
      construcao: item.construcao,
      sob_consulta: item.total === null,
    });
    salvarPedido();
    montagem = criarMontagemVazia();
    arteConferida = null;
    return irParaPasso(3);
  }
}

function atualizarBarra() {
  if (passoAtual === 1) {
    elementos.barraTitulo.textContent = produtoEscolhido ? produtoEscolhido.nome : "Escolha um modelo";
    elementos.barraDetalhe.textContent = produtoEscolhido ? "toque em continuar" : "toque na foto do boné";
  } else if (passoAtual === 2) {
    const quantas = partesComArte().length;
    elementos.barraTitulo.textContent = produtoEscolhido ? produtoEscolhido.nome : "";
    const previa = previaDoItem();
    const partes = quantas ? `${quantas} ${quantas === 1 ? "arte" : "artes"}` : "sem arte";
    const valor = previa.total === null
      ? `${montagem.quantidade || 0} un.`
      : formatarMoeda(previa.total);
    elementos.barraDetalhe.textContent = `${partes} · ${valor}`;
  } else {
    const pecas = itens.reduce((soma, item) => soma + item.quantidade, 0);
    elementos.barraTitulo.textContent = `${itens.length} ${itens.length === 1 ? "item" : "itens"}`;
    elementos.barraDetalhe.textContent = `${pecas} bonés no pedido`;
  }

  const textos = { 1: "Continuar", 2: "Adicionar", 3: "" };
  elementos.botaoAvancar.textContent = textos[passoAtual];
  elementos.botaoAvancar.classList.toggle("oculto", passoAtual === ULTIMO_PASSO);
}

function piscarAviso(texto) {
  elementos.barraTitulo.textContent = texto;
  elementos.barraDetalhe.textContent = "";
  elementos.botaoAvancar.classList.add("botao--tremendo");
  setTimeout(() => {
    elementos.botaoAvancar.classList.remove("botao--tremendo");
    atualizarBarra();
  }, 1600);
}

/* ---------- Passo 3: revisao ---------- */

function removerItem(indice) {
  itens.splice(indice, 1);
  salvarPedido();
  desenharPedido();
  atualizarBarra();
}

function desenharPedido() {
  elementos.lista.textContent = "";
  const temItens = itens.length > 0;
  elementos.vazio.classList.toggle("oculto", temItens);

  itens.forEach((item, indice) => {
    const linhaLista = document.createElement("li");
    linhaLista.className = "item";

    if (item.imagem) {
      const foto = document.createElement("img");
      foto.className = "item__foto";
      foto.src = item.imagem;
      foto.alt = "";
      foto.loading = "lazy";
      foto.width = 64;
      foto.height = 64;
      linhaLista.append(foto);
    }

    const texto = document.createElement("div");
    texto.className = "item__texto";

    const nome = document.createElement("div");
    nome.className = "item__nome";
    nome.textContent = `${item.quantidade}x ${item.nome}`;
    texto.append(nome);

    (item.aplicacoes || []).forEach((aplicacao) => {
      const linhaArte = document.createElement("div");
      linhaArte.className = "item__detalhe";
      linhaArte.textContent = `${aplicacao.parte}: ${aplicacao.tecnica}` +
        (aplicacao.observacao ? ` — ${aplicacao.observacao}` : "");
      texto.append(linhaArte);
    });

    const extras = [];
    if (item.cores) extras.push(item.cores);
    Object.values(item.variacoes || {}).forEach((valor) => extras.push(valor));
    if (item.arte && item.arte.redesenho) extras.push("com redesenho da arte");
    if (extras.length) {
      const linhaExtras = document.createElement("div");
      linhaExtras.className = "item__detalhe";
      linhaExtras.textContent = extras.join(" · ");
      texto.append(linhaExtras);
    }

    const preco = document.createElement("div");
    preco.className = "item__preco";
    preco.textContent = item.total === null ? "sob consulta" : formatarMoeda(item.total);
    texto.append(preco);

    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "item__remover";
    remover.textContent = "✕";
    remover.setAttribute("aria-label", `Tirar ${item.nome} do pedido`);
    remover.addEventListener("click", () => removerItem(indice));

    linhaLista.append(texto, remover);
    elementos.lista.append(linhaLista);
  });

  const pecas = itens.reduce((soma, item) => soma + item.quantidade, 0);
  const algumSemPreco = itens.some((item) => item.total === null);
  const valor = itens.reduce((soma, item) => soma + (item.total || 0), 0);

  elementos.totalPecas.textContent = String(pecas);
  elementos.totalPrazo.textContent = formatarData(calcularPrazo(20));
  elementos.totalValor.textContent = algumSemPreco ? "sob consulta" : formatarMoeda(valor);
  elementos.lembreteAnexos.classList.toggle("oculto", !itens.some((item) => item.arte && item.arte.origem));
  elementos.botaoWhatsapp.disabled = !temItens;
}

function pedidoAtual() {
  return { referencia: gerarReferencia(), itens, cliente: elementos.cliente.value };
}

async function copiarResumo() {
  const texto = montarMensagemWhatsapp(catalogo, pedidoAtual());
  try {
    await navigator.clipboard.writeText(texto);
    elementos.avisoCopia.textContent = "Resumo copiado.";
  } catch (erro) {
    elementos.avisoCopia.textContent = "Não deu para copiar sozinho. Toque em enviar pelo WhatsApp.";
  }
  elementos.avisoCopia.classList.remove("oculto");
  setTimeout(() => elementos.avisoCopia.classList.add("oculto"), 4000);
}

function limparPedido() {
  if (itens.length && !confirm("Apagar tudo e começar de novo?")) return;
  itens = [];
  montagem = criarMontagemVazia();
  produtoEscolhido = null;
  arteConferida = null;
  if (logoNaTela) URL.revokeObjectURL(logoNaTela.endereco);
  logoNaTela = null;
  salvarPedido();
  desenharPedido();
  irParaPasso(1);
}

/* ---------- Inicio ---------- */

function modeloDaUrl() {
  return new URLSearchParams(window.location.search).get("modelo");
}

async function iniciar() {
  try {
    catalogo = await carregarCatalogo();
  } catch (erro) {
    elementos.grade.innerHTML =
      '<p class="aviso aviso--erro">Não foi possível carregar o catálogo. ' +
      'Se você abriu o arquivo direto do disco, use um servidor local.</p>';
    console.error(erro);
    return;
  }

  prepararMedicao(catalogo);
  montarTrilhaDoProgresso();
  montarFiltros();
  montarGrade();
  preencherDadosEmpresa(catalogo);

  elementos.botaoAvancar.addEventListener("click", avancar);
  elementos.botaoVoltar.addEventListener("click", () => irParaPasso(passoAtual - 1));
  elementos.botaoTrocar.addEventListener("click", () => irParaPasso(1));
  elementos.botaoVirar.addEventListener("click", virarOBone);
  elementos.botaoOutro.addEventListener("click", () => irParaPasso(1));
  elementos.botaoWhatsapp.addEventListener("click", () => {
    const pedido = pedidoAtual();
    registrarPedidoEnviado(pedido);
    abrirWhatsapp(catalogo, pedido);
  });
  elementos.botaoCopiar.addEventListener("click", copiarResumo);
  elementos.botaoLimpar.addEventListener("click", limparPedido);
  elementos.painelFundo.addEventListener("click", () => fecharPainel());
  elementos.painelFechar.addEventListener("click", () => fecharPainel());
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && painelEstaAberto()) fecharPainel();
  });

  /* O botão voltar do aparelho é o mais usado no celular. Sem isto, quem
     apertava voltar no meio da montagem saía do site e perdia tudo. */
  window.addEventListener("popstate", (evento) => {
    if (voltandoPeloHistorico) {
      voltandoPeloHistorico = false;
      return;
    }
    if (painelEstaAberto()) {
      fecharPainel({ mexerNoHistorico: false });
      return;
    }
    const estado = evento.state || {};
    if (estado.passo) irParaPasso(estado.passo, { mexerNoHistorico: false });
  });

  const pedido = modeloDaUrl();
  const passoInicial = pedido && produtoPorId(catalogo, pedido) ? 2 : (itens.length ? 3 : 1);
  if (pedido && produtoPorId(catalogo, pedido)) escolherModelo(pedido);
  history.replaceState({ passo: passoInicial }, "");
  irParaPasso(passoInicial, { mexerNoHistorico: false });
}

iniciar();
