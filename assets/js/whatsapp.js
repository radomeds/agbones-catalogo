/* Monta a mensagem de WhatsApp com o pedido inteiro ja escrito.
   E o fechamento do site: o cliente sai daqui com a especificacao pronta. */

import { formatarMoeda, calcularPrazo, formatarData, linhaPorId } from "./comum.js";

/** Texto de um item do pedido, em linhas curtas para ler no celular. */
function descreverItem(catalogo, item, posicao) {
  const linha = linhaPorId(catalogo, item.linha);
  const partes = [
    `${posicao}. ${item.nome} — ${item.quantidade} un.`,
    `   Linha: ${linha ? linha.nome : "-"}`,
  ];
  // a construcao muda o material de cada parte, e com ele a tecnica possivel
  if (item.construcao) partes.push(`   Construção: ${item.construcao}`);
  // cada parte do boné com a sua técnica: é o que a produção precisa saber
  (item.aplicacoes || []).forEach((aplicacao) => {
    partes.push(`   ${aplicacao.parte}: ${aplicacao.tecnica}` +
      (aplicacao.observacao ? ` — ${aplicacao.observacao}` : ""));
  });
  if (!item.aplicacoes || !item.aplicacoes.length) {
    partes.push("   Personalização: a definir");
  }
  if (item.cores) partes.push(`   Cores: ${item.cores}`);
  Object.entries(item.variacoes || {}).forEach(([nome, valor]) => {
    partes.push(`   ${nome.charAt(0).toUpperCase() + nome.slice(1)}: ${valor}`);
  });

  const arte = item.arte;
  if (arte && arte.origem) {
    partes.push(`   Arte: ${arte.origem}${arte.redesenho ? " (precisa de redesenho)" : ""}`);
    if (arte.arquivo) partes.push(`   Arquivo conferido no site: ${arte.arquivo}`);
  }
  if (item.observacoes) partes.push(`   Obs.: ${item.observacoes}`);
  partes.push(
    item.total === null
      ? "   Valor: sob consulta"
      : `   Valor: ${formatarMoeda(item.unitario)}/un · ${formatarMoeda(item.total)}`,
  );
  return partes.join("\n");
}

/** Mensagem completa do pedido. */
export function montarMensagemWhatsapp(catalogo, pedido) {
  const linhas = [];
  linhas.push(`*Pedido ${pedido.referencia}* — montado no site`);
  linhas.push("");

  pedido.itens.forEach((item, indice) => {
    linhas.push(descreverItem(catalogo, item, indice + 1));
    linhas.push("");
  });

  const algumSemPreco = pedido.itens.some((item) => item.total === null);
  const soma = pedido.itens.reduce((acumulado, item) => acumulado + (item.total || 0), 0);
  const totalPecas = pedido.itens.reduce((acumulado, item) => acumulado + item.quantidade, 0);

  linhas.push(`Total de peças: ${totalPecas}`);
  linhas.push(
    algumSemPreco
      ? "Total: sob consulta (preciso do orçamento de vocês)"
      : `*Total: ${formatarMoeda(soma)}* (frete à parte)`,
  );
  linhas.push("");
  linhas.push(`Prazo estimado se eu aprovar hoje: ${formatarData(calcularPrazo(20))} (20 dias úteis).`);

  const artes = pedido.itens.map((item) => item.arte).filter(Boolean);
  if (artes.some((arte) => arte.redesenho)) {
    linhas.push("");
    linhas.push(
      "Sei que imagem de referência não é arte de produção: vocês redesenham em vetor e me mandam o layout para eu aprovar antes de produzir.",
    );
  }
  if (artes.some((arte) => arte.origem)) {
    linhas.push("");
    linhas.push("*Vou anexar aqui nesta conversa:*");
    linhas.push("- minha logo, no melhor arquivo que eu tiver (vetor, se houver)");
    linhas.push("- a imagem de referência do boné, se eu tiver feito uma");
  }

  if (pedido.cliente && pedido.cliente.trim()) {
    linhas.push("");
    linhas.push(`Meu nome/empresa: ${pedido.cliente.trim()}`);
  }

  return linhas.join("\n");
}

/** Link wa.me com a mensagem ja codificada. */
export function linkWhatsapp(numero, mensagem) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/** Abre a conversa em aba nova. */
export function abrirWhatsapp(catalogo, pedido) {
  const mensagem = montarMensagemWhatsapp(catalogo, pedido);
  window.open(linkWhatsapp(catalogo.empresa.whatsapp, mensagem), "_blank", "noopener");
}
