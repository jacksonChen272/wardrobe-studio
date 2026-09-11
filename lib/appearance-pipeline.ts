import { fallbackSegmenter } from './import-pipeline';
import {
  silhouette,
  detectTemplate,
  shapeFromSilhouette,
  type Silhouette,
} from './garment-analysis';
import {
  templateCategory,
  type Garment,
  type Template,
  type GarmentShape,
  type GarmentAppearance,
} from './wardrobe';
export interface AppearanceDraft {
  source: string;
  processed: string;
  mask: string;
  name: string;
  colors: string[];
  silhouette: Silhouette;
  detected: ReturnType<typeof detectTemplate>;
  appearance: GarmentAppearance;
  requiresMask: boolean;
  sourceType: 'upload' | 'product';
  width: number;
  height: number;
}
const MAX = 15 * 1024 * 1024;
function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export async function importImageUrl(value: string): Promise<File> {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw Error('請貼上完整的圖片網址（https://…）。');
  }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw Error('僅支援不含登入資訊的 HTTP / HTTPS 圖片網址。');
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 15000);
  try {
    const r = await fetch(u.href, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: abort.signal,
    });
    if (!r.ok) throw Error();
    if (Number(r.headers.get('content-length')) > MAX)
      throw Error('圖片請小於15MB。');
    const reader = r.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX) {
        await reader.cancel();
        throw Error('圖片請小於15MB。');
      }
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    const type = r.headers.get('content-type')?.split(';')[0] || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
      throw Error('這是商品頁或不支援的格式，請下載商品圖片後上傳。');
    return new File(
      chunks,
      '商品圖片.' +
        (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'),
      { type },
    );
  } catch (e) {
    if (e instanceof Error && /15MB|商品頁/.test(e.message)) throw e;
    throw Error(
      '網站限制跨來源讀取（CORS）、網址失效或連線逾時。請先將商品圖儲存到裝置，再上傳或拖入；不需要重開加入流程。',
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function prepareAppearance(
  file: File,
  sourceType: 'upload' | 'product' = 'upload',
): Promise<AppearanceDraft> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('支援JPG、PNG、WEBP，請先轉換HEIC或其他格式。');
  if (file.size > MAX) throw Error('圖片請小於15MB。');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const c = canvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const source = c.toDataURL();
  const raw = ctx.getImageData(0, 0, c.width, c.height),
    seg = await fallbackSegmenter.separate(raw);
  const mask =
    seg.mask ||
    new ImageData(new Uint8ClampedArray(raw.data), c.width, c.height);
  if (!seg.mask)
    for (let i = 3; i < mask.data.length; i += 4) mask.data[i] = 255;
  return extract(
    source,
    raw,
    mask,
    file.name.replace(/\.[^.]+$/, ''),
    sourceType,
    seg.method,
    seg.method === 'manual',
  );
}
function extract(
  source: string,
  raw: ImageData,
  mask: ImageData,
  name: string,
  sourceType: 'upload' | 'product',
  method: string,
  manual: boolean,
): AppearanceDraft {
  const s = silhouette(mask),
    bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  let skin = 0,
    pixels = 0;
  for (let i = 0; i < raw.data.length; i += 4) {
    raw.data[i + 3] = mask.data[i + 3];
    if (mask.data[i + 3] < 128) continue;
    const [r, g, b] = raw.data.slice(i, i + 3);
    if (r > 95 && r > g * 1.18 && g > b * 1.12 && r - b > 35) skin++;
    pixels++;
    const key = [r >> 4, g >> 4, b >> 4].join();
    const v = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++;
    v.r += r;
    v.g += g;
    v.b += b;
    bins.set(key, v);
  }
  const colors = [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map(
      (v) =>
        '#' +
        [v.r, v.g, v.b]
          .map((x) =>
            Math.round(x / v.n)
              .toString(16)
              .padStart(2, '0'),
          )
          .join(''),
    );
  const c = canvas(raw.width, raw.height),
    ctx = c.getContext('2d')!;
  ctx.putImageData(mask, 0, 0);
  const maskUrl = c.toDataURL();
  ctx.putImageData(raw, 0, 0);
  const processed = c.toDataURL();
  const detected = detectTemplate(s, name);
  const requiresMask =
    method !== 'manual-polygon' &&
    (manual ||
      s.coverage < 0.035 ||
      (skin / Math.max(1, pixels) > 0.18 && s.aspect < 0.8));
  return {
    source,
    processed,
    mask: maskUrl,
    name,
    colors,
    silhouette: s,
    detected,
    sourceType,
    requiresMask,
    width: raw.width,
    height: raw.height,
    appearance: {
      version: 2,
      frontTexture: processed,
      frontRegion: s.torso,
      confidence: requiresMask ? 0 : detected.confidence,
      method,
    },
  };
}
export async function correctMask(
  draft: AppearanceDraft,
  points: [number, number][],
): Promise<AppearanceDraft> {
  if (points.length < 3) throw Error('至少點選3個輪廓點。');
  const image = new Image();
  image.src = draft.source;
  await image.decode();
  const c = canvas(image.width, image.height),
    ctx = c.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const raw = ctx.getImageData(0, 0, c.width, c.height);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  points.forEach(([x, y], i) =>
    i
      ? ctx.lineTo(x * c.width, y * c.height)
      : ctx.moveTo(x * c.width, y * c.height),
  );
  ctx.closePath();
  ctx.fill();
  return extract(
    draft.source,
    raw,
    ctx.getImageData(0, 0, c.width, c.height),
    draft.name,
    draft.sourceType,
    'manual-polygon',
    false,
  );
}
export function previewGarment(
  draft: AppearanceDraft,
  name: string,
  t: Template,
  shape?: GarmentShape,
): Garment {
  const region =
    templateCategory(t) === 'top'
      ? draft.silhouette.torso
      : draft.silhouette.bounds;
  return {
    id: 'draft',
    name: name.trim() || '新衣物',
    category: templateCategory(t),
    subcategory: t,
    sourceType: draft.sourceType,
    sourceImage: draft.source,
    processedImage: draft.processed,
    mask: draft.mask,
    dominantColors: draft.colors,
    texture: null,
    garmentTemplate: t,
    createdAt: new Date().toISOString(),
    appearanceMethod: 'front-projection',
    appearance: { ...draft.appearance, frontRegion: region },
    shape: shape || shapeFromSilhouette(draft.silhouette, t),
  };
}
