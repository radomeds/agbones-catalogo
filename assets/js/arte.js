/* Confere a arte do cliente no navegador dele.
   Nada e enviado: o arquivo e lido em memoria, medido e descartado.
   O objetivo e dizer na hora se aquele arquivo vai para producao ou se
   vai precisar de redesenho — em vez de descobrir isso dias depois. */

const LADO_DA_AMOSTRA = 200;
const LIMITE_DE_CORES = 3000;

function extensaoDe(nome) {
  const partes = nome.toLowerCase().split(".");
  return partes.length > 1 ? partes.pop() : "";
}

/** Le a imagem e mede tamanho, transparencia e variedade de cores. */
async function medirImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = await new Promise((resolver, rejeitar) => {
      const elemento = new Image();
      elemento.onload = () => resolver(elemento);
      elemento.onerror = () => rejeitar(new Error("imagem ilegivel"));
      elemento.src = url;
    });

    const tela = document.createElement("canvas");
    tela.width = LADO_DA_AMOSTRA;
    tela.height = LADO_DA_AMOSTRA;
    const pincel = tela.getContext("2d", { willReadFrequently: true });
    // sem suavizacao: reduzir sem inventar cor que nao existe no original
    pincel.imageSmoothingEnabled = false;
    pincel.drawImage(imagem, 0, 0, LADO_DA_AMOSTRA, LADO_DA_AMOSTRA);

    const pixels = pincel.getImageData(0, 0, LADO_DA_AMOSTRA, LADO_DA_AMOSTRA).data;
    const cores = new Set();
    let temTransparencia = false;
    for (let posicao = 0; posicao < pixels.length; posicao += 4) {
      if (pixels[posicao + 3] < 250) temTransparencia = true;
      cores.add((pixels[posicao] << 16) | (pixels[posicao + 1] << 8) | pixels[posicao + 2]);
    }

    return {
      largura: imagem.naturalWidth,
      altura: imagem.naturalHeight,
      temTransparencia,
      cores: cores.size,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Confere o arquivo e devolve o veredito para a tela e para o WhatsApp.
    nivel: "ok" (serve), "atencao" (serve com ressalva) ou "redesenho". */
/** Diz se dá para mostrar este arquivo na tela.
    PDF, AI, CDR e EPS são ótimos para produzir e impossíveis de desenhar aqui. */
export function podeMostrarNaTela(arquivo) {
  const extensao = extensaoDe(arquivo.name);
  return ["png", "jpg", "jpeg", "webp", "svg"].includes(extensao);
}

/** Endereço temporário da imagem, para desenhar no boné.
    Vale só nesta aba: nada é enviado e nada é guardado. */
export function enderecoParaMostrar(arquivo) {
  return podeMostrarNaTela(arquivo) ? URL.createObjectURL(arquivo) : null;
}

export async function conferirArte(catalogo, arquivo) {
  const regras = catalogo.arte;
  const extensao = extensaoDe(arquivo.name);
  const vetores = regras.formatos_vetor.map((formato) => formato.toLowerCase());
  const imagens = regras.formatos_imagem.map((formato) => formato.toLowerCase());
  const tamanho = `${Math.max(1, Math.round(arquivo.size / 1024))} KB`;

  if (vetores.includes(extensao)) {
    return {
      nivel: "ok",
      titulo: "Arquivo em vetor — é o que precisamos.",
      detalhe: `${arquivo.name} · ${tamanho}. Vai direto para o layout, sem redesenho.`,
      resumo: `${arquivo.name} (vetor ${extensao.toUpperCase()})`,
    };
  }

  if (!imagens.includes(extensao)) {
    return {
      nivel: "atencao",
      titulo: "Não reconhecemos esse formato.",
      detalhe: `Aceitamos ${regras.formatos_vetor.join(", ")} em vetor e ${regras.formatos_imagem.join(", ")} em imagem. Mande assim mesmo pelo WhatsApp que a gente confere.`,
      resumo: `${arquivo.name} (formato a conferir)`,
    };
  }

  let medida;
  try {
    medida = await medirImagem(arquivo);
  } catch (erro) {
    return {
      nivel: "atencao",
      titulo: "Não conseguimos abrir essa imagem aqui.",
      detalhe: "Mande pelo WhatsApp que a gente confere do nosso lado.",
      resumo: `${arquivo.name} (não foi possível conferir)`,
    };
  }

  const menorLado = Math.min(medida.largura, medida.altura);
  const dimensoes = `${medida.largura}×${medida.altura} px`;
  const fundo = medida.temTransparencia ? "fundo transparente" : "fundo sólido";
  const resumo = `${arquivo.name} (${dimensoes}, ${fundo})`;

  // Muita cor e nenhum transparente: quase sempre e foto ou mockup do boné
  // pronto, nao a logo isolada. E o caso classico da imagem gerada por IA.
  if (medida.cores > LIMITE_DE_CORES && !medida.temTransparencia) {
    return {
      nivel: "redesenho",
      titulo: "Isso parece uma foto ou um mockup, não a sua logo isolada.",
      detalhe:
        `${dimensoes}. Serve muito bem como referência do que você quer — mande junto. ` +
        "Mas para produzir precisamos da logo separada, em vetor ou PNG de fundo transparente. " +
        "Se você não tiver, nós redesenhamos e mandamos para aprovar.",
      resumo: `${resumo} — parece referência, não arte`,
    };
  }

  if (menorLado < regras.largura_minima_px) {
    return {
      nivel: "redesenho",
      titulo: "Imagem pequena demais para bordar.",
      detalhe:
        `${dimensoes}, e trabalhamos a partir de ${regras.largura_minima_px} px. ` +
        "Se tiver o arquivo original em vetor, é ele que resolve. Senão, redesenhamos a sua logo.",
      resumo: `${resumo} — abaixo de ${regras.largura_minima_px} px`,
    };
  }

  if (!medida.temTransparencia) {
    return {
      nivel: "atencao",
      titulo: "Boa resolução, mas o fundo não é transparente.",
      detalhe:
        `${dimensoes}. Dá para trabalhar: recortamos o fundo e te mandamos o layout para aprovar. ` +
        "Se tiver a versão em vetor, mande que fica mais rápido.",
      resumo,
    };
  }

  return {
    nivel: "ok",
    titulo: "Essa imagem serve.",
    detalhe: `${dimensoes}, fundo transparente. Seguimos com ela para o layout.`,
    resumo,
  };
}
