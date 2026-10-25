// Uji galeri 3D di mode demo (tanpa Supabase): build situs -> vite preview -> Edge/Chrome headless.
// Dipakai karena emulator Supabase lokal untuk test:e2e tidak tersedia; memeriksa bagian galeri saja.
//   BROWSER_PATH=/path/ke/chrome  (opsional; bawaan mencari Microsoft Edge / Google Chrome)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'test-output', 'gallery');
const DIST = 'dist-gallery-test';
const PORT = 4322;
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const jsErrors = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ name, ok: false });
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

function watch(page, label) {
  page.on('pageerror', (e) => jsErrors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') jsErrors.push(`[${label}] console.error: ${m.text()}${m.location()?.url ? ` (${m.location().url})` : ''}`);
  });
}
async function waitSite(page) { await page.waitForFunction(() => window.__siteReady === true, { timeout: 30000 }); }
/** Tunggu sampai kamera tiba di stop `n` (progres scroll sudah menetap). */
async function settle(page, n, timeout = 60000) {
  await page.waitForFunction((i) => {
    const g = window.__gallery; const d = g.debug();
    return d.stop === i && Math.abs(d.p - i / (g.stops().length - 1)) < 0.004;
  }, { timeout }, n);
  await sleep(300);
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); }

async function canvasStats(page) {
  const b64 = await page.screenshot({ encoding: 'base64' });   // seluruh viewport; dipotong di bawah (clip mengubah ukuran jendela)
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 180; c.height = 112;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, Math.min(900, img.width), Math.min(560, img.height), 0, 0, 180, 112);
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

console.log('▶ Build situs mode demo…');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const build = spawnSync(process.execPath, [vite, 'build', '--outDir', DIST, '--emptyOutDir'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
if (build.status !== 0) { console.error((build.stderr || build.stdout).slice(-1500)); process.exit(1); }

console.log('▶ Menyalakan vite preview…');
const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { cwd: root, stdio: 'ignore' });
let up = false;
for (let i = 0; i < 80 && !up; i++) {
  try { up = (await fetch(`${BASE}/`)).ok; } catch { await sleep(250); }
}
if (!up) { server.kill(); console.error('vite preview tidak menyala'); process.exit(1); }

const browserPath = findBrowser();
if (!browserPath) { server.kill(); console.error('Browser Edge/Chrome tidak ditemukan. Set BROWSER_PATH.'); process.exit(1); }
const browser = await puppeteer.launch({
  executablePath: browserPath, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1440,900'],
});

try {
  console.log('\n▶ Pengujian galeri (mode demo)');
  const page = await browser.newPage();
  watch(page, 'desktop');
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  await check('2. Galeri 3D benar-benar dirender (WebGL, tekstur karya)', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await waitSite(page);
    await page.waitForFunction(() => window.__gallery && window.__gallery.debug().artworks.length > 0 && window.__gallery.debug().artworks.every((a) => a.src), { timeout: 30000 });
    await page.evaluate(() => window.__gallery.goToStop(3, false));
    await settle(page, 3);
    const dbg = await page.evaluate(() => window.__gallery.debug());
    const stats = await canvasStats(page);
    await shot(page, 'desktop-gallery-stop3');
    assert(dbg.calls > 10 && dbg.triangles > 200, `draw calls ${dbg.calls}, segitiga ${dbg.triangles}`);
    assert(stats.std > 12 && stats.colors > 40, `kanvas terlihat kosong (std ${stats.std}, warna ${stats.colors})`);
    return `kualitas ${dbg.quality}, ${dbg.calls} draw call, ${dbg.triangles} segitiga, ${dbg.artworks.length} karya`;
  });

  await check('2d. Patung utama tampil dan kredit model asli muncul bila berkas tersedia', async () => {
    await page.waitForFunction(() => (window.__gallery.debug().statues || []).length > 0, { timeout: 30000 });
    const d = await page.evaluate(() => window.__gallery.debug());
    const credit = await page.$eval('#model-credits', (el) => ({ hidden: el.hidden, text: el.textContent.trim() }));
    assert(d.statues.includes('center-angel'), 'patung utama tidak ada');
    assert(!credit.hidden && credit.text.length > 0, 'kredit model harus tampil saat berkas asli tersedia');
    return `patung: ${d.statues.join(', ')}; model asli: ${d.statueModels.length}`;
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
    await settle(page, 0);
    const a = await page.evaluate(() => window.__gallery.debug());
    await page.evaluate(() => window.scrollTo(0, window.__gallery.scrollYForStop(5)));
    await settle(page, 5);
    const b = await page.evaluate(() => window.__gallery.debug());
    const dist = Math.hypot(...a.camera.map((v, i) => v - b.camera[i]));
    assert(dist > 2, `kamera hanya bergeser ${dist.toFixed(2)}`);
    assert(b.stop === 5, `stop aktif ${b.stop}, harapan 5`);
    const caption = await page.$eval('.caption__title', (el) => el.textContent);
    assert(caption.length > 0, 'caption kosong');
    return `kamera bergeser ${dist.toFixed(1)} m; caption “${caption}”`;
  });

  await check('3a. Pintu aula membawa kamera masuk dan tombol keluar mengembalikannya', async () => {
    const hallStop = await page.evaluate(() => window.__gallery.stops().findIndex((s) => s.kind === 'hall'));
    assert(hallStop >= 0, 'stop aula tidak ditemukan');
    await page.evaluate((i) => window.__gallery.goToStop(i, false), hallStop);
    await settle(page, hallStop);
    await page.click('.caption__enter');
    await page.waitForFunction(() => !document.querySelector('#hall-controls').hidden && window.__gallery.debug().hallProgress >= 0.999, { timeout: 10000 });
    const before = await page.evaluate(() => window.__gallery.debug());
    await page.mouse.move(700, 450);
    await page.mouse.wheel({ deltaY: 320 });
    await page.waitForFunction(() => window.__gallery.debug().hallTourProgress > 0.95, { timeout: 10000 });
    const after = await page.evaluate(() => window.__gallery.debug());
    assert(after.hallWalking && after.hallBoards === 3, 'mode jelajah atau panel 3D tidak aktif');
    assert(Math.hypot(after.camera[0] - before.camera[0], after.camera[2] - before.camera[2]) > 0.15, 'kamera tidak bergerak ke bingkai berikutnya saat scroll');
    assert(after.fov > 70 && after.fov < 90, `sudut pandang aula tidak sesuai: ${after.fov}`);
    await page.mouse.wheel({ deltaY: -320 });
    await page.waitForFunction(() => window.__gallery.debug().hallTourProgress < 0.1, { timeout: 10000 });
    const info = await page.$eval('#hall-controls', (el) => el.textContent);
    assert(info.includes('Tanah Laut') === false, 'informasi pribadi seharusnya berada di panel 3D, bukan kontrol HUD');
    await page.click('[data-hall-exit]');
    await page.waitForFunction(() => {
      const d = window.__gallery.debug();
      return document.querySelector('#hall-controls').hidden && !d.hallWalking && d.radius > d.ring.rIn;
    }, { timeout: 5000 });
    return 'scroll maju menuju bingkai berikutnya dan mundur ke bingkai sebelumnya, tanpa zoom; kembali ke galeri';
  });

  await check('3b. Klik karya di kanvas membuka modal detail', async () => {
    const first = await page.evaluate(() => window.__gallery.stops().findIndex((s) => s.kind === 'art'));
    await page.evaluate((i) => window.__gallery.goToStop(i, false), first);
    await settle(page, first);
    const pt = await page.evaluate((i) => { const g = window.__gallery; return g.screenPointOfPlacement(g.stops()[i].placement); }, first);
    assert(pt, 'karya pertama tidak terlihat di layar');
    await page.mouse.click(pt.x, pt.y);
    await page.waitForSelector('dialog.lightbox[open]', { timeout: 5000 });
    const title = await page.$eval('#lb-title', (el) => el.textContent);
    await shot(page, 'desktop-lightbox');
    await page.keyboard.press('Escape');
    return `modal “${title}”`;
  });

  await check('Tidak ada error JavaScript atau konsol', async () => {
    assert(!jsErrors.length, jsErrors.slice(0, 5).join(' | '));
    return '0 error';
  });
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nHasil: ${results.length - failed.length} lulus, ${failed.length} gagal`);
process.exit(failed.length ? 1 : 0);
