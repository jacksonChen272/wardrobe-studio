import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import 'fake-indexeddb/auto';
fs.mkdirSync('work/tests', { recursive: true });
for (const name of ['wardrobe', 'import-pipeline', 'garment-geometry']) {
  const source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
  const js = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replaceAll("'./wardrobe'", "'./wardrobe.js'");
  fs.writeFileSync(`work/tests/${name}.js`, js);
}
const {
  samples,
  initialOutfit,
  cycle,
  acceptedSwipe,
  swipeCategory,
  loadGarments,
  saveGarment,
  templates,
} = await import('../work/tests/wardrobe.js');
const { garmentGeometry, geometry, covers } =
  await import('../work/tests/garment-geometry.js');
globalThis.ImageData = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};
const { fallbackSegmenter, finishImport } =
  await import('../work/tests/import-pipeline.js');
let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`PASS ${name}`);
};
for (const c of ['top', 'bottom', 'shoes'])
  check(`${c} isolated, reversible, wraps`, () => {
    let o = cycle(initialOutfit, samples, c, 1);
    for (const other of ['top', 'bottom', 'shoes'].filter((x) => x !== c))
      assert.equal(o[other], initialOutfit[other]);
    assert.deepEqual(cycle(o, samples, c, -1), initialOutfit);
    for (let i = 1; i < samples.filter((x) => x.category === c).length; i++)
      o = cycle(o, samples, c, 1);
    assert.deepEqual(o, initialOutfit);
  });
check('swipe threshold and vertical rejection', () => {
  assert(!acceptedSwipe(5, 0, 390));
  assert(!acceptedSwipe(70, 90, 390));
  assert(acceptedSwipe(-40, 2, 390));
  assert(!acceptedSwipe(30, 1, 800));
});
check('normalized projection boundaries', () => {
  const b = { head: 0.15, waist: 0.45, ankle: 0.86, foot: 0.96 };
  assert.equal(swipeCategory(0.1, b), null);
  assert.equal(swipeCategory(0.3, b), 'top');
  assert.equal(swipeCategory(0.6, b), 'bottom');
  assert.equal(swipeCategory(0.9, b), 'shoes');
  assert.equal(swipeCategory(0.99, b), null);
});
const data = JSON.parse(
  fs.readFileSync('public/models/mannequin.json', 'utf8'),
);
for (const t of Object.keys(templates))
  check(`3D ${t}: finite, bounded, real depth`, () => {
    const g = garmentGeometry(data, t);
    assert(g.index.count > 300);
    for (const v of g.attributes.position.array) assert(Number.isFinite(v));
    g.computeBoundingBox();
    assert(g.boundingBox.max.z - g.boundingBox.min.z > 0.08);
    assert(g.index.count / 3 < 15000);
    g.dispose();
  });
check('visible skin geometry remains bounded', () => {
  const g = geometry(
    data,
    data.body,
    (p) =>
      !samples
        .filter((s) => Object.values(initialOutfit).includes(s.id))
        .some((s) => covers(s.garmentTemplate, p)),
  );
  assert(g.index.count < data.body.length);
  g.dispose();
});
const white = new ImageData(20, 20);
for (let i = 0; i < 400; i++) white.data.set([255, 255, 255, 255], i * 4);
for (let y = 5; y < 15; y++)
  for (let x = 5; x < 15; x++)
    white.data.set([20, 50, 150, 255], (y * 20 + x) * 4);
const separated = await fallbackSegmenter.separate(white);
check('uniform background segmentation keeps garment', () => {
  assert.equal(separated.method, 'edge-background');
  assert.equal(separated.mask.data[3], 0);
  assert.equal(separated.mask.data[(10 * 20 + 10) * 4 + 3], 255);
});
white.data[3] = 0;
for (let i = 0; i < 80; i++) white.data[i * 4 + 3] = 0;
const alpha = await fallbackSegmenter.separate(white);
check('transparent image preserves mask', () =>
  assert.equal(alpha.method, 'transparent'),
);
const complex = new ImageData(20, 20);
complex.data.fill(255);
complex.data.set([0, 0, 0, 255], 0);
const manual = await fallbackSegmenter.separate(complex);
check('complex photo honestly falls back to manual', () => {
  assert.equal(manual.method, 'manual');
  assert.equal(manual.mask, null);
});
const old = await new Promise((resolve, reject) => {
  const r = indexedDB.open('wardrobe-studio', 1);
  r.onupgradeneeded = () =>
    r.result.createObjectStore('items', { keyPath: 'id' });
  r.onsuccess = () => resolve(r.result);
  r.onerror = reject;
});
await new Promise((resolve) => {
  const tx = old.transaction('items', 'readwrite');
  for (const item of [
    {
      id: 'old-top',
      name: '旧衣',
      category: '上衣',
      src: 'data:image/png;base64,a',
    },
    {
      id: 'old-accessory',
      name: '項鍊',
      category: '配飾',
      src: 'data:image/png;base64,b',
    },
  ])
    tx.objectStore('items').put(item);
  tx.oncomplete = resolve;
});
old.close();
const migrated = await loadGarments();
check('v1 migration preserves IDs and source', () => {
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'old-top');
  assert.equal(migrated[0].sourceImage, 'data:image/png;base64,a');
});
const item = finishImport(
  { source: 'source', processed: 'processed', mask: null },
  '測試布料',
  'shirt',
  '#224466',
  'swatch',
);
await saveGarment(item);
const reloaded = await loadGarments();
check(
  'save/reload retains structured appearance without duplicate migration',
  () => {
    assert.equal(reloaded.length, 2);
    assert.deepEqual(
      reloaded.find((x) => x.id === item.id),
      item,
    );
  },
);
const retained = await new Promise((resolve) => {
  const r = indexedDB.open('wardrobe-studio', 2);
  r.onsuccess = () => {
    const d = r.result,
      q = d.transaction('items').objectStore('items').getAll();
    q.onsuccess = () => {
      d.close();
      resolve(q.result);
    };
  };
});
check('legacy accessories untouched', () => assert.equal(retained.length, 2));
console.log(`${passed} checks passed`);
