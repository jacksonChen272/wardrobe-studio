import type { Garment, Template } from './wardrobe';
import { templateCategory } from './wardrobe';
export interface SegmentationResult {
  mask: ImageData | null;
  confidence: number;
  method: 'transparent' | 'edge-background' | 'manual';
}
export interface GarmentSegmenter {
  separate(image: ImageData): Promise<SegmentationResult>;
}
// Pluggable local/remote segmentation contract. No remote API is called.
export const fallbackSegmenter: GarmentSegmenter = {
  async separate(image) {
    const { width: w, height: h, data } = image;
    const mask = new ImageData(w, h);
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 10) transparent++;
    if (transparent > data.length / 40) {
      for (let i = 0; i < data.length; i += 4)
        mask.data.set([255, 255, 255, data[i + 3]], i);
      return { mask, confidence: 0.95, method: 'transparent' };
    }
    const corners = [0, w - 1, (h - 1) * w, w * h - 1];
    const bg = [0, 1, 2].map(
      (k) => corners.reduce((a, i) => a + data[i * 4 + k], 0) / 4,
    );
    const uniform = corners.every(
      (i) => Math.hypot(...bg.map((v, k) => v - data[i * 4 + k])) < 30,
    );
    if (!uniform) return { mask: null, confidence: 0, method: 'manual' };
    const visited = new Uint8Array(w * h),
      queue = new Int32Array(w * h);
    let start = 0,
      end = 0;
    const add = (p: number) => {
      if (visited[p]) return;
      visited[p] = 1;
      if (Math.hypot(...bg.map((v, k) => v - data[p * 4 + k])) < 35)
        queue[end++] = p;
    };
    for (let x = 0; x < w; x++) {
      add(x);
      add((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      add(y * w);
      add(y * w + w - 1);
    }
    while (start < end) {
      const p = queue[start++];
      if (p % w) add(p - 1);
      if (p % w < w - 1) add(p + 1);
      if (p >= w) add(p - w);
      if (p < w * (h - 1)) add(p + w);
    }
    const removed = new Set(queue.subarray(0, end));
    for (let p = 0; p < w * h; p++)
      mask.data.set([255, 255, 255, removed.has(p) ? 0 : 255], p * 4);
    return { mask, confidence: 0.65, method: 'edge-background' };
  },
};
export interface ImportDraft {
  source: string;
  processed: string;
  mask: string | null;
  color: string;
  method: string;
  width: number;
  height: number;
}
export async function prepareImport(file: File): Promise<ImportDraft> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('請選擇 JPG、PNG 或 WEBP 圖片');
  if (file.size > 15 * 1024 * 1024) throw Error('圖片請小於 15 MB');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * ratio));
  c.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const source = c.toDataURL('image/png');
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const segmentation = await fallbackSegmenter.separate(data);
  let mask: string | null = null;
  if (segmentation.mask) {
    for (let i = 3; i < data.data.length; i += 4)
      data.data[i] = segmentation.mask.data[i];
    ctx.putImageData(segmentation.mask, 0, 0);
    mask = c.toDataURL();
    ctx.putImageData(data, 0, 0);
  }
  const bins = new Map<string, { count: number; rgb: number[] }>();
  for (let i = 0; i < data.data.length; i += 16) {
    if (data.data[i + 3] < 128) continue;
    const rgb = [...data.data.slice(i, i + 3)],
      key = rgb.map((v) => v >> 5).join(',');
    const b = bins.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    b.count++;
    rgb.forEach((v, k) => (b.rgb[k] += v));
    bins.set(key, b);
  }
  const best = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  const color = best
    ? '#' +
      best.rgb
        .map((v) =>
          Math.round(v / best.count)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    : '#777777';
  return {
    source,
    processed: c.toDataURL(),
    mask,
    color,
    method: segmentation.method,
    width: c.width,
    height: c.height,
  };
}
export function finishImport(
  draft: ImportDraft,
  name: string,
  template: Template,
  color: string,
  texture: string | null,
): Garment {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '新衣物',
    category: templateCategory(template),
    subcategory: template,
    sourceType: 'upload',
    sourceImage: draft.source,
    processedImage: draft.processed,
    mask: draft.mask,
    dominantColors: [color],
    texture,
    garmentTemplate: template,
    createdAt: new Date().toISOString(),
    appearanceMethod: texture ? 'fabric' : 'color',
  };
}
// Explicit user-selected fabric swatch. Never map an entire person/product photo to sleeves.
export async function fabricSwatch(source: string, x: number, y: number) {
  const img = new Image();
  img.src = source;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const side = Math.max(16, Math.min(img.width, img.height) * 0.1);
  ctx.drawImage(
    img,
    Math.max(0, Math.min(img.width - side, x * img.width - side / 2)),
    Math.max(0, Math.min(img.height - side, y * img.height - side / 2)),
    side,
    side,
    0,
    0,
    128,
    128,
  );
  return c.toDataURL();
}
