<script setup lang="ts">
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    /** Shorter layout for embedded racing strip */
    compact?: boolean;
  }>(),
  { compact: false }
);

const host = ref<HTMLDivElement | null>(null);
let renderer: WebGLRenderer | null = null;
let raf = 0;
let mesh: Mesh | null = null;
let resizeObserver: ResizeObserver | null = null;
let disposeThree: (() => void) | null = null;

onMounted(() => {
  const el = host.value;
  if (!el) return;

  const scene = new Scene();
  scene.background = new Color(0x0f172a);

  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2.2, 1.4, 2.8);

  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  const lightA = new AmbientLight(0xffffff, 0.35);
  const lightB = new DirectionalLight(0xffffff, 1.1);
  lightB.position.set(3, 5, 4);
  scene.add(lightA, lightB);

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.2,
    roughness: 0.35,
  });
  mesh = new Mesh(geometry, material);
  scene.add(mesh);

  const resize = () => {
    if (!renderer) return;
    const w = el.clientWidth;
    const minH = props.compact ? 100 : 240;
    const h = Math.max(minH, el.clientHeight);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el);
  resize();

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (mesh) {
      mesh.rotation.x += 0.008;
      mesh.rotation.y += 0.012;
    }
    renderer?.render(scene, camera);
  };
  tick();

  disposeThree = () => {
    cancelAnimationFrame(raf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    geometry.dispose();
    material.dispose();
    renderer?.dispose();
    if (renderer?.domElement.parentElement === el) {
      el.removeChild(renderer.domElement);
    }
    renderer = null;
    mesh = null;
  };
});

onBeforeUnmount(() => {
  disposeThree?.();
  disposeThree = null;
});
</script>

<template>
  <div
    class="flex h-full flex-1 flex-col"
    :class="compact ? 'min-h-[140px]' : 'min-h-[240px]'"
  >
    <div
      v-if="!compact"
      class="border-b border-slate-800 px-3 py-2 text-xs text-slate-400"
    >
      Three.js · rotating mesh · resize-aware
    </div>
    <div
      ref="host"
      class="relative flex-1"
      :class="compact ? 'min-h-[120px]' : 'min-h-[220px]'"
    />
  </div>
</template>
