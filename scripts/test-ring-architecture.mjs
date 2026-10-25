// Menguji helper geometri cincin (assets/js/ring-architecture.js): sektor lantai/langit-langit dan dinding busur.
// Hanya geometri murni Three.js — tidak butuh browser atau WebGL.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as L from '../assets/js/gallery-layout.js';
import * as R from '../assets/js/ring-architecture.js';

let pass = 0; let fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const R_wall = (radius) => R.arcWallGeometry(radius, 0, Math.PI * 2, 4.6);
const bend = (radius, sign) => R.bendToWall(new THREE.PlaneGeometry(2.4, 1, 12, 1), radius, sign);

/** Segitiga [[p0,p1,p2], ...] dari geometri berindeks atau tidak. */
function triangles(g) {
  const pos = g.attributes.position;
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const v = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  const out = [];
  for (let i = 0; i < idx.length; i += 3) out.push([v(idx[i]), v(idx[i + 1]), v(idx[i + 2])]);
  return out;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const angle = (x, z) => Math.atan2(x, z);

console.log('1) sektor');
test('sektor: luas', () => {
  const g = R.sectorGeometry(5, 14, 0.3, 1.7);
  const area = triangles(g).reduce((s, [a, b, c]) => s + len(cross(sub(b, a), sub(c, a))) / 2, 0);
  const want = ((1.7 - 0.3) / 2) * (14 * 14 - 5 * 5);
  assert.ok(Math.abs(area - want) / want < 0.005, `luas ${area.toFixed(3)} vs ${want.toFixed(3)}`);
});
test('sektor: batas', () => {
  const g = R.sectorGeometry(5, 14, 0.3, 1.7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const a = angle(p.getX(i), p.getZ(i));
    assert.ok(r >= 5 - 1e-6 && r <= 14 + 1e-6, `r=${r}`);
    assert.ok(a >= 0.3 - 1e-6 && a <= 1.7 + 1e-6, `a=${a}`);
    assert.ok(near(p.getY(i), 0));
  }
});
test('sektor: arah normal dan winding', () => {
  for (const up of [true, false]) {
    const g = R.sectorGeometry(5, 14, 0.3, 1.7, { up });
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) assert.ok(near(n.getY(i), up ? 1 : -1), 'normal salah arah');
    triangles(g).forEach(([a, b, c]) => {
      const f = cross(sub(b, a), sub(c, a));
      assert.ok(up ? f[1] > 0 : f[1] < 0, `winding terbalik (up=${up})`);
    });
  }
});
test('sektor: UV = posisi dunia / 3', () => {
  const g = R.sectorGeometry(5, 14, 0.3, 1.7);
  const p = g.attributes.position; const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    assert.ok(near(uv.getX(i), p.getX(i) / 3) && near(uv.getY(i), p.getZ(i) / 3));
  }
});
test('sektor: sudut sempit tetap valid', () => {
  const g = R.sectorGeometry(5, 14, 0.5, 0.52);
  assert.ok(g.attributes.position.count >= 4);
  assert.ok(triangles(g).length >= 2);
});

console.log('2) dinding busur');
test('dinding busur: bentuk', () => {
  const g = R.arcWallGeometry(9.5, 0.4, 1.2, 4.6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    assert.ok(near(Math.hypot(p.getX(i), p.getZ(i)), 9.5), 'jari-jari harus tetap');
    assert.ok(p.getY(i) >= -1e-9 && p.getY(i) <= 4.6 + 1e-9);
    const a = angle(p.getX(i), p.getZ(i));
    assert.ok(a >= 0.4 - 1e-6 && a <= 1.2 + 1e-6);
  }
});
test('dinding busur: normal keluar dan UV dalam meter', () => {
  const g = R.arcWallGeometry(9.5, 0.4, 1.2, 4.6);
  const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv;
  let maxU = 0;
  for (let i = 0; i < p.count; i++) {
    const a = angle(p.getX(i), p.getZ(i));
    assert.ok(near(n.getX(i), Math.sin(a), 1e-6) && near(n.getY(i), 0) && near(n.getZ(i), Math.cos(a), 1e-6), 'normal harus radial keluar');
    assert.ok(near(uv.getX(i), ((a - 0.4) * 9.5) / 4, 1e-6) && near(uv.getY(i), p.getY(i) / 4, 1e-6), 'UV harus meter/4');
    maxU = Math.max(maxU, uv.getX(i));
  }
  assert.ok(near(maxU, (0.8 * 9.5) / 4, 1e-6));
});
test('dinding busur: sisi depan menghadap keluar', () => {
  const g = R.arcWallGeometry(9.5, 0.4, 1.2, 4.6);
  triangles(g).forEach(([a, b, c]) => {
    const f = cross(sub(b, a), sub(c, a));
    const mid = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
    assert.ok(f[0] * mid[0] + f[2] * mid[2] > 0, 'winding menghadap ke dalam');
  });
});
test('dinding busur: cukup halus agar bidang tipis di depannya tidak tenggelam', () => {
  // sagitta antar-segmen harus jauh di bawah offset bidang bayangan/cahaya (4–6 mm) di depan dinding
  const R = 14.5;
  const g = R_wall(R);
  const p = g.attributes.position;
  let maxSag = 0;
  for (let i = 2; i < p.count; i += 2) {
    const a0 = Math.atan2(p.getX(i - 2), p.getZ(i - 2)); const a1 = Math.atan2(p.getX(i), p.getZ(i));
    const d = Math.abs(a1 - a0);
    if (d > 0.5) continue;                                  // lompatan atan2 di sambungan ±π
    maxSag = Math.max(maxSag, R * (1 - Math.cos(d / 2)));
  }
  assert.ok(maxSag <= 0.002, `sagitta ${(maxSag * 1000).toFixed(1)} mm`);
});
test('dinding busur: tinggi mulai y0', () => {
  const g = R.arcWallGeometry(9.5, 0.4, 1.2, 1.1, 3.5);
  const p = g.attributes.position; const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    assert.ok(p.getY(i) >= 3.5 - 1e-9 && p.getY(i) <= 4.6 + 1e-9);
    assert.ok(near(uv.getY(i), p.getY(i) / 4, 1e-6), 'UV vertikal mengikuti y dunia');
  }
});

console.log('2b) melengkungkan bidang ke dinding');
test('bendToWall: bidang mengikuti lengkung dinding luar dan dalam', () => {
  const sag = (rad, x) => rad - Math.sqrt(rad * rad - x * x);
  for (const [rad, sign] of [[14.5, 1], [5.5, -1]]) {
    const g = bend(rad, sign);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      assert.ok(near(p.getZ(i), sign * sag(rad, p.getX(i)), 1e-6), `R=${rad} x=${p.getX(i)}: z=${p.getZ(i)}`);
    }
  }
});
test('bendToWall: titik tengah tidak bergeser dan x,y tidak berubah', () => {
  const g = bend(14.5, 1);
  const p = g.attributes.position;
  let centers = 0;
  for (let i = 0; i < p.count; i++) {
    if (near(p.getX(i), 0)) { centers++; assert.ok(near(p.getZ(i), 0)); }
    assert.ok(Math.abs(p.getX(i)) <= 1.2 + 1e-6 && Math.abs(p.getY(i)) <= 0.5 + 1e-6);
  }
  assert.ok(centers >= 2, 'tidak ada titik tengah (segmen kurang)');
});

console.log('3) pembangun cincin');
{
  const D = L.DIMENSIONS;
  const TAU = Math.PI * 2;
  const art = [];
  let n = 0;
  for (const [room, walls] of Object.entries({ 1: { left: 2, right: 2 }, 2: { left: 1, right: 1, back: 1 }, 3: { left: 2, right: 2, back: 3 } })) {
    for (const wall of ['left', 'right', 'back']) for (let i = 0; i < (walls[wall] || 0); i++) art.push({ id: `a${n}`, room: +room, wall, sort_order: n++, image: { width: 1600, height: 1000 } });
  }
  const layout = L.buildLayout(art, {}, { aspect: 16 / 9 });
  const { rIn, rMid, rOut } = layout.ring;
  const root = new THREE.Group();
  const mats = {};
  for (const k of ['wall', 'ceiling', 'floor', 'strip', 'trim']) mats[k] = new THREE.MeshStandardMaterial();
  const addMesh = (geom, mat, x, y, z, { parent = root } = {}) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const built = R.buildRingArchitecture({ root, mats, layout, addMesh, box, useShadows: false });
  root.updateMatrixWorld(true);

  const ray = (from, dir, far = 60) => {
    const rc = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize(), 0, far);
    return rc.intersectObjects(root.children, true)[0] || null;
  };
  const at = (r, a, y) => { const [x, z] = L.polar(r, a); return [x, y, z]; };
  const heading = (a) => [Math.cos(a), 0, -Math.sin(a)];
  const inward = (a) => [-Math.sin(a), 0, -Math.cos(a)];

  test('arsitektur: partisi berpintu', () => {
    assert.deepEqual(built.partitions, L.partitionAngles(layout));
  });
  test('arsitektur: semua titik terbatas dan di dalam cincin', () => {
    let count = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        assert.ok(Number.isFinite(v.x + v.y + v.z), 'titik NaN');
        const r = Math.hypot(v.x, v.z);
        assert.ok(r >= rIn - 0.2 && r <= rOut + 0.2, `titik di luar cincin (r=${r.toFixed(2)})`);
        assert.ok(v.y >= -1e-6 && v.y <= D.H + 1e-6, `titik di luar tinggi ruang (y=${v.y.toFixed(2)})`);
        count++;
      }
    });
    assert.ok(count > 500, 'terlalu sedikit geometri');
  });
  test('arsitektur: dinding dalam dan luar utuh', () => {
    const a = (layout.foyer.a1 + layout.rooms[0].a1) / 2 - 0.35;    // jauh dari partisi
    const hitIn = ray(at(rMid, a, 2), inward(a));
    assert.ok(hitIn && Math.abs(hitIn.distance - (rMid - rIn)) < 0.05, `dinding dalam: ${hitIn?.distance}`);
    const hitOut = ray(at(rMid, a, 2), [Math.sin(a), 0, Math.cos(a)]);
    assert.ok(hitOut && Math.abs(hitOut.distance - (rOut - rMid)) < 0.05, `dinding luar: ${hitOut?.distance}`);
  });
  test('arsitektur: foyer tetap terbuka, bay non-foyer ditutup', () => {
    built.partitions.forEach((ap, index) => {
      const isFoyer = index === 0;
      const a = ap + 0.5 / rIn;
      const wall = ray(at(rMid, a, 2), inward(a), rMid - rIn + 2);
      assert.equal(wall === null, isFoyer, `bukaan bay ${ap.toFixed(2)} ${isFoyer ? 'harus terbuka untuk masuk' : 'harus tertutup'}`);
      if (isFoyer) {
        const jambAngle = ap + 1.2 / rIn;
        const jamb = ray(at(rMid, jambAngle, 2), inward(jambAngle), rMid - rIn + 2);
        assert.ok(jamb && Math.abs(jamb.distance - (rMid - rIn)) < 0.05, 'celah samping akses aula tidak tertutup');
      }
      const lintel = ray(at(rMid, a, 4.0), inward(a));
      assert.ok(lintel && Math.abs(lintel.distance - (rMid - rIn)) < 0.05, `penutup di atas bay ${ap.toFixed(2)} hilang`);
    });
  });
  test('arsitektur: portal berbingkai mengarah dari foyer ke aula tanpa menutup jalur', () => {
    const portal = root.getObjectByName('hall-portal');
    assert.ok(portal, 'portal aula tidak dibuat');
    assert.equal(portal.children.length, 3, 'portal harus memiliki dua tiang dan satu balok atas');
    const ap = built.partitions[0];
    const opening = ray(at(rMid, ap, 1.8), inward(ap), rMid - rIn + 1);
    assert.equal(opening, null, 'bingkai portal menghalangi akses ke aula');
  });
  test('arsitektur: pintu partisi ruang berikutnya terbuka di tengah, tertutup di sisi', () => {
    const ap = built.partitions[1];
    const d = 0.2;
    const through = ray(at(rMid * Math.cos(d), ap - d, 1.6), heading(ap - d));
    assert.ok(!through || through.distance > 3, `pintu tertutup (hit ${through?.distance})`);
    const rc = (rMid + 3) * Math.cos(d);
    const blocked = ray(at(rc, ap - d, 1.6), heading(ap - d));
    assert.ok(blocked && Math.abs(blocked.distance - rc * Math.tan(d)) < 0.5, `dinding samping partisi hilang (hit ${blocked?.distance})`);
  });
  test('arsitektur: dinding penutup di akhir cincin', () => {
    const d = 0.2;
    const hit = ray(at(rMid * Math.cos(d), TAU - d, 1.6), heading(TAU - d));
    assert.ok(hit && Math.abs(hit.distance - rMid * Math.cos(d) * Math.tan(d)) < 0.5, `dinding penutup hilang (hit ${hit?.distance})`);
  });
  test('arsitektur: dinding belakang foyer terlihat dari sisi nama pemilik', () => {
    const hit = ray([1, 1.6, rMid], [-1, 0, 0]);
    assert.ok(hit && Math.abs(hit.distance - (1 - D.T / 2)) < 0.05, `sisi foyer dinding penutup terbuka (hit ${hit?.distance})`);
  });
}

console.log('4) menempel di dinding melengkung');
test('wallOffset: dinding luar (cekung) maju, dinding dalam (cembung) mundur', () => {
  const sag = (rad, x) => rad - Math.sqrt(rad * rad - x * x);
  const o = R.wallOffset(14.5, 1, 1.9);
  assert.ok(near(o.z, sag(14.5, 1.9)) && near(o.rotY, -Math.asin(1.9 / 14.5)));
  const i = R.wallOffset(5.5, -1, 1.9);
  assert.ok(near(i.z, -sag(5.5, 1.9)) && near(i.rotY, Math.asin(1.9 / 5.5)));
  const c = R.wallOffset(5.5, -1, 0);
  assert.ok(near(c.z, 0) && near(c.rotY, 0));
});

console.log('5) aula tengah');
{
  const art = [{ id: 'a', room: 1, wall: 'left', sort_order: 0, image: { width: 1600, height: 1000 } }];
  const layout = L.buildLayout(art, {}, { aspect: 16 / 9 });
  const root = new THREE.Group();
  const mats = {};
  for (const k of ['wall', 'ceiling', 'floor', 'strip', 'trim']) mats[k] = new THREE.MeshStandardMaterial();
  const addMesh = (geom, mat, x, y, z, { parent = root } = {}) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const hall = R.buildCentralHall({ root, mats, layout, addMesh });
  root.updateMatrixWorld(true);
  const ray = (from, dir) => new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize(), 0, 30).intersectObjects(root.children, true)[0] || null;
  test('aula: titik pusat panggung', () => assert.deepEqual(hall.center, [0, 0.24, 0]));
  test('aula: seluruhnya di dalam dinding dalam', () => {
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        assert.ok(Math.hypot(v.x, v.z) <= layout.ring.rIn + 1e-6, 'geometri aula menembus koridor');
        assert.ok(v.y >= -1e-6 && v.y <= L.DIMENSIONS.H + 1e-6);
      }
    });
  });
  test('aula: panggung terkena dari atas', () => {
    const h = ray([0, 3, 0], [0, -1, 0]);
    assert.ok(h && near(h.distance, 3 - 0.24, 1e-4), `hit ${h?.distance}`);
    const lower = ray([2.7, 3, 0], [0, -1, 0]);
    assert.ok(lower && near(lower.distance, 3 - 0.12, 1e-4), 'undakan bawah hilang');
  });
  test('aula: lantai, langit-langit, dan lubang cahaya', () => {
    const floor = ray([4.5, 1, 0], [0, -1, 0]);
    assert.ok(floor && near(floor.distance, 1, 1e-4), 'lantai aula hilang');
    const sky = ray([0.5, 3, 0.5], [0, 1, 0]);
    assert.ok(sky && near(sky.distance, L.DIMENSIONS.H - 3, 0.01) && sky.object.material === mats.strip, 'lubang cahaya hilang');
    const ceil = ray([4.5, 3, 0], [0, 1, 0]);
    assert.ok(ceil && near(ceil.distance, L.DIMENSIONS.H - 3, 1e-3) && ceil.object.material !== mats.strip, 'langit-langit aula hilang');
  });
}

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
