// Alat bantu (dijalankan di browser lewat scripts/optimize-glb.mjs, bukan bagian situs):
// muat GLB, kecilkan tekstur ke JPEG, ekspor ulang sebagai GLB; serta pratinjau simpul-simpul model.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const countMeshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };

const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** GLB -> GLB dengan tekstur ≤ maxSize px berformat JPEG; `only` = nama mesh yang dipertahankan (lainnya dibuang). */
export async function optimize(url, maxSize = 1024, only = null) {
  const gltf = await new GLTFLoader().loadAsync(url);
  if (only) {
    const drop = [];
    gltf.scene.traverse((o) => { if (o.isMesh && o.name !== only) drop.push(o); });
    if (drop.length === countMeshes(gltf.scene)) throw new Error(`mesh "${only}" tidak ditemukan`);
    drop.forEach((o) => o.removeFromParent());
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      Object.values(m).forEach((v) => { if (v && v.isTexture) v.userData.mimeType = 'image/jpeg'; });
    });
  });
  const out = await new GLTFExporter().parseAsync(gltf.scene, { binary: true, maxTextureSize: maxSize });
  return toBase64(out);
}

/** Render setiap simpul bermesh berdampingan dengan label namanya (untuk memilih `pick`). */
export async function preview(url, canvas) {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d4cb');
  scene.add(new THREE.HemisphereLight('#ffffff', '#887766', 2.5));
  const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(2, 4, 5); scene.add(sun);
  const names = [];
  meshes.forEach((m, i) => {
    const c = m.clone();
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    const g = new THREE.Group(); g.add(c);
    const box = new THREE.Box3().setFromObject(g);
    const s = 2 / (box.max.y - box.min.y);
    g.scale.setScalar(s);
    box.setFromObject(g);
    g.position.set(i * 1.6 - (box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    scene.add(g);
    names.push(m.name);
  });
  const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.1, 50);
  const cx = ((meshes.length - 1) * 1.6) / 2;
  camera.position.set(cx, 1.1, 6.5); camera.lookAt(cx, 1, 0);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.render(scene, camera);
  return names;
}
