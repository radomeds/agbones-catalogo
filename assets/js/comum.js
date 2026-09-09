/* Funcoes compartilhadas pelas paginas do site.
   Todo o conteudo do catalogo vem de dados/produtos.json — nunca do HTML. */

const CAMINHO_CATALOGO = "dados/produtos.json";
let catalogoEmCache = null;

/** Le o catalogo uma unica vez por sessao de pagina. */
export async function carregarCatalogo() {
  if (catalogoEmCache) return catalogoEmCache;
  const resposta = await fetch(CAMINHO_CATALOGO, { cache: "no-cache" });
  if (!resposta.ok) throw new Error("Nao foi possivel carregar o catalogo.");
  catalogoEmCache = await resposta.json();
  return catalogoEmCache;
}

export function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function linhaPorId(catalogo, id) {
  return catalogo.linhas.find((linha) => linha.id === id) || null;
}

export function produtoPorId(catalogo, id) {
  return catalogo.produtos.find((produto) => produto.id === id) || null;
}

/* ---------- Ficha técnica: o que cabe em cada parte da peça ----------

   A regra do mapa: a arte não é uma imagem em cima do boné. Ela só vale se
   couber na construção física real. Por isso a técnica oferecida numa área
   sai do cruzamento de três coisas — o material daquela parte na construção
   escolhida, o que a fábrica libera para o modelo, e as restrições da própria
   área (costura, vinco, fita estreita). */

/** A construção escolhida, ou a que vem marcada como padrão. */
export function construcaoDoProduto(produto, id = null) {
  const construcoes = produto.construcoes || [];
  if (id) {
    const achada = construcoes.find((item) => item.id === id);
    if (achada) return achada;
  }
  return construcoes.find((item) => item.padrao) || construcoes[0] || null;
}

/** Material daquela área na construção escolhida. */
export function materialDaArea(construcao, areaId) {
  if (!construcao || !construcao.materiais) return null;
  return construcao.materiais[areaId] || null;
}

export function tecnicaPorId(catalogo, id) {
  return catalogo.tecnicas.find((tecnica) => tecnica.id === id) || null;
}

/** Fechos que a construção aceita. "todos" libera a lista inteira. */
export function fechosDaConstrucao(catalogo, construcao) {
  const todos = catalogo.fechos.valores;
  if (!construcao || construcao.fechos === "todos" || !construcao.fechos) return todos;
  return construcao.fechos.map((id) => todos.find((f) => f.id === id)).filter(Boolean);
}

/**
 * Técnicas que podem ser aplicadas numa área.
 * Devolve { permitidas, recomendada, restricao } — nunca uma técnica que a
 * peça não aceita.
 */
export function tecnicasDaArea(catalogo, produto, construcao, area) {
  const material = materialDaArea(construcao, area.id);
  const restricao = area.restricao || null;

  let permitidas = catalogo.tecnicas.filter((tecnica) => {
    // 1. a técnica precisa servir para o material daquela parte
    if (material && !tecnica.materiais.includes(material)) return false;
    // 2. a fábrica pode limitar o que o modelo aceita
    if (produto.tecnicas && !produto.tecnicas.includes(tecnica.id)) return false;
    // 3. a área pode aceitar só um punhado (a fita de couro, por exemplo)
    if (area.somente && !area.somente.includes(tecnica.id)) return false;
    // 4. costura ou vinco pode impedir uma técnica ali
    if (restricao && (restricao.bloqueia || []).includes(tecnica.id)) return false;
    return true;
  });

  /* A ficha da area manda; se ela nao disser nada, vale a tecnica tipica da
     linha — promocional e DTF, premium e bordado. E so um destaque na tela. */
  const linha = linhaPorId(catalogo, produto.linha);
  const sugerida = area.recomendada || (linha ? linha.recomendada : null);
  const recomendada = sugerida
    ? permitidas.find((tecnica) => tecnica.id === sugerida) || null
    : null;

  // a recomendada vem primeiro, para o cliente ver o caminho sugerido
  if (recomendada) {
    permitidas = [recomendada, ...permitidas.filter((t) => t.id !== recomendada.id)];
  }

  return { permitidas, recomendada, restricao, material };
}

/** Menor pedido aceito para o produto: o da linha, mas a categoria pode ter
    minimo proprio — chapeu sai de 30, mesmo sendo premium. */
export function minimoDoProduto(catalogo, produto) {
  const linha = linhaPorId(catalogo, produto.linha);
  const daLinha = linha && linha.minimo ? linha.minimo : 0;
  const daCategoria = (catalogo.minimo_por_categoria || {})[produto.categoria];
  return Math.max(daLinha, typeof daCategoria === "number" ? daCategoria : 0);
}

/** Faixa de quantidade que contem o numero informado. */
export function faixaDaQuantidade(catalogo, quantidade) {
  return catalogo.faixas_quantidade.find((faixa) => {
    const acimaDoMinimo = quantidade >= faixa.min;
    const abaixoDoMaximo = faixa.max === null || quantidade <= faixa.max;
    return acimaDoMinimo && abaixoDoMaximo;
  }) || null;
}

/** Preco unitario do produto na quantidade pedida.
    Devolve null quando a tabela ainda nao tem o valor — vira "sob consulta". */
export function precoUnitario(catalogo, produto, quantidade) {
  const faixa = faixaDaQuantidade(catalogo, quantidade);
  if (!faixa) return null;
  const preco = produto.precos ? produto.precos[faixa.id] : null;
  return typeof preco === "number" ? preco : null;
}

/** Acrescimo por unidade das tecnicas escolhidas.
    Devolve null se alguma tecnica ainda nao tem valor na tabela — o que vira
    "sob consulta" na tela, em vez de um preco inventado. */
export function acrescimoDasTecnicas(catalogo, idsEscolhidos) {
  let total = 0;
  for (const id of idsEscolhidos) {
    const tecnica = tecnicaPorId(catalogo, id);
    if (!tecnica || typeof tecnica.acrescimo_unidade !== "number") return null;
    total += tecnica.acrescimo_unidade;
  }
  return total;
}

/** Data prevista de entrega: 20 dias uteis a partir de hoje.
    Nao considera feriado — e estimativa, e o texto do site avisa. */
export function calcularPrazo(diasUteis = 20, inicio = new Date()) {
  const data = new Date(inicio.getTime());
  let contados = 0;
  while (contados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const diaDaSemana = data.getDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) contados += 1;
  }
  return data;
}

export function formatarData(data) {
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Codigo curto para o cliente e a AG Bones citarem o mesmo pedido. */
export function gerarReferencia(agora = new Date()) {
  const doisDigitos = (numero) => String(numero).padStart(2, "0");
  const dia = doisDigitos(agora.getDate());
  const mes = doisDigitos(agora.getMonth() + 1);
  const sorteio = String(Math.floor(Math.random() * 900) + 100);
  return `AG-${dia}${mes}-${sorteio}`;
}

/** Monta o cartao de um modelo. Serve para a vitrine (link) e para o
    configurador (botao selecionavel). */
export function montarCartaoModelo(catalogo, produto, { como = "link", href = "#" } = {}) {
  const elemento = document.createElement(como === "link" ? "a" : "button");
  elemento.className = "modelo";
  elemento.dataset.produto = produto.id;
  elemento.dataset.linha = produto.linha;
  elemento.dataset.categoria = produto.categoria;
  if (como === "link") {
    elemento.href = href;
  } else {
    elemento.type = "button";
    elemento.setAttribute("aria-pressed", "false");
  }

  // no celular o cartão é estreito: nome da linha + mínimo quebra em três
  // linhas e some. O mínimo é a informação que o cliente precisa ver aqui
  const quantas = minimoDoProduto(catalogo, produto);
  const minimo = quantas ? `a partir de ${quantas} un.` : "";

  const foto = document.createElement("img");
  foto.className = "modelo__foto";
  // o cartão tem 170px no celular: a foto da ficha aqui seria peso jogado fora
  foto.src = produto.imagem.replace("assets/produtos/", "assets/produtos/mini/");
  // "Boné modelo Chapéu de Palha" estava saindo errado no leitor de tela
  foto.alt = produto.categoria === "bone" ? `Boné modelo ${produto.nome}` : produto.nome;
  foto.loading = "lazy";
  foto.decoding = "async";
  foto.width = 360;
  foto.height = 360;

  const corpo = document.createElement("div");
  corpo.className = "modelo__corpo";
  const nome = document.createElement("span");
  nome.className = "modelo__nome";
  nome.textContent = produto.nome;
  const rodape = document.createElement("span");
  rodape.className = "modelo__linha";
  rodape.textContent = minimo;
  corpo.append(nome, document.createElement("br"), rodape);

  elemento.append(foto, corpo);
  return elemento;
}

/** Preenche os dados da empresa nos pontos marcados com data-empresa. */
export function preencherDadosEmpresa(catalogo) {
  const empresa = catalogo.empresa;
  document.querySelectorAll("[data-empresa]").forEach((elemento) => {
    const chave = elemento.dataset.empresa;
    if (empresa[chave]) elemento.textContent = empresa[chave];
  });
  document.querySelectorAll("[data-empresa-href]").forEach((elemento) => {
    const chave = elemento.dataset.empresaHref;
    if (chave === "whatsapp") elemento.href = `https://wa.me/${empresa.whatsapp}`;
    if (chave === "email") elemento.href = `mailto:${empresa.email}`;
    if (chave === "instagram") elemento.href = `https://instagram.com/${empresa.instagram}`;
    if (chave === "facebook") elemento.href = `https://facebook.com/${empresa.facebook}`;
  });
}
