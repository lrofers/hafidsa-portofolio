// Arsitektur galeri melingkar: helper geometri (sektor lantai/langit-langit, dinding busur) dan pembangun
// ruang untuk galeri 3D. Geometri dibuat manual agar sistem sudut sama dengan polar() di gallery-layout.js
// (x = r·sin a, z = r·cos a) dan arah winding-nya pasti.
import * as THREE from 'three';
import { DIMENSIONS as D, partitionAngles, polar } from './gallery-layout.js';

const SEGMENT = Math.PI / 48;        // sudut maksimum per segmen lantai/langit-langit (3,75°)
const WALL_SEGMENT = Math.PI / 180;  // dinding lebih halus (1°): bidang tipis di depan dinding tidak boleh tenggelam di antara faset

/**
 * Sektor cincin datar di y = 0 antara jari-jari r0..r1 dan sudut a0..a1.
 * Normal +y (up) atau -y; UV = posisi dunia (x, z) / 3 sehingga satu ubin tekstur = 3 m.
 */
export function sectorGeometry(r0, r1, a0, a1, { up = true } = {}) {
  const n = Math.max(2, Math.ceil((a1 - a0) / SEGMENT));
  const pos = []; const uv = []; const nor = []; const index = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const s = Math.sin(a); const c = Math.cos(a);
    for (const r of [r0, r1]) {
      pos.push(r * s, 0, r * c);
      uv.push((r * s) / 3, (r * c) / 3);
      nor.push(0, up ? 1 : -1, 0);
    }
  }
  for (let i = 0; i < n; i++) {
    const A = i * 2; const B = A + 1; const C = A + 2; const Dd = A + 3;   // dalam_i, luar_i, dalam_i+1, luar_i+1
    if (up) index.push(A, B, C, B, Dd, C);
    else index.push(A, C, B, B, C, Dd);
  }
  return buildGeometry(pos, nor, uv, index);
}

/**
 * Dinding busur terbuka di jari-jari r, sudut a0..a1, tinggi y0..y0+h. Sisi depan (winding) dan normal
 * menghadap keluar (menjauhi pusat); pakai material DoubleSide agar terlihat dari kedua sisi.
 * UV = (panjang busur / 4, y / 4).
 */
export function arcWallGeometry(r, a0, a1, h, y0 = 0) {
  const n = Math.max(1, Math.ceil((a1 - a0) / WALL_SEGMENT));
  const pos = []; const uv = []; const nor = []; const index = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const s = Math.sin(a); const c = Math.cos(a);
    for (const y of [y0, y0 + h]) {
      pos.push(r * s, y, r * c);
      uv.push(((a - a0) * r) / 4, y / 4);
      nor.push(s, 0, c);
    }
  }
  for (let i = 0; i < n; i++) {
    const b0 = i * 2; const t0 = b0 + 1; const b1 = b0 + 2; const t1 = b0 + 3;
    index.push(b0, b1, t0, b1, t1, t0);
  }
  return buildGeometry(pos, nor, uv, index);
}

/**
 * Lengkungkan bidang datar (sumbu x = menyusuri dinding, z = menjauh dari dinding) agar menempel pada dinding
 * berjari-jari R. sign +1: dinding luar (cekung, tepi maju ke arah penonton); -1: dinding dalam (cembung).
 * Dipakai untuk bidang bayangan/cahaya di belakang bingkai, yang kalau datar tenggelam di dinding melengkung.
 */
export function bendToWall(geom, R, sign) {
  const p = geom.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, p.getZ(i) + sign * (R - Math.sqrt(Math.max(R * R - x * x, 0))));
  }
  p.needsUpdate = true;
  return geom;
}

function buildGeometry(pos, nor, uv, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * Bangun ruang cincin: lantai, langit-langit, dinding luar utuh, dinding dalam dengan bukaan (bay) di tiap
 * partisi berpintu, partisi radial berpintu, dinding penutup pada a = 0 (≡ 2π), plint, dan strip lampu.
 * @param {object} ctx { root, mats, layout, addMesh, box } — addMesh/box sama dengan helper di createGallery
 * @returns {{partitions:number[]}} sudut partisi berpintu (untuk jalur kamera dan patung)
 */
export function buildRingArchitecture({ root, mats, layout, addMesh, box }) {
  const { rIn, rMid, rOut } = layout.ring;
  const { H, T, DOOR_W, DOOR_H, BAY_W, BAY_H } = D;
  const TAU = Math.PI * 2;
  const partitions = partitionAngles(layout);
  // dinding busur tanpa tebal terlihat dari kedua sisi
  const wallMat = mats.wall.clone(); wallMat.side = THREE.DoubleSide;
  const trimMat = mats.trim.clone(); trimMat.side = THREE.DoubleSide;

  addMesh(sectorGeometry(rIn, rOut, 0, TAU), mats.floor, 0, 0, 0);
  addMesh(sectorGeometry(rIn, rOut, 0, TAU, { up: false }), mats.ceiling, 0, H, 0, { receive: false });
  [-1.9, 1.9].forEach((o) => addMesh(sectorGeometry(rMid + o - 0.11, rMid + o + 0.11, 0, TAU, { up: false }), mats.strip, 0, H - 0.015, 0, { receive: false }));

  // dinding luar utuh
  addMesh(arcWallGeometry(rOut, 0, TAU, H), wallMat, 0, 0, 0);
  addMesh(arcWallGeometry(rOut - 0.03, 0, TAU, 0.16), trimMat, 0, 0, 0, { receive: false });

  // Dinding dalam: potongan di antara bay + penutup (lintel) di atas tiap bay.
  const bayHalf = BAY_W / 2 / rIn;
  const foyerDoorWidth = 2.1;
  const foyerDoorHalf = foyerDoorWidth / 2 / rIn;
  const foyerDoorCenter = partitions.length ? partitions[0] - D.HALL_DOOR_OFFSET / rIn : 0;
  const foyerDoorStart = foyerDoorCenter - foyerDoorHalf;
  const foyerDoorEnd = foyerDoorCenter + foyerDoorHalf;
  const piers = [];
  let start = 0;
  partitions.forEach((ap, index) => {
    piers.push([start, index === 0 ? Math.min(ap - bayHalf, foyerDoorStart) : ap - bayHalf]);
    start = ap + bayHalf;
    addMesh(arcWallGeometry(rIn, ap - bayHalf, ap + bayHalf, H - BAY_H, BAY_H), wallMat, 0, 0, 0);
  });
  if (partitions.length && foyerDoorStart < partitions[0] - bayHalf) {
    addMesh(arcWallGeometry(rIn, foyerDoorStart, partitions[0] - bayHalf, H - BAY_H, BAY_H), wallMat, 0, 0, 0);
  }
  piers.push([start, TAU]);
  piers.filter(([s, e]) => e > s).forEach(([s, e]) => {
    addMesh(arcWallGeometry(rIn, s, e, H), wallMat, 0, 0, 0);
    addMesh(arcWallGeometry(rIn + 0.03, s, e, 0.16), trimMat, 0, 0, 0, { receive: false });
  });
  partitions.slice(1).forEach((ap) => {
    addMesh(arcWallGeometry(rIn, ap - bayHalf, ap + bayHalf, H), wallMat, 0, 0, 0);
    addMesh(arcWallGeometry(rIn + 0.03, ap - bayHalf, ap + bayHalf, 0.16), trimMat, 0, 0, 0, { receive: false });
  });
  if (partitions.length) {
    const ap = partitions[0];
    [[ap - bayHalf, foyerDoorStart], [foyerDoorEnd, ap + bayHalf]].forEach(([a0, a1]) => {
      if (a1 <= a0) return;
      addMesh(arcWallGeometry(rIn, a0, a1, H), wallMat, 0, 0, 0);
      addMesh(arcWallGeometry(rIn + 0.03, a0, a1, 0.16), trimMat, 0, 0, 0, { receive: false });
    });

    const portal = new THREE.Group();
    portal.name = 'hall-portal';
    root.add(portal);
    const portalRadius = rIn - 0.06;
    [-1, 1].forEach((side) => {
      const angle = foyerDoorCenter + side * foyerDoorHalf;
      const [x, z] = polar(portalRadius, angle);
      const jamb = addMesh(box(0.16, BAY_H, 0.24), mats.trim, x, BAY_H / 2, z, { parent: portal, receive: false });
      jamb.rotation.y = angle;
    });
    addMesh(
      arcWallGeometry(portalRadius, foyerDoorStart, foyerDoorEnd, 0.16, BAY_H - 0.16),
      trimMat,
      0, 0, 0,
      { parent: portal, receive: false },
    );
  }

  // partisi radial: sumbu x lokal = arah radial, +z lokal menghadap kamera yang datang
  const buildPartition = (a, { door = true } = {}) => {
    const g = new THREE.Group();
    const [px, pz] = polar(rMid, a);
    g.position.set(px, 0, pz);
    g.rotation.y = a - Math.PI / 2;
    root.add(g);
    const W = D.W;
    if (!door) {
      addMesh(box(W, H, T), wallMat, 0, H / 2, 0, { parent: g });
      addMesh(box(W, 0.16, 0.05), mats.trim, 0, 0.08, T / 2 + 0.02, { receive: false, parent: g });
      return;
    }
    const side = (W - DOOR_W) / 2;
    [-1, 1].forEach((sgn) => {
      const x = sgn * (DOOR_W / 2 + side / 2);
      addMesh(box(side, H, T), mats.wall, x, H / 2, 0, { parent: g });
      addMesh(box(side, 0.16, 0.05), mats.trim, x, 0.08, T / 2 + 0.02, { receive: false, parent: g });
      addMesh(box(0.12, DOOR_H, T + 0.1), mats.trim, sgn * (DOOR_W / 2 + 0.06), DOOR_H / 2, 0, { receive: false, parent: g }); // kusen
    });
    addMesh(box(DOOR_W, H - DOOR_H, T), mats.wall, 0, DOOR_H + (H - DOOR_H) / 2, 0, { parent: g });
    addMesh(box(DOOR_W + 0.24, 0.12, T + 0.1), mats.trim, 0, DOOR_H + 0.06, 0, { receive: false, parent: g });
  };
  partitions.forEach((ap) => buildPartition(ap));
  buildPartition(0, { door: false });   // dinding penutup: belakang foyer sekaligus ujung ruang terakhir

  return { partitions };
}

/**
 * Posisi & putaran lokal untuk benda datar kecil (plakat, teks) pada jarak lateral x dari titik singgung dinding
 * berjari-jari R. sign +1: dinding luar (cekung, maju ke arah penonton); -1: dinding dalam (cembung, mundur).
 */
export function wallOffset(R, sign, x) {
  return { z: sign * (R - Math.sqrt(Math.max(R * R - x * x, 0))), rotY: -sign * Math.asin(Math.max(-1, Math.min(1, x / R))) };
}

/**
 * Aula patung di pusat cincin: lantai, langit-langit dengan lubang cahaya, dan panggung bertingkat dua.
 * @returns {{center:number[]}} titik atas panggung (tempat alas patung utama berdiri)
 */
export function buildCentralHall({ root, mats, layout, addMesh }) {
  const { rIn } = layout.ring;
  const { H } = D;
  const TAU = Math.PI * 2;
  const SKY = 2.4;
  const brass = new THREE.MeshStandardMaterial({ color: '#b8923f', metalness: 0.72, roughness: 0.32 });
  const glow = new THREE.MeshStandardMaterial({
    color: '#fff0c8',
    emissive: '#ffd27a',
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  addMesh(sectorGeometry(0, rIn, 0, TAU), mats.floor, 0, 0, 0);
  addMesh(sectorGeometry(SKY, rIn, 0, TAU, { up: false }), mats.ceiling, 0, H, 0, { receive: false });
  addMesh(sectorGeometry(0, SKY, 0, TAU, { up: false }), mats.strip, 0, H - 0.005, 0, { receive: false });   // lubang cahaya
  const ceilingRim = new THREE.Mesh(new THREE.TorusGeometry(SKY - 0.04, 0.055, 8, 64), brass);
  ceilingRim.rotation.x = Math.PI / 2;
  ceilingRim.position.y = H - 0.035;
  root.add(ceilingRim);

  const chandelier = new THREE.Group();
  chandelier.position.y = H - 0.42;
  root.add(chandelier);
  const ringGeometry = new THREE.TorusGeometry(1.45, 0.035, 8, 48);
  const lowerRingGeometry = new THREE.TorusGeometry(0.95, 0.028, 8, 40);
  const ring = new THREE.Mesh(ringGeometry, brass);
  ring.rotation.x = Math.PI / 2;
  chandelier.add(ring);
  const lowerRing = new THREE.Mesh(lowerRingGeometry, brass);
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = -0.38;
  chandelier.add(lowerRing);
  chandelier.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.52, 12), brass));
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.54, 6), brass);
    arm.position.set(x * 1.2, -0.18, z * 1.2);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z));
    chandelier.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), glow);
    bulb.position.set(x * 1.45, -0.24, z * 1.45);
    chandelier.add(bulb);
  }

  addMesh(new THREE.CylinderGeometry(2.9, 2.9, 0.12, 64), mats.trim, 0, 0.06, 0);
  addMesh(new THREE.CylinderGeometry(2.4, 2.4, 0.12, 64), mats.trim, 0, 0.18, 0);
  return { center: [0, 0.24, 0] };
}
