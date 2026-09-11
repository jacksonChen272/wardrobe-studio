import type { GarmentShape, Template } from './wardrobe';
export const defaultShape = (t: Template): GarmentShape => ({
  hem:
    t === 'hoodie' ? 0.93 : t === 'shirt' ? 0.96 : t === 'jacket' ? 0.97 : 0.99,
  sleeve: t === 'tshirt' ? 0.32 : 0.505,
  ease:
    t === 'hoodie'
      ? 0.035
      : t === 'jacket'
        ? 0.026
        : t === 'shirt'
          ? 0.016
          : 0.008,
  legWidth: t === 'jeans' ? 1.17 : 1.08,
  flare: 1.18,
  neck: t === 'shirt' || t === 'jacket' ? 'collar' : 'crew',
});
export interface Silhouette {
  bounds: { x: number; y: number; width: number; height: number };
  torso: { x: number; y: number; width: number; height: number };
  aspect: number;
  sleeveRatio: number;
  coverage: number;
  legGap: boolean;
}
// Mask geometry supplies a tentative classification, never a claim of semantic AI detection.
export function silhouette(mask: ImageData): Silhouette {
  const { width: w, height: h, data } = mask;
  let left = w,
    right = 0,
    top = h,
    bottom = 0,
    count = 0;
  const rows = Array.from({ length: h }, () => ({
    left: w,
    right: 0,
    count: 0,
  }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 127) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        count++;
        rows[y].left = Math.min(rows[y].left, x);
        rows[y].right = Math.max(rows[y].right, x);
        rows[y].count++;
      }
  if (!count) throw Error('沒有找到衣服，請重新標出輪廓。');
  const bw = right - left + 1,
    bh = bottom - top + 1,
    median = (a: number[]) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
  const middle = rows
    .slice(Math.round(top + bh * 0.52), Math.round(top + bh * 0.82))
    .filter((r) => r.count > 0);
  const tl = middle.length ? median(middle.map((r) => r.left)) : left,
    tr = middle.length ? median(middle.map((r) => r.right)) : right;
  const low = rows[Math.min(h - 1, Math.round(top + bh * 0.85))];
  const center = Math.round((left + right) / 2),
    cy = Math.min(h - 1, Math.round(top + bh * 0.85));
  return {
    bounds: { x: left / w, y: top / h, width: bw / w, height: bh / h },
    torso: {
      x: tl / w,
      y: (top + bh * 0.035) / h,
      width: (tr - tl + 1) / w,
      height: (bh * 0.965) / h,
    },
    aspect: bw / bh,
    sleeveRatio: bw / Math.max(1, tr - tl),
    coverage: count / (w * h),
    legGap:
      low.count < (low.right - low.left) * 0.84 &&
      data[(cy * w + center) * 4 + 3] < 128,
  };
}
export function detectTemplate(
  s: Silhouette,
  name: string,
): { template: Template; confidence: number; reason: string } {
  const hints: [RegExp, Template][] = [
    [/hoodie|帽\s*t|連帽/i, 'hoodie'],
    [/襯衫|shirt(?!.*t-shirt)|button/i, 'shirt'],
    [/t-shirt|tshirt|短袖|素.?t/i, 'tshirt'],
    [/jacket|外套/i, 'jacket'],
    [/skirt|裙/i, 'skirt'],
    [/jeans|丹寧|牛仔/i, 'jeans'],
    [/shorts|短褲/i, 'shorts'],
    [/pants|長褲|褲/i, 'pants'],
    [/sneaker|shoe|鞋/i, 'sneakers'],
    [/長袖|long.?sleeve/i, 'longsleeve'],
  ];
  const hint = /t-shirt|tshirt|短袖|素.?t/i.test(name)
    ? ([/tshirt/, 'tshirt'] as [RegExp, Template])
    : hints.find(([r]) => r.test(name));
  if (hint)
    return {
      template: hint[1],
      confidence: 0.78,
      reason: '依檔名與衣物輪廓推測，請確認',
    };
  if (s.legGap && s.aspect < 1)
    return {
      template: s.aspect < 0.65 ? 'pants' : 'shorts',
      confidence: 0.62,
      reason: '依雙褲管輪廓推測',
    };
  if (s.aspect > 1.65 && s.sleeveRatio < 1.3)
    return {
      template: 'sneakers',
      confidence: 0.45,
      reason: '依低矮輪廓推測，請確認',
    };
  if (s.sleeveRatio > 1.85)
    return {
      template: 'longsleeve',
      confidence: 0.58,
      reason: '依延伸袖型推測，請確認領口與版型',
    };
  return {
    template: 'tshirt',
    confidence: 0.4,
    reason: '無法可靠辨識細分類，請手動確認',
  };
}
export function shapeFromSilhouette(s: Silhouette, t: Template): GarmentShape {
  const d = defaultShape(t);
  if (['shorts', 'pants', 'jeans'].includes(t))
    return {
      ...d,
      legWidth: Math.max(1.05, Math.min(1.45, 1 + s.aspect * 0.25)),
    };
  return {
    ...d,
    ease: Math.max(
      d.ease,
      Math.min(0.04, (s.torso.width / s.bounds.width - 0.4) * 0.055),
    ),
    flare: Math.max(1.05, Math.min(1.5, s.aspect + 0.7)),
  };
}
