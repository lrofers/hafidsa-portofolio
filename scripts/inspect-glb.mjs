// Periksa berkas .glb tanpa menjalankan apa pun dari berkas itu: baca header & chunk JSON, lalu cetak
// simpul (nama, jumlah segitiga), ukuran tekstur (dari header PNG/JPEG di buffer biner), dan total.
// pemakaian: node scripts/inspect-glb.mjs <berkas.glb>
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('pemakaian: node scripts/inspect-glb.mjs <berkas.glb>'); process.exit(1); }
const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('bukan berkas GLB'); process.exit(1); }

let json = null; let bin = null;
for (let off = 12; off < buf.length;) {
  const len = buf.readUInt32LE(off); const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}

const viewBytes = (i) => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
function imageSize(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]; const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: 'jpeg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  if (b.subarray(8, 12).toString() === 'WEBP') return { type: 'webp', w: 0, h: 0 };
  return { type: '?', w: 0, h: 0 };
}

const meshTris = (mi) => (json.meshes[mi].primitives || []).reduce((s, p) => {
  const n = p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
  return s + n / 3;
}, 0);

console.log(`${file}: ${(buf.length / 1e6).toFixed(1)} MB, generator: ${json.asset?.generator || '-'}`);
console.log(`ekstensi: ${(json.extensionsUsed || []).join(', ') || '-'}`);
console.log('\nsimpul bermesh:');
let total = 0;
(json.nodes || []).forEach((n, i) => {
  if (n.mesh === undefined) return;
  const t = meshTris(n.mesh); total += t;
  console.log(`  [${i}] ${n.name || '(tanpa nama)'} | ${t} segitiga`);
});
console.log('\nsimpul tingkat atas:', (json.scenes?.[json.scene || 0]?.nodes || []).map((i) => `[${i}] ${json.nodes[i].name || ''}`).join(', '));
console.log('\ntekstur:');
let texBytes = 0;
(json.images || []).forEach((im, i) => {
  const b = im.bufferView !== undefined ? viewBytes(im.bufferView) : null;
  const s = b ? imageSize(b) : { type: 'uri', w: 0, h: 0 };
  texBytes += b?.length || 0;
  console.log(`  [${i}] ${im.name || ''} ${s.type} ${s.w}x${s.h} ${b ? (b.length / 1e6).toFixed(1) + ' MB' : im.uri}`);
});
console.log(`\ntotal: ${total} segitiga, tekstur ${(texBytes / 1e6).toFixed(1)} MB, material ${(json.materials || []).length}`);
