import fs from 'node:fs';
import { createHash } from 'node:crypto';
const source = 'work/assets/base.obj';
if (!fs.existsSync(source)) {
  const r = await fetch(
    'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj',
  );
  if (!r.ok) throw Error(`Source HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync('work/assets', { recursive: true });
  fs.writeFileSync(source, bytes);
}
if (
  createHash('sha256').update(fs.readFileSync(source)).digest('hex') !==
  '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c'
)
  throw Error(
    'Source asset changed; review its license and mesh before regenerating.',
  );
const lines = fs.readFileSync('work/assets/base.obj', 'utf8').split('\n');
const vertices = [];
const groups = {};
let group = '';
for (const l of lines) {
  const p = l.trim().split(/\s+/);
  if (p[0] === 'v') vertices.push(p.slice(1).map(Number));
  if (p[0] === 'g') {
    group = p[1];
    groups[group] ??= [];
  }
  if (p[0] === 'f') {
    const ids = p.slice(1).map((v) => Number(v.split('/')[0]) - 1);
    for (let i = 1; i < ids.length - 1; i++)
      groups[group].push(ids[0], ids[i], ids[i + 1]);
  }
}
const bodyIds = [...new Set(groups.body)];
const lo = [0, 1, 2].map((k) =>
  Math.min(...bodyIds.map((i) => vertices[i][k])),
);
const hi = [0, 1, 2].map((k) =>
  Math.max(...bodyIds.map((i) => vertices[i][k])),
);
const s = 1.8 / (hi[1] - lo[1]);
const convert = (v) => [v[0] * s, (v[1] - lo[1]) * s, v[2] * s];
const output = {
  positions: vertices.map((v) => convert(v).map((x) => +x.toFixed(6))),
  body: groups.body,
  shell: groups['helper-tights'],
  skirt: groups['helper-skirt'],
  joints: {},
};
for (const [g, indices] of Object.entries(groups)) {
  if (g.startsWith('joint-')) {
    const ids = [...new Set(indices)];
    output.joints[g.slice(6)] = convert(
      [0, 1, 2].map(
        (k) => ids.reduce((a, i) => a + vertices[i][k], 0) / ids.length,
      ),
    );
  }
}
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/mannequin.json', JSON.stringify(output));
console.log(
  JSON.stringify(
    {
      lo,
      hi,
      triangles: groups.body.length / 3,
      shell: output.shell.length / 3,
      joints: output.joints,
    },
    null,
    2,
  ),
);
