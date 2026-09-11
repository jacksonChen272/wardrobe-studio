import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Template } from './wardrobe';
export interface AvatarData {
  positions: number[][];
  body: number[];
  shell: number[];
  skirt: number[];
  joints: Record<string, number[]>;
}
export function pose(p: number[]) {
  const [x, y, z] = p;
  return [x * (0.82 + 0.18 * THREE.MathUtils.smoothstep(y, 0.78, 1.08)), y, z];
}
export function covers(t: Template, p: number[]) {
  const [x, y] = p;
  const ax = Math.abs(x);
  switch (t) {
    case 'tshirt':
      return y > 0.99 && y < 1.51 && ax < 0.32;
    case 'longsleeve':
    case 'shirt':
    case 'sweater':
    case 'hoodie':
    case 'jacket':
      return y > 0.97 && y < 1.51 && ax < 0.455;
    case 'shorts':
      return y > 0.59 && y < 1.04 && ax < 0.3;
    case 'skirt':
      return y > 0.5 && y < 1.04 && ax < 0.31;
    case 'pants':
    case 'jeans':
      return y > 0.105 && y < 1.04 && ax < 0.33;
    case 'sneakers':
      return y < 0.14;
    case 'casual':
      return y < 0.09;
  }
}
export function geometry(
  data: AvatarData,
  indices: number[],
  filter: (p: number[]) => boolean,
  offset = 0,
) {
  const pos = data.positions.flatMap(pose);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const normals = g.getAttribute('normal');
  const attr = g.getAttribute('position');
  for (let i = 0; i < attr.count; i++)
    attr.setXYZ(
      i,
      attr.getX(i) + normals.getX(i) * offset,
      attr.getY(i) + normals.getY(i) * offset,
      attr.getZ(i) + normals.getZ(i) * offset,
    );
  const kept: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    const p = [0, 1, 2].map(
      (k) => ids.reduce((sum, id) => sum + data.positions[id][k], 0) / 3,
    );
    if (filter(p)) kept.push(...ids);
  }
  g.setIndex(kept);
  g.computeBoundingSphere();
  return g;
}
export function garmentGeometry(data: AvatarData, t: Template) {
  const isSkirt = t === 'skirt';
  const indices = isSkirt ? data.skirt : data.shell;
  const offset = ['hoodie', 'jacket', 'sweater'].includes(t)
    ? 0.026
    : ['tshirt', 'shirt', 'longsleeve'].includes(t)
      ? 0.02
      : ['sneakers', 'casual'].includes(t)
        ? 0.018
        : 0.009;
  const full = geometry(data, indices, () => true, offset);
  // Clip crossing triangles at exact hem/cuff planes instead of discarding whole faces.
  const bounds: Record<Template, number[]> = {
    tshirt: [0.99, 1.51, 0.32],
    longsleeve: [0.97, 1.51, 0.455],
    shirt: [0.97, 1.51, 0.455],
    sweater: [0.97, 1.51, 0.455],
    hoodie: [0.97, 1.51, 0.455],
    jacket: [0.97, 1.51, 0.455],
    shorts: [0.59, 1.04, 0.3],
    skirt: [0.5, 1.04, 0.31],
    pants: [0.105, 1.04, 0.33],
    jeans: [0.105, 1.04, 0.33],
    sneakers: [-1, 0.14, 1],
    casual: [-1, 0.09, 1],
  };
  const [low, high, width] = bounds[t];
  type V = { source: number[]; position: number[]; normal: number[] };
  const fp = full.getAttribute('position'),
    fn = full.getAttribute('normal'),
    outP: number[] = [],
    outN: number[] = [],
    outI: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    let poly: V[] = indices
      .slice(i, i + 3)
      .map((id) => ({
        source: data.positions[id],
        position: [fp.getX(id), fp.getY(id), fp.getZ(id)],
        normal: [fn.getX(id), fn.getY(id), fn.getZ(id)],
      }));
    for (const [axis, limit, sign] of [
      [1, low, 1],
      [1, high, -1],
      [0, -width, 1],
      [0, width, -1],
    ]) {
      const next: V[] = [];
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j],
          b = poly[(j + 1) % poly.length],
          da = (a.source[axis] - limit) * sign,
          db = (b.source[axis] - limit) * sign;
        if (da >= 0) next.push(a);
        if (da >= 0 !== db >= 0) {
          const f = da / (da - db);
          const mix = (key: keyof V) =>
            a[key].map((v, k) => v + (b[key][k] - v) * f);
          next.push({
            source: mix('source'),
            position: mix('position'),
            normal: mix('normal'),
          });
        }
      }
      poly = next;
    }
    for (let j = 1; j < poly.length - 1; j++) {
      const base = outP.length / 3;
      for (const v of [poly[0], poly[j], poly[j + 1]]) {
        outP.push(...v.position);
        outN.push(...v.normal);
      }
      outI.push(base, base + 1, base + 2);
    }
  }
  full.dispose();
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  raw.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  raw.setIndex(outI);
  const g = mergeVertices(raw, 0.00001);
  raw.dispose();
  // Cuffs/necklines use boundary walls: actual thickness, not transparent cutouts.
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i) * 4, p.getY(i) * 4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const edges = new Map<string, [number, number, number]>();
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join('-');
      const e = edges.get(key);
      edges.set(key, [a, b, (e?.[2] ?? 0) + 1]);
    }
  }
  const positions = Array.from(p.array),
    normals = Array.from(n.array),
    newIndices = Array.from(idx.array);
  for (const [a, b, count] of edges.values()) {
    if (count !== 1) continue;
    const c = positions.length / 3;
    for (const id of [a, b]) {
      positions.push(
        p.getX(id) - n.getX(id) * 0.004,
        p.getY(id) - n.getY(id) * 0.004,
        p.getZ(id) - n.getZ(id) * 0.004,
      );
      normals.push(n.getX(id), n.getY(id), n.getZ(id));
      uv.push(p.getX(id) * 4, p.getY(id) * 4);
    }
    newIndices.push(a, b, c + 1, a, c + 1, c);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(newIndices);
  g.computeBoundingSphere();
  return g;
}
