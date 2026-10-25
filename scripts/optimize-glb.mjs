// Kecilkan model patung untuk web: tekstur 4K PNG -> JPEG ≤ 1024 px (geometri tidak diubah).
// Sumber: assets/models/source/*.glb (tidak dibundel), hasil: assets/models/*.glb.
// Butuh dev server Vite yang berjalan:  npm run dev  lalu  node scripts/optimize-glb.mjs [url-dev-server] [maxSize]
//   Hanya satu mesh dari sebuah berkas:  node scripts/optimize-glb.mjs <url> 1024 <nama.glb> <nama-mesh>
//   Pratinjau simpul (untuk memilih `pick` di statues.js):  node scripts/optimize-glb.mjs <url> preview <nama.glb>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [base = 'http://localhost:5173', arg2 = '1024', arg3, arg4] = process.argv.slice(2);
const browserPath = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => p && fs.existsSync(p));
if (!browserPath) { console.error('Browser Edge/Chrome tidak ditemukan. Set BROWSER_PATH.'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, protocolTimeout: 600000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${base}/404.html`, { waitUntil: 'domcontentloaded' });

  if (arg2 === 'preview') {
    await page.setViewport({ width: 1400, height: 700 });
    const names = await page.evaluate(async (url) => {
      const t = await import('/scripts/glb-browser.js');
      document.body.innerHTML = '<canvas id="pv" width="1400" height="700" style="position:fixed;inset:0"></canvas>';
      return t.preview(url, document.getElementById('pv'));
    }, `/assets/models/source/${arg3}`);
    const out = path.join(root, 'test-output', `preview-${arg3}.png`);
    await page.screenshot({ path: out });
    console.log('simpul (kiri ke kanan):', names.join(' | '));
    console.log('pratinjau:', out);
  } else {
    const maxSize = Number(arg2) || 1024;
    const files = arg3 ? [arg3] : fs.readdirSync(path.join(root, 'assets/models/source')).filter((f) => f.endsWith('.glb'));
    for (const file of files) {
      const b64 = await page.evaluate(async (url, size, only) => (await import('/scripts/glb-browser.js')).optimize(url, size, only), `/assets/models/source/${file}`, maxSize, arg4 || null);
      const out = path.join(root, 'assets/models', file);
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      console.log(`${file}: ${(fs.statSync(path.join(root, 'assets/models/source', file)).size / 1e6).toFixed(1)} MB -> ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
    }
  }
} finally {
  await browser.close();
}
