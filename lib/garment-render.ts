import * as THREE from 'three';
import {
  garmentGeometry,
  garmentBounds,
  type AvatarData,
} from './garment-geometry';
import { defaultShape } from './garment-analysis';
import { templateCategory, type Garment } from './wardrobe';

export function frontCoordinates(g: THREE.BufferGeometry, item: Garment) {
  const region = item.appearance?.frontRegion || {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    shape = item.shape || defaultShape(item.garmentTemplate),
    [low, high] = garmentBounds(item.garmentTemplate, shape),
    top = templateCategory(item.garmentTemplate) === 'top';
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal'),
    uv: number[] = [],
    weights: number[] = [];
  const half = top
    ? 0.18 + shape.ease
    : item.category === 'shoes'
      ? 0.28
      : item.garmentTemplate === 'skirt'
        ? 0.3
        : 0.29;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    uv.push(
      region.x + (x / (half * 2) + 0.5) * region.width,
      1 - (region.y + (1 - (y - low) / (high - low)) * region.height),
    );
    weights.push(
      z > -0.005
        ? THREE.MathUtils.smoothstep(n.getZ(i), 0.1, 0.55) *
            (top
              ? 1 -
                THREE.MathUtils.smoothstep(
                  Math.abs(x),
                  half - 0.018,
                  half + 0.02,
                )
              : 1)
        : 0,
    );
  }
  g.setAttribute('frontUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('frontWeight', new THREE.Float32BufferAttribute(weights, 1));
}
export function disposeGarment(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        materials.add(m),
      );
    }
  });
  for (const m of materials) {
    for (const key of ['map', 'bumpMap', 'normalMap', 'roughnessMap']) {
      const t = (m as unknown as Record<string, unknown>)[key];
      if (t instanceof THREE.Texture) textures.add(t);
    }
    if (m.userData.frontMap instanceof THREE.Texture)
      textures.add(m.userData.frontMap);
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
}
export function createGarment(
  data: AvatarData,
  item: Garment,
  isCurrent: () => boolean,
) {
  const t = item.garmentTemplate,
    s = item.shape || defaultShape(t),
    g = garmentGeometry(data, t, s);
  frontCoordinates(g, item);
  const color = new THREE.Color(item.dominantColors[0] || '#777777'),
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: t === 'jeans' ? 0.96 : t === 'shirt' ? 0.72 : 0.85,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
  const mesh = new THREE.Mesh(g, material);
  mesh.userData.id = item.id;
  // Small deterministic weave modifies normals; print pixels remain the original source pixels.
  const weave = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const v =
          120 + ((x + y) % 2) * 8 + Math.round(Math.sin(x * 1.7 + y * 2.4) * 3),
        i = (y * 64 + x) * 4;
      weave.set([v, v, v, 255], i);
    }
  const bump = new THREE.DataTexture(weave, 64, 64);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(7, 7);
  bump.needsUpdate = true;
  material.bumpMap = bump;
  material.bumpScale = t === 'sweater' ? 0.004 : 0.0012;
  if (item.appearance) {
    const empty = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 0]),
      1,
      1,
    );
    empty.needsUpdate = true;
    const uniform = { value: empty as THREE.Texture };
    material.userData.frontMap = empty;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.garmentFront = uniform;
      shader.vertexShader =
        'attribute vec2 frontUv; attribute float frontWeight; varying vec2 vGarmentUv; varying float vGarmentWeight;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGarmentUv=frontUv; vGarmentWeight=frontWeight;',
      );
      shader.fragmentShader =
        'uniform sampler2D garmentFront; varying vec2 vGarmentUv; varying float vGarmentWeight;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nvec4 garmentPixel=texture2D(garmentFront,vGarmentUv); float inFrame=step(0.0,vGarmentUv.x)*step(vGarmentUv.x,1.0)*step(0.0,vGarmentUv.y)*step(vGarmentUv.y,1.0); diffuseColor.rgb=mix(diffuseColor.rgb,garmentPixel.rgb,garmentPixel.a*clamp(vGarmentWeight,0.0,1.0)*inFrame);',
      );
    };
    material.customProgramCacheKey = () => 'wardrobe-source-front-v2';
    new THREE.TextureLoader().load(
      item.appearance.frontTexture,
      (texture) => {
        if (!isCurrent()) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 4;
        uniform.value = texture;
        empty.dispose();
        material.userData.frontMap = texture;
      },
      undefined,
      () => {
        mesh.userData.textureError = true;
      },
    );
  } else if (item.texture) {
    new THREE.TextureLoader().load(item.texture, (texture) => {
      if (!isCurrent()) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      material.map = texture;
      material.color.set('white');
      material.needsUpdate = true;
    });
  }
  const trim = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.82),
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    light = new THREE.MeshStandardMaterial({
      color: color.clone().lerp(new THREE.Color('white'), 0.18),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material = trim) => {
    const m = new THREE.Mesh(geo, mat);
    mesh.add(m);
    return m;
  };
  const tube = (
    points: number[][],
    radius = 0.003,
    mat: THREE.Material = trim,
  ) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.map(
            (p) => new THREE.Vector3(...(p as [number, number, number])),
          ),
        ),
        24,
        radius,
        6,
        false,
      ),
      mat,
    );
  if (item.category === 'top') {
    // Ribbed neck follows a shallow U in front, while collar leaves are actual folded geometry.
    if (s.neck !== 'collar') {
      tube(
        [
          [-0.083, 1.49, 0.045],
          [-0.063, 1.469, 0.078],
          [0, s.neck === 'v' ? 1.42 : 1.461, 0.093],
          [0.063, 1.469, 0.078],
          [0.083, 1.49, 0.045],
        ],
        t === 'hoodie' ? 0.008 : 0.005,
        light,
      );
    }
    for (const side of [-1, 1])
      tube(
        [
          [side * 0.085, 1.495, 0.03],
          [side * 0.155, 1.463, 0.04],
          [side * 0.21, 1.418, 0.06],
        ],
        0.0022,
      );
    if (s.neck === 'collar') {
      for (const side of [-1, 1]) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              side * 0.018,
              1.48,
              0.072,
              side * 0.087,
              1.485,
              0.04,
              side * 0.107,
              1.435,
              0.083,
              side * 0.048,
              1.413,
              0.118,
            ],
            3,
          ),
        );
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        add(geo, light).name = 'collar-' + side;
      }
      tube(
        [
          [0, s.hem + 0.018, 0.137],
          [0, 1.15, 0.116],
          [0, 1.33, 0.142],
          [0, 1.437, 0.1],
        ],
        t === 'jacket' ? 0.003 : 0.006,
        trim,
      );
      if (t === 'shirt')
        for (let y = s.hem + 0.055; y < 1.43; y += 0.074) {
          const m = add(new THREE.SphereGeometry(0.0045, 8, 6), light);
          m.position.set(0.004, y, y < 1.18 ? 0.13 : 0.15);
        }
    }
    if (t === 'hoodie') {
      const hood = new THREE.SphereGeometry(
        0.12,
        32,
        20,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.64,
      );
      hood.rotateX(-Math.PI / 2);
      hood.scale(1, 0.94, 0.85);
      hood.translate(0, 1.505, -0.045);
      add(hood, material.clone()).name = 'hood';
      for (const side of [-1, 1])
        tube(
          [
            [side * 0.035, 1.47, 0.12],
            [side * 0.029, 1.4, 0.157],
            [side * 0.034, 1.33, 0.16],
          ],
          0.003,
          light,
        );
      tube(
        [
          [-0.11, 1.15, 0.142],
          [-0.075, 1.2, 0.147],
          [0.075, 1.2, 0.147],
          [0.11, 1.15, 0.142],
        ],
        0.003,
        trim,
      );
    }
    // Hem piping and cuffs provide a visible sewn edge, with conservative depth.
    tube(
      [
        [-0.16 - s.ease, s.hem + 0.009, 0.105],
        [-0.08, s.hem + 0.009, 0.143],
        [0.08, s.hem + 0.009, 0.143],
        [0.16 + s.ease, s.hem + 0.009, 0.105],
      ],
      0.003,
      trim,
    );
  } else if (item.category === 'shoes') {
    for (const side of [-1, 1]) {
      const outline = new THREE.Shape();
      outline.moveTo(-0.044, -0.07);
      outline.bezierCurveTo(-0.067, 0, -0.065, 0.2, -0.038, 0.258);
      outline.quadraticCurveTo(0, 0.286, 0.052, 0.25);
      outline.bezierCurveTo(0.075, 0.2, 0.06, -0.04, 0.04, -0.07);
      outline.closePath();
      const sole = new THREE.ExtrudeGeometry(outline, {
        depth: t === 'sneakers' ? 0.025 : 0.014,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.004,
        bevelThickness: 0.004,
      });
      sole.rotateX(Math.PI / 2);
      sole.translate(side * 0.194, 0.028, 0);
      const soleMat = new THREE.MeshStandardMaterial({
        color: t === 'sneakers' ? '#dddeda' : '#30332e',
        roughness: 0.85,
      });
      add(sole, soleMat).name = 'sole-' + side;
      if (t === 'sneakers')
        for (let z = 0.075; z < 0.16; z += 0.023)
          tube(
            [
              [side * 0.194 - 0.038, 0.093, z],
              [side * 0.194 + 0.038, 0.093, z + 0.014],
            ],
            0.0026,
            light,
          );
    }
  }
  // Dispose unattached trim materials too (e.g. plain pants).
  if (!mesh.children.some((c) => (c as THREE.Mesh).material === trim))
    trim.dispose();
  if (!mesh.children.some((c) => (c as THREE.Mesh).material === light))
    light.dispose();
  return mesh;
}
