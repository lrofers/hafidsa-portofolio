// Patung galeri: daftar model (berlisensi bebas), pas-tinggi, malaikat cadangan buatan kode, dan pemuat GLB.
// Patung utama selalu tampil di panggung aula; bila berkas modelnya belum ada/gagal, dipakai malaikat cadangan.
// Patung lain tampil hanya bila diaktifkan, berkasnya ada, dan berhasil dimuat.
import * as THREE from 'three';
import { DIMENSIONS, partitionAngles, polar } from './gallery-layout.js';

const { BAY_W } = DIMENSIONS;

/** slot 'center' = panggung aula; 'door-k' = di aula, dibingkai bukaan partisi berpintu ke-k. */
export const STATUES = [
  {
    id: 'center-angel', slot: 'center', file: 'angel-old-marble.glb', height: 2.9, plinth: 0.8, enabled: true,
    credit: { title: 'Angel (old marble version)', author: 'Sebastian Sosnowski', license: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/angel-old-marble-version-2c879fc654b44f5e8d12527948535b51' },
  },
  {
    // lisensi di halaman Meshy belum terbukti — aktifkan (enabled: true) hanya setelah diperiksa
    id: 'praying-angel', slot: 'door-0', file: 'angel-praying.glb', height: 2.2, plinth: 0.7, enabled: false,
    credit: { title: 'Antique-style angel statue', author: 'Meshy', license: 'belum diperiksa', url: 'https://www.meshy.ai/3d-models/antique-style-angel-statue-019a31f7-93fb-7e98-84cd-b0827beef73e' },
  },
  {
    // berkas berisi tiga patung; `pick` = nama simpul yang dipakai (null = seluruh adegan)
    id: 'cemetery-angel', slot: 'door-1', file: 'cemetery-angels.glb', height: 2.2, plinth: 0.7, enabled: false, pick: null,
    credit: { title: 'free Angels Statues - Retopoed (kinda)', author: 'JJORIS', license: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/free-angels-statues-retopoed-kinda-4797a1710dd84e1cbe7a25585e4d3f20' },
  },
];

/** Skala seragam agar setinggi `height`, dasar di y = 0, pusat x/z di 0. Objek tidak boleh punya parent. */
export function fitToHeight(object, height) {
  const box = new THREE.Box3();
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.scale.multiplyScalar(height / (box.max.y - box.min.y || 1));
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.position.x -= (box.min.x + box.max.x) / 2;
  object.position.y -= box.min.y;
  object.position.z -= (box.min.z + box.max.z) / 2;
  object.updateMatrixWorld(true);
  return object;
}

/** Malaikat sederhana: jubah (lathe), kepala, dua sayap terbuka, satu lengan terangkat. */
export function buildFallbackAngel(height, material = new THREE.MeshStandardMaterial({ color: '#ece8e0', roughness: 0.6, metalness: 0 })) {
  const g = new THREE.Group();
  const robe = [[0, 0], [0.42, 0], [0.4, 0.1], [0.31, 0.6], [0.23, 1.15], [0.17, 1.55], [0.21, 1.72], [0.12, 1.88], [0, 1.9]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(robe, 24), material));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), material);
  head.position.set(0, 2.03, 0.02); head.rotation.x = 0.25; g.add(head);

  // sayap: garis luar bulu panjang dari bahu ke ujung atas, lalu bergerigi turun
  const wing = new THREE.Shape();
  wing.moveTo(0, 0);
  wing.quadraticCurveTo(0.45, 0.75, 1.15, 1.25);
  [[1.0, 0.85], [1.05, 0.7], [0.82, 0.38], [0.86, 0.22], [0.62, -0.08], [0.64, -0.24], [0.4, -0.5], [0.38, -0.7], [0.15, -0.95]].forEach(([x, y]) => wing.lineTo(x, y));
  wing.quadraticCurveTo(0.05, -0.4, 0, 0);
  const wingGeom = new THREE.ExtrudeGeometry(wing, { depth: 0.04, bevelEnabled: false, curveSegments: 8 });
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(wingGeom, material);
    w.position.set(s * 0.08, 1.68, -0.14); w.scale.x = s; w.rotation.y = s * -0.35; g.add(w);
  });

  const arm = (len) => new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, len, 8), material);
  const up = arm(0.8); up.position.set(0.3, 2.05, 0.02); up.rotation.z = -0.32; g.add(up);      // tangan kanan menunjuk ke atas
  const down = arm(0.7); down.position.set(-0.27, 1.38, 0.08); down.rotation.z = -0.3; g.add(down);
  return fitToHeight(g, height);
}

async function defaultLoadModel(url, pick) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const node = pick ? scene.getObjectByName(pick) : null;
  if (!node) return scene;
  // pertahankan transformasi induk (mis. rotasi Z-up -> Y-up dari ekspor Sketchfab) sebelum dilepas
  scene.updateMatrixWorld(true);
  node.matrixWorld.decompose(node.position, node.quaternion, node.scale);
  node.removeFromParent();
  return node;
}

const countTriangles = (root) => {
  let n = 0;
  root.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return n;
};

/**
 * @param {object} o
 * @param {object} o.layout      hasil buildLayout()
 * @param {'high'|'medium'|'low'} o.quality  'low' memuat paling banyak 2 patung
 * @param {Record<string,string>} o.files    nama berkas -> URL (lihat statue-files.js)
 * @param {THREE.Object3D} o.parent
 * @param {number[]} o.hallCenter titik atas panggung aula
 */
export async function createStatues({ layout, quality, files = {}, parent, useShadows = false, hallCenter = [0, 0, 0], loadModel = defaultLoadModel }) {
  const group = new THREE.Group();
  parent.add(group);
  const marble = new THREE.MeshStandardMaterial({ color: '#ece8e0', roughness: 0.6, metalness: 0 });
  const stone = new THREE.MeshStandardMaterial({ color: '#e2dcd1', roughness: 0.78, metalness: 0 });
  const parts = partitionAngles(layout);
  const pose = (slot) => {
    if (slot === 'center') {
      // menghadap pengunjung di stop "Aula Patung"
      const h = layout.stops.find((x) => x.kind === 'hall');
      return { pos: hallCenter, rotY: h ? Math.atan2(h.pos[0], h.pos[2]) : 0 };
    }
    const ap = parts[Number(slot.split('-')[1])];
    if (ap === undefined) return null;
    // di balik separuh bukaan sebelum partisi, agar tidak tertutup ujung partisi yang membelah bukaan
    const a = ap - BAY_W / 4 / layout.ring.rIn;
    const [x, z] = polar(layout.ring.rIn - 1.4, a);
    return { pos: [x, 0, z], rotY: a };
  };
  const wanted = STATUES
    .filter((s) => s.slot === 'center' || (s.enabled && files[s.file] && pose(s.slot)))
    .slice(0, quality === 'low' ? 2 : 3);

  const results = await Promise.all(wanted.map(async (s) => {
    if (s.enabled && files[s.file]) {
      try { return { s, model: await loadModel(files[s.file], s.pick), real: true }; }
      catch (e) { if (s.slot !== 'center') console.warn(`Patung "${s.id}" gagal dimuat, dilewati:`, e?.message || e); }
    }
    return s.slot === 'center' ? { s, model: buildFallbackAngel(s.height, marble), real: false } : null;
  }));

  const loaded = [];
  results.filter(Boolean).forEach(({ s, model, real }) => {
    const p = pose(s.slot);
    const holder = new THREE.Group();
    holder.userData.statueId = s.id;
    holder.position.set(...p.pos);
    holder.rotation.y = p.rotY;
    const radius = s.slot === 'center' ? 0.62 : 0.45;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, s.plinth, 32), stone);
    plinth.position.y = s.plinth / 2;
    holder.add(plinth);
    if (real) {
      fitToHeight(model, s.height);
      model.traverse((m) => {
        if (!m.isMesh) return;
        m.userData.statueModel = true;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
          if ('roughness' in mat) { mat.roughness = Math.max(0.55, mat.roughness); mat.metalness = 0; }
        });
      });
      loaded.push(s.id);
    }
    model.position.y += s.plinth;
    holder.add(model);
    holder.traverse((m) => { if (m.isMesh) { m.castShadow = useShadows; m.receiveShadow = useShadows; } });
    group.add(holder);
  });

  return {
    group,
    loaded,
    credits: () => STATUES.filter((s) => loaded.includes(s.id)).map((s) => ({ id: s.id, ...s.credit })),
    triangles: () => countTriangles(group),
    dispose() {
      group.traverse((m) => {
        m.geometry?.dispose?.();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
      });
      group.clear();
      group.removeFromParent();
      loaded.length = 0;
    },
  };
}
