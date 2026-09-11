import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
fs.mkdirSync('work/tests', { recursive: true });
for (const name of [
  'wardrobe',
  'import-pipeline',
  'garment-geometry',
  'garment-analysis',
  'garment-render',
  'appearance-pipeline',
]) {
  const source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
  const js = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g, '$1$2.js$3');
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
const { defaultShape, detectTemplate, silhouette } =
  await import('../work/tests/garment-analysis.js');
const { frontCoordinates, createGarment, disposeGarment } =
  await import('../work/tests/garment-render.js');
const { importImageUrl } = await import('../work/tests/appearance-pipeline.js');
check('existing six gesture functions are unchanged', () => {
  const file = ts.createSourceFile(
      'p.tsx',
      fs.readFileSync('app/page.tsx', 'utf8'),
      99,
      true,
      4,
    ),
    parts = [];
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ['down', 'move', 'up', 'change', 'switchMode', 'resetGesture'].includes(
        n.name.getText(file),
      )
    )
      parts.push(
        n.name.getText(file) +
          ':' +
          n.initializer.getText(file).replace(/\s+/g, ''),
      );
    ts.forEachChild(n, visit);
  };
  visit(file);
  assert.equal(
    createHash('sha256').update(parts.sort().join('|')).digest('hex'),
    'ca606c752336c567c8963df9e0f1d82ce5dcf68d918b2a552d56656ec758b8e2',
  );
});
check('T-shirt name never matches generic shirt', () =>
  assert.equal(
    detectTemplate(silhouette(separated.mask), '紅色白 T-tshirt').template,
    'tshirt',
  ),
);
check(
  'shirt, hoodie and T-shirt have distinct silhouettes and construction',
  () => {
    const meshes = ['tshirt', 'shirt', 'hoodie'].map((t) =>
      createGarment(
        data,
        { ...samples[0], garmentTemplate: t, shape: defaultShape(t) },
        () => true,
      ),
    );
    meshes.forEach((m) => m.geometry.computeBoundingBox());
    assert(
      meshes[0].geometry.boundingBox.max.x <
        meshes[1].geometry.boundingBox.max.x,
    );
    assert(
      meshes[2].geometry.boundingBox.min.y <
        meshes[0].geometry.boundingBox.min.y,
    );
    assert(meshes[1].getObjectByName('collar-1'));
    assert(meshes[2].getObjectByName('hood'));
    assert(!meshes[0].getObjectByName('hood'));
    // Full sleeves cover the distal forearm; short sleeves must leave it exposed.
    assert(covers('shirt', [0.45, 1.16, 0.15]));
    assert(covers('hoodie', [0.45, 1.16, 0.15]));
    assert(!covers('tshirt', [0.45, 1.16, 0.15]));
    meshes.forEach(disposeGarment);
  },
);
check('shoe template includes two real sole meshes', () => {
  const m = createGarment(
    data,
    samples.find((g) => g.garmentTemplate === 'sneakers'),
    () => true,
  );
  assert(m.getObjectByName('sole-1'));
  assert(m.getObjectByName('sole--1'));
  disposeGarment(m);
});
check('front projection has bounded UV and zero logo weight on rear', () => {
  const garment = {
      ...samples[0],
      appearance: { frontRegion: { x: 0.2, y: 0.05, width: 0.6, height: 0.9 } },
    },
    g = garmentGeometry(data, 'tshirt');
  frontCoordinates(g, garment);
  const p = g.attributes.position,
    w = g.attributes.frontWeight,
    uv = g.attributes.frontUv;
  let front = 0;
  for (let i = 0; i < p.count; i++) {
    assert(Number.isFinite(uv.getX(i)));
    if (p.getZ(i) < -0.01) assert.equal(w.getX(i), 0);
    if (w.getX(i) > 0.8) front++;
  }
  assert(front > 20);
  g.dispose();
});
const originalFetch = globalThis.fetch;
let optionsSeen;
globalThis.fetch = async (_, options) => {
  optionsSeen = options;
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { 'content-type': 'image/png' },
  });
};
const urlFile = await importImageUrl('https://example.invalid/product.png');
check('URL import reads image without credentials', () => {
  assert.equal(urlFile.type, 'image/png');
  assert.equal(optionsSeen.credentials, 'omit');
  assert.equal(optionsSeen.referrerPolicy, 'no-referrer');
});
await assert.rejects(() => importImageUrl('javascript:alert(1)'), /HTTP/);
check('unsafe URL scheme rejected', () => {});
globalThis.fetch = async () => {
  throw new TypeError('CORS');
};
await assert.rejects(
  () => importImageUrl('https://example.invalid/image.png'),
  /CORS.*上傳|CORS.*拖入/,
);
check('CORS error gives actionable upload fallback', () => {});
globalThis.fetch = async () =>
  new Response('<html/>', { headers: { 'content-type': 'text/html' } });
await assert.rejects(
  () => importImageUrl('https://example.invalid/product'),
  /商品頁/,
);
check('product HTML is not treated as an image', () => {});
globalThis.fetch = originalFetch;
const featured = {
  ...item,
  id: 'front-print',
  appearanceMethod: 'front-projection',
  shape: defaultShape('tshirt'),
  appearance: {
    version: 2,
    frontTexture: 'original-red-print-pixels',
    frontRegion: { x: 0.2, y: 0.05, width: 0.6, height: 0.9 },
    confidence: 0.8,
    method: 'edge-background',
  },
};
await saveGarment(featured);
const restored = (await loadGarments()).find((g) => g.id === featured.id);
check('front texture, source region and shape survive reload', () =>
  assert.deepEqual(restored, featured),
);
console.log(`${passed} checks passed`);
