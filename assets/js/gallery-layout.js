// Tata letak galeri (fungsi murni, tanpa three.js) — dipakai oleh galeri 3D di beranda dan denah di admin.
//
//  Koordinat: galeri berbentuk cincin mengelilingi aula patung di pusat (0,0). Titik pada sudut `a` dan
//  jari-jari `r` adalah polar(r, a) = [r·sin a, r·cos a] (x, z). Kamera bergerak dengan `a` membesar,
//  mulai dari foyer (a = 0) dan berakhir di dinding penutup (a = 2π ≡ 0).
//  Dinding kiri = dalam (rIn, menghadap aula), kanan = luar (rOut), ujung = partisi pada a1 ruang.
import { clamp, roman } from './utils.js';

export const DIMENSIONS = {
  W: 9,            // lebar koridor (rOut - rIn)
  H: 4.6,          // tinggi ruang
  T: 0.4,          // tebal partisi
  DOOR_W: 3.4,
  DOOR_H: 3.7,
  EYE: 1.62,
  ART_Y: 1.65,
  FOYER_LEN: 12,   // panjang foyer (busur di jari-jari tengah)
  ROOM_MIN: 13,
  SPACING: 4.3,    // jarak rata-rata antar karya pada satu dinding
  BACK_MAX: 3,     // karya maksimum di dinding ujung ruang terakhir
  R_MID_MIN: 10,   // jari-jari tengah minimum (aula tengah tetap lega)
  BAY_W: 2.6,      // lebar bukaan di dinding dalam pada tiap partisi berpintu
  BAY_H: 3.5,      // tinggi bukaan
  HALL_DOOR_OFFSET: 1.7,
  ART_EDGE: 2.6,   // jarak minimum pusat karya dari partisi (di sepanjang dinding)
};
const D = DIMENSIONS;
const TAU = Math.PI * 2;

export const WALL_LABELS = { left: 'Dinding dalam (kiri)', right: 'Dinding luar (kanan)', back: 'Dinding ujung' };

/** Titik dunia [x, z] pada jari-jari r dan sudut a. */
export const polar = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
/** Titik dunia [x, y, z] pada jari-jari r, sudut a, tinggi y. */
const at = (r, a, y) => { const [x, z] = polar(r, a); return [x, y, z]; };

/* ============================ deteksi perangkat ============================ */

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/** 'high' = desktop, 'medium' = tablet/layar kecil, 'low' = smartphone. */
export function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  if (coarse && minSide < 700) return 'low';
  if (coarse || window.innerWidth < 1024) return 'medium';
  return 'high';
}

/** FOV kamera menyesuaikan orientasi layar agar karya tetap terbingkai di potret/tablet. */
export function viewFov(aspect) {
  return aspect < 0.8 ? 66 : aspect < 1.2 ? 58 : 52;
}

/* =============================== tata letak =============================== */

export function artSize(image) {
  let aspect = image?.width && image?.height ? image.width / image.height : 0.8;
  aspect = clamp(aspect, 0.5, 2.2);
  let h = clamp(1.75 / Math.sqrt(aspect), 1.0, 2.3);
  let w = h * aspect;
  if (w > 2.5) { w = 2.5; h = w / aspect; }
  return { w, h, aspect };
}

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/** Jumlah karya yang muat pada dinding sepanjang `arc` meter (jarak SPACING, tepi ART_EDGE dari partisi). */
const maxFit = (arc) => Math.max(0, Math.floor((arc - (2 * D.ART_EDGE - 2)) / D.SPACING));

/**
 * Bagi karya satu ruang ke dinding dan tentukan panjangnya (busur di jari-jari tengah) untuk `rMid` tertentu.
 * Dinding dalam lebih pendek dari dinding luar: kelebihannya pindah ke dinding luar, dan bila perlu ruang memanjang.
 */
function planRoom(inRoom, isLast, rMid) {
  const rIn = rMid - D.W / 2; const rOut = rMid + D.W / 2;
  let left = inRoom.filter((a) => a.wall === 'left');
  let right = inRoom.filter((a) => a.wall === 'right');
  let back = inRoom.filter((a) => a.wall === 'back');
  // dinding ujung punya ambang pintu di tengah (kecuali ruang terakhir) -> kapasitas terbatas; sisanya ke dinding samping
  const backCap = isLast ? D.BACK_MAX : 2;
  if (back.length > backCap) {
    back.slice(backCap).forEach((a, i) => (i % 2 ? right : left).push(a));
    back = back.slice(0, backCap);
  }
  let len = D.ROOM_MIN;
  for (let guard = 0; guard < 400; guard++, len += 0.5) {
    const capIn = maxFit((len / rMid) * rIn);
    const capOut = maxFit((len / rMid) * rOut);
    const L = [...left]; const R = [...right];
    while (L.length > capIn && R.length < capOut) R.push(L.pop());
    while (R.length > capOut && L.length < capIn) L.push(R.pop());
    if (L.length <= capIn && R.length <= capOut) { left = L.sort(byOrder); right = R.sort(byOrder); break; }
  }
  return { left, right, back, len };
}

/**
 * Hitung ruang, penempatan karya, dan daftar "stop" kamera.
 * @param {Array} artworks  [{ room, wall, sort_order, image:{width,height}, ... }]
 * @param {object} settings site_settings (owner_name, owner_role, gallery_rooms)
 * @param {{aspect:number, fov?:number}} view
 */
export function buildLayout(artworks, settings = {}, view = { aspect: 16 / 9 }) {
  const fov = view.fov ?? viewFov(view.aspect);
  const roomNames = Array.isArray(settings.gallery_rooms) ? settings.gallery_rooms : [];
  const roomNums = [...new Set(artworks.map((a) => a.room))].sort((a, b) => a - b);

  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * view.aspect;
  // di layar potret caption menutupi bagian bawah -> arahkan pandangan sedikit ke bawah agar karya naik
  const lookDrop = view.aspect < 0.8 ? 0.32 : 0;

  // jari-jari tengah mengikuti total panjang ruang; panjang ruang bergantung pada jari-jari (dinding dalam),
  // jadi iterasi sampai total/2π tidak melebihi jari-jari
  let rMid = D.R_MID_MIN;
  let plans = [];
  let total = D.FOYER_LEN;
  for (let it = 0; it < 40; it++) {
    plans = roomNums.map((num, ri) => planRoom(artworks.filter((a) => a.room === num).sort(byOrder), ri === roomNums.length - 1, rMid));
    total = D.FOYER_LEN + plans.reduce((s, p) => s + p.len, 0);
    if (total / TAU <= rMid + 1e-9) break;
    rMid = total / TAU;
  }
  const rIn = rMid - D.W / 2; const rOut = rMid + D.W / 2;
  const ring = { rIn, rMid, rOut };
  const scale = TAU / total;                       // meter busur (tengah) -> radian

  const foyer = { a0: 0, a1: roomNums.length ? D.FOYER_LEN * scale : TAU };
  const rooms = [];
  const placements = [];
  const stops = [];

  stops.push({ kind: 'intro', dwell: 0.3, pos: at(rMid, 2.6 / rMid, D.EYE), look: at(rMid, 11.6 / rMid, 1.85), caption: null });
  const aFoyer = foyer.a1 / 2;
  stops.push({
    kind: 'wall', dwell: 0.3, pos: at(rMid - 2.3, aFoyer, D.EYE), look: at(rOut, aFoyer + 0.3 / rOut, 2.4 - lookDrop),
    caption: { title: settings.owner_name || '', subtitle: settings.owner_role || '', room: 'Foyer' },
  });
  if (roomNums.length) {
    // menatap patung utama lewat separuh bukaan dinding dalam sebelum partisi pertama
    const aBay = foyer.a1 - D.HALL_DOOR_OFFSET / rIn;
    stops.push({
      kind: 'hall', dwell: 0.3, pos: at(rIn + 1.0, aBay, D.EYE), look: [0, 2.1 - lookDrop, 0],
      caption: { title: 'Aula Patung', subtitle: '', room: 'Foyer' },
    });
  }

  let aPrev = foyer.a1;
  roomNums.forEach((num, ri) => {
    const { left, right, back, len } = plans[ri];
    const isLast = ri === roomNums.length - 1;
    const a0 = aPrev;
    const a1 = isLast ? TAU : a0 + len * scale;
    const meta = roomNames[num - 1] || {};
    const room = {
      index: ri, number: num, name: meta.name || `Ruang ${roman(num)}`, subtitle: meta.subtitle || '',
      a0, a1, length: (a1 - a0) * rMid, isLast, count: left.length + right.length + back.length,
    };
    rooms.push(room);

    stops.push({
      kind: 'door', dwell: 0.12, room: ri,
      pos: at(rMid, a0 - 2.2 / rMid, D.EYE), look: at(rMid, a0 + 9 / rMid, 1.9),
      caption: { title: room.name, subtitle: room.subtitle, room: room.name, isRoom: true },
    });

    const roomPlacements = [];
    const sideFill = (list, wall) => {
      const r = wall === 'left' ? rIn : rOut;
      const n = list.length;
      const slot = ((a1 - a0) * r - 2 * D.ART_EDGE) / n;
      list.forEach((art, i) => {
        // kiri/kanan sedikit bergeser agar karya tidak saling berhadapan persis
        const s = D.ART_EDGE + slot * (i + 0.5 + (wall === 'left' ? -0.08 : 0.1));
        const a = a0 + s / r;
        const [x, z] = polar(r, a);
        roomPlacements.push({ art, wall, room: ri, size: artSize(art.image), r, a, x, z, rotY: wall === 'left' ? a : a + Math.PI });
      });
    };
    sideFill(left, 'left');
    sideFill(right, 'right');

    const slot = isLast ? Math.min(3.6, (D.W - 1.2) / Math.max(back.length, 1)) : 0;
    back.forEach((art, i) => {
      const size = artSize(art.image);
      let off; let maxW;
      if (isLast) { off = (i - (back.length - 1) / 2) * slot; maxW = Math.min(2.5, slot - 0.7); }
      else { off = (i % 2 === 0 ? -1 : 1) * (D.DOOR_W / 2 + (D.W / 2 - D.DOOR_W / 2) / 2); maxW = 2.0; }
      const w = Math.min(size.w, maxW);
      const r = rMid + off;
      const rotY = a1 - Math.PI / 2;
      // menempel di muka partisi yang menghadap kamera (bergeser setengah tebal partisi dari garis tengahnya)
      const [cx, cz] = polar(r, a1);
      const x = cx + (Math.sin(rotY) * D.T) / 2; const z = cz + (Math.cos(rotY) * D.T) / 2;
      roomPlacements.push({ art, wall: 'back', room: ri, size: { ...size, w, h: w / size.aspect }, r, a: a1, x, z, rotY });
    });
    const wallRank = { left: 0, right: 1, back: 2 };
    roomPlacements.sort((p, q) => p.a - q.a || wallRank[p.wall] - wallRank[q.wall]);

    roomPlacements.forEach((p) => {
      p.index = placements.length;
      placements.push(p);
      const needH = (p.size.w * 1.55) / (2 * tanH);
      const needV = (p.size.h * 1.75) / (2 * tanV);
      let pos;
      if (p.wall === 'back') {
        const d = clamp(Math.max(5.2, needH, needV), 5.2, 9);
        pos = at(rMid + clamp((p.r - rMid) * 0.5, -2, 2), a1 - d / rMid, D.EYE);
      } else {
        const d = clamp(Math.max(3.1, needH, needV), 3.1, D.W - 0.9);
        const rc = p.wall === 'left' ? clamp(rIn + d, rIn + 0.8, rOut - 0.8) : clamp(rOut - d, rIn + 0.8, rOut - 0.8);
        pos = at(rc, p.a - 1.1 / rc, D.EYE);
      }
      const look = [p.x, D.ART_Y - lookDrop, p.z];
      stops.push({ kind: 'art', dwell: 0.3, placement: p.index, pos, look, caption: { room: room.name, art: p.art } });
    });

    aPrev = a1;
  });

  stops.push({
    kind: 'end', dwell: 0.3, pos: at(rMid, TAU - 3.4 / rMid, D.EYE), look: at(rMid, TAU, 2.0 - lookDrop),
    caption: { title: 'Akhir galeri', subtitle: 'Lanjutkan ke proyek', room: rooms.at(-1)?.name || 'Galeri', isEnd: true },
  });

  return { ring, foyer, rooms, placements, stops, dims: D, fov };
}

/* ============================== jalur kamera ============================== */

/** Sudut partisi berpintu: foyer -> ruang pertama, lalu akhir setiap ruang kecuali yang terakhir. */
export function partitionAngles(layout) {
  if (!layout.rooms.length) return [];
  return [layout.foyer.a1, ...layout.rooms.filter((r) => !r.isLast).map((r) => r.a1)];
}

const angleOf = (p) => { const a = Math.atan2(p[0], p[2]); return a < 0 ? a + TAU : a; };

/**
 * Titik bantu jalur kamera dari stop `a` ke stop `b`: mengikuti busur koridor (celah ≤ 2.5 m) dan
 * melewati tengah ambang pintu agar kamera tidak menembus kusen. Titik pertama/terakhir = stop itu sendiri.
 * @returns {{pos:number[][], look:number[][]}}
 */
export function segmentWaypoints(a, b, layout) {
  const { rMid } = layout.ring;
  const aA = angleOf(a.pos); const aB = angleOf(b.pos);
  const dir = aB >= aA ? 1 : -1;
  const crossing = partitionAngles(layout)
    .filter((ap) => ap > Math.min(aA, aB) && ap < Math.max(aA, aB))
    .sort((x, y) => (x - y) * dir);

  // jangkar (r, sudut): stop awal, sepasang titik di tengah tiap pintu, stop akhir
  const anchors = [{ r: Math.hypot(a.pos[0], a.pos[2]), a: aA }];
  const look = [a.look];
  crossing.forEach((ap) => {
    const off = Math.min(1.1, Math.abs(aA - ap) * rMid * 0.5, Math.abs(aB - ap) * rMid * 0.5) / rMid;
    anchors.push({ r: rMid, a: ap - dir * off }, { r: rMid, a: ap + dir * off });
    look.push(at(rMid, ap + (dir * 7) / rMid, 1.9));
  });
  anchors.push({ r: Math.hypot(b.pos[0], b.pos[2]), a: aB, pos: b.pos });
  look.push(b.look);

  // isi busur di antara jangkar agar jalur mengikuti koridor
  const pos = [a.pos];
  for (let i = 1; i < anchors.length; i++) {
    const p = anchors[i - 1]; const q = anchors[i];
    const n = Math.max(1, Math.ceil(Math.hypot((q.a - p.a) * Math.max(p.r, q.r), q.r - p.r) / 2.4));
    for (let k = 1; k <= n; k++) {
      pos.push(k === n && q.pos ? q.pos : at(p.r + (q.r - p.r) * (k / n), p.a + (q.a - p.a) * (k / n), D.EYE));
    }
  }
  return { pos, look };
}
