/* Zoom com dois dedos na foto do boné (e roda do mouse no computador).
   Dois toques rápidos alternam entre perto e longe. Só mexe no CSS:
   a foto continua sendo desenhada no tamanho de sempre. */

const MINIMO = 1;
const MAXIMO = 3;

export function ligarZoom(elemento, { aoUsar } = {}) {
  const dedos = new Map();
  let escala = 1, dx = 0, dy = 0;
  let inicio = null;
  let ultimoToque = 0;

  function aplicar() {
    // não deixa a foto fugir da caixa: o quanto ela cresceu é o quanto pode andar
    const caixa = elemento.getBoundingClientRect();
    const largura = caixa.width / escala, altura = caixa.height / escala;
    const folgaX = (largura * (escala - 1)) / 2, folgaY = (altura * (escala - 1)) / 2;
    dx = Math.max(-folgaX, Math.min(folgaX, dx));
    dy = Math.max(-folgaY, Math.min(folgaY, dy));
    elemento.style.setProperty("--zoom", String(escala));
    elemento.style.setProperty("--zoom-x", `${dx}px`);
    elemento.style.setProperty("--zoom-y", `${dy}px`);
    elemento.classList.toggle("com-zoom", escala > 1.01);
  }

  function voltar() {
    escala = 1; dx = 0; dy = 0;
    aplicar();
  }

  function distancia() {
    const [a, b] = [...dedos.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function meio() {
    const [a, b] = [...dedos.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  elemento.addEventListener("pointerdown", (evento) => {
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    elemento.setPointerCapture?.(evento.pointerId);
    if (dedos.size === 2) {
      inicio = { distancia: distancia(), escala, meio: meio(), dx, dy };
      if (aoUsar) aoUsar();
    } else if (dedos.size === 1) {
      inicio = { arrasto: { x: evento.clientX, y: evento.clientY }, dx, dy };
      const agora = Date.now();
      if (evento.pointerType !== "mouse" && agora - ultimoToque < 300) {
        if (escala > 1.01) voltar();
        else { escala = 2; aplicar(); }
        if (aoUsar) aoUsar();
        ultimoToque = 0;
      } else {
        ultimoToque = agora;
      }
    }
  });

  elemento.addEventListener("pointermove", (evento) => {
    if (!dedos.has(evento.pointerId)) return;
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (dedos.size === 2 && inicio && inicio.distancia) {
      escala = Math.max(MINIMO, Math.min(MAXIMO, inicio.escala * (distancia() / inicio.distancia)));
      const m = meio();
      dx = inicio.dx + (m.x - inicio.meio.x);
      dy = inicio.dy + (m.y - inicio.meio.y);
      aplicar();
    } else if (dedos.size === 1 && inicio && inicio.arrasto && escala > 1.01) {
      dx = inicio.dx + (evento.clientX - inicio.arrasto.x);
      dy = inicio.dy + (evento.clientY - inicio.arrasto.y);
      aplicar();
    }
  });

  function soltar(evento) {
    dedos.delete(evento.pointerId);
    if (dedos.size === 1) {
      const [resto] = dedos.values();
      inicio = { arrasto: { x: resto.x, y: resto.y }, dx, dy };
    } else if (!dedos.size) {
      inicio = null;
      if (escala < 1.05) voltar();
    }
  }
  elemento.addEventListener("pointerup", soltar);
  elemento.addEventListener("pointercancel", soltar);

  elemento.addEventListener("wheel", (evento) => {
    evento.preventDefault();
    escala = Math.max(MINIMO, Math.min(MAXIMO, escala * (evento.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (escala < 1.02) { voltar(); return; }
    aplicar();
    if (aoUsar) aoUsar();
  }, { passive: false });

  elemento.addEventListener("dblclick", () => {
    if (escala > 1.01) voltar();
    else { escala = 2; aplicar(); }
  });

  return { voltar };
}
