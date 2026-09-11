'use client';
import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import * as THREE from 'three';
import { createGarment, disposeGarment } from '@/lib/garment-render';
import { covers, geometry, type AvatarData } from '@/lib/garment-geometry';
import { CATEGORIES, type Garment, type Mode } from '@/lib/wardrobe';
export interface ViewHandle {
  zone: (y: number) => 'top' | 'bottom' | 'shoes' | null;
  capture: () => void;
  stats: () => unknown;
}
type Props = {
  mode: Mode;
  angle: number;
  zoom: number;
  garments: Garment[];
  onReady: () => void;
};
type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  root: THREE.Group;
  data: AvatarData;
  body: THREE.Mesh;
  parts: Map<string, THREE.Mesh>;
  render: () => void;
  transitions: { mesh: THREE.Mesh; start: number }[];
};
export const Avatar3D = forwardRef<ViewHandle, Props>(function Avatar3D(
  { mode, angle, zoom, garments, onReady },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    desired = useRef({ mode, angle, zoom });
  const [loaded, setLoaded] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    desired.current = { mode, angle, zoom };
  }, [mode, angle, zoom]);
  useImperativeHandle(
    ref,
    () => ({
      zone(y) {
        const r = runtime.current;
        if (!r) return null;
        const screen = (height: number) =>
          (1 - new THREE.Vector3(0, height, 0).project(r.camera).y) / 2;
        return y < screen(1.54) || y > screen(-0.05)
          ? null
          : y < screen(1.02)
            ? 'top'
            : y < screen(0.16)
              ? 'bottom'
              : 'shoes';
      },
      capture() {
        const r = runtime.current;
        if (!r) return;
        r.render();
        const link = document.createElement('a');
        link.download = 'wardrobe-look.png';
        link.href = r.renderer.domElement.toDataURL('image/png');
        link.click();
      },
      stats() {
        const r = runtime.current;
        return r
          ? {
              triangles: r.renderer.info.render.triangles,
              drawCalls: r.renderer.info.render.calls,
              geometries: r.renderer.info.memory.geometries,
              rotation: r.root.rotation.y,
              parts: [...r.parts.keys()],
            }
          : null;
      },
    }),
    [],
  );
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false,
      frame = 0;
    const abort = new AbortController();
    let cleanup = () => {};
    async function init() {
      if (!container) return;
      try {
        const response = await fetch('./models/mannequin.json', {
          signal: abort.signal,
        });
        if (!response.ok) throw Error('人台下載失敗');
        const data = (await response.json()) as AvatarData;
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({
          antialias: window.devicePixelRatio < 2,
          alpha: false,
          preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.setClearColor('#e5e6e2');
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        container.appendChild(renderer.domElement);
        const scene = new THREE.Scene(),
          camera = new THREE.OrthographicCamera(-1, 1, 2, 0, 0.1, 20);
        camera.position.set(0, 0.92, 5);
        camera.lookAt(0, 0.92, 0);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xa3a69d, 2));
        for (const [x, y, z, intensity] of [
          [3, 4, 4, 2.8],
          [-3, 2, 1, 1.2],
          [-1, 3, -3, 2],
        ]) {
          const light = new THREE.DirectionalLight(0xffffff, intensity);
          light.position.set(x, y, z);
          scene.add(light);
        }
        const root = new THREE.Group();
        scene.add(root);
        const body = new THREE.Mesh(
          geometry(data, data.body, () => true),
          new THREE.MeshStandardMaterial({ color: '#e3e3df', roughness: 0.32 }),
        );
        root.add(body);
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.39, 0.4, 0.022, 64),
          new THREE.MeshStandardMaterial({ color: '#c5c7c1', roughness: 0.48 }),
        );
        base.position.y = -0.02;
        scene.add(base);
        const r: Runtime = {
          renderer,
          scene,
          camera,
          root,
          data,
          body,
          parts: new Map(),
          render: () => renderer.render(scene, camera),
          transitions: [],
        };
        runtime.current = r;
        const resize = () => {
          const w = container.clientWidth,
            h = container.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h, false);
          const halfHeight = Math.max(1.025, (0.59 * h) / w);
          camera.left = (-halfHeight * w) / h;
          camera.right = (halfHeight * w) / h;
          camera.top = halfHeight;
          camera.bottom = -halfHeight;
          camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        let last = performance.now(),
          slowFrames = 0,
          observedFrames = 0;
        const loop = (now: number) => {
          if (disposed) return;
          const dt = Math.min((now - last) / 1000, 0.05);
          if (document.visibilityState === 'visible') {
            observedFrames++;
            if (now - last > 36) slowFrames++;
            if (observedFrames === 120) {
              if (slowFrames > 45 && renderer.getPixelRatio() > 1) {
                renderer.setPixelRatio(1);
                resize();
              }
              observedFrames = 0;
              slowFrames = 0;
            }
          }
          last = now;
          const target =
            desired.current.mode === 'builder' ? 0 : desired.current.angle;
          root.rotation.y =
            desired.current.mode === 'builder'
              ? 0
              : THREE.MathUtils.damp(root.rotation.y, target, 14, dt);
          camera.zoom =
            desired.current.mode === 'builder' ? 1 : desired.current.zoom;
          camera.updateProjectionMatrix();
          r.transitions = r.transitions.filter((t) => {
            const a = Math.min(1, (now - t.start) / 180);
            t.mesh.position.x = (1 - a) * 0.018;
            const m = t.mesh.material as THREE.MeshStandardMaterial;
            m.opacity = 0.45 + 0.55 * a;
            if (a === 1) {
              m.transparent = false;
              m.needsUpdate = true;
            }
            return a < 1;
          });
          if (document.visibilityState === 'visible') r.render();
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          r.parts.clear();
          disposeGarment(scene);
          renderer.dispose();
          renderer.domElement.remove();
          runtime.current = null;
        };
        setLoaded((v) => v + 1);
        onReady();
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : '裝置無法啟動 3D');
      }
    }
    void init();
    return () => {
      disposed = true;
      abort.abort();
      cleanup();
    };
    // Scene lifetime deliberately does not depend on garment selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    for (const c of CATEGORIES) {
      const garment = garments.find((g) => g.category === c);
      if (!garment) continue;
      const old = r.parts.get(c);
      if (old?.userData.garment === garment) continue;
      if (old) {
        r.root.remove(old);
        disposeGarment(old);
        r.transitions = r.transitions.filter((t) => t.mesh !== old);
      }
      const mesh = createGarment(
        r.data,
        garment,
        () => r.parts.get(c) === mesh,
      );
      mesh.userData.garment = garment;
      const material = mesh.material as THREE.MeshStandardMaterial;
      r.root.add(mesh);
      r.parts.set(c, mesh);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        material.transparent = true;
        r.transitions.push({ mesh, start: performance.now() });
      }
    }
    // Hide covered skin triangles, preventing penetration even with the loose templates.
    r.body.geometry.dispose();
    r.body.geometry = geometry(
      r.data,
      r.data.body,
      (p) => !garments.some((g) => covers(g.garmentTemplate, p, g.shape)),
    );
    r.render();
  }, [garments, loaded]);
  return (
    <div className="render-host" ref={host}>
      {!loaded && !error && <div className="scene-status">正在準備試衣間…</div>}
      {error && (
        <div className="scene-status">{error}。請更新瀏覽器或重新載入。</div>
      )}
    </div>
  );
});
