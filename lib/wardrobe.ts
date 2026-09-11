export type Category = 'top' | 'bottom' | 'shoes';
export type Mode = 'builder' | 'inspect';
export const CATEGORIES: Category[] = ['top', 'bottom', 'shoes'];
export const labels = { top: '上衣', bottom: '下身', shoes: '鞋子' };
export const templates = {
  tshirt: '短袖 T-shirt',
  longsleeve: '長袖上衣',
  shirt: '襯衫',
  hoodie: '帽 T',
  sweater: '毛衣',
  jacket: '外套',
  shorts: '短褲',
  pants: '長褲',
  jeans: '牛仔褲',
  skirt: '裙子',
  sneakers: '運動鞋',
  casual: '休閒鞋',
};
export type Template = keyof typeof templates;
export const templateCategory = (t: Template): Category =>
  ['shorts', 'pants', 'jeans', 'skirt'].includes(t)
    ? 'bottom'
    : ['sneakers', 'casual'].includes(t)
      ? 'shoes'
      : 'top';
export interface Garment {
  id: string;
  name: string;
  category: Category;
  subcategory: Template;
  sourceType: 'sample' | 'upload' | 'product' | 'legacy';
  sourceImage: string;
  processedImage: string;
  mask: string | null;
  dominantColors: string[];
  texture: string | null;
  garmentTemplate: Template;
  createdAt: string;
  appearanceMethod: 'sample' | 'color' | 'fabric';
}
export type Outfit = Record<Category, string>;
const seed = (
  id: string,
  name: string,
  t: Template,
  color: string,
): Garment => ({
  id,
  name,
  category: templateCategory(t),
  subcategory: t,
  sourceType: 'sample',
  sourceImage: '',
  processedImage: '',
  mask: null,
  dominantColors: [color],
  texture: null,
  garmentTemplate: t,
  createdAt: '2026-09-11',
  appearanceMethod: 'sample',
});
export const samples = [
  seed('t-ink', '墨黑短袖', 'tshirt', '#242629'),
  seed('t-milk', '奶白針織', 'sweater', '#e7dfce'),
  seed('t-blue', '海軍藍襯衫', 'shirt', '#344b65'),
  seed('t-rust', '磚紅帽 T', 'hoodie', '#925344'),
  seed('b-denim', '直筒丹寧', 'jeans', '#435c76'),
  seed('b-black', '黑色長褲', 'pants', '#27292b'),
  seed('b-skirt', '石灰 A 字裙', 'skirt', '#797a73'),
  seed('b-short', '卡其短褲', 'shorts', '#a99578'),
  seed('s-white', '白色運動鞋', 'sneakers', '#e5e5df'),
  seed('s-dark', '黑色休閒鞋', 'casual', '#2a2b2b'),
];
export const initialOutfit: Outfit = {
  top: 't-ink',
  bottom: 'b-denim',
  shoes: 's-white',
};
export function cycle(
  outfit: Outfit,
  items: Garment[],
  category: Category,
  delta: number,
): Outfit {
  const list = items.filter((i) => i.category === category);
  if (!list.length) return outfit;
  const idx = list.findIndex((i) => i.id === outfit[category]);
  return {
    ...outfit,
    [category]: list[(Math.max(0, idx) + delta + list.length) % list.length].id,
  };
}
export function swipeCategory(
  y: number,
  bounds: { head: number; waist: number; ankle: number; foot: number },
): Category | null {
  if (y < bounds.head || y > bounds.foot) return null;
  return y < bounds.waist ? 'top' : y < bounds.ankle ? 'bottom' : 'shoes';
}
export function acceptedSwipe(dx: number, dy: number, width: number) {
  return (
    Math.abs(dx) >= Math.max(28, width * 0.065) &&
    Math.abs(dx) > Math.abs(dy) * 1.3
  );
}

function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('wardrobe-studio', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('items'))
        r.result.createObjectStore('items', { keyPath: 'id' });
      if (!r.result.objectStoreNames.contains('garments'))
        r.result.createObjectStore('garments', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveGarment(item: Garment) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction('garments', 'readwrite');
    tx.objectStore('garments').put(item);
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export async function loadGarments() {
  const d = await db();
  const read = (name: string) =>
    new Promise<unknown[]>((resolve, reject) => {
      const r = d.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const current = (await read('garments')) as Garment[];
  const legacy = (await read('items')) as {
    id: string;
    name: string;
    category: string;
    src: string;
  }[];
  d.close();
  for (const old of legacy) {
    if (
      current.some((g) => g.id === old.id) ||
      !['上衣', '下身', '鞋子'].includes(old.category)
    )
      continue;
    const t =
      old.category === '上衣'
        ? 'tshirt'
        : old.category === '下身'
          ? 'pants'
          : 'sneakers';
    const migrated: Garment = {
      ...seed(old.id, old.name, t, '#656e78'),
      sourceType: 'legacy',
      sourceImage: old.src,
      processedImage: old.src,
      appearanceMethod: 'color',
    };
    await saveGarment(migrated);
    current.push(migrated);
  }
  return current;
}
