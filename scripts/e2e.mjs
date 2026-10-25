// Uji end-to-end: Supabase lokal (tools/local-supabase) + build situs + server Express + browser headless.
// Memeriksa ke-15 poin "Pengujian wajib" di README. Jalankan: npm run test:e2e
//   BROWSER_PATH=/path/ke/chrome  (opsional; bawaan mencari Microsoft Edge / Google Chrome)
//   E2E_KEEP=1                    (opsional; biarkan stack & server tetap hidup setelah selesai)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer, { KnownDevices } from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'test-output', 'e2e');
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: 'admin@example.com', password: 'Admin-Password-123!' };
const USER = { email: 'visitor@example.com', password: 'Visitor-Password-123!' };
const BOGUS_SLUG = 'logo-tidak-ada-xyz';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const jsErrors = [];
const t0 = Date.now();

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
    console.log(`  FAIL  ${name}  — ${err.message}`);
  }
}

function findBrowser() {
  const c = [process.env.BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return c.find((p) => p && fs.existsSync(p));
}

/** PNG RGB tanpa dependensi (untuk uji upload). */
function makePng(w, h, color) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x / w, y / h);
      const o = y * stride + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function watch(page, label) {
  page.on('pageerror', (e) => jsErrors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url || '';
    if (url.includes(BOGUS_SLUG)) return; // logo rusak yang sengaja dibuat untuk menguji fallback
    if (url.includes('/halaman-yang-tidak-ada')) return; // dokumen 404 yang sengaja dibuka
    jsErrors.push(`[${label}] console.error: ${text}${url ? ` (${url})` : ''}`);
  });
}

async function waitSite(page) { await page.waitForFunction(() => window.__siteReady === true, { timeout: 30000 }); }
async function waitAdmin(page) { await page.waitForFunction(() => window.__adminReady === true, { timeout: 30000 }); }
async function waitToast(page, text, timeout = 30000) {
  await page.waitForFunction((t) => [...document.querySelectorAll('.toast')].some((el) => el.textContent.includes(t)), { timeout }, text);
}
async function setValue(page, selector, value) {
  await page.$eval(selector, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
}
async function noOverflow(page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); }

async function canvasStats(page) {
  const b64 = await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 0, width: 900, height: 560 } });
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 180; c.height = 112;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 180, 112);
    const d = ctx.getImageData(0, 0, 180, 112).data;
    let s = 0; let s2 = 0; const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += l; s2 += l * l;
      colors.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    }
    const n = d.length / 4; const mean = s / n;
    return { std: Math.sqrt(s2 / n - mean * mean), colors: colors.size };
  }, b64);
}

/* ================================ persiapan ================================ */

console.log('\n▶ Menyalakan Supabase lokal…');
const stackMod = await import(pathToFileURL(path.join(root, 'tools', 'local-supabase', 'stack.mjs')).href);
let stack = await stackMod.startStack({ reset: true, quiet: true });
const keys = { url: stack.url, anon: stack.anonKey, service: stack.serviceRoleKey };
console.log(`  Supabase: ${keys.url}`);
const service = createClient(keys.url, keys.service, { auth: { persistSession: false, autoRefreshToken: false } });

console.log('▶ Build situs (dist-e2e)…');
const build = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, VITE_SUPABASE_URL: keys.url, VITE_SUPABASE_ANON_KEY: keys.anon },
});

console.log('▶ Menyalakan server Express…');
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(PORT), DIST_DIR: 'dist-e2e', NODE_ENV: 'test', SUPABASE_URL: keys.url, VITE_SUPABASE_URL: keys.url, VITE_SUPABASE_ANON_KEY: keys.anon, SUPABASE_SERVICE_ROLE_KEY: keys.service, TRUST_PROXY: '0' },
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* belum siap */ }
  await sleep(250);
}

const browserPath = findBrowser();
if (!browserPath) { console.error('Browser Edge/Chrome tidak ditemukan. Set BROWSER_PATH.'); process.exit(1); }
const launch = (extra = []) => puppeteer.launch({
  executablePath: browserPath, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1440,900', ...extra],
});
const browser = await launch();
const pngA = path.join(OUT, 'upload-a.png');
const pngB = path.join(OUT, 'upload-b.png');
fs.writeFileSync(pngA, makePng(1800, 1200, (x, y) => [Math.round(40 + 200 * x), Math.round(90 + 120 * y), 160]));
fs.writeFileSync(pngB, makePng(1200, 1500, (x, y) => [200, Math.round(60 + 150 * x * y), Math.round(220 - 160 * y)]));

console.log('\n▶ Pengujian');
const ctx = {};

/* 15. build */
await check('15a. Build produksi tanpa error', async () => {
  assert(build.status === 0, `vite build gagal (exit ${build.status}): ${(build.stderr || build.stdout).slice(-600)}`);
  assert(!/\berror\b/i.test(build.stderr || ''), `stderr build: ${build.stderr.slice(0, 300)}`);
  const pages = ['index.html', 'projects.html', 'project-detail.html', 'about.html', 'contact.html', '404.html', ...['login', 'index', 'projects', 'gallery', 'skills', 'about', 'media', 'messages', 'settings'].map((p) => `admin/${p}.html`)];
  pages.forEach((p) => assert(fs.existsSync(path.join(root, 'dist-e2e', p)), `${p} tidak ada di hasil build`));
  return `${pages.length} halaman dibangun`;
});

/* admin pertama + pengguna biasa */
await check('Persiapan: admin pertama via `npm run create-admin` & bootstrap menolak admin kedua', async () => {
  const env = { ...process.env, SUPABASE_URL: keys.url, SUPABASE_SERVICE_ROLE_KEY: keys.service };
  const r = spawnSync(process.execPath, ['server/scripts/create-admin.js', '--email', ADMIN.email, '--password', ADMIN.password], { cwd: root, env, encoding: 'utf8' });
  assert(r.status === 0, `create-admin gagal: ${r.stderr || r.stdout}`);
  assert(/administrator/i.test(r.stdout), `output tak terduga: ${r.stdout}`);
  const r2 = spawnSync(process.execPath, ['server/scripts/create-admin.js', '--email', 'kedua@example.com', '--password', 'Second-Password-123!'], { cwd: root, env, encoding: 'utf8' });
  assert(r2.status !== 0 && /sudah ada/i.test(r2.stderr + r2.stdout), 'bootstrap seharusnya menolak admin kedua');
  const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } });
  const { error } = await anon.auth.signUp({ email: USER.email, password: USER.password });
  assert(!error, `signup pengguna biasa gagal: ${error?.message}`);
  return 'admin dibuat; admin kedua ditolak; pengguna biasa terdaftar';
});

/* 1. halaman publik */
const page = await browser.newPage();
watch(page, 'publik');
await page.setViewport({ width: 1440, height: 900 });
await check('1a. Semua halaman publik bisa dibuka (dan tidak dalam mode demo)', async () => {
  const pages = [['/', '#gallery-canvas'], ['/projects.html', '.card'], ['/project-detail.html?slug=contoh-proyek-satu', '.pd-head h1'], ['/about.html', '#about-bio p'], ['/contact.html', '#contact-form'], ['/halaman-yang-tidak-ada', '.notice h1']];
  for (const [url, sel] of pages) {
    const res = await page.goto(BASE + url, { waitUntil: 'networkidle0' });
    assert(res.status() === (url.startsWith('/halaman') ? 404 : 200), `${url} status ${res.status()}`);
    await waitSite(page);
    await page.waitForSelector(sel, { timeout: 15000 });
    assert(!(await page.$('.banner--info')), `${url} masih mode demo`);
  }
  return `${pages.length} halaman`;
});

/* 2–3. galeri 3D */
await check('2. Galeri 3D benar-benar dirender (WebGL, tekstur dari database)', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  await page.waitForFunction(() => window.__gallery && window.__gallery.debug().artworks.length > 0 && window.__gallery.debug().artworks.every((a) => a.src), { timeout: 30000 });
  await page.evaluate(() => window.__gallery.goToStop(3, false));
  await sleep(3500);
  const dbg = await page.evaluate(() => window.__gallery.debug());
  const stats = await canvasStats(page);
  await shot(page, 'desktop-gallery-stop3');
  assert(dbg.calls > 10 && dbg.triangles > 200, `draw calls ${dbg.calls}, segitiga ${dbg.triangles}`);
  assert(dbg.artworks.every((a) => a.src.includes('/demo/') || a.src.includes('/storage/v1/')), 'sumber tekstur tidak dari database');
  assert(stats.std > 12 && stats.colors > 40, `kanvas terlihat kosong (std ${stats.std.toFixed(1)}, warna ${stats.colors})`);
  ctx.desktopDbg = dbg;
  return `kualitas ${dbg.quality}, ${dbg.calls} draw call, ${dbg.triangles} segitiga, ${dbg.artworks.length} karya, kontras piksel σ=${stats.std.toFixed(0)}`;
});

await check('2c. Kamera tetap di dalam koridor melingkar sepanjang scroll', async () => {
  const res = await page.evaluate(() => {
    const g = window.__gallery;
    const { ring } = g.debug();
    let min = Infinity; let max = -Infinity; let bad = 0;
    for (let i = 0; i <= 100; i++) {
      const c = g.cameraAt(i / 100);
      const r = Math.hypot(c.pos[0], c.pos[2]);
      min = Math.min(min, r); max = Math.max(max, r);
      if (![...c.pos, ...c.look].every(Number.isFinite) || c.pos[1] < 1.4 || c.pos[1] > 1.9) bad++;
    }
    return { ring, min, max, bad };
  });
  assert(res.ring && res.ring.rOut > res.ring.rIn, 'debug().ring tidak tersedia');
  assert(res.bad === 0, `${res.bad} posisi kamera tidak valid atau di luar tinggi mata`);
  assert(res.min >= res.ring.rIn + 0.5 && res.max <= res.ring.rOut - 0.5, `kamera keluar koridor: r ∈ [${res.min.toFixed(2)}, ${res.max.toFixed(2)}], koridor [${res.ring.rIn.toFixed(2)}, ${res.ring.rOut.toFixed(2)}]`);
  return `r ∈ [${res.min.toFixed(1)}, ${res.max.toFixed(1)}] dalam koridor [${res.ring.rIn.toFixed(1)}, ${res.ring.rOut.toFixed(1)}]`;
});

await check('3. Scroll menggerakkan kamera', async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(2500);
  const a = await page.evaluate(() => window.__gallery.debug());
  await page.evaluate(() => window.scrollTo(0, window.__gallery.scrollYForStop(5)));
  await sleep(3500);
  const b = await page.evaluate(() => window.__gallery.debug());
  const dist = Math.hypot(...a.camera.map((v, i) => v - b.camera[i]));
  assert(dist > 2, `kamera hanya bergeser ${dist.toFixed(2)}`);
  assert(b.stop === 5, `stop aktif ${b.stop}, harapan 5`);
  const caption = await page.$eval('.caption__title', (el) => el.textContent);
  assert(caption.length > 0, 'caption kosong');
  return `kamera bergeser ${dist.toFixed(1)} m; caption “${caption}”`;
});

await check('3b. Klik karya di kanvas membuka modal detail', async () => {
  const first = await page.evaluate(() => window.__gallery.stops().findIndex((s) => s.kind === 'art'));
  await page.evaluate((i) => window.__gallery.goToStop(i, false), first);
  await sleep(3500);
  const pt = await page.evaluate((i) => { const g = window.__gallery; return g.screenPointOfPlacement(g.stops()[i].placement); }, first);
  assert(pt, 'karya pertama tidak terlihat di layar');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('dialog.lightbox[open]', { timeout: 5000 });
  const title = await page.$eval('#lb-title', (el) => el.textContent);
  await shot(page, 'desktop-lightbox');
  await page.keyboard.press('Escape');
  return `modal “${title}”`;
});

/* 4. proyek dari database */
await check('4. Proyek dibaca dari database', async () => {
  const { data, error } = await service.from('projects').select('slug, title').eq('status', 'published');
  assert(!error, error?.message);
  await page.goto(`${BASE}/projects.html`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  const titles = await page.$$eval('.card__title', (els) => els.map((e) => e.textContent));
  assert(titles.length === data.length, `${titles.length} kartu vs ${data.length} proyek terbit`);
  data.forEach((p) => assert(titles.includes(p.title), `“${p.title}” tidak tampil`));
  await page.click('.chip[data-cat="Fotografi"]');
  const filtered = await page.$$eval('.card', (els) => els.length);
  assert(filtered < titles.length && filtered > 0, 'filter kategori tidak bekerja');
  return `${titles.length} proyek; filter kategori → ${filtered}`;
});

/* 5. login admin */
const admin = await browser.newPage();
watch(admin, 'admin');
await admin.setViewport({ width: 1366, height: 900 });
await check('5. Admin dapat login', async () => {
  await admin.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
  await admin.waitForSelector('#login-form');
  assert(admin.url().includes('/admin/login.html'), 'halaman admin tidak mengalihkan ke login');
  await admin.type('#email', ADMIN.email);
  await admin.type('#password', ADMIN.password);
  await Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle0' }), admin.click('#login-form [type="submit"]')]);
  await waitAdmin(admin);
  const stats = await admin.$$eval('.stat', (els) => els.length);
  assert(new URL(admin.url()).pathname === '/admin/', `berada di ${admin.url()}`);
  assert(stats === 6, `kartu statistik ${stats}`);
  await shot(admin, 'admin-dashboard');
  return 'login → dashboard';
});

await check('1b. Semua halaman admin bisa dibuka', async () => {
  for (const p of ['projects', 'gallery', 'skills', 'about', 'media', 'messages', 'settings']) {
    await admin.goto(`${BASE}/admin/${p}.html`, { waitUntil: 'networkidle0' });
    await waitAdmin(admin);
    assert(!(await admin.$('#view .loading')), `${p}: masih memuat`);
    assert(!(await admin.$('.toast--error')), `${p}: toast error`);
  }
  return '7 halaman + dashboard';
});

/* 6. buat & edit proyek */
await check('6. Admin dapat membuat dan mengedit proyek', async () => {
  await admin.goto(`${BASE}/admin/projects.html?new=1`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.waitForSelector('#project-form [name="title"]');
  await admin.type('[name="title"]', 'Proyek Uji E2E');
  await admin.type('[name="category"]', 'Pengujian');
  await admin.type('[name="year"]', '2025');
  await admin.type('[name="summary"]', 'Ringkasan proyek uji otomatis.');
  await admin.type('[name="description"]', 'Paragraf pertama.\n\nParagraf kedua.');
  await admin.select('[name="status"]', 'published');
  const slug = await admin.$eval('[name="slug"]', (el) => el.value);
  assert(slug === 'proyek-uji-e2e', `slug otomatis “${slug}”`);
  await admin.click('[data-sw]');
  await admin.click('[data-save]');
  await waitToast(admin, 'Proyek dibuat');
  await admin.waitForFunction(() => location.search.includes('edit='));
  let { data: p } = await service.from('projects').select('id, title, status, project_software(software_id)').eq('slug', slug).single();
  assert(p && p.status === 'published' && p.project_software.length === 1, 'proyek tidak tersimpan lengkap');
  ctx.projectId = p.id;
  await admin.waitForSelector('#project-form [name="title"]');
  await setValue(admin, '[name="title"]', 'Proyek Uji E2E (diedit)');
  await admin.click('[data-save]');
  await waitToast(admin, 'Perubahan disimpan');
  ({ data: p } = await service.from('projects').select('title').eq('id', ctx.projectId).single());
  assert(p.title === 'Proyek Uji E2E (diedit)', `judul di DB: ${p.title}`);
  await page.goto(`${BASE}/project-detail.html?slug=${slug}`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  const h1 = await page.$eval('.pd-head h1', (el) => el.textContent);
  assert(h1 === 'Proyek Uji E2E (diedit)', `halaman publik: ${h1}`);
  return 'dibuat (terbit + software), diedit, tampil di situs';
});

await check('6b. Duplikasi, urutan, dan status draf proyek', async () => {
  await admin.goto(`${BASE}/admin/projects.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.click(`.row[data-id="${ctx.projectId}"] [data-act="duplicate"]`);
  await waitToast(admin, 'diduplikasi');
  const { data: copies } = await service.from('projects').select('id, status, slug').like('slug', 'proyek-uji-e2e-salinan%');
  assert(copies.length === 1 && copies[0].status === 'draft', 'salinan tidak dibuat sebagai draf');
  const before = await admin.$$eval('.row[data-id]', (els) => els.map((e) => e.dataset.id));
  const i = before.indexOf(ctx.projectId);
  await admin.click(`.row[data-id="${ctx.projectId}"] [data-act="up"]`);
  await waitToast(admin, 'Urutan disimpan');
  const after = await admin.$$eval('.row[data-id]', (els) => els.map((e) => e.dataset.id));
  assert(after.indexOf(ctx.projectId) === i - 1, 'urutan tidak berubah');
  const { data: ordered } = await service.from('projects').select('id').order('sort_order');
  assert(ordered.findIndex((x) => x.id === ctx.projectId) === i - 1, 'urutan tidak tersimpan di DB');
  await page.goto(`${BASE}/project-detail.html?slug=${copies[0].slug}`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  assert(/tidak ditemukan/i.test(await page.$eval('#project', (el) => el.textContent)), 'draf terlihat oleh pengunjung');
  return 'salinan draf tersembunyi dari publik; urutan tersimpan';
});

/* 7. upload foto */
await check('7. Upload foto benar-benar menyimpan file (Storage + database)', async () => {
  await admin.goto(`${BASE}/admin/media.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  const input = await admin.$('#head-actions [data-file]');
  await input.uploadFile(pngA);
  await admin.waitForSelector('.upload-item--done, .upload-item--error', { timeout: 60000 });
  assert(!(await admin.$('.upload-item--error')), await admin.$eval('.upload-item__status', (e) => e.textContent));
  const { data: rows } = await service.from('media_assets').select('*').not('path', 'is', null).order('created_at', { ascending: false }).limit(1);
  const m = rows[0];
  assert(m && m.path.startsWith('uploads/') && m.width === 1800 && m.height === 1200, `baris media: ${JSON.stringify(m)}`);
  for (const p of [m.path, m.thumb_path]) {
    const res = await fetch(`${keys.url}/storage/v1/object/public/portfolio/${p}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(res.ok && /image\/(webp|jpeg|png)/.test(res.headers.get('content-type')) && buf.length > 500, `${p}: HTTP ${res.status} ${res.headers.get('content-type')} ${buf.length} B`);
  }
  ctx.mediaA = m;
  await shot(admin, 'admin-media');
  return `${m.path} (${m.mime_type}, ${m.size_bytes} B) + thumbnail ${m.thumb_path ? 'ada' : 'tidak ada'}`;
});

/* 8. ganti foto -> galeri */
await check('8. Mengganti foto memperbarui karya di galeri 3D', async () => {
  const { data: art } = await service.from('gallery_artworks').select('id, media_id').eq('title', 'Karya Contoh I').single();
  await admin.goto(`${BASE}/admin/gallery.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.click(`.row[data-id="${art.id}"] [data-act="photo"]`);
  await admin.waitForSelector(`dialog.dlg[open] .media-tile[data-id="${ctx.mediaA.id}"]`, { timeout: 15000 });
  await admin.click(`dialog.dlg[open] .media-tile[data-id="${ctx.mediaA.id}"]`);
  await admin.click('dialog.dlg[open] [data-ok]');
  await waitToast(admin, 'Foto diganti');
  const { data: after } = await service.from('gallery_artworks').select('media_id').eq('id', art.id).single();
  assert(after.media_id === ctx.mediaA.id, 'media_id karya tidak berubah');
  await shot(admin, 'admin-gallery');

  const view = await browser.newPage();
  watch(view, 'publik-galeri');
  await view.setViewport({ width: 1440, height: 900 });
  await view.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitSite(view);
  await view.waitForFunction((id, p) => window.__gallery?.debug().artworks.find((a) => a.id === id)?.src?.includes(p), { timeout: 30000 }, art.id, ctx.mediaA.thumb_path || ctx.mediaA.path);
  await view.evaluate(() => window.__gallery.goToStop(3, false));
  await sleep(3500);
  await shot(view, 'desktop-gallery-replaced');

  // Ganti FILE media (Media › Ganti gambar): karya yang memakai media itu ikut berganti
  await admin.goto(`${BASE}/admin/media.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.click(`.media-tile[data-id="${ctx.mediaA.id}"]`);
  const rep = await admin.waitForSelector('dialog.dlg[open] [data-replace]');
  await rep.uploadFile(pngB);
  await admin.waitForSelector('dialog.dlg[open] .upload-item--done, dialog.dlg[open] .upload-item--error', { timeout: 60000 });
  assert(!(await admin.$('dialog.dlg[open] .upload-item--error')), 'penggantian file gagal');
  const { data: m2 } = await service.from('media_assets').select('*').eq('id', ctx.mediaA.id).single();
  assert(m2.path !== ctx.mediaA.path && m2.width === 1200 && m2.height === 1500, 'baris media tidak diperbarui');
  const oldRes = await fetch(`${keys.url}/storage/v1/object/public/portfolio/${ctx.mediaA.path}`);
  assert(oldRes.status >= 400, 'file lama masih ada di Storage');
  await view.reload({ waitUntil: 'networkidle0' });
  await waitSite(view);
  await view.waitForFunction((id, p) => window.__gallery?.debug().artworks.find((a) => a.id === id)?.src?.includes(p), { timeout: 30000 }, art.id, m2.thumb_path || m2.path);
  await view.close();
  await admin.keyboard.press('Escape');
  ctx.mediaA = m2;
  return 'Galeri › Ganti foto dan Media › Ganti gambar sama-sama tampil di bingkai 3D; file lama dihapus';
});

/* 9–10. About, skills, logo software */
await check('9. About dan Skills dapat diedit', async () => {
  await admin.goto(`${BASE}/admin/about.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await setValue(admin, '#profile-form [name="about_bio"]', 'Biografi uji E2E.\n\nParagraf kedua biografi.');
  await admin.click('#profile-form [type="submit"]');
  await waitToast(admin, 'Profil disimpan');

  await admin.click('[data-table="experiences"] [data-add]');
  await admin.waitForSelector('dialog.dlg[open] [name="title"]');
  await admin.type('dialog.dlg[open] [name="title"]', 'Pengalaman Uji E2E');
  await admin.type('dialog.dlg[open] [name="organization"]', 'Studio Uji');
  await admin.type('dialog.dlg[open] [name="start_year"]', '2021');
  await admin.click('dialog.dlg[open] .dlg__actions [type="submit"]');
  await waitToast(admin, 'Disimpan');

  await admin.goto(`${BASE}/admin/skills.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.click('#head-actions [data-add]');
  await admin.waitForSelector('dialog.dlg[open] [name="name"]');
  await admin.type('dialog.dlg[open] [name="name"]', 'Keahlian Uji E2E');
  await setValue(admin, 'dialog.dlg[open] [name="category"]', 'Uji');
  await admin.type('dialog.dlg[open] [name="level"]', '70');
  await admin.click('dialog.dlg[open] .dlg__actions [type="submit"]');
  await waitToast(admin, 'Keahlian ditambahkan');

  await page.goto(`${BASE}/about.html`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  const bio = await page.$eval('#about-bio', (el) => el.textContent);
  const skills = await page.$eval('#about-skills', (el) => el.textContent);
  const exp = await page.$eval('#about-exp', (el) => el.textContent);
  assert(bio.includes('Biografi uji E2E.'), 'biografi tidak berubah');
  assert(skills.includes('Keahlian Uji E2E') && (await page.$('#about-skills .skill-level')), 'keahlian baru tidak tampil');
  assert(exp.includes('Pengalaman Uji E2E'), 'pengalaman baru tidak tampil');
  return 'biografi, pengalaman, dan keahlian tampil di halaman Tentang';
});

await check('10. Logo software tampil dengan benar (+ fallback bila gagal dimuat)', async () => {
  const { data: figma } = await service.from('software_tools').select('id').eq('name', 'Figma').single();
  await admin.goto(`${BASE}/admin/skills.html?tab=software`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.click(`.sw-card[data-id="${figma.id}"] [data-act="toggle"]`);
  await waitToast(admin, 'ditampilkan');
  await admin.click('#head-actions [data-add]');
  await admin.waitForSelector('dialog.dlg[open] [name="icon_slug"]');
  await admin.click('dialog.dlg[open] [data-preset]'); // isi dari katalog (Photoshop)
  await setValue(admin, 'dialog.dlg[open] [name="name"]', 'Logo Uji Rusak');
  await setValue(admin, 'dialog.dlg[open] [name="icon_slug"]', BOGUS_SLUG);
  await admin.click('dialog.dlg[open] .dlg__actions [type="submit"]');
  await waitToast(admin, 'Software ditambahkan');

  await page.goto(`${BASE}/about.html`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  await sleep(1500);
  const logos = await page.$$eval('#about-software .sw-logo', (els) => els.map((el) => ({
    name: el.getAttribute('aria-label'),
    loaded: !!el.querySelector('img') && !el.querySelector('img').hidden && el.querySelector('img').naturalWidth > 0,
    fallback: !!el.querySelector('.sw-logo__fallback:not([hidden])'),
    w: el.querySelector('.sw-logo__mark').getBoundingClientRect().width,
    label: el.querySelector('.sw-logo__name')?.textContent,
  })));
  const fig = logos.find((l) => l.name === 'Figma');
  const bad = logos.find((l) => l.name === 'Logo Uji Rusak');
  assert(fig?.loaded && fig.label === 'Figma', `logo Figma: ${JSON.stringify(fig)}`);
  assert(bad?.fallback && !bad.loaded, `fallback logo rusak: ${JSON.stringify(bad)}`);
  assert(new Set(logos.map((l) => Math.round(l.w))).size === 1, 'ukuran logo tidak konsisten');
  const { count } = await service.from('software_tools').select('id', { count: 'exact', head: true }).eq('is_visible', false);
  assert(logos.length === 2 && count === 11, `hanya software yang diaktifkan yang tampil (tampil ${logos.length})`);
  await shot(page, 'about-software');
  return 'Figma (Devicon) termuat; slug rusak → inisial; software tersembunyi tidak tampil';
});

/* 11. persistensi */
await check('11. Data tetap tersimpan setelah refresh (dan setelah database dinyalakan ulang)', async () => {
  await admin.goto(`${BASE}/admin/projects.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  await admin.reload({ waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  const titles = await admin.$$eval('.row__title', (els) => els.map((e) => e.textContent));
  assert(titles.includes('Proyek Uji E2E (diedit)'), 'proyek hilang setelah refresh');
  await stack.stop();
  stack = await stackMod.startStack({ reset: false, quiet: true });
  await admin.reload({ waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  const again = await admin.$$eval('.row__title', (els) => els.map((e) => e.textContent));
  assert(again.includes('Proyek Uji E2E (diedit)'), 'proyek hilang setelah restart database');
  const res = await fetch(`${keys.url}/storage/v1/object/public/portfolio/${ctx.mediaA.path}`);
  assert(res.ok, 'file Storage hilang setelah restart');
  return 'refresh browser + restart PostgreSQL/Storage: data & file tetap ada';
});

/* 12. pengguna biasa */
await check('12. Pengguna biasa tidak dapat menjalankan operasi admin', async () => {
  const u = createClient(keys.url, keys.anon, { auth: { persistSession: false } });
  const { error: le } = await u.auth.signInWithPassword(USER);
  assert(!le, le?.message);
  const ins = await u.from('projects').insert({ slug: 'hack', title: 'hack' });
  assert(ins.error, 'insert proyek tidak ditolak');
  const upd = await u.from('site_settings').update({ owner_name: 'hacked' }).eq('id', 1).select();
  assert(!upd.error ? upd.data.length === 0 : true, 'update pengaturan tidak ditolak');
  const del = await u.from('gallery_artworks').delete().neq('title', '').select();
  assert(!del.error ? del.data.length === 0 : true, 'hapus karya tidak ditolak');
  const role = await u.from('profiles').update({ role: 'admin' }).neq('role', 'x').select();
  assert(!role.error ? role.data.length === 0 : true, 'pengguna bisa menaikkan role');
  const msgs = await u.from('contact_messages').select('*');
  assert(msgs.error || msgs.data.length === 0, 'pengguna bisa membaca pesan kontak');
  const up = await u.storage.from('portfolio').upload(`uploads/hack-${Date.now()}.png`, fs.readFileSync(pngA), { contentType: 'image/png' });
  assert(up.error, 'upload Storage tidak ditolak');
  const boot = await u.rpc('bootstrap_first_admin', { admin_email: USER.email });
  assert(boot.error, 'bootstrap_first_admin bisa dipanggil pengguna');
  const anonClient = createClient(keys.url, keys.anon, { auth: { persistSession: false } });
  const ai = await anonClient.from('media_assets').insert({ external_url: '/x.png' });
  assert(ai.error, 'anon bisa menambah media');
  const { data: s } = await service.from('site_settings').select('owner_name').eq('id', 1).single();
  assert(s.owner_name !== 'hacked', 'pengaturan berubah!');

  const ui = await browser.createBrowserContext();
  const p2 = await ui.newPage();
  watch(p2, 'pengguna-biasa');
  await p2.goto(`${BASE}/admin/login.html`, { waitUntil: 'networkidle0' });
  await p2.type('#email', USER.email);
  await p2.type('#password', USER.password);
  await p2.click('#login-form [type="submit"]');
  await p2.waitForFunction(() => !document.querySelector('#login-msg').hidden, { timeout: 15000 });
  const msg = await p2.$eval('#login-msg', (el) => el.textContent);
  assert(/bukan administrator/i.test(msg), `pesan login: ${msg}`);
  await p2.goto(`${BASE}/admin/projects.html`, { waitUntil: 'networkidle0' });
  assert(p2.url().includes('/admin/login.html'), 'pengguna biasa bisa membuka halaman admin');
  await ui.close();
  return 'insert/update/delete/role/upload/RPC ditolak; UI menolak login non-admin';
});

/* kontak */
await check('Formulir kontak: validasi, kirim, honeypot, rate limit, dan admin membaca pesan', async () => {
  await page.goto(`${BASE}/contact.html`, { waitUntil: 'networkidle0' });
  await waitSite(page);
  await page.click('#contact-form [type="submit"]');
  await page.waitForFunction(() => document.querySelector('#f-name').getAttribute('aria-invalid') === 'true');
  await page.type('#f-name', 'Penguji E2E');
  await page.type('#f-email', 'penguji@example.com');
  await page.type('#f-subject', 'Halo dari uji otomatis');
  await page.type('#f-message', 'Ini pesan uji end-to-end yang cukup panjang.');
  await sleep(2800);
  await page.click('#contact-form [type="submit"]');
  await page.waitForSelector('.form-status--success', { timeout: 15000 });
  const { data: m } = await service.from('contact_messages').select('*').eq('email', 'penguji@example.com');
  assert(m.length === 1 && m[0].ip_hash, 'pesan tidak tersimpan (atau tanpa hash IP)');
  const post = (body) => fetch(`${BASE}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body) });
  const bot = await post({ name: 'Bot', email: 'bot@example.com', message: 'spam spam spam', website: 'http://spam', elapsed: 9000 });
  assert(bot.ok, 'honeypot harus dibalas sukses palsu');
  const { count: botCount } = await service.from('contact_messages').select('id', { count: 'exact', head: true }).eq('email', 'bot@example.com');
  assert(botCount === 0, 'pesan bot tersimpan');
  const noOrigin = await fetch(`${BASE}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert(noOrigin.status === 403, `tanpa Origin: ${noOrigin.status}`);
  let last;
  for (let i = 0; i < 3; i++) last = await post({ name: 'Penguji', email: 'penguji2@example.com', message: `pesan ke-${i + 1} untuk batas`, elapsed: 9000 });
  const fourth = await post({ name: 'Penguji', email: 'penguji2@example.com', message: 'pesan keempat harus ditolak', elapsed: 9000 });
  assert(last.ok && fourth.status === 429, `rate limit: ${last.status} lalu ${fourth.status}`);
  await admin.goto(`${BASE}/admin/messages.html`, { waitUntil: 'networkidle0' });
  await waitAdmin(admin);
  const txt = await admin.$eval('[data-list]', (el) => el.textContent);
  assert(txt.includes('Penguji E2E'), 'pesan tidak tampil di admin');
  return 'tersimpan (hash IP), honeypot diabaikan, tanpa Origin 403, email ke-4/jam 429, tampil di admin';
});

/* 13. smartphone */
await check('13. Website & admin dapat dibuka di smartphone (Android, tanpa horizontal overflow)', async () => {
  const m = await browser.newPage();
  watch(m, 'ponsel');
  await m.emulate(KnownDevices['Pixel 7'] || KnownDevices['Pixel 5']);
  const report = [];
  for (const url of ['/', '/projects.html', '/project-detail.html?slug=contoh-proyek-satu', '/about.html', '/contact.html']) {
    await m.goto(BASE + url, { waitUntil: 'networkidle0' });
    await waitSite(m);
    const o = await noOverflow(m);
    assert(o.sw <= o.w + 1, `${url}: scrollWidth ${o.sw} > ${o.w}`);
    report.push(url);
  }
  await m.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitSite(m);
  await m.waitForFunction(() => window.__gallery?.debug().artworks.every((a) => a.src), { timeout: 30000 });
  const dbg = await m.evaluate(() => window.__gallery.debug());
  assert(dbg.quality === 'low', `kualitas ponsel ${dbg.quality}`);
  await m.evaluate(() => window.__gallery.goToStop(3, false));
  await sleep(3000);
  await shot(m, 'mobile-gallery');
  await m.click('.nav-toggle');
  await m.waitForSelector('.site-header.is-open');
  await shot(m, 'mobile-nav');
  await m.keyboard.press('Escape');
  for (const p of ['index', 'projects', 'gallery', 'media', 'settings']) {
    await m.goto(`${BASE}/admin/${p}.html`, { waitUntil: 'networkidle0' });
    await waitAdmin(m);
    const o = await noOverflow(m);
    assert(o.sw <= o.w + 1, `admin/${p}: scrollWidth ${o.sw} > ${o.w}`);
  }
  await m.click('[data-nav-open]');
  await m.waitForFunction(() => document.body.classList.contains('nav-open'));
  await shot(m, 'mobile-admin-nav');
  await m.close();
  return `kualitas “low”, ${dbg.calls} draw call (desktop ${ctx.desktopDbg?.calls}); ${report.length} halaman publik + 5 halaman admin tanpa overflow`;
});

/* 14. fallback */
await check('14. Fallback tersedia bila WebGL tidak didukung', async () => {
  const nogl = await launch(['--disable-webgl', '--disable-3d-apis']);
  const p = await nogl.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 860 });
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('#gallery-fallback:not([hidden]) .fb-art', { timeout: 20000 });
  const n = await p.$$eval('.fb-art', (els) => els.length);
  const { count } = await service.from('gallery_artworks').select('id', { count: 'exact', head: true }).eq('status', 'published');
  assert(n === count, `${n} karya di fallback vs ${count} terbit`);
  const loadedThree = await p.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('gallery-3d')));
  assert(!loadedThree, 'three.js tetap diunduh tanpa WebGL');
  await p.click('.fb-art');
  await p.waitForSelector('dialog.lightbox[open]');
  await p.keyboard.press('Escape');
  await p.screenshot({ path: path.join(OUT, 'fallback-nowebgl.png'), fullPage: false });
  await nogl.close();
  assert(!errs.length, errs.join('; '));
  return `${n} karya dalam grid HTML, modal bekerja, three.js tidak diunduh`;
});

await check('Aksesibilitas: skip link, keyboard, dan prefers-reduced-motion', async () => {
  const p = await browser.newPage();
  watch(p, 'reduced-motion');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(`${BASE}/projects.html`, { waitUntil: 'networkidle0' });
  await waitSite(p);
  await p.keyboard.press('Tab');
  assert(await p.evaluate(() => document.activeElement.classList.contains('skip-link')), 'Tab pertama bukan skip link');
  const opacity = await p.$eval('.card', (el) => getComputedStyle(el).opacity);
  assert(opacity === '1', `kartu tidak langsung terlihat (opacity ${opacity})`);
  const missingAlt = await p.$$eval('img', (els) => els.filter((i) => !i.hasAttribute('alt')).length);
  assert(missingAlt === 0, `${missingAlt} gambar tanpa atribut alt`);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitSite(p);
  await p.close();
  return 'skip link fokus pertama; konten tampil tanpa animasi; semua <img> punya alt';
});

await check('15b. Tidak ada error JavaScript kritis selama pengujian', async () => {
  assert(!jsErrors.length, `${jsErrors.length} error:\n    ${jsErrors.slice(0, 12).join('\n    ')}`);
  return 'console & pageerror bersih';
});

/* ================================ selesai ================================ */

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\nHasil: ${passed}/${results.length} lulus · ${((Date.now() - t0) / 1000).toFixed(0)} detik · screenshot di test-output/e2e/`);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, jsErrors, desktop: ctx.desktopDbg }, null, 2));
if (process.env.E2E_KEEP) {
  console.log(`(E2E_KEEP) Server: ${BASE}  Supabase: ${keys.url}  — Ctrl+C untuk berhenti`);
} else {
  server.kill();
  await stack.stop();
  if (passed !== results.length && serverLog) fs.writeFileSync(path.join(OUT, 'server.log'), serverLog);
  process.exit(passed === results.length ? 0 : 1);
}
