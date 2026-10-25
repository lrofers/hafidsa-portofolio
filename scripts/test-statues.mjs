// Menguji patung galeri (assets/js/statues.js): pas-tinggi, malaikat cadangan, pemuatan model & kredit.
// Berkas model dan pemuatnya disuntikkan, jadi tidak butuh browser, Vite, atau berkas .glb sungguhan.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as L from '../assets/js/gallery-layout.js';
import * as S from '../assets/js/statues.js';

let pass = 0; let fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const bbox = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

const art = [];
let n = 0;
for (const [room, walls] of Object.entries({ 1: { left: 2, right: 2 }, 2: { left: 1, right: 1 }, 3: { left: 2, right: 2 } })) {
  for (const wall of ['left', 'right']) for (let i = 0; i < walls[wall]; i++) art.push({ id: `a${n}`, room: +room, wall, sort_order: n++, image: { width: 1600, height: 1000 } });
}
const layout = L.buildLayout(art, {}, { aspect: 16 / 9 });
const ALL = { 'angel-old-marble.glb': '/m/a.glb', 'angel-praying.glb': '/m/b.glb', 'cemetery-angels.glb': '/m/c.glb' };
const okModel = async () => new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.6), new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.1 }));
const make = (o) => S.createStatues({ layout, quality: 'high', files: {}, parent: new THREE.Group(), useShadows: false, hallCenter: [0, 0.24, 0], loadModel: okModel, ...o });

console.log('1) fitToHeight');
await test('fitToHeight: satuan cm', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(40, 340, 40));
  const b = bbox(S.fitToHeight(m, 3.4));
  assert.ok(near(b.max.y - b.min.y, 3.4) && near(b.min.y, 0));
  assert.ok(near((b.min.x + b.max.x) / 2, 0) && near((b.min.z + b.max.z) / 2, 0));
});
await test('fitToHeight: pusat jauh dari dasar', () => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 15, 3)); m.position.set(7, -2.5, -4); g.add(m);   // y ∈ [-10, 5]
  const b = bbox(S.fitToHeight(g, 2.9));
  assert.ok(near(b.max.y - b.min.y, 2.9) && near(b.min.y, 0));
  assert.ok(near((b.min.x + b.max.x) / 2, 0) && near((b.min.z + b.max.z) / 2, 0));
});

console.log('2) malaikat cadangan');
await test('cadangan: bentuk', () => {
  const a = S.buildFallbackAngel(2.9);
  const b = bbox(a);
  assert.ok(near(b.max.y - b.min.y, 2.9, 0.05), `tinggi ${(b.max.y - b.min.y).toFixed(2)}`);
  assert.ok(b.max.x - b.min.x > 1.2, 'sayap tidak terbuka lebar');
  const t = tris(a);
  assert.ok(t >= 500 && t <= 4000, `${t} segitiga`);
});

console.log('3) createStatues');
await test('patung utama tanpa file', async () => {
  const s = await make({});
  assert.deepEqual(s.loaded, []);
  assert.equal(s.group.children.length, 1);
  assert.deepEqual(s.credits(), []);
});
await test('patung utama berdiri di panggung dan muat di bawah langit-langit', async () => {
  const s = await make({});
  const b = bbox(s.group);
  assert.ok(near(b.min.y, 0.24, 1e-4), `dasar ${b.min.y}`);
  assert.ok(b.max.y <= L.DIMENSIONS.H - 0.3, `puncak ${b.max.y.toFixed(2)} menembus langit-langit`);
  assert.ok(near(s.group.children[0].position.x, 0) && near(s.group.children[0].position.z, 0), 'patung tidak berada di tengah alas');
  const hallStop = layout.stops.find((x) => x.kind === 'hall');
  const want = Math.atan2(hallStop.pos[0], hallStop.pos[2]);
  assert.ok(near(s.group.children[0].rotation.y, want), 'patung utama harus menghadap stop Aula Patung');
});
await test('kredit', async () => {
  const s = await make({ files: ALL });
  const ids = s.credits().map((c) => c.id);
  assert.deepEqual(ids, ['center-angel']);
  assert.ok(s.credits().every((c) => c.title && c.author && /^https:\/\//.test(c.url) && c.license));
  assert.deepEqual(s.loaded, ['center-angel']);
});
await test('model rusak', async () => {
  const orig = console.error; let errors = 0; console.error = () => { errors++; };
  try {
    const s = await make({ files: ALL, loadModel: async (url) => { if (url === '/m/a.glb') throw new Error('rusak'); return okModel(); } });
    assert.ok(!s.loaded.includes('center-angel'));
    assert.ok(!s.credits().some((c) => c.id === 'center-angel'));
    assert.equal(s.group.children.length, 1, 'hanya patung utama yang tetap tampil');
    assert.equal(errors, 0);
  } finally { console.error = orig; }
});
await test('patung tambahan di bawah dihapus', async () => {
  const urls = [];
  const s = await make({ files: ALL, loadModel: async (url) => { urls.push(url); return okModel(); } });
  assert.deepEqual(urls, ['/m/a.glb'], 'hanya model patung utama yang dimuat');
  assert.equal(s.group.children.length, 1);
  assert.equal(s.group.children[0].userData.statueId, 'center-angel');
});
await test('model dinonaktifkan tidak dimuat', async () => {
  const urls = [];
  await make({ files: ALL, loadModel: async (url) => { urls.push(url); return okModel(); } });
  assert.ok(!urls.includes('/m/b.glb'), 'model Meshy (lisensi belum terbukti) ikut dimuat');
});
await test('bahan model dibuat doff seperti marmer', async () => {
  const s = await make({ files: ALL });
  s.group.traverse((m) => { if (m.isMesh && m.userData.statueModel) assert.ok(m.material.roughness >= 0.55 && m.material.metalness === 0); });
});
await test('kualitas low', async () => {
  const s = await make({ files: ALL, quality: 'low' });
  assert.ok(s.group.children.length <= 2);
});
await test('dispose', async () => {
  const s = await make({ files: ALL });
  s.dispose(); s.dispose();
  assert.equal(s.group.children.length, 0);
  assert.equal(s.triangles(), 0);
});

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
