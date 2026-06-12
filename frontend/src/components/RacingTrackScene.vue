<script setup lang="ts">
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Fog,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { nitroActive, visualIntensity } from "../lib/racingSpeed";
import type { LeaderboardPlayer } from "../types/game";

const MAX_CARS = 20;

const props = withDefaults(
  defineProps<{
    players: LeaderboardPlayer[];
    myPlayerId: string;
    compact?: boolean;
    /** When true (e.g. you finished the paragraph), run a short on-track celebration. */
    celebrate?: boolean;
    /** Increment on each wrong key so the track can flash a warning sign. */
    wrongKeySignal?: number;
  }>(),
  { compact: false, players: () => [], celebrate: false, wrongKeySignal: 0 }
);

const playersRef = toRef(props, "players");
const myIdRef = toRef(props, "myPlayerId");
const celebrateRef = toRef(props, "celebrate");
const wrongKeySignalRef = toRef(props, "wrongKeySignal");

/** Celebration / wrong-key cues are driven from the parent; Three state lives in `onMounted`. */
const celebrationEndMs = ref<number | null>(null);
const pendingConfettiSpawn = ref(false);
const wrongWarnUntilMs = ref(0);

watch(celebrateRef, (v) => {
  if (v) {
    celebrationEndMs.value = performance.now() + 3200;
    pendingConfettiSpawn.value = true;
  }
}, { immediate: true });

watch(wrongKeySignalRef, (n, prev) => {
  if (prev !== undefined && n > prev) {
    wrongWarnUntilMs.value = performance.now() + 900;
  }
});

const host = ref<HTMLDivElement | null>(null);

type CarEntry = {
  root: Group;
  currentPos: Vector3;
  currentQuat: Quaternion;
  laneIndex: number;
};

function disposeObjectSubtree(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material as Material | Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}

const blackPlastic = new MeshStandardMaterial({
  color: 0x0a0a0c,
  metalness: 0.15,
  roughness: 0.88,
});

let carbonWeaveTexture: CanvasTexture | null = null;

function getCarbonWeaveTexture(): CanvasTexture {
  if (carbonWeaveTexture) return carbonWeaveTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#121418";
    ctx.fillRect(0, 0, size, size);
    const step = 8;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const alt = ((x / step + y / step) & 1) === 0;
        ctx.fillStyle = alt ? "#1c2028" : "#0e1014";
        ctx.fillRect(x, y, step, step);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  }
  carbonWeaveTexture = new CanvasTexture(canvas);
  carbonWeaveTexture.colorSpace = SRGBColorSpace;
  carbonWeaveTexture.wrapS = RepeatWrapping;
  carbonWeaveTexture.wrapT = RepeatWrapping;
  carbonWeaveTexture.repeat.set(3, 3);
  carbonWeaveTexture.needsUpdate = true;
  return carbonWeaveTexture;
}

function carbonMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: getCarbonWeaveTexture(),
    color: 0xb0b4bc,
    metalness: 0.55,
    roughness: 0.38,
  });
}

/** GT sports coupe — rounded volumes, flared arches, deep wheels, carbon aero. +Z = rear, −Z = front. */
function createCarGroup(paintHex: number): Group {
  const group = new Group();
  const paint = new MeshStandardMaterial({
    color: paintHex,
    metalness: 0.88,
    roughness: 0.14,
    emissive: new Color(0x000000),
    emissiveIntensity: 0,
  });
  const paintDark = paint.clone();
  paintDark.color.multiplyScalar(0.72);
  paintDark.roughness = 0.22;

  const glass = new MeshStandardMaterial({
    color: 0x02060e,
    metalness: 0.96,
    roughness: 0.03,
    transparent: true,
    opacity: 0.76,
  });
  const rubberProto = new MeshStandardMaterial({
    color: 0x060608,
    metalness: 0.02,
    roughness: 0.98,
  });
  const rimProto = new MeshStandardMaterial({
    color: 0xf0f2f8,
    metalness: 0.9,
    roughness: 0.12,
  });
  const rimInnerProto = new MeshStandardMaterial({
    color: 0x282c34,
    metalness: 0.65,
    roughness: 0.35,
  });
  const carbon = carbonMat();
  const grilleMat = new MeshStandardMaterial({
    color: 0x04060a,
    metalness: 0.55,
    roughness: 0.38,
  });
  const chromeMat = new MeshStandardMaterial({
    color: 0xf4f6fc,
    metalness: 0.94,
    roughness: 0.1,
  });

  function addPaint(mesh: Mesh, accent = false) {
    mesh.userData.carPaint = true;
    if (accent) mesh.userData.carPaintAccent = true;
    group.add(mesh);
  }

  const flat = blackPlastic.clone();

  const under = new Mesh(new BoxGeometry(1.0, 0.038, 1.68), flat);
  under.position.set(0, 0.028, 0.02);
  group.add(under);

  const splitter = new Mesh(new BoxGeometry(1.06, 0.022, 0.16), carbon.clone());
  splitter.position.set(0, 0.042, -0.84);
  group.add(splitter);

  const splitterStrakeL = new Mesh(new BoxGeometry(0.18, 0.012, 0.08), carbon.clone());
  splitterStrakeL.position.set(0.32, 0.048, -0.82);
  const splitterStrakeR = splitterStrakeL.clone();
  splitterStrakeR.position.x = -0.32;
  group.add(splitterStrakeL, splitterStrakeR);

  const belly = new Mesh(new BoxGeometry(0.9, 0.055, 1.18), paintDark);
  belly.position.set(0, 0.072, 0.04);
  addPaint(belly, true);

  const rocker = new Mesh(new BoxGeometry(0.98, 0.058, 1.38), paint);
  rocker.position.set(0, 0.088, 0.04);
  addPaint(rocker);

  const skirtL = new Mesh(new BoxGeometry(0.055, 0.028, 1.18), carbon.clone());
  skirtL.position.set(0.48, 0.068, 0.06);
  const skirtR = skirtL.clone();
  skirtR.position.x = -0.48;
  group.add(skirtL, skirtR);

  const noseDome = new Mesh(new SphereGeometry(0.44, 18, 14), paint);
  noseDome.scale.set(1.08, 0.28, 0.82);
  noseDome.position.set(0, 0.118, -0.64);
  addPaint(noseDome);

  const hood = new Mesh(new BoxGeometry(0.84, 0.062, 0.78), paint);
  hood.position.set(0, 0.148, -0.48);
  hood.rotation.x = -0.24;
  addPaint(hood);

  const hoodPower = new Mesh(new BoxGeometry(0.32, 0.014, 0.18), carbon.clone());
  hoodPower.position.set(0, 0.162, -0.34);
  hoodPower.rotation.x = -0.22;
  group.add(hoodPower);

  const fenderFL = new Mesh(new SphereGeometry(0.26, 14, 12), paint);
  fenderFL.scale.set(0.72, 0.48, 0.92);
  fenderFL.position.set(0.46, 0.132, -0.34);
  addPaint(fenderFL);
  const fenderFR = fenderFL.clone();
  fenderFR.position.x = -0.46;
  addPaint(fenderFR);

  const fenderRL = new Mesh(new SphereGeometry(0.28, 14, 12), paint);
  fenderRL.scale.set(0.78, 0.52, 0.88);
  fenderRL.position.set(0.46, 0.138, 0.38);
  addPaint(fenderRL);
  const fenderRR = fenderRL.clone();
  fenderRR.position.x = -0.46;
  addPaint(fenderRR);

  const cabinBase = new Mesh(new BoxGeometry(0.74, 0.11, 0.62), paint);
  cabinBase.position.set(0, 0.168, 0.06);
  addPaint(cabinBase);

  const intakeMain = new Mesh(new BoxGeometry(0.52, 0.095, 0.045), grilleMat);
  intakeMain.position.set(0, 0.098, -0.84);
  group.add(intakeMain);

  const intakeSideL = new Mesh(new BoxGeometry(0.12, 0.055, 0.035), grilleMat.clone());
  intakeSideL.position.set(0.38, 0.09, -0.78);
  const intakeSideR = intakeSideL.clone();
  intakeSideR.position.x = -0.38;
  group.add(intakeSideL, intakeSideR);

  const hlMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8ee,
    emissiveIntensity: 0.62,
    metalness: 0.45,
    roughness: 0.06,
    transparent: true,
    opacity: 0.97,
  });
  const drlMat = hlMat.clone();
  drlMat.emissiveIntensity = 0.38;
  const hlL = new Mesh(new BoxGeometry(0.22, 0.048, 0.032), hlMat);
  hlL.position.set(0.36, 0.112, -0.82);
  const hlR = hlL.clone();
  hlR.position.x = -0.36;
  const drlL = new Mesh(new BoxGeometry(0.14, 0.018, 0.022), drlMat);
  drlL.position.set(0.36, 0.088, -0.818);
  const drlR = drlL.clone();
  drlR.position.x = -0.36;
  group.add(hlL, hlR, drlL, drlR);

  const aPillarL = new Mesh(new BoxGeometry(0.05, 0.14, 0.06), paintDark);
  aPillarL.position.set(0.34, 0.248, -0.08);
  aPillarL.rotation.z = -0.18;
  addPaint(aPillarL, true);
  const aPillarR = aPillarL.clone();
  aPillarR.position.x = -0.34;
  aPillarR.rotation.z = 0.18;
  aPillarR.userData.carPaint = true;
  aPillarR.userData.carPaintAccent = true;
  group.add(aPillarR);

  const windshield = new Mesh(new BoxGeometry(0.66, 0.14, 0.36), glass);
  windshield.position.set(0, 0.258, -0.16);
  windshield.rotation.x = -0.48;
  group.add(windshield);

  const roof = new Mesh(new BoxGeometry(0.58, 0.042, 0.34), paint);
  roof.position.set(0, 0.328, 0.02);
  roof.rotation.x = -0.14;
  addPaint(roof);

  const fastback = new Mesh(new BoxGeometry(0.64, 0.11, 0.46), glass);
  fastback.position.set(0, 0.288, 0.3);
  fastback.rotation.x = 0.42;
  group.add(fastback);

  const rearDeck = new Mesh(new BoxGeometry(0.86, 0.055, 0.34), paint);
  rearDeck.position.set(0, 0.162, 0.6);
  rearDeck.rotation.x = 0.1;
  addPaint(rearDeck);

  const haunchL = new Mesh(new SphereGeometry(0.24, 12, 10), paint);
  haunchL.scale.set(0.65, 0.42, 0.75);
  haunchL.position.set(0.4, 0.152, 0.52);
  addPaint(haunchL);
  const haunchR = haunchL.clone();
  haunchR.position.x = -0.4;
  addPaint(haunchR);

  const diffuser = new Mesh(new BoxGeometry(0.96, 0.048, 0.24), carbon.clone());
  diffuser.position.set(0, 0.052, 0.88);
  group.add(diffuser);

  for (const ex of [-0.22, 0.22] as const) {
    const tip = new Mesh(new CylinderGeometry(0.038, 0.042, 0.08, 12), chromeMat.clone());
    tip.rotation.x = Math.PI / 2;
    tip.position.set(ex, 0.078, 0.9);
    group.add(tip);
  }

  const wingPostL = new Mesh(new BoxGeometry(0.05, 0.14, 0.05), carbon.clone());
  wingPostL.position.set(0.38, 0.228, 0.74);
  const wingPostR = wingPostL.clone();
  wingPostR.position.x = -0.38;
  group.add(wingPostL, wingPostR);

  const wing = new Mesh(new BoxGeometry(0.98, 0.022, 0.16), carbon.clone());
  wing.position.set(0, 0.268, 0.78);
  wing.rotation.x = -0.12;
  group.add(wing);

  const wingGurney = new Mesh(new BoxGeometry(0.98, 0.012, 0.018), carbon.clone());
  wingGurney.position.set(0, 0.276, 0.71);
  group.add(wingGurney);

  const tailMat = new MeshStandardMaterial({
    color: 0x180204,
    emissive: 0xff1020,
    emissiveIntensity: 0.85,
    metalness: 0.12,
    roughness: 0.32,
  });
  const tailBar = new Mesh(new BoxGeometry(0.76, 0.032, 0.028), tailMat);
  tailBar.position.set(0, 0.138, 0.86);
  group.add(tailBar);

  const ventL = new Mesh(new BoxGeometry(0.06, 0.04, 0.16), carbon.clone());
  ventL.position.set(0.46, 0.122, 0.14);
  const ventR = ventL.clone();
  ventR.position.x = -0.46;
  group.add(ventL, ventR);

  const mirCapL = new Mesh(new BoxGeometry(0.048, 0.028, 0.065), chromeMat.clone());
  mirCapL.position.set(0.48, 0.268, -0.1);
  const mirCapR = mirCapL.clone();
  mirCapR.position.x = -0.48;
  group.add(mirCapL, mirCapR);

  function addWheelArch(x: number, z: number) {
    const arch = new Mesh(new TorusGeometry(0.19, 0.028, 8, 20, Math.PI), paint);
    arch.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    arch.rotation.z = Math.PI / 2;
    arch.position.set(x * 0.92, 0.168, z);
    addPaint(arch);
  }
  addWheelArch(0.48, 0.34);
  addWheelArch(-0.48, 0.34);
  addWheelArch(0.48, -0.38);
  addWheelArch(-0.48, -0.38);

  function addWheel(x: number, z: number) {
    const wg = new Group();
    const tireMat = rubberProto.clone();
    const rimMat = rimProto.clone();
    const rimInner = rimInnerProto.clone();

    const tireOut = new Mesh(new CylinderGeometry(0.184, 0.184, 0.128, 32, 1, false), tireMat);
    tireOut.rotation.z = Math.PI / 2;
    const tireSidewall = new Mesh(new TorusGeometry(0.184, 0.022, 10, 32), tireMat);
    tireSidewall.rotation.y = Math.PI / 2;
    const rimBarrel = new Mesh(new CylinderGeometry(0.114, 0.108, 0.09, 28, 1, false), rimInner);
    rimBarrel.rotation.z = Math.PI / 2;
    const rimFace = new Mesh(new CylinderGeometry(0.104, 0.104, 0.028, 28, 1, false), rimMat);
    rimFace.rotation.z = Math.PI / 2;
    rimFace.position.x = x > 0 ? 0.052 : -0.052;
    const brake = new Mesh(
      new CylinderGeometry(0.094, 0.094, 0.028, 22, 1, false),
      new MeshStandardMaterial({ color: 0xff2a18, emissive: 0x440800, emissiveIntensity: 0.15, metalness: 0.4, roughness: 0.45 })
    );
    brake.rotation.z = Math.PI / 2;
    const cap = new Mesh(new CylinderGeometry(0.032, 0.032, 0.04, 12), rimMat.clone());
    cap.rotation.z = Math.PI / 2;
    cap.position.x = x > 0 ? 0.068 : -0.068;

    wg.add(tireOut, tireSidewall, brake, rimBarrel, rimFace, cap);
    for (let s = 0; s < 7; s++) {
      const spoke = new Mesh(new BoxGeometry(0.11, 0.012, 0.024), rimMat.clone());
      const a = (s / 7) * Math.PI * 2;
      spoke.position.set(x > 0 ? 0.058 : -0.058, Math.cos(a) * 0.044, Math.sin(a) * 0.044);
      spoke.rotation.x = Math.PI / 2;
      spoke.rotation.y = a;
      wg.add(spoke);
    }
    wg.position.set(x, 0.184, z);
    group.add(wg);
  }
  addWheel(0.5, 0.34);
  addWheel(-0.5, 0.34);
  addWheel(0.5, -0.38);
  addWheel(-0.5, -0.38);

  group.scale.setScalar(1.08);
  return group;
}

function setCarPaintColor(root: Group, hex: number) {
  const base = new Color(hex);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.userData.carPaint) return;
    const mat = mesh.material as MeshStandardMaterial;
    mat.color.copy(base);
    if (mesh.userData.carPaintAccent) {
      mat.color.multiplyScalar(0.72);
    }
  });
}

function forEachCarPaintMaterial(root: Group, fn: (m: MeshStandardMaterial) => void) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.userData.carPaint) return;
    fn(mesh.material as MeshStandardMaterial);
  });
}

const MINE_MARKER_NAME = "__mine_marker__";

/** Gold ring + beacon so your car is obvious (body color alone is not enough). */
function applyMineIndicator(root: Group, isMine: boolean) {
  const existing = root.getObjectByName(MINE_MARKER_NAME);
  if (!isMine) {
    if (existing) {
      root.remove(existing);
      disposeObjectSubtree(existing);
    }
    return;
  }
  if (existing) return;

  const g = new Group();
  g.name = MINE_MARKER_NAME;

  const ringMat = new MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xffa000,
    emissiveIntensity: 0.62,
    metalness: 0.38,
    roughness: 0.38,
  });
  const ring = new Mesh(new TorusGeometry(0.62, 0.055, 8, 32), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;

  const ballMat = ringMat.clone();
  ballMat.emissiveIntensity = 0.78;
  const ball = new Mesh(new SphereGeometry(0.11, 14, 12), ballMat);
  ball.position.y = 0.76;

  const poleMat = ringMat.clone();
  poleMat.emissiveIntensity = 0.45;
  const pole = new Mesh(new CylinderGeometry(0.035, 0.035, 0.52, 10), poleMat);
  pole.position.y = 0.4;

  g.add(ring, pole, ball);
  root.add(g);
}

const worldUp = new Vector3(0, 1, 0);
const tmpV = new Vector3();
const tmpTan = new Vector3();
const tmpSide = new Vector3();
const tmpLook = new Vector3();
const tmpSpawnJitter = new Vector3();
const chaseDummy = new Object3D();
const camPos = new Vector3();
const camLook = new Vector3();
const idealCam = new Vector3();
const idealLook = new Vector3();

/** Procedural asphalt: edge lines, dashed center, wear noise — UV.u follows distance along track, UV.v across width. */
function createRoadAsphaltTexture(): CanvasTexture {
  const w = 512;
  const h = 176;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#2c323a");
  grad.addColorStop(0.14, "#1e2229");
  grad.addColorStop(0.5, "#23272f");
  grad.addColorStop(0.86, "#1e2229");
  grad.addColorStop(1, "#2c323a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 5500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.012 + Math.random() * 0.038})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.022})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  ctx.fillStyle = "rgba(6,8,10,0.5)";
  ctx.fillRect(0, 0, w, h * 0.13);
  ctx.fillRect(0, h * 0.87, w, h * 0.13);
  ctx.fillStyle = "#e8edf5";
  ctx.fillRect(0, h * 0.035, w, h * 0.024);
  ctx.fillRect(0, h * 0.941, w, h * 0.024);
  const mid = h * 0.5 - 2.5;
  ctx.fillStyle = "rgba(210, 175, 45, 0.2)";
  ctx.fillRect(0, mid - 5, w, 3);
  ctx.fillRect(0, mid + 5, w, 3);
  ctx.fillStyle = "#f2f5fa";
  const dash = 28;
  const gap = 22;
  for (let x = 0; x < w; x += dash + gap) {
    ctx.fillRect(x, mid, dash, 5);
  }
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  for (let x = 0; x < w; x += 64) {
    ctx.fillRect(x, 0, 1, h);
  }
  ctx.globalAlpha = 1;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildClosedTrackCurve(): CatmullRomCurve3 {
  const r = 22;
  const pts = [
    new Vector3(r, 0, 0),
    new Vector3(r * 0.65, 0, r * 0.85),
    new Vector3(0, 0, r * 1.05),
    new Vector3(-r * 0.75, 0, r * 0.55),
    new Vector3(-r * 1.05, 0, 0),
    new Vector3(-r * 0.7, 0, -r * 0.8),
    new Vector3(0, 0, -r),
    new Vector3(r * 0.75, 0, -r * 0.55),
  ];
  return new CatmullRomCurve3(pts, true, "catmullrom", 0.45);
}

function buildRibbonGeometry(
  curve: CatmullRomCurve3,
  segments: number,
  halfWidth: number,
  opts?: { yOuter?: number; yInner?: number; uScale?: number }
): BufferGeometry {
  const yOuter = opts?.yOuter ?? 0.047;
  const yInner = opts?.yInner ?? 0.041;
  const uScale = opts?.uScale ?? 0.058;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = worldUp;
  const prev = new Vector3();
  let uAccum = 0;
  let hasPrev = false;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    if (hasPrev) {
      uAccum += p.distanceTo(prev);
    }
    prev.copy(p);
    hasPrev = true;

    const tan = curve.getTangentAt(t).normalize();
    tmpSide.crossVectors(tan, up);
    if (tmpSide.lengthSq() < 1e-8) {
      tmpSide.set(1, 0, 0);
    } else {
      tmpSide.normalize();
    }
    const uu = uAccum * uScale;

    positions.push(
      p.x + tmpSide.x * halfWidth,
      p.y + yOuter,
      p.z + tmpSide.z * halfWidth,
      p.x - tmpSide.x * halfWidth,
      p.y + yInner,
      p.z - tmpSide.z * halfWidth
    );
    uvs.push(uu, 0, uu, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function colorForId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = ((h >>> 0) % 360) / 360;
  return new Color().setHSL(hue, 0.55, 0.48).getHex();
}

/** Glossy sports-car paint: per-player hue with a light team tint. */
function carColorForPlayer(p: LeaderboardPlayer): number {
  const base = new Color(colorForId(p.id));
  base.offsetHSL(0, 0.12, 0.04);
  const teamTint =
    p.team_id === 1
      ? new Color().setHSL(0.92, 0.72, 0.52)
      : new Color().setHSL(0.58, 0.72, 0.5);
  base.lerp(teamTint, 0.28);
  return base.getHex();
}

function top20ByRank(players: LeaderboardPlayer[]): LeaderboardPlayer[] {
  return [...players].sort((a, b) => a.rank - b.rank).slice(0, MAX_CARS);
}

function progressToU(progress: number): number {
  return MathUtils.clamp(progress, 0, 1);
}

/** Checkered cloth + pole; group origin at ground contact beside the track. `outward` is horizontal away from track center. */
function createFinishFlagGroup(outward: Vector3): { group: Group; cloth: Mesh } {
  const g = new Group();
  const poleMat = new MeshStandardMaterial({
    color: 0x4a5058,
    metalness: 0.32,
    roughness: 0.52,
  });
  const pole = new Mesh(new CylinderGeometry(0.11, 0.13, 3.45, 10), poleMat);
  pole.position.y = 1.725;
  g.add(pole);

  const cells = 8;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const cell = canvas.width / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#0c0e12" : "#eef1f5";
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;

  const clothMat = new MeshStandardMaterial({
    map: tex,
    roughness: 0.48,
    metalness: 0.06,
    emissive: new Color(0xffffff),
    emissiveIntensity: 0.035,
    side: DoubleSide,
  });
  const cloth = new Mesh(new PlaneGeometry(1.5, 1.02), clothMat);
  const inward = outward.clone().multiplyScalar(-1);
  cloth.position.set(outward.x * 0.38, 3.32, outward.z * 0.38);
  cloth.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), inward);
  g.add(cloth);

  return { group: g, cloth };
}

/** Pole + yellow board + dark “!” strip — parent is billboarded to face the camera. */
function createWarningSignGroup(): Group {
  const g = new Group();
  const pole = new Mesh(
    new CylinderGeometry(0.055, 0.065, 2.05, 8),
    new MeshStandardMaterial({
      color: 0x6a5c38,
      metalness: 0.28,
      roughness: 0.55,
    })
  );
  pole.position.y = 1.02;
  g.add(pole);

  const board = new Mesh(
    new PlaneGeometry(0.95, 0.88),
    new MeshStandardMaterial({
      color: 0xffcc33,
      emissive: new Color(0xff8800),
      emissiveIntensity: 0.55,
      roughness: 0.42,
      metalness: 0.08,
      side: DoubleSide,
    })
  );
  board.position.set(0, 2.12, 0.04);
  g.add(board);

  const stripe = new Mesh(
    new PlaneGeometry(0.14, 0.62),
    new MeshBasicMaterial({ color: 0x120808, transparent: true, opacity: 0.9 })
  );
  stripe.position.set(0, 2.12, 0.055);
  g.add(stripe);

  const cap = new Mesh(
    new SphereGeometry(0.12, 10, 10),
    new MeshStandardMaterial({
      color: 0xffaa22,
      emissive: new Color(0xff6600),
      emissiveIntensity: 0.35,
      roughness: 0.35,
    })
  );
  cap.position.set(0, 2.58, 0.04);
  g.add(cap);

  g.visible = false;
  return g;
}

/** Deterministic RNG for stable city layout across reloads. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let skyTexture: CanvasTexture | null = null;
let grassGroundTexture: CanvasTexture | null = null;
let buildingWindowTexture: CanvasTexture | null = null;

function getSkyTexture(): CanvasTexture {
  if (skyTexture) return skyTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#3a6ea5");
    g.addColorStop(0.42, "#6a9fd4");
    g.addColorStop(0.72, "#9ec4e8");
    g.addColorStop(1, "#c8dce8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 18; i++) {
      const w = 40 + (i % 5) * 28;
      const h = 12 + (i % 3) * 6;
      ctx.fillRect((i * 67) % 420, 40 + (i * 23) % 120, w, h);
    }
  }
  skyTexture = new CanvasTexture(canvas);
  skyTexture.colorSpace = SRGBColorSpace;
  skyTexture.needsUpdate = true;
  return skyTexture;
}

function getGrassGroundTexture(): CanvasTexture {
  if (grassGroundTexture) return grassGroundTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1a3824";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      const g = 0x22 + ((i * 13) % 28);
      ctx.fillStyle = `rgb(${g - 8},${g + 18},${g - 4})`;
      ctx.fillRect((i * 17) % size, (i * 31) % size, 1, 1);
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + (i % 5) * 0.008})`;
      ctx.fillRect((i * 41) % size, (i * 19) % size, 2, 2);
    }
  }
  grassGroundTexture = new CanvasTexture(canvas);
  grassGroundTexture.colorSpace = SRGBColorSpace;
  grassGroundTexture.wrapS = RepeatWrapping;
  grassGroundTexture.wrapT = RepeatWrapping;
  grassGroundTexture.repeat.set(8, 8);
  grassGroundTexture.needsUpdate = true;
  return grassGroundTexture;
}

function getBuildingWindowTexture(): CanvasTexture {
  if (buildingWindowTexture) return buildingWindowTexture;
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#4a5468";
    ctx.fillRect(0, 0, w, h);
    const cw = 10;
    const ch = 14;
    const gapX = 4;
    const gapY = 6;
    for (let y = gapY; y < h - ch; y += ch + gapY) {
      for (let x = gapX; x < w - cw; x += cw + gapX) {
        const lit = ((x * 3 + y * 11) % 19) > 6;
        ctx.fillStyle = lit ? "#ffecc8" : "#141c28";
        ctx.fillRect(x, y, cw, ch);
        if (lit) {
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(x + 1, y + 1, cw - 2, 3);
        }
      }
    }
  }
  buildingWindowTexture = new CanvasTexture(canvas);
  buildingWindowTexture.colorSpace = SRGBColorSpace;
  buildingWindowTexture.needsUpdate = true;
  return buildingWindowTexture;
}

const BUILDING_FACADE_COLORS = [0xd8dce8, 0xc8d0dc, 0xe0d8cc, 0xb8c4d4, 0xd0ccc4] as const;

const citySharedGeo = {
  trunk: new CylinderGeometry(0.12, 0.17, 1.05, 8),
  foliageA: new SphereGeometry(0.72, 10, 8),
  foliageB: new SphereGeometry(0.55, 9, 8),
  foliageC: new SphereGeometry(0.42, 8, 7),
  building: new BoxGeometry(1, 1, 1),
  lampPole: new CylinderGeometry(0.035, 0.045, 2.6, 6),
  lampArm: new BoxGeometry(0.32, 0.04, 0.04),
  lampBulb: new SphereGeometry(0.09, 8, 8),
  bush: new SphereGeometry(0.5, 8, 6),
};

const citySharedMat = {
  trunk: new MeshStandardMaterial({ color: 0x4a3424, roughness: 0.92, metalness: 0.04 }),
  foliage: [
    new MeshStandardMaterial({ color: 0x1a5530, roughness: 0.9, metalness: 0.02 }),
    new MeshStandardMaterial({ color: 0x247040, roughness: 0.88, metalness: 0.02 }),
    new MeshStandardMaterial({ color: 0x2f8848, roughness: 0.86, metalness: 0.02 }),
  ],
  windowFacade: new MeshStandardMaterial({
    map: getBuildingWindowTexture(),
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.2,
  }),
  concrete: new MeshStandardMaterial({ color: 0x9098a4, roughness: 0.88, metalness: 0.08 }),
  lampPole: new MeshStandardMaterial({ color: 0x3a4048, roughness: 0.72, metalness: 0.35 }),
  lampBulb: new MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xffe4a0,
    emissiveIntensity: 0.48,
    roughness: 0.35,
  }),
  skyline: new MeshStandardMaterial({
    color: 0x4a5870,
    roughness: 0.82,
    metalness: 0.12,
    transparent: true,
    opacity: 0.88,
  }),
};

function meshShared(geo: BufferGeometry, mat: Material): Mesh {
  const m = new Mesh(geo, mat);
  m.userData.sharedGeometry = true;
  return m;
}

function facadeMaterial(rand: () => number): MeshStandardMaterial {
  const m = citySharedMat.windowFacade.clone();
  m.color.setHex(BUILDING_FACADE_COLORS[Math.floor(rand() * BUILDING_FACADE_COLORS.length)]!);
  return m;
}

function createTreeProp(rand: () => number, kind: "park" | "street" = "street"): Group {
  const g = new Group();
  const scale = kind === "street" ? 0.85 + rand() * 0.35 : 0.65 + rand() * 0.75;
  const foliage = citySharedMat.foliage[Math.floor(rand() * citySharedMat.foliage.length)]!;
  const trunk = meshShared(citySharedGeo.trunk, citySharedMat.trunk);
  trunk.position.y = 0.52 * scale;
  const a = meshShared(citySharedGeo.foliageA, foliage);
  a.position.set(0, 1.35 * scale, 0);
  const b = meshShared(citySharedGeo.foliageB, foliage);
  b.position.set(0.28 * scale, 1.55 * scale, 0.12 * scale);
  const c = meshShared(citySharedGeo.foliageC, foliage);
  c.position.set(-0.22 * scale, 1.62 * scale, -0.08 * scale);
  g.add(trunk, a, b, c);
  if (kind === "park" && rand() > 0.4) {
    const bush = meshShared(citySharedGeo.bush, foliage);
    bush.scale.set(1.3, 0.55, 1.3);
    bush.position.set((rand() - 0.5) * 1.2, 0.22, (rand() - 0.5) * 1.2);
    g.add(bush);
  }
  g.scale.setScalar(scale);
  g.rotation.y = rand() * Math.PI * 2;
  return g;
}

function createBuildingProp(rand: () => number, tier: "mid" | "high" | "low"): Group {
  const g = new Group();
  let w: number;
  let h: number;
  let d: number;
  if (tier === "high") {
    w = 1.8 + rand() * 2.2;
    d = 1.8 + rand() * 2.2;
    h = 12 + rand() * 18;
  } else if (tier === "low") {
    w = 3 + rand() * 4.5;
    d = 2.5 + rand() * 3.5;
    h = 2.5 + rand() * 4;
  } else {
    w = 2.4 + rand() * 3.6;
    d = 2 + rand() * 3;
    h = 5 + rand() * 9;
  }
  const body = meshShared(citySharedGeo.building, facadeMaterial(rand));
  body.scale.set(w, h, d);
  body.position.y = h * 0.5;
  g.add(body);
  const trim = meshShared(citySharedGeo.building, citySharedMat.concrete.clone());
  trim.scale.set(w * 1.02, 0.28, d * 1.02);
  trim.position.y = 0.14;
  g.add(trim);
  if (tier !== "low" && rand() > 0.35) {
    const roof = meshShared(citySharedGeo.building, citySharedMat.concrete.clone());
    roof.scale.set(w * 0.94, 0.3, d * 0.94);
    roof.position.y = h + 0.15;
    g.add(roof);
  }
  g.rotation.y = rand() * Math.PI * 2;
  return g;
}

function createStreetLamp(): Group {
  const g = new Group();
  const pole = meshShared(citySharedGeo.lampPole, citySharedMat.lampPole);
  pole.position.y = 1.3;
  const arm = meshShared(citySharedGeo.lampArm, citySharedMat.lampPole);
  arm.position.set(0.14, 2.55, 0);
  const bulb = meshShared(citySharedGeo.lampBulb, citySharedMat.lampBulb);
  bulb.position.set(0.28, 2.52, 0);
  g.add(pole, arm, bulb);
  return g;
}

type PlacedProp = { x: number; z: number; r: number };

/** Trees, blocks, boulevard, and distant skyline outside the track. */
function buildCityScenery(curve: CatmullRomCurve3, trackHalfWidth: number): Group {
  const city = new Group();
  city.name = "city-scenery";
  const rand = seededRandom(0x7a4e21);
  const placed: PlacedProp[] = [];
  const side = new Vector3();
  const tan = new Vector3();
  const minTrackClear = trackHalfWidth + 3.2;

  function canPlace(x: number, z: number, r: number): boolean {
    const d2center = x * x + z * z;
    if (d2center < (minTrackClear + 2) * (minTrackClear + 2)) return false;
    for (const p of placed) {
      const dx = x - p.x;
      const dz = z - p.z;
      const need = r + p.r + 0.8;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  }

  function placeProp(prop: Group, x: number, z: number, r: number): boolean {
    if (!canPlace(x, z, r)) return false;
    prop.position.set(x, 0, z);
    city.add(prop);
    placed.push({ x, z, r });
    return true;
  }

  /** Boulevard: tree rows + lamps hugging the circuit. */
  for (let i = 0; i < 72; i++) {
    const t = i / 72;
    const p = curve.getPointAt(t);
    tan.copy(curve.getTangentAt(t)).normalize();
    side.crossVectors(tan, worldUp);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize();

    for (const outward of [1, -1] as const) {
      const treeDist = trackHalfWidth + 5.2 + (i % 3) * 0.15;
      const tx = p.x + side.x * treeDist * outward;
      const tz = p.z + side.z * treeDist * outward;
      placeProp(createTreeProp(rand, "street"), tx, tz, 1.6);

      if (i % 9 === 0) {
        const lx = p.x + side.x * (trackHalfWidth + 3.8) * outward;
        const lz = p.z + side.z * (trackHalfWidth + 3.8) * outward;
        const lamp = createStreetLamp();
        lamp.rotation.y = Math.atan2(side.x * outward, side.z * outward);
        placeProp(lamp, lx, lz, 0.5);
      }
    }
  }

  /** Mid-rise blocks in a ring around the circuit. */
  for (let i = 0; i < 64; i++) {
    const t = (i + rand() * 0.35) / 64;
    const p = curve.getPointAt(t % 1);
    tan.copy(curve.getTangentAt(t % 1)).normalize();
    side.crossVectors(tan, worldUp);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize();
    const outward = i % 2 === 0 ? 1 : -1;
    const dist = trackHalfWidth + 14 + rand() * 10;
    const x = p.x + side.x * dist * outward + tan.x * (rand() - 0.5) * 5;
    const z = p.z + side.z * dist * outward + tan.z * (rand() - 0.5) * 5;
    const tier = rand() < 0.22 ? "high" : rand() < 0.55 ? "mid" : "low";
    const bw = tier === "high" ? 3 : tier === "mid" ? 4 : 5;
    placeProp(createBuildingProp(rand, tier), x, z, bw);
  }

  /** Park grid: trees + low buildings further out. */
  const blockStep = 11;
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const cx = gx * blockStep + (rand() - 0.5) * 4;
      const cz = gz * blockStep + (rand() - 0.5) * 4;
      const dist = Math.hypot(cx, cz);
      if (dist < 34 || dist > 82) continue;
      const roll = rand();
      if (roll < 0.52) {
        placeProp(createTreeProp(rand, "park"), cx, cz, 1.8);
      } else if (roll < 0.82) {
        placeProp(createBuildingProp(rand, dist > 55 ? "mid" : "low"), cx, cz, 4);
      }
      if (rand() > 0.7) {
        placeProp(
          createTreeProp(rand, "park"),
          cx + (rand() - 0.5) * 5,
          cz + (rand() - 0.5) * 5,
          1.4
        );
      }
    }
  }

  /** Distant skyline silhouette. */
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2 + rand() * 0.08;
    const rad = 102 + rand() * 14;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const h = 8 + rand() * 28;
    const w = 3 + rand() * 7;
    const d = 3 + rand() * 6;
    const block = meshShared(citySharedGeo.building, citySharedMat.skyline);
    block.scale.set(w, h, d);
    block.position.set(x, h * 0.5, z);
    block.rotation.y = ang + Math.PI * 0.5;
    city.add(block);
  }

  return city;
}

let disposeThree: (() => void) | null = null;

onMounted(() => {
  const el = host.value;
  if (!el) return;

  const curve = buildClosedTrackCurve();

  const scene = new Scene();
  scene.background = getSkyTexture();
  scene.fog = new Fog(0xa8c8e0, 58, 152);

  const camera = new PerspectiveCamera(48, 1, 0.1, 500);
  camera.position.set(0, 32, 48);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const canvas = renderer.domElement;
  el.appendChild(canvas);
  /** Keep focus on the typing field: canvas can steal focus and then keydown never reaches the input. */
  canvas.tabIndex = -1;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.userSelect = "none";
  const blockCanvasFocus = (ev: Event) => {
    ev.preventDefault();
  };
  canvas.addEventListener("pointerdown", blockCanvasFocus);

  const roadSurfaceTexture = createRoadAsphaltTexture();
  roadSurfaceTexture.wrapS = RepeatWrapping;
  roadSurfaceTexture.wrapT = RepeatWrapping;
  roadSurfaceTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  scene.add(new HemisphereLight(0xd0e4ff, 0x3a5038, 0.52));
  const sun = new DirectionalLight(0xfff8f0, 1.05);
  sun.position.set(38, 58, 24);
  scene.add(sun);
  scene.add(new AmbientLight(0x98a8b8, 0.28));

  const grassTex = getGrassGroundTexture();
  grassTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const ground = new Mesh(
    new PlaneGeometry(260, 260),
    new MeshStandardMaterial({
      map: grassTex,
      color: 0xb8d4b8,
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  scene.add(ground);

  const ribbonHalfWidth = 2.4;
  const cityScenery = buildCityScenery(curve, ribbonHalfWidth);
  scene.add(cityScenery);

  const shoulderGeom = buildRibbonGeometry(curve, 220, ribbonHalfWidth + 1.05, {
    yOuter: 0.033,
    yInner: 0.031,
    uScale: 0.04,
  });
  const shoulderMat = new MeshStandardMaterial({
    color: 0x9aa4ae,
    roughness: 0.86,
    metalness: 0.1,
    side: DoubleSide,
  });
  scene.add(new Mesh(shoulderGeom, shoulderMat));

  const ribbonGeom = buildRibbonGeometry(curve, 220, ribbonHalfWidth);
  const ribbonMat = new MeshStandardMaterial({
    map: roadSurfaceTexture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.06,
    emissive: new Color(0x141c24),
    emissiveIntensity: 0.06,
    side: DoubleSide,
  });
  const ribbonEmissiveBase = new Color().copy(ribbonMat.emissive);
  scene.add(new Mesh(ribbonGeom, ribbonMat));

  /** Closed loop: use t = 0 as start/finish; flag sits just outside the ribbon on one side. */
  const tFinish = 0;
  const finishCenter = curve.getPointAt(tFinish);
  const finishTan = curve.getTangentAt(tFinish).normalize();
  tmpSide.crossVectors(finishTan, worldUp);
  if (tmpSide.lengthSq() < 1e-8) tmpSide.set(1, 0, 0);
  else tmpSide.normalize();
  const finishOutward = tmpSide.clone();
  const finishBase = finishCenter
    .clone()
    .addScaledVector(finishOutward, ribbonHalfWidth + 0.7);
  finishBase.y += 0.06;
  const { group: finishFlagGroup, cloth: finishFlagCloth } = createFinishFlagGroup(finishOutward);
  finishFlagGroup.position.copy(finishBase);
  scene.add(finishFlagGroup);

  const CONFETTI_COUNT = 44;
  const confettiGroup = new Group();
  const confettiVel: Vector3[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const geo = new BoxGeometry(0.1 + Math.random() * 0.1, 0.14 + Math.random() * 0.12, 0.05);
    const mat = new MeshBasicMaterial({
      color: new Color().setHSL(Math.random(), 0.84, 0.54),
      transparent: true,
      opacity: 0.94,
    });
    const m = new Mesh(geo, mat);
    m.visible = false;
    m.userData.spin = new Vector3(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12
    );
    confettiGroup.add(m);
    confettiVel.push(new Vector3());
  }
  scene.add(confettiGroup);

  function spawnConfettiBurst(origin: Vector3) {
    let i = 0;
    for (const ch of confettiGroup.children) {
      const m = ch as Mesh;
      const vel = confettiVel[i]!;
      i++;
      m.visible = true;
      tmpSpawnJitter.set(
        (Math.random() - 0.5) * 2.4,
        Math.random() * 0.55,
        (Math.random() - 0.5) * 2.4
      );
      m.position.copy(origin).add(tmpSpawnJitter);
      vel.set(
        (Math.random() - 0.5) * 7,
        5.5 + Math.random() * 8,
        (Math.random() - 0.5) * 7
      );
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      (m.material as MeshBasicMaterial).opacity = 0.94;
    }
  }

  const warningSignGroup = createWarningSignGroup();
  scene.add(warningSignGroup);

  const carsRoot = new Group();
  scene.add(carsRoot);

  const cars = new Map<string, CarEntry>();

  const speedLineGroup = new Group();
  speedLineGroup.matrixAutoUpdate = false;
  speedLineGroup.renderOrder = 2000;
  scene.add(speedLineGroup);
  const lineMeshes: Mesh[] = [];
  const SPEED_LINE_COUNT = 18;
  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    const w = 0.75 + Math.random() * 1.35;
    const geo = new PlaneGeometry(w, 0.04);
    const col = new Color().setHSL(0.52 + Math.random() * 0.08, 0.85, 0.52);
    const mat = new MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const m = new Mesh(geo, mat);
    m.frustumCulled = false;
    m.position.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 5,
      -5 - Math.random() * 18
    );
    m.rotation.z = (Math.random() - 0.5) * 0.35;
    m.userData.zSpeed = 0.35 + Math.random() * 0.85;
    speedLineGroup.add(m);
    lineMeshes.push(m);
  }

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const afterPass = new AfterimagePass(0.92);
  const bloomPass = new UnrealBloomPass(new Vector2(256, 256), 0.42, 0.42, 0.18);
  bloomPass.threshold = 0.12;
  composer.addPass(renderPass);
  composer.addPass(afterPass);
  composer.addPass(bloomPass);

  let raf = 0;
  let resizeObserver: ResizeObserver | null = null;
  let cameraInitialized = false;
  let timeS = 0;

  const resize = () => {
    const w = el.clientWidth;
    const minH = props.compact ? 100 : 200;
    const h = Math.max(minH, el.clientHeight);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    /** Default `updateStyle: true` so the canvas CSS matches the host; `false` can mis-frame in flex layouts. */
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  };

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el);
  resize();

  function syncCarMeshes(top: LeaderboardPlayer[]) {
    const keep = new Set(top.map((p) => p.id));
    for (const [id, entry] of cars) {
      if (!keep.has(id)) {
        carsRoot.remove(entry.root);
        disposeObjectSubtree(entry.root);
        cars.delete(id);
      }
    }
    top.forEach((p, laneIdx) => {
      let entry = cars.get(p.id);
      if (!entry) {
        const root = createCarGroup(carColorForPlayer(p));
        carsRoot.add(root);
        const u = progressToU(p.progress);
        const center = curve.getPointAt(u);
        entry = {
          root,
          currentPos: center.clone(),
          currentQuat: new Quaternion(),
          laneIndex: laneIdx,
        };
        entry.root.position.copy(entry.currentPos);
        cars.set(p.id, entry);
      }
      entry!.laneIndex = laneIdx;
      setCarPaintColor(entry!.root, carColorForPlayer(p));
      applyMineIndicator(entry!.root, p.id === myIdRef.value);
    });
  }

  function carTargetOnTrack(
    progress: number,
    laneIndex: number,
    totalLanes: number,
    outPos: Vector3,
    outTan: Vector3
  ) {
    const u = progressToU(progress);
    const center = curve.getPointAt(u);
    outTan.copy(curve.getTangentAt(u)).normalize();
    tmpSide.crossVectors(outTan, worldUp);
    if (tmpSide.lengthSq() < 1e-8) tmpSide.set(1, 0, 0);
    else tmpSide.normalize();
    const mid = (totalLanes - 1) / 2;
    const maxRankOffset = mid > 1e-6 ? mid : 0;
    const norm = maxRankOffset > 0 ? (laneIndex - mid) / maxRankOffset : 0;
    /** Keep lanes inside the ribbon; old 0.62 * mid put rank #1 ~6m off center (reads as “car on the side”). */
    const maxLane = ribbonHalfWidth * 0.82;
    const lane = MathUtils.clamp(norm, -1, 1) * maxLane;
    outPos.copy(center).addScaledVector(tmpSide, lane);
    outPos.y += 0.268;
  }

  const unitScale = new Vector3(1, 1, 1);

  let lastFrameMs = performance.now();

  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameMs) * 0.001);
    lastFrameMs = now;
    timeS = now * 0.001;

    const top = top20ByRank(playersRef.value);
    syncCarMeshes(top);

    const mine = top.find((p) => p.id === myIdRef.value);
    const chase = mine ?? top[0] ?? null;

    if (pendingConfettiSpawn.value) {
      pendingConfettiSpawn.value = false;
      tmpV.set(0, 2.8, 0);
      const ent = mine ? cars.get(mine.id) : null;
      if (ent) {
        tmpV.copy(ent.currentPos);
        tmpV.y += 0.5;
      } else if (chase) {
        const e2 = cars.get(chase.id);
        if (e2) {
          tmpV.copy(e2.currentPos);
          tmpV.y += 0.5;
        }
      }
      spawnConfettiBurst(tmpV);
    }

    const cEnd = celebrationEndMs.value;
    const celebActive = cEnd != null && now < cEnd;
    if (!celebActive && cEnd != null && now >= cEnd) {
      celebrationEndMs.value = null;
      for (const ch of confettiGroup.children) {
        const m = ch as Mesh;
        m.visible = false;
        (m.material as MeshBasicMaterial).opacity = 0.94;
      }
    }

    for (let ci = 0; ci < confettiGroup.children.length; ci++) {
      const m = confettiGroup.children[ci] as Mesh;
      if (!m.visible) continue;
      const vel = confettiVel[ci]!;
      m.position.addScaledVector(vel, dt);
      vel.y -= 11 * dt;
      vel.multiplyScalar(Math.max(0.88, 1 - 0.9 * dt));
      const sp = m.userData.spin as Vector3;
      m.rotation.x += sp.x * dt;
      m.rotation.y += sp.y * dt;
      m.rotation.z += sp.z * dt;
      const mat = m.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, mat.opacity - 0.28 * dt);
      if (m.position.y < -0.4 || mat.opacity < 0.06) {
        m.visible = false;
        mat.opacity = 0.94;
      }
    }

    const chaseIntensity = chase ? visualIntensity(chase) : 0;

    const damp = MathUtils.clamp(0.965 - chaseIntensity * 0.12, 0.82, 0.965);
    afterPass.uniforms["damp"].value = damp;
    bloomPass.strength = 0.32 + chaseIntensity * 0.62;
    bloomPass.radius = 0.38 + chaseIntensity * 0.28;
    bloomPass.threshold = Math.max(0.05, 0.2 - chaseIntensity * 0.1);
    const ribbonIntBase = 0.1 + chaseIntensity * 0.45;
    ribbonMat.emissiveIntensity = ribbonIntBase;

    if (celebActive) {
      const pulse = Math.sin(timeS * 12) * 0.5 + 0.5;
      ribbonMat.emissive.setHSL((timeS * 0.28) % 1, 0.72, 0.5);
      ribbonMat.emissiveIntensity += 0.42 + pulse * 0.55;
      bloomPass.strength = Math.max(bloomPass.strength, 0.78 + pulse * 0.48);
      bloomPass.radius = Math.max(bloomPass.radius, 0.54);
      bloomPass.threshold = Math.min(bloomPass.threshold, 0.06);
    } else {
      ribbonMat.emissive.copy(ribbonEmissiveBase);
    }

    finishFlagCloth.rotation.z =
      Math.sin(timeS * 2.85) * 0.065 + (celebActive ? Math.sin(timeS * 9.2) * 0.2 : 0);

    const lerpPos = 0.16;
    const lerpRot = 0.14;
    const lerpCam = 0.09;
    const lerpLook = 0.12;

    for (const p of top) {
      const entry = cars.get(p.id);
      if (!entry) continue;
      carTargetOnTrack(p.progress, entry.laneIndex, top.length, tmpV, tmpTan);
      entry.currentPos.lerp(tmpV, lerpPos);
      chaseDummy.position.copy(entry.currentPos);
      tmpLook.copy(entry.currentPos).add(tmpTan);
      chaseDummy.lookAt(tmpLook);
      entry.currentQuat.slerp(chaseDummy.quaternion, lerpRot);
      entry.root.position.copy(entry.currentPos);
      entry.root.quaternion.copy(entry.currentQuat);

      const int = visualIntensity(p);
      if (nitroActive(int)) {
        const pulse = Math.sin(timeS * 14) * 0.5 + 0.5;
        forEachCarPaintMaterial(entry.root, (mat) => {
          mat.emissive.setHex(0x1188ff);
          mat.emissiveIntensity = 0.32 + pulse * int * 0.95;
        });
        const sc = 1 + int * 0.12 * pulse;
        entry.root.scale.setScalar(sc);
      } else {
        forEachCarPaintMaterial(entry.root, (mat) => {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        });
        entry.root.scale.lerp(unitScale, 0.2);
      }
    }

    if (top.length === 0) {
      idealCam.set(0, 32, 48);
      idealLook.set(0, 0, 0);
    } else if (chase) {
      const chaseEntry = cars.get(chase.id);
      const lane = chaseEntry?.laneIndex ?? 0;
      carTargetOnTrack(chase.progress, lane, top.length, tmpV, tmpTan);
      idealLook.copy(tmpV);
      /** Chase from behind + above; no sideways offset — lateral offset framed the car off-center. */
      idealCam.copy(tmpV).addScaledVector(tmpTan, -11.2).addScaledVector(worldUp, 5.85);
    }

    if (!cameraInitialized && top.length > 0) {
      camPos.copy(idealCam);
      camLook.copy(idealLook);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      cameraInitialized = true;
    } else {
      camPos.lerp(idealCam, lerpCam);
      camLook.lerp(idealLook, lerpLook);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }

    const targetFov = MathUtils.clamp(44 + chaseIntensity * 32, 40, 88);
    camera.fov = MathUtils.lerp(camera.fov, targetFov, 0.12);
    camera.updateProjectionMatrix();

    const sh = chaseIntensity * 0.26;
    camera.position.x += Math.sin(timeS * 19.4) * sh * 0.42;
    camera.position.y += Math.sin(timeS * 27.1 + 1.7) * sh * 0.55;
    camera.position.z += Math.cos(timeS * 21.2) * sh * 0.38;

    if (celebActive) {
      const ce = Math.sin(timeS * 21) * 0.55 + 0.45;
      camera.position.y += Math.sin(timeS * 17) * ce * 0.55;
      camera.position.x += Math.cos(timeS * 14) * ce * 0.38;
    }

    camera.updateMatrixWorld(true);
    speedLineGroup.matrix.copy(camera.matrixWorld);

    const showWarn = now < wrongWarnUntilMs.value;
    warningSignGroup.visible = showWarn;
    if (showWarn && mine) {
      const wEnt = cars.get(mine.id);
      if (wEnt) {
        warningSignGroup.position.copy(wEnt.currentPos);
        warningSignGroup.position.y += 3.45;
        warningSignGroup.quaternion.copy(camera.quaternion);
        const ws = 1 + Math.sin(timeS * 20) * 0.12;
        warningSignGroup.scale.setScalar(ws);
      } else {
        warningSignGroup.visible = false;
      }
    }

    /** Tall additive panes + bloom read as “random pillars”, not speed. Only show on nitro. */
    const showLines = chase != null && nitroActive(chaseIntensity);
    speedLineGroup.visible = showLines;
    if (showLines) {
      const mult = 0.45 + chaseIntensity * 1.55;
      const opBase = MathUtils.clamp(0.03 + chaseIntensity * 0.18, 0.025, 0.2);
      for (const m of lineMeshes) {
        m.position.z += (m.userData.zSpeed as number) * mult * 0.5;
        (m.material as MeshBasicMaterial).opacity = opBase;
        if (m.position.z > 1.5) {
          m.position.z = -24 - Math.random() * 12;
          m.position.x = (Math.random() - 0.5) * 16;
          m.position.y = (Math.random() - 0.5) * 8;
        }
      }
    }

    composer.render();
  }

  tick();

  disposeThree = () => {
    cancelAnimationFrame(raf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    ribbonGeom.dispose();
    ribbonMat.dispose();
    scene.remove(finishFlagGroup);
    disposeObjectSubtree(finishFlagGroup);
    scene.remove(confettiGroup);
    disposeObjectSubtree(confettiGroup);
    scene.remove(warningSignGroup);
    disposeObjectSubtree(warningSignGroup);
    scene.remove(cityScenery);
    disposeObjectSubtree(cityScenery);
    shoulderGeom.dispose();
    shoulderMat.dispose();
    ground.geometry.dispose();
    (ground.material as MeshStandardMaterial).dispose();
    for (const [, e] of cars) {
      carsRoot.remove(e.root);
      disposeObjectSubtree(e.root);
    }
    cars.clear();
    for (const m of lineMeshes) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    lineMeshes.length = 0;
    scene.remove(speedLineGroup);
    afterPass.dispose();
    bloomPass.dispose();
    composer.dispose();
    renderer.dispose();
    canvas.removeEventListener("pointerdown", blockCanvasFocus);
    if (canvas.parentElement === el) {
      el.removeChild(canvas);
    }
    disposeThree = null;
  };
});

onBeforeUnmount(() => {
  disposeThree?.();
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-1 flex-col bg-slate-950/40"
    :class="compact ? 'min-h-[140px]' : 'min-h-[240px]'"
  >
    <div
      v-if="!compact"
      class="border-b border-slate-800 px-3 py-2 text-xs text-slate-400"
    >
      GT coupes on a city circuit — boulevard trees, blocks, skyline, and grass surrounds the track; your car has the gold beacon.
    </div>
    <div
      ref="host"
      class="relative min-h-0 w-full flex-1 overflow-hidden"
      :class="compact ? 'min-h-[120px]' : 'min-h-[200px]'"
    />
  </div>
</template>
