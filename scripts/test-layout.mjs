// Menguji tata letak galeri melingkar (assets/js/gallery-layout.js) — fungsi murni, tanpa browser.
// Memeriksa: cincin menutup, karya menempel di dinding & tidak bertumpuk, stop kamera tetap di dalam koridor.
import assert from 'node:assert/strict';
import * as L from '../assets/js/gallery-layout.js';
import * as P from '../assets/js/admin/plan-svg.js';

const D = L.DIMENSIONS;
const TAU = Math.PI * 2;
let pass = 0; let fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** spec = { [ruang]: { left, right, back } } -> daftar karya (gambar 1600x1000). */
function mk(spec) {
  const out = [];
  let n = 0;
  for (const [room, walls] of Object.entries(spec)) {
    for (const wall of ['left', 'right', 'back']) {
      for (let i = 0; i < (walls[wall] || 0); i++) {
        out.push({ id: `a${n}`, title: `Karya ${n}`, room: Number(room), wall, sort_order: n, image: { width: 1600, height: 1000 } });
        n++;
      }
    }
  }
  return out;
}
const dense = {};
for (let r = 1; r <= 7; r++) dense[r] = { left: 4, right: 3, back: 2 };
const SPECS = {
  kosong: {},
  satu: { 1: { left: 1 } },
  tiga: { 1: { left: 2, right: 2 }, 2: { left: 1, right: 1, back: 1 }, 3: { left: 2, right: 2, back: 3 } },
  tujuh: dense,
};
const build = (spec, aspect = 16 / 9) => L.buildLayout(mk(spec), { owner_name: 'Nama', hero_title: 'Judul' }, { aspect });

function checkWalls(lay) {
  const { rIn, rMid, rOut } = lay.ring;
  for (const p of lay.placements) {
    const room = lay.rooms[p.room];
    const [x, z] = L.polar(p.r, p.a);
    if (p.wall === 'back') {
      // karya menempel di muka partisi yang menghadap kamera (bergeser setengah tebal partisi dari garis tengah)
      const n = [Math.sin(p.rotY), Math.cos(p.rotY)];
      assert.ok(near(p.x, x + (n[0] * D.T) / 2) && near(p.z, z + (n[1] * D.T) / 2), `karya ${p.index} tertanam di partisi`);
    } else {
      assert.ok(near(Math.hypot(p.x, p.z), p.r), `r tidak cocok dengan x,z (karya ${p.index})`);
      assert.ok(near(x, p.x) && near(z, p.z), 'x,z harus sama dengan polar(r, a)');
    }
    if (p.wall === 'left') assert.ok(near(p.r, rIn), `dinding kiri harus di rIn (${p.r} vs ${rIn})`);
    else if (p.wall === 'right') assert.ok(near(p.r, rOut), `dinding kanan harus di rOut (${p.r} vs ${rOut})`);
    else {
      assert.ok(near(p.a, room.a1, 1e-9), 'dinding ujung harus di a1 ruangnya');
      assert.ok(p.r >= rIn + 0.5 && p.r <= rOut - 0.5, 'karya dinding ujung harus di dalam lebar koridor');
    }
    if (p.wall !== 'back') {
      assert.ok(p.a >= room.a0 + L.DIMENSIONS.ART_EDGE / p.r - 1e-9, 'karya terlalu dekat partisi awal');
      assert.ok(p.a <= room.a1 - L.DIMENSIONS.ART_EDGE / p.r + 1e-9, 'karya terlalu dekat partisi akhir');
    }
  }
  assert.ok(rMid > 0);
}

function checkSpacing(lay) {
  const groups = new Map();
  for (const p of lay.placements) {
    const k = `${p.room}:${p.wall}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  for (const [k, list] of groups) {
    const back = k.endsWith(':back');
    list.sort((a, b) => (back ? a.r - b.r : a.a - b.a));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]; const b = list[i];
      const gap = back ? b.r - a.r : (b.a - a.a) * b.r;
      assert.ok(gap >= (a.size.w + b.size.w) / 2 + 0.4 - 1e-9, `karya bertumpuk di ${k}: jarak ${gap.toFixed(2)}`);
    }
  }
}

console.log('1) polar');
test('polar: sudut 0 di +z, sudut π/2 di +x', () => {
  const [x0, z0] = L.polar(10, 0);
  const [x1, z1] = L.polar(10, Math.PI / 2);
  assert.ok(near(x0, 0) && near(z0, 10) && near(x1, 10) && near(z1, 0));
});

console.log('2) cincin');
test('cincin menutup', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    const lay = build(spec);
    assert.equal(lay.foyer.a0, 0, `${name}: foyer.a0`);
    if (!lay.rooms.length) assert.ok(near(lay.foyer.a1, TAU, 1e-9), `${name}: foyer harus melingkar penuh`);
    else {
      assert.equal(lay.foyer.a1, lay.rooms[0].a0, `${name}: foyer.a1 = rooms[0].a0`);
      lay.rooms.forEach((r, i) => { if (i) assert.equal(r.a0, lay.rooms[i - 1].a1, `${name}: ruang ${i} tidak menyambung`); });
      assert.ok(near(lay.rooms.at(-1).a1, TAU, 1e-9), `${name}: ruang terakhir harus berakhir di 2π`);
    }
  }
});
test('jari-jari', () => {
  for (const spec of Object.values(SPECS)) {
    const { ring } = build(spec);
    assert.ok(ring.rMid >= D.R_MID_MIN - 1e-9, `rMid ${ring.rMid} < R_MID_MIN`);
    assert.ok(near(ring.rOut - ring.rIn, D.W, 1e-9));
  }
});

console.log('3) karya');
test('karya berada di dindingnya', () => { for (const spec of Object.values(SPECS)) checkWalls(build(spec)); });
test('karya menghadap koridor', () => {
  for (const spec of Object.values(SPECS)) {
    const lay = build(spec);
    for (const p of lay.placements) {
      const n = [Math.sin(p.rotY), Math.cos(p.rotY)];
      if (p.wall === 'back') {
        assert.ok(n[0] * Math.cos(p.a) + n[1] * -Math.sin(p.a) < 0, 'dinding ujung harus menghadap kamera yang datang');
      } else {
        const c = L.polar(lay.ring.rMid, p.a);
        assert.ok(n[0] * (c[0] - p.x) + n[1] * (c[1] - p.z) > 0, `karya ${p.index} (${p.wall}) membelakangi koridor`);
      }
    }
  }
});
test('tidak bertumpuk', () => { for (const spec of Object.values(SPECS)) checkSpacing(build(spec)); });
test('kelebihan dinding dalam', () => {
  const lay = build({ 1: { left: 8 } });
  assert.equal(lay.placements.length, 8);
  checkWalls(lay);
  checkSpacing(lay);
});

console.log('4) stop kamera');
test('stop di dalam koridor', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    const lay = build(spec);
    const { rIn, rOut } = lay.ring;
    for (const s of lay.stops) {
      assert.equal(s.pos[1], D.EYE, `${name}: y stop`);
      const r = Math.hypot(s.pos[0], s.pos[2]);
      assert.ok(r >= rIn + 0.6 - 1e-9 && r <= rOut - 0.6 + 1e-9, `${name}: stop ${s.kind} di luar koridor (r=${r.toFixed(2)})`);
    }
    const kinds = lay.stops.map((s) => s.kind);
    const expect = ['intro', 'wall', ...(lay.rooms.length ? ['hall'] : [])];
    lay.rooms.forEach((room, i) => {
      expect.push('door');
      lay.placements.filter((p) => p.room === i).forEach(() => expect.push('art'));
    });
    expect.push('end');
    assert.deepEqual(kinds, expect, `${name}: urutan stop`);
    assert.equal(lay.stops.length, 3 + (lay.rooms.length ? 1 : 0) + lay.rooms.length + lay.placements.length);
  }
});
test('placements tidak bergantung aspek', () => {
  const pick = (lay) => lay.placements.map((p) => ({ x: p.x, z: p.z, rotY: p.rotY, r: p.r, a: p.a, wall: p.wall }));
  const a = build(SPECS.tiga, 0.5);
  const b = build(SPECS.tiga, 1.78);
  assert.deepEqual(pick(a), pick(b));
  assert.notDeepEqual(a.stops, b.stops);
});

console.log('5) kasus tepi');
test('galeri kosong', () => {
  const lay = build({});
  assert.ok(Object.values(lay.ring).every(Number.isFinite));
  assert.ok(lay.stops.every((s) => [...s.pos, ...s.look].every(Number.isFinite)));
});
test('satu karya', () => {
  const lay = build(SPECS.satu);
  assert.equal(lay.placements.length, 1);
  assert.ok(lay.stops.every((s) => [...s.pos, ...s.look].every(Number.isFinite)));
});
test('deterministik', () => { assert.deepEqual(build(SPECS.tiga), build(SPECS.tiga)); });

console.log('6) jalur kamera');
const angleOf = (p) => { const a = Math.atan2(p[0], p[2]); return a < 0 ? a + TAU : a; };
const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
test('partitionAngles', () => {
  const lay = build(SPECS.tiga);
  assert.deepEqual(L.partitionAngles(lay), [lay.rooms[0].a0, lay.rooms[0].a1, lay.rooms[1].a1]);
  assert.deepEqual(L.partitionAngles(build({})), []);
});
test('waypoint mengikuti busur', () => {
  const lay = build(SPECS.tiga);
  const { rIn, rOut } = lay.ring;
  lay.stops.slice(0, -1).forEach((s, i) => {
    const wp = L.segmentWaypoints(s, lay.stops[i + 1], lay);
    assert.deepEqual(wp.pos[0], s.pos);
    assert.deepEqual(wp.pos.at(-1), lay.stops[i + 1].pos);
    assert.deepEqual(wp.look[0], s.look);
    assert.deepEqual(wp.look.at(-1), lay.stops[i + 1].look);
    wp.pos.forEach((p, k) => {
      const r = Math.hypot(p[0], p[2]);
      assert.ok(r >= rIn + 0.6 - 1e-9 && r <= rOut - 0.6 + 1e-9, `segmen ${i}: titik ${k} di luar koridor (r=${r.toFixed(2)})`);
      if (k) assert.ok(dist3(p, wp.pos[k - 1]) <= 2.6, `segmen ${i}: celah ${dist3(p, wp.pos[k - 1]).toFixed(2)} m`);
    });
  });
});
test('waypoint melewati pintu', () => {
  const lay = build(SPECS.tiga);
  const { rMid } = lay.ring;
  const parts = L.partitionAngles(lay);
  let checked = 0;
  lay.stops.forEach((s, i) => {
    if (s.kind !== 'door') return;
    const ap = parts[s.room];
    const wp = L.segmentWaypoints(s, lay.stops[i + 1], lay);
    const dA = (ap - angleOf(s.pos)) * rMid;
    const dB = (angleOf(lay.stops[i + 1].pos) - ap) * rMid;
    const off = Math.min(1.1, dA * 0.5, dB * 0.5);
    const want = (a) => wp.pos.some((p) => Math.abs(Math.hypot(p[0], p[2]) - rMid) < 1e-6 && Math.abs(angleOf(p) - a) < 1e-6);
    assert.ok(want(ap - off / rMid), `ruang ${s.room}: tidak ada titik sebelum pintu`);
    assert.ok(want(ap + off / rMid), `ruang ${s.room}: tidak ada titik sesudah pintu`);
    const [lx, lz] = L.polar(rMid, ap + 7 / rMid);
    assert.ok(wp.look.some((p) => Math.abs(p[0] - lx) < 1e-6 && Math.abs(p[2] - lz) < 1e-6 && Math.abs(p[1] - 1.9) < 1e-9), `ruang ${s.room}: tidak ada titik tatap`);
    checked++;
  });
  assert.equal(checked, 3);
});
test('waypoint galeri kosong', () => {
  const lay = build({});
  lay.stops.slice(0, -1).forEach((s, i) => {
    const wp = L.segmentWaypoints(s, lay.stops[i + 1], lay);
    assert.ok([...wp.pos, ...wp.look].every((p) => p.every(Number.isFinite)));
    wp.pos.forEach((p, k) => { if (k) assert.ok(dist3(p, wp.pos[k - 1]) <= 2.6); });
  });
});

console.log('6b) stop aula');
test('stop aula menatap patung lewat separuh bukaan pertama', () => {
  const lay = build(SPECS.tiga);
  const h = lay.stops.find((s) => s.kind === 'hall');
  assert.ok(h, 'tidak ada stop aula');
  const ap = L.partitionAngles(lay)[0];
  const r = Math.hypot(h.pos[0], h.pos[2]);
  const a = Math.atan2(h.pos[0], h.pos[2]);
  assert.ok(near(r, lay.ring.rIn + 1.0), `r=${r}`);
  assert.ok(near(a, ap - L.DIMENSIONS.BAY_W / 4 / lay.ring.rIn), 'harus di tengah separuh bukaan sebelum partisi');
  assert.ok(near(h.look[0], 0) && near(h.look[2], 0), 'harus menatap pusat aula');
});

console.log('7) denah admin');
test('denah: sektor ruang, karya, aula', () => {
  const lay = build(SPECS.tiga);
  const svg = P.ringPlanSVG(lay, { roomName: (n) => `Ruang ${n}` });
  const count = (re) => (svg.match(re) || []).length;
  assert.equal(count(/class="room"/g), lay.rooms.length + 1, 'jumlah sektor (foyer + ruang)');
  assert.equal(count(/data-plan="/g), lay.placements.length);
  assert.equal(count(/class="hall"/g), 1);
  const S = +(lay.ring.rOut + 1.5).toFixed(3);
  assert.ok(svg.includes(`viewBox="${-S} ${-S} ${2 * S} ${2 * S}"`), 'viewBox persegi berpusat');
  lay.placements.forEach((p) => {
    const m = svg.match(new RegExp(`data-plan="${p.art.id}"[^>]*transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)`));
    assert.ok(m, `karya ${p.art.id} tanpa posisi`);
    assert.ok(Math.abs(+m[1] - p.x) < 0.01 && Math.abs(+m[2] - p.z) < 0.01, `posisi karya ${p.art.id}`);
  });
});
test('denah: teks di-escape', () => {
  const art = mk({ 1: { left: 1 } });
  art[0].title = '<img src=x onerror=alert(1)>';
  const lay = L.buildLayout(art, { gallery_rooms: [{ name: '<script>' }] }, { aspect: 16 / 9 });
  const svg = P.ringPlanSVG(lay, { roomName: () => '<b>' });
  assert.ok(!svg.includes('<script>') && !svg.includes('<img') && !svg.includes('<b>'));
});
test('denah: galeri kosong', () => {
  const svg = P.ringPlanSVG(build({}), { roomName: () => '' });
  assert.equal((svg.match(/class="room"/g) || []).length, 1);
});

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
