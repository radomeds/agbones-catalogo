/* O boné em 3D, montado em código: cada parte é uma peça própria (gomos da frente,
   laterais, traseira, aba, botão, regulador), para o cliente trocar a cor de uma
   parte só e ver na hora. Nada de modelo 3D baixado: as formas saem de poucos
   números (altura da copa, número de gomos, aba reta ou curva, tela atrás), e é
   por isso que o mesmo código desenha o trucker, o americano, o aba reta e o
   dad hat. Chapéu e viseira saem do mesmo jeito, com outro desenho.
   Motor: three.js (MIT), em assets/js/terceiros/three/. */

import * as THREE from "three";
import { OrbitControls } from "./terceiros/three/OrbitControls.js";
import { RoomEnvironment } from "./terceiros/three/RoomEnvironment.js";
import { DecalGeometry } from "./terceiros/three/DecalGeometry.js";
import {
  MEDIDAS_PADRAO, CAMPOS_DE_AJUSTE, DESENHOS, medidasDe, RASCUNHO_DE_AJUSTES, carregarAjustes, partesDoDesenho,
} from "./desenhos.js";

export {
  MEDIDAS_PADRAO, CAMPOS_DE_AJUSTE, DESENHOS, medidasDe, RASCUNHO_DE_AJUSTES, carregarAjustes, partesDoDesenho,
};

const GRAU = Math.PI / 180;

/* ---------- texturas feitas na hora (sem baixar imagem nenhuma) ---------- */

function telaDeDesenho(largura, altura = largura) {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  return tela;
}

/** Relevo de sarja: as diagonais finas do tecido de boné. */
function texturaSarja() {
  const tela = telaDeDesenho(128);
  const c = tela.getContext("2d");
  c.fillStyle = "#808080";
  c.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 256; i += 4) {
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i + 128, 128);
    c.stroke();
  }
  // um pouco de irregularidade, que tecido de verdade não é perfeito
  const ruido = c.getImageData(0, 0, 128, 128);
  for (let i = 0; i < ruido.data.length; i += 4) {
    const d = (Math.random() - 0.5) * 30;
    ruido.data[i] += d;
    ruido.data[i + 1] += d;
    ruido.data[i + 2] += d;
  }
  c.putImageData(ruido, 0, 0);
  const textura = new THREE.CanvasTexture(tela);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

/** Furos da tela (o "mesh" do trucker): colmeia vazada. */
function texturaFurosTela() {
  const tela = telaDeDesenho(64);
  const c = tela.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = "#000";
  const furo = (x, y) => {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 + 30) * GRAU;
      c.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    }
    c.fill();
  };
  [[16, 16], [48, 16], [0, 48], [32, 48], [64, 48], [16, 80], [48, 80], [-16, 16], [80, 16], [16, -16], [48, -16]].forEach(([x, y]) => furo(x, y));
  const textura = new THREE.CanvasTexture(tela);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

/** Pespontos da aba: as fileiras de costura que todo boné tem. */
function texturaPespontoAba(fileiras) {
  const tela = telaDeDesenho(512, 256);
  const c = tela.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, 512, 256);
  c.strokeStyle = "rgba(0,0,0,.28)";
  c.lineWidth = 2;
  c.setLineDash([7, 5]);
  fileiras.forEach((v) => {
    c.beginPath();
    c.moveTo(0, v * 256);
    c.lineTo(512, v * 256);
    c.stroke();
  });
  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

/** Palha trançada, para o chapéu de palha e o de juta. */
function texturaPalha(juta) {
  const tela = telaDeDesenho(128);
  const c = tela.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      const cruzado = ((x + y) / 8) % 2 === 0;
      c.fillStyle = cruzado ? "rgba(0,0,0,.10)" : "rgba(0,0,0,.22)";
      if (juta) c.fillRect(x + 1, y + 1, 6, 6);
      else if (cruzado) c.fillRect(x, y + 2, 8, 4);
      else c.fillRect(x + 2, y, 4, 8);
    }
  }
  const textura = new THREE.CanvasTexture(tela);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/* ---------- materiais ---------- */

function materialTecido(sarja, cor) {
  return new THREE.MeshPhysicalMaterial({
    color: cor,
    roughness: 0.9,
    sheen: 0.45,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.12),
    envMapIntensity: 0.28,
    bumpMap: sarja,
    bumpScale: 1.2,
    side: THREE.DoubleSide,
  });
}

function materialTela(furos, cor) {
  return new THREE.MeshPhysicalMaterial({
    color: cor,
    roughness: 0.95,
    sheen: 0.3,
    sheenRoughness: 0.8,
    envMapIntensity: 0.28,
    alphaMap: furos,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}

/* ---------- formas ---------- */

/* Escala: 1 é o fundo da cabeça, da testa até o meio (cerca de 10 cm). Um boné
   tamanho 58 tem a boca com 0,8 de meia largura e 1 de meio fundo. */

/** O quanto o perfil da copa é "em pé" naquele giro: a frente de boné
    estruturado sobe quase reta e só arredonda no alto; a traseira cai em curva. */
function firmeza(forma, phi) {
  const peso = (1 + Math.cos(phi)) / 2; // 1 na frente, 0 atrás
  return forma.tras + (forma.frente - forma.tras) * peso;
}

/** Superfície da copa: φ é o giro em volta da cabeça (0 = frente), v vai da
    borda (0) ao botão do topo (1). Cada meridiano é uma superelipse que sai da
    boca do boné e chega no botão, que fica um pouco para trás do meio. */
function pontoDaCopa(forma, phi, v) {
  const p = firmeza(forma, phi);
  const t = (Math.min(1, Math.max(0, v)) * Math.PI) / 2;
  const roda = Math.pow(Math.max(0, Math.cos(t)), 2 / p);
  const sobe = Math.pow(Math.sin(t), 2 / p);
  const bx = forma.largura * Math.sin(phi);
  const bz = forma.fundura * Math.cos(phi);
  const az = forma.topo * forma.fundura;
  return new THREE.Vector3(bx * roda, forma.altura * sobe, az + (bz - az) * roda);
}

/** O v em que a copa chega a uma fração `h` da altura, naquele giro. */
function vDaAltura(forma, phi, h) {
  const p = firmeza(forma, phi);
  const alvo = Math.pow(Math.min(1, Math.max(0, h)), p / 2);
  return (2 / Math.PI) * Math.asin(Math.min(1, alvo));
}

/** A direção para fora da copa num ponto (para a arte deitar no tecido). */
function normalDaCopa(forma, phi, v) {
  const e = 1e-3;
  const centro = pontoDaCopa(forma, phi, v);
  const giro = pontoDaCopa(forma, phi + e, v).sub(pontoDaCopa(forma, phi - e, v));
  const subida = pontoDaCopa(forma, phi, v + e).sub(pontoDaCopa(forma, phi, Math.max(0, v - e)));
  const normal = new THREE.Vector3().crossVectors(giro, subida).normalize();
  const fora = centro.clone().sub(new THREE.Vector3(0, forma.altura * 0.3, forma.topo * forma.fundura));
  if (normal.dot(fora) < 0) normal.negate();
  return normal;
}

/** Um gomo (ou um pedaço da copa) entre dois ângulos, com um recorte opcional. */
function geometriaDaCopa(forma, phi0, phi1, { vMax = 1, recorte = null, passos = 40, aneis = 40 } = {}) {
  const posicoes = [];
  const uvs = [];
  const indices = [];
  const colunas = passos + 1;
  for (let j = 0; j <= aneis; j++) {
    const v = (j / aneis) * vMax;
    for (let i = 0; i <= passos; i++) {
      const phi = phi0 + ((phi1 - phi0) * i) / passos;
      const ponto = pontoDaCopa(forma, phi, v);
      posicoes.push(ponto.x, ponto.y, ponto.z);
      uvs.push((phi / (2 * Math.PI)) * 9, v * 3);
    }
  }
  for (let j = 0; j < aneis; j++) {
    for (let i = 0; i < passos; i++) {
      const phiMeio = phi0 + ((phi1 - phi0) * (i + 0.5)) / passos;
      const vMeio = ((j + 0.5) / aneis) * vMax;
      if (recorte && recorte(phiMeio, vMeio)) continue;
      const a = j * colunas + i;
      const b = a + 1;
      const c = a + colunas;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  return geometria;
}

/** Costura entre gomos: um cordão fino que acompanha o meridiano. */
function geometriaDaCostura(forma, phi, vMax = 1) {
  const pontos = [];
  for (let k = 0; k <= 40; k++) {
    const v = (k / 40) * vMax * 0.995;
    const ponto = pontoDaCopa(forma, phi, v).addScaledVector(normalDaCopa(forma, phi, Math.min(v, 0.98)), 0.004);
    pontos.push(ponto);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 60, 0.007, 6, false);
}

/** A aba, vista de cima, é meia superelipse presa na metade da frente da boca
    do boné: larga e quase reta na ponta, fechando rápido nos cantos. A aba curva
    desce nos lados (o arco que se vê de frente) e toda aba desce um pouco para
    a frente. */
function geometriaDaAba(forma, aba) {
  const { comprimento, largura, curva, inclinacao, ponta = 2.4, abertura = 86 } = aba;
  const passosT = 64;
  const passosS = 16;
  const espessura = 0.022;
  const posicoes = [];
  const uvs = [];
  const indices = [];
  const meia = abertura * GRAU;
  const larguraDaPonta = forma.largura * Math.sin(meia) * largura;
  const zDosCantos = forma.fundura * Math.cos(meia);
  const alcance = forma.fundura + comprimento - zDosCantos;

  const ponto = (t, s, lado) => {
    const angulo = t * meia;
    const dentro = new THREE.Vector3(forma.largura * Math.sin(angulo), 0, forma.fundura * Math.cos(angulo));
    const u = (t * Math.PI) / 2;
    const fora = new THREE.Vector3(
      larguraDaPonta * Math.sign(Math.sin(u)) * Math.pow(Math.abs(Math.sin(u)), 2 / ponta),
      0,
      zDosCantos + alcance * Math.pow(Math.abs(Math.cos(u)), 2 / ponta),
    );
    const p = dentro.clone().lerp(fora, s);
    const distancia = Math.hypot(p.x - dentro.x, p.z - dentro.z);
    // a curva cresce com a distância da costura: nos cantos, onde a aba é
    // estreita, ela quase não desce; senão vira uma parede do lado do boné
    const longe = Math.min(1, Math.pow(distancia / Math.max(0.2, comprimento), 0.7));
    p.y -= curva * Math.pow(p.x / larguraDaPonta, 2) * longe;
    p.y -= inclinacao * distancia;
    p.y += lado * espessura - 0.01;
    return p;
  };

  const faixa = (lado) => {
    const inicio = posicoes.length / 3;
    for (let j = 0; j <= passosS; j++) {
      const s = j / passosS;
      for (let i = 0; i <= passosT; i++) {
        const t = -1 + (2 * i) / passosT;
        const p = ponto(t, s, lado);
        posicoes.push(p.x, p.y, p.z);
        uvs.push(i / passosT, s);
      }
    }
    const colunas = passosT + 1;
    for (let j = 0; j < passosS; j++) {
      for (let i = 0; i < passosT; i++) {
        const a = inicio + j * colunas + i;
        const b = a + 1;
        const c = a + colunas;
        const d = c + 1;
        if (lado > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
    return inicio;
  };

  faixa(0.5);
  faixa(-0.5);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  // a parte de cima e a de baixo em grupos diferentes: cada uma com a sua cor
  const metade = indices.length / 2;
  geometria.setIndex(indices);
  geometria.addGroup(0, metade, 0);
  geometria.addGroup(metade, metade, 1);
  geometria.computeVertexNormals();

  // a borda da aba (o "debrum"): fecha a espessura na beirada e nos cantos
  const contorno = [];
  for (let i = 0; i <= passosT; i++) contorno.push(ponto(-1 + (2 * i) / passosT, 1, 0));
  const borda = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(contorno), 128, espessura * 0.62, 8, false);
  return { geometria, borda };
}

/** Chapéus: um perfil girado em volta do eixo (copa, aba e caimento). */
function geometriaDeChapeu(perfil, passos = 96) {
  const pontos = perfil.map(([x, y]) => new THREE.Vector2(x, y));
  const geometria = new THREE.LatheGeometry(pontos, passos);
  geometria.computeVertexNormals();
  return geometria;
}

/* De onde a câmera olha cada parte (para virar o boné sozinho quando o cliente
   escolhe a parte). Ângulo em graus em volta do boné; 0 é de frente. */
const VISTA_DA_PARTE = {
  frente: 28, laterais: 80, traseira: 180, aba: 25, "aba-baixo": 15, botao: 30,
  copa: 25, fita: 20, debrum: 25,
};

/* ---------- o palco ---------- */

export class PalcoDoBone {
  constructor(tela) {
    this.tela = tela;
    this.renderizador = new THREE.WebGLRenderer({ canvas: tela, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderizador.outputColorSpace = THREE.SRGBColorSpace;
    this.renderizador.toneMapping = THREE.NeutralToneMapping;
    this.renderizador.toneMappingExposure = 1;
    // sombra de verdade: a aba sombreia a frente, a copa sombreia a aba
    this.renderizador.shadowMap.enabled = true;
    this.renderizador.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderizador);
    this.cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const sol = new THREE.DirectionalLight(0xffffff, 2.6);
    sol.position.set(2.2, 3.6, 2.4);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.left = -2.2;
    sol.shadow.camera.right = 2.2;
    sol.shadow.camera.top = 2.2;
    sol.shadow.camera.bottom = -2.2;
    sol.shadow.camera.near = 0.5;
    sol.shadow.camera.far = 12;
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.025;
    sol.shadow.radius = 4;
    this.cena.add(sol);
    this.cena.add(sol.target);
    const contraluz = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    contraluz.position.set(-3, 2, -2.5);
    this.cena.add(contraluz);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(2.4, 1.05, 4.6);

    this.controles = new OrbitControls(this.camera, tela);
    this.controles.enablePan = false;
    this.controles.enableDamping = true;
    this.controles.minDistance = 3.2;
    this.controles.maxDistance = 12;
    this.controles.minPolarAngle = 20 * GRAU;
    this.controles.maxPolarAngle = 100 * GRAU;
    this.controles.target.set(0, 0.32, 0.25);
    this.controles.autoRotate = true;
    this.controles.autoRotateSpeed = 1.1;
    this.controles.addEventListener("start", () => {
      this.controles.autoRotate = false;
      this.alvoDeGiro = null;
    });

    this.sarja = texturaSarja();
    this.furos = texturaFurosTela();
    this.cores = {};
    this.materiais = {};
    this.arte = null;
    this.alvoDeGiro = null;
    this.ajustes = {};
    this.raioDoModelo = 1.45;

    this.sombra = this.criarSombra();
    this.cena.add(this.sombra);

    this.redimensionar();
    new ResizeObserver(() => this.redimensionar()).observe(tela);
    this.renderizador.setAnimationLoop(() => this.quadro());
  }

  criarSombra() {
    const tela = telaDeDesenho(128);
    const c = tela.getContext("2d");
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,.42)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    const plano = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tela), transparent: true, depthWrite: false }),
    );
    plano.rotation.x = -Math.PI / 2;
    plano.position.set(0, -0.2, 0.35);
    return plano;
  }

  redimensionar() {
    const { clientWidth: l, clientHeight: a } = this.tela;
    if (!l || !a) return;
    this.renderizador.setSize(l, a, false);
    this.camera.aspect = l / a;
    this.camera.updateProjectionMatrix();
    this.enquadrar();
  }

  /** Afasta a câmera o bastante para o boné inteiro caber, em pé ou deitado. */
  enquadrar() {
    const meiaAltura = Math.tan((this.camera.fov / 2) * GRAU);
    const caber = this.raioDoModelo * 1.02; // o boné inteiro, de qualquer lado
    const distancia = caber / (meiaAltura * Math.min(1, this.camera.aspect));
    const alvo = this.controles.target;
    const direcao = this.camera.position.clone().sub(alvo).normalize();
    this.camera.position.copy(alvo).addScaledVector(direcao, distancia);
    this.controles.minDistance = distancia * 0.6;
    this.controles.maxDistance = distancia * 1.6;
  }

  quadro() {
    if (this.alvoDeGiro !== null) {
      // gira devagar até a parte escolhida ficar de frente para o cliente
      const alvo = this.controles.target;
      const atual = Math.atan2(this.camera.position.x - alvo.x, this.camera.position.z - alvo.z);
      let diferenca = this.alvoDeGiro - atual;
      diferenca = Math.atan2(Math.sin(diferenca), Math.cos(diferenca));
      if (Math.abs(diferenca) < 0.01) this.alvoDeGiro = null;
      else {
        const passo = diferenca * 0.12;
        const deslocado = this.camera.position.clone().sub(alvo);
        deslocado.applyAxisAngle(new THREE.Vector3(0, 1, 0), passo);
        this.camera.position.copy(alvo).add(deslocado);
      }
    }
    this.controles.update();
    this.renderizador.render(this.cena, this.camera);
  }

  /** Vira o boné para mostrar uma parte. */
  olharPara(parte) {
    const angulo = VISTA_DA_PARTE[parte];
    if (angulo === undefined) return;
    this.controles.autoRotate = false;
    this.alvoDeGiro = angulo * GRAU;
  }

  /** Põe a câmera num ângulo exato (graus): 0 é de frente; 90, do lado; elevação 90 é de cima. */
  vista(azimute, elevacao = 8) {
    this.controles.autoRotate = false;
    this.alvoDeGiro = null;
    const alvo = this.controles.target;
    const distancia = this.camera.position.distanceTo(alvo);
    const a = azimute * GRAU;
    const e = Math.min(89.5, elevacao) * GRAU;
    this.camera.position.set(
      alvo.x + distancia * Math.cos(e) * Math.sin(a),
      alvo.y + distancia * Math.sin(e),
      alvo.z + distancia * Math.cos(e) * Math.cos(a),
    );
    this.controles.minPolarAngle = 0;
    this.controles.update();
  }

  /** Mede o modelo montado: a câmera mira o meio dele e se afasta o bastante
      para ele caber de qualquer lado; a sombra vai para debaixo dele. */
  medirModelo() {
    const caixa = new THREE.Box3().setFromObject(this.grupo);
    if (caixa.isEmpty()) return;
    const esfera = caixa.getBoundingSphere(new THREE.Sphere());
    const deslocamento = esfera.center.clone().sub(this.controles.target);
    this.controles.target.copy(esfera.center);
    this.camera.position.add(deslocamento);
    this.raioDoModelo = esfera.radius;
    this.sombra.position.set(esfera.center.x, caixa.min.y - 0.01, esfera.center.z);
    const lado = Math.max(caixa.max.x - caixa.min.x, caixa.max.z - caixa.min.z) * 1.15;
    this.sombra.scale.set(lado / 3.4, lado / 3.4, 1);
    this.enquadrar();
  }

  /** O ajuste fino do ADM ({ modelo: { copa, aba, arte } }); remonta o que está na tela. */
  definirAjustes(ajustes) {
    this.ajustes = ajustes || {};
    if (this.id) this.montar(this.id, this.cores);
  }

  /** Troca o modelo inteiro. `cores` é { parte: "#hex" }. */
  montar(id, cores = {}) {
    if (this.grupo) {
      this.cena.remove(this.grupo);
      this.grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.id = id;
    this.desenho = DESENHOS[id];
    this.materiais = {};
    this.cores = { ...cores };
    this.grupo = new THREE.Group();
    this.alvoDaArte = null;
    if (!this.desenho) return;
    this.medidas = medidasDe(id, this.ajustes);
    if (this.desenho.tipo === "bone") this.montarBone(this.desenho);
    else if (this.desenho.tipo === "viseira") this.montarViseira(this.desenho);
    else this.montarChapeu(this.desenho);
    this.grupo.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.cena.add(this.grupo);
    this.medirModelo();
    Object.entries(this.cores).forEach(([parte, cor]) => this.pintar(parte, cor));
    if (this.arte) this.colocarArte(this.arte);
  }

  material(parte, criar) {
    if (!this.materiais[parte]) this.materiais[parte] = [];
    const material = criar();
    this.materiais[parte].push(material);
    return material;
  }

  tecido(parte, padrao = "#f2f2f2") {
    return this.material(parte, () => materialTecido(this.sarja, new THREE.Color(this.cores[parte] || padrao)));
  }

  /** Pinta uma parte. Aceita "todo" para o boné inteiro. */
  pintar(parte, cor) {
    if (parte === "todo") {
      Object.keys(this.materiais).forEach((p) => {
        if (p !== "costura-fixa") this.pintar(p, cor);
      });
      return;
    }
    this.cores[parte] = cor;
    (this.materiais[parte] || []).forEach((material) => material.color.set(cor));
    // a costura acompanha a parte, um tom acima, como linha da mesma cor
    (this.materiais[`costura-${parte}`] || []).forEach((material) => {
      material.color.set(cor).offsetHSL(0, 0, -0.06);
    });
  }

  montarBone(d) {
    const m = this.medidas;
    const forma = { ...m.copa };
    this.forma = forma;
    const fatia = (2 * Math.PI) / (d.gomos === 5 ? 5 : 6);
    // gomos: na de 6 a frente são dois gomos com costura no meio; na de 5, um só
    const gomos = [];
    if (d.gomos === 6) {
      for (let k = 0; k < 6; k++) gomos.push([-fatia + k * fatia, k * fatia]);
    } else {
      const frente = 108 * GRAU;
      const resto = (2 * Math.PI - frente) / 4;
      gomos.push([-frente / 2, frente / 2]);
      for (let k = 0; k < 4; k++) gomos.push([frente / 2 + k * resto, frente / 2 + (k + 1) * resto]);
    }

    const parteDoGomo = (centro) => {
      const angulo = Math.atan2(Math.sin(centro), Math.cos(centro));
      const absoluto = Math.abs(angulo);
      if (absoluto < 62 * GRAU) return "frente";
      if (absoluto < 130 * GRAU) return "laterais";
      return "traseira";
    };

    // a abertura do regulador, atrás, embaixo: um arco de uns 6 cm por 4
    const recorte = d.fecho === "fechado" ? null : (phi, v) => {
      const atras = Math.atan2(Math.sin(phi - Math.PI), Math.cos(phi - Math.PI));
      const meia = 0.36;
      if (Math.abs(atras) > meia) return false;
      const altura = Math.pow(Math.sin((v * Math.PI) / 2), 2 / firmeza(forma, phi));
      return altura < 0.34 * Math.sqrt(1 - Math.pow(atras / meia, 2));
    };

    gomos.forEach(([a, b]) => {
      const parte = parteDoGomo((a + b) / 2);
      const usaTela = d.tela && parte !== "frente";
      const material = usaTela
        ? this.material(parte, () => materialTela(this.furos, new THREE.Color(this.cores[parte] || "#f2f2f2")))
        : this.tecido(parte);
      if (usaTela) this.furos.repeat.set(5, 9);
      const malha = new THREE.Mesh(geometriaDaCopa(forma, a, b, { recorte }), material);
      malha.userData.parte = parte;
      this.grupo.add(malha);
      const costura = this.material(`costura-${parte}`, () => new THREE.MeshStandardMaterial({ roughness: 0.9 }));
      costura.color.set(this.cores[parte] || "#f2f2f2").offsetHSL(0, 0, -0.06);
      this.grupo.add(new THREE.Mesh(geometriaDaCostura(forma, a), costura));

      // o ilhós de cada gomo (o furinho de ventilação bordado), no alto do gomo
      if (!usaTela) {
        const centro = (a + b) / 2;
        const v = vDaAltura(forma, centro, 0.8);
        const ponto = pontoDaCopa(forma, centro, v);
        const normal = normalDaCopa(forma, centro, v);
        const ilhos = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 8, 20), costura);
        ilhos.position.copy(ponto).addScaledVector(normal, 0.004);
        ilhos.lookAt(ponto.clone().add(normal));
        this.grupo.add(ilhos);
      }
    });

    // o forro por dentro (o lado de dentro aparece quando o boné vira)
    const forro = new THREE.Mesh(
      geometriaDaCopa({ ...forma, largura: forma.largura * 0.985, fundura: forma.fundura * 0.985, altura: forma.altura * 0.985 }, 0, 2 * Math.PI, { recorte, passos: 120 }),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1, side: THREE.BackSide }),
    );
    this.grupo.add(forro);

    // o botão do topo
    const botao = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 12), this.tecido("botao"));
    botao.scale.set(1, 0.42, 1);
    botao.position.copy(pontoDaCopa(forma, 0, 1)).add(new THREE.Vector3(0, 0.01, 0));
    this.grupo.add(botao);

    // a aba
    this.montarAba(forma, m.aba, m.aba.curva < 0.08 ? [0.18, 0.36, 0.54, 0.72, 0.9] : [0.25, 0.5, 0.75, 0.92]);

    // o regulador, na base do arco de trás
    if (d.fecho === "snap" || d.fecho === "fivela") {
      const pontos = [];
      for (let k = 0; k <= 20; k++) {
        const phi = Math.PI - 0.4 + (0.8 * k) / 20;
        const v = vDaAltura(forma, phi, 0.05);
        pontos.push(pontoDaCopa(forma, phi, v).addScaledVector(normalDaCopa(forma, phi, v), 0.012));
      }
      const tira = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 40, 0.026, 6, false),
        d.fecho === "snap"
          ? new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45 })
          : this.tecido("traseira"),
      );
      this.grupo.add(tira);
      if (d.fecho === "fivela") {
        const phi = Math.PI + 0.14;
        const v = vDaAltura(forma, phi, 0.05);
        const fivela = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.06, 0.02),
          new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.3 }),
        );
        const normal = normalDaCopa(forma, phi, v);
        fivela.position.copy(pontoDaCopa(forma, phi, v)).addScaledVector(normal, 0.03);
        fivela.lookAt(fivela.position.clone().add(normal));
        this.grupo.add(fivela);
      }
    }

    // a logo: no meio da frente (na costura do meio, na de 6 gomos), na altura do ajuste
    const phi = m.arte.lado;
    const v = vDaAltura(forma, phi, m.arte.altura);
    this.alvoDaArte = {
      ponto: pontoDaCopa(forma, phi, v),
      normal: normalDaCopa(forma, phi, v),
      tamanho: m.arte.tamanho,
      giro: m.arte.giro,
      malhas: this.grupo.children.filter((o) => o.userData.parte === "frente"),
    };
  }

  montarAba(forma, aba, fileiras) {
    const { geometria, borda } = geometriaDaAba(forma, aba);
    const pesponto = texturaPespontoAba(fileiras);
    const cima = this.material("aba", () => {
      const m = materialTecido(this.sarja, new THREE.Color(this.cores.aba || "#f2f2f2"));
      m.map = pesponto;
      return m;
    });
    const baixo = this.tecido("aba-baixo");
    const malha = new THREE.Mesh(geometria, [cima, baixo]);
    malha.userData.parte = "aba";
    this.grupo.add(malha);
    this.grupo.add(new THREE.Mesh(borda, this.tecido("aba")));
  }

  montarViseira(d) {
    const m = this.medidas;
    const forma = { largura: m.copa.largura, fundura: m.copa.fundura, altura: 1, frente: 2.6, tras: 2.6, topo: 0 };
    this.forma = forma;
    const vMax = vDaAltura(forma, 0, m.copa.faixa);
    // a faixa: só a frente e os lados; atrás é o elástico
    const abertura = 118 * GRAU;
    const faixa = new THREE.Mesh(
      geometriaDaCopa(forma, -abertura, abertura, { vMax, passos: 80, aneis: 10 }),
      d.malha ? this.material("frente", () => materialTela(this.furos, new THREE.Color(this.cores.frente || "#f2f2f2"))) : this.tecido("frente"),
    );
    if (d.malha) this.furos.repeat.set(5, 9);
    faixa.userData.parte = "frente";
    this.grupo.add(faixa);
    // a borda de cima da faixa, com viés
    const vies = [];
    for (let k = 0; k <= 60; k++) vies.push(pontoDaCopa(forma, -abertura + (2 * abertura * k) / 60, vMax));
    this.grupo.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vies), 120, 0.014, 6, false), this.tecido("frente")));
    // o elástico atrás
    const atras = [];
    const vElastico = vDaAltura(forma, Math.PI, 0.08);
    for (let k = 0; k <= 30; k++) atras.push(pontoDaCopa(forma, abertura + ((2 * Math.PI - 2 * abertura) * k) / 30, vElastico));
    this.grupo.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(atras), 60, 0.03, 6, false), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })));
    this.montarAba(forma, m.aba, [0.25, 0.5, 0.75, 0.92]);
    const v = vDaAltura(forma, m.arte.lado, m.copa.faixa * m.arte.altura);
    this.alvoDaArte = {
      ponto: pontoDaCopa(forma, m.arte.lado, v),
      normal: normalDaCopa(forma, m.arte.lado, v),
      tamanho: m.arte.tamanho,
      giro: m.arte.giro,
      malhas: [faixa],
    };
  }

  montarChapeu(d) {
    const perfis = {
      // [raio, altura] de dentro do topo até a ponta da aba
      bucket: [[0, 0.82], [0.62, 0.82], [0.7, 0.78], [0.86, 0.06], [0.88, 0], [1.08, -0.22], [1.3, -0.4], [1.31, -0.42]],
      cumbuca: [[0, 0.8], [0.5, 0.78], [0.78, 0.6], [0.9, 0.2], [0.92, 0], [1.12, -0.18], [1.3, -0.3], [1.31, -0.32]],
      australiano: [[0, 0.86], [0.55, 0.86], [0.66, 0.8], [0.84, 0.1], [0.88, 0], [1.2, -0.08], [1.55, -0.24], [1.56, -0.26]],
      cowboy: [[0, 0.9], [0.3, 0.8], [0.5, 0.92], [0.66, 0.86], [0.8, 0.1], [0.84, 0], [1.2, 0.02], [1.5, 0.14], [1.62, 0.3], [1.63, 0.32]],
      praia: [[0, 0.78], [0.5, 0.78], [0.62, 0.72], [0.82, 0.08], [0.86, 0], [1.3, -0.2], [1.78, -0.38], [1.79, -0.4]],
    };
    const perfil = perfis[d.perfil];
    const corte = perfil.findIndex(([, y]) => y <= 0.0001 && y >= -0.0001);
    const copaPerfil = perfil.slice(0, corte + 1);
    const abaPerfil = perfil.slice(corte);

    const fazerMaterial = (parte) => {
      if (d.palha) {
        const m = new THREE.MeshStandardMaterial({
          color: d.palha === "juta" ? 0xc9b48a : 0xe8d29a,
          map: texturaPalha(d.palha === "juta"),
          roughness: 0.95,
          side: THREE.DoubleSide,
        });
        m.map.repeat.set(24, 6);
        return m;
      }
      return this.tecido(parte);
    };
    const copa = new THREE.Mesh(geometriaDeChapeu(copaPerfil), fazerMaterial("copa"));
    copa.userData.parte = "copa";
    const aba = new THREE.Mesh(geometriaDeChapeu(abaPerfil), fazerMaterial("aba"));
    // o boné olha para +z; o chapéu fica com a frente para o mesmo lado
    const escala = this.medidas.copa.escala;
    [copa, aba].forEach((m) => {
      m.scale.set(escala, escala, escala * 1.08);
      m.position.y = 0.1;
      this.grupo.add(m);
    });
    // a costura em espiral da aba de bucket e australiano
    if (!d.palha) {
      const linha = this.material("costura-aba", () => new THREE.MeshStandardMaterial({ roughness: 0.9 }));
      linha.color.set(this.cores.aba || "#f2f2f2").offsetHSL(0, 0, -0.08);
      abaPerfil.slice(1, -1).forEach(([r, y]) => {
        const anel = new THREE.Mesh(new THREE.TorusGeometry(r * escala, 0.006, 6, 96), linha);
        anel.rotation.x = Math.PI / 2;
        anel.scale.set(1, 1.08, 1);
        anel.position.y = y * escala + 0.1 + 0.008;
        this.grupo.add(anel);
      });
    }
    if (d.fita) {
      const fita = new THREE.Mesh(
        new THREE.CylinderGeometry(0.69 * escala, 0.71 * escala, 0.16, 96, 1, true),
        this.material("fita", () => new THREE.MeshStandardMaterial({ color: this.cores.fita || "#3b2a1e", roughness: 0.6, side: THREE.DoubleSide })),
      );
      fita.scale.set(1, 1, 1.08);
      fita.position.y = 0.1 + 0.16 * escala;
      fita.userData.parte = "fita";
      this.grupo.add(fita);
    }
    if (d.debrum) {
      const ponta = abaPerfil[abaPerfil.length - 1];
      const debrum = new THREE.Mesh(
        new THREE.TorusGeometry(ponta[0] * escala, 0.02, 8, 120),
        this.material("debrum", () => new THREE.MeshStandardMaterial({ color: this.cores.debrum || "#141414", roughness: 0.7 })),
      );
      debrum.rotation.x = Math.PI / 2;
      debrum.scale.set(1, 1.08, 1);
      debrum.position.y = ponta[1] * escala + 0.1;
      this.grupo.add(debrum);
    }
    if (d.cordao) {
      const lado = d.perfil === "praia" ? 0.86 : 0.86;
      const pontos = [
        new THREE.Vector3(-lado * escala, 0.1, 0),
        new THREE.Vector3(-0.5, -0.5, 0.1),
        new THREE.Vector3(0, -0.72, 0.15),
        new THREE.Vector3(0.5, -0.5, 0.1),
        new THREE.Vector3(lado * escala, 0.1, 0),
      ];
      this.grupo.add(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 60, 0.012, 6, false),
        new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 }),
      ));
    }
    // a arte vai na frente da copa (na juta, na fita), na altura do ajuste
    const arte = this.medidas.arte;
    let ponto;
    let normal;
    if (d.fita) {
      const y = 0.1 + escala * (0.16 + (arte.altura - 0.5) * 0.16);
      ponto = new THREE.Vector3(0, y, 0.7 * escala);
      normal = new THREE.Vector3(0, 0, 1);
    } else {
      // anda no perfil da copa, de cima para baixo, até a altura pedida
      const topo = copaPerfil[0][1];
      const alvo = topo * arte.altura;
      let raio = copaPerfil[copaPerfil.length - 1][0];
      let inclinacao = [0, 1];
      for (let k = 1; k < copaPerfil.length; k++) {
        const [r0, y0] = copaPerfil[k - 1];
        const [r1, y1] = copaPerfil[k];
        if (alvo <= y0 && alvo >= y1 && y0 !== y1) {
          raio = r0 + ((r1 - r0) * (y0 - alvo)) / (y0 - y1);
          inclinacao = [y0 - y1, r1 - r0];
          break;
        }
      }
      ponto = new THREE.Vector3(0, 0.1 + alvo * escala, raio * escala);
      normal = new THREE.Vector3(0, inclinacao[1], inclinacao[0]).normalize();
    }
    // para o lado: gira em volta do eixo do chapéu; o z é um pouco mais comprido
    const giroLado = new THREE.Matrix4().makeRotationY(arte.lado);
    ponto.applyMatrix4(giroLado);
    normal.applyMatrix4(giroLado);
    ponto.z *= 1.08;
    this.alvoDaArte = {
      ponto,
      normal,
      tamanho: arte.tamanho,
      giro: arte.giro,
      malhas: d.fita ? this.grupo.children.filter((o) => o.userData.parte === "fita") : [copa],
    };
    this.grupo.position.y = 0.05;
  }

  /** Coloca a arte do cliente na frente. `arte` = { imagem (canvas), proporcao, escala, relevo }. */
  colocarArte(arte) {
    this.arte = arte;
    if (this.decalque) {
      this.grupo.remove(this.decalque);
      this.decalque.geometry.dispose();
      this.decalque.material.dispose();
      this.decalque = null;
    }
    if (!arte || !this.alvoDaArte || !this.alvoDaArte.malhas.length) return;
    const textura = new THREE.CanvasTexture(arte.imagem);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({
      map: textura,
      transparent: true,
      // a frente do boné é montada com as faces viradas para dentro; o decalque herda isso
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: arte.relevo ? 0.55 : 0.8,
      bumpMap: arte.relevo ? textura : null,
      bumpScale: arte.relevo ? 3 : 0,
    });
    const largura = this.alvoDaArte.tamanho * (arte.escala || 1);
    const proporcao = arte.proporcao || 1;
    const tamanho = proporcao >= 1
      ? new THREE.Vector3(largura, largura / proporcao, 1.2)
      : new THREE.Vector3(largura * proporcao, largura, 1.2);
    // o alvo está no espaço do grupo; o decalque projeta no espaço do mundo
    this.grupo.updateMatrixWorld(true);
    const alvo = this.alvoDaArte;
    const posicao = alvo.ponto.clone().add(new THREE.Vector3(0, arte.subir || 0, 0)).applyMatrix4(this.grupo.matrixWorld);
    const normal = (alvo.normal || new THREE.Vector3(0, 0, 1)).clone().transformDirection(this.grupo.matrixWorld);
    // a arte deita no tecido: de frente para a normal, em pé, e com o giro do ajuste
    const mira = new THREE.Object3D();
    mira.position.copy(posicao);
    mira.up.set(0, 1, 0);
    mira.lookAt(posicao.clone().add(normal));
    mira.rotateZ(alvo.giro || 0);
    const orientacao = mira.rotation.clone();
    const geometrias = this.alvoDaArte.malhas.map((malha) => {
      malha.updateMatrixWorld(true);
      return new DecalGeometry(malha, posicao, orientacao, tamanho);
    }).filter((g) => g.getAttribute("position").count);
    if (!geometrias.length) return;
    const juntas = geometrias.length === 1 ? geometrias[0] : juntarGeometrias(geometrias);
    // o decalque sai no espaço do mundo; o grupo pode estar deslocado
    juntas.applyMatrix4(this.grupo.matrixWorld.clone().invert());
    this.decalque = new THREE.Mesh(juntas, material);
    this.decalque.receiveShadow = true;
    this.grupo.add(this.decalque);
  }

  /** A foto do boné como está na tela, para mandar junto com o pedido. */
  async foto() {
    this.renderizador.render(this.cena, this.camera);
    return new Promise((resolver) => this.tela.toBlob(resolver, "image/png"));
  }

  girar(ligado) {
    this.controles.autoRotate = ligado;
  }

  /** Para de desenhar enquanto o 3D está escondido (poupa a bateria do celular). */
  pausar(pausado) {
    this.renderizador.setAnimationLoop(pausado ? null : () => this.quadro());
  }
}

function juntarGeometrias(geometrias) {
  const posicoes = [];
  const normais = [];
  const uvs = [];
  geometrias.forEach((g) => {
    posicoes.push(...g.getAttribute("position").array);
    normais.push(...g.getAttribute("normal").array);
    uvs.push(...g.getAttribute("uv").array);
  });
  const junta = new THREE.BufferGeometry();
  junta.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  junta.setAttribute("normal", new THREE.Float32BufferAttribute(normais, 3));
  junta.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return junta;
}
