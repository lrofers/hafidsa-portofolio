// Menghasilkan karya abstrak ORIGINAL (SVG) sebagai aset demo/placeholder.
// Jalankan: npm run gen:demo  ->  public/demo/art-XX.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');
mkdirSync(outDir, { recursive: true });

// PRNG deterministik agar hasil konsisten
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palettes = [
  ['#f2e8da', '#d9693b', '#7a2e1d', '#2b2118', '#e9b872'],
  ['#e8ecea', '#5d7f78', '#27403d', '#0f1d1c', '#c9d7cf'],
  ['#f3ece4', '#c08a8a', '#6d3b4a', '#2a1a22', '#e7c8b6'],
  ['#ecebe4', '#8c9a5b', '#4a5232', '#1f2412', '#d9d3a7'],
  ['#e9eaf0', '#4f5fa8', '#232a5c', '#10132b', '#b8bfe4'],
  ['#f4ede1', '#d4a13a', '#8a5a14', '#2e1d08', '#f0d28a'],
];

const grain = (id, f = 0.9, op = 0.1) => `
  <filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${op * 6} 0"/>
  </filter>`;

function wrap(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${defs}${grain('g')}</defs>
  ${body}
  <rect width="${w}" height="${h}" filter="url(#g)"/>
</svg>
`;
}

// 1. Matahari di atas cakrawala
function sunHorizon(r, p, w, h) {
  const horizon = h * (0.55 + r() * 0.1);
  const sx = w * (0.35 + r() * 0.3), sr = w * (0.16 + r() * 0.08);
  let bands = '';
  for (let i = 0; i < 7; i++) {
    const y = horizon + i * ((h - horizon) / 7);
    bands += `<rect y="${y}" width="${w}" height="${(h - horizon) / 7 + 1}" fill="${p[i % 2 ? 2 : 3]}" opacity="${0.35 + i * 0.09}"/>`;
  }
  return wrap(w, h, `
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${sx}" cy="${horizon - sr * 0.35}" r="${sr}" fill="${p[1]}"/>
    <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${p[3]}"/>
    ${bands}
    <rect y="${horizon - 1.5}" width="${w}" height="3" fill="${p[0]}" opacity=".7"/>`,
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[4]}"/><stop offset="1" stop-color="${p[0]}"/></linearGradient>`);
}

// 2. Lengkung bertumpuk
function arches(r, p, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${p[0]}"/>`;
  const n = 5, cx = w / 2, base = h * 0.88;
  for (let i = 0; i < n; i++) {
    const rw = (w * 0.42) * (1 - i / n) ;
    const top = base - (h * 0.62) * (1 - i / (n + 1));
    s += `<path d="M${cx - rw} ${base} V${top + rw} A${rw} ${rw} 0 0 1 ${cx + rw} ${top + rw} V${base} Z" fill="${p[(i + 1) % 5]}"/>`;
  }
  s += `<rect y="${base}" width="${w}" height="${h - base}" fill="${p[3]}"/>`;
  return wrap(w, h, s);
}

// 3. Bidang warna (color field)
function colorField(r, p, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${p[0]}"/>`;
  const m = w * 0.1;
  let y = m;
  const rows = 3 + Math.floor(r() * 2);
  for (let i = 0; i < rows; i++) {
    const rh = (h - m * 2) / rows - 14;
    let x = m;
    const cols = 1 + Math.floor(r() * 3);
    for (let j = 0; j < cols; j++) {
      const cw = (w - m * 2) / cols - 14 * (cols > 1 ? 1 : 0);
      s += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="${p[1 + Math.floor(r() * 4)]}" opacity="${0.75 + r() * 0.25}"/>`;
      x += cw + 14;
    }
    y += rh + 14;
  }
  return wrap(w, h, s);
}

// 4. Gelombang mengalir
function waves(r, p, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${p[0]}"/>`;
  const layers = 9;
  for (let i = 0; i < layers; i++) {
    const y0 = h * (0.15 + i * 0.09), amp = 30 + r() * 70, ph = r() * 6;
    let d = `M0 ${h} L0 ${y0}`;
    for (let x = 0; x <= w; x += 20) d += ` L${x} ${y0 + Math.sin(x / (w / 4) + ph) * amp}`;
    d += ` L${w} ${h} Z`;
    s += `<path d="${d}" fill="${p[1 + (i % 3)]}" opacity="${0.18 + i * 0.08}"/>`;
  }
  return wrap(w, h, s);
}

// 5. Lingkaran translusen bertumpuk
function circles(r, p, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${p[3]}"/>`;
  for (let i = 0; i < 9; i++) {
    const rad = w * (0.1 + r() * 0.22);
    s += `<circle cx="${w * (0.2 + r() * 0.6)}" cy="${h * (0.2 + r() * 0.6)}" r="${rad}" fill="${p[i % 5]}" opacity="${0.35 + r() * 0.4}" style="mix-blend-mode:screen"/>`;
  }
  return wrap(w, h, s);
}

// 6. Garis diagonal
function stripes(r, p, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${p[0]}"/><g transform="rotate(-18 ${w / 2} ${h / 2})">`;
  const n = 16, sw = (w * 1.8) / n;
  for (let i = 0; i < n; i++) {
    const wi = sw * (0.25 + r() * 0.6);
    s += `<rect x="${-w * 0.4 + i * sw}" y="${-h * 0.3}" width="${wi}" height="${h * 1.6}" fill="${p[1 + Math.floor(r() * 4)]}" opacity="${0.5 + r() * 0.5}"/>`;
  }
  s += '</g>';
  return wrap(w, h, s);
}

const works = [
  [sunHorizon, 1000, 1250, 0], [arches, 1000, 1250, 1], [colorField, 1500, 1000, 2],
  [waves, 1250, 1250, 3], [circles, 1000, 1250, 4], [stripes, 1500, 1000, 5],
  [sunHorizon, 1500, 1000, 3], [arches, 1250, 1250, 5], [circles, 1500, 1000, 1],
];

works.forEach(([fn, w, h, pi], i) => {
  const seed = 1000 + i * 77;
  writeFileSync(join(outDir, `art-${String(i + 1).padStart(2, '0')}.svg`), fn(rng(seed), palettes[pi], w, h));
});

// Placeholder foto profil (siluet geometris, bukan foto orang)
writeFileSync(join(outDir, 'profile-placeholder.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5dccd"/><stop offset="1" stop-color="#cdbfa8"/></linearGradient></defs>
  <rect width="800" height="1000" fill="url(#b)"/>
  <circle cx="400" cy="400" r="130" fill="#a8977c"/>
  <path d="M120 1000 C120 700 280 620 400 620 C520 620 680 700 680 1000 Z" fill="#a8977c"/>
  <text x="400" y="930" font-family="Georgia,serif" font-size="30" text-anchor="middle" fill="#6e6149" letter-spacing="6">FOTO PROFIL</text>
</svg>
`);

console.log(`OK: ${works.length} karya + 1 placeholder profil -> ${outDir}`);
