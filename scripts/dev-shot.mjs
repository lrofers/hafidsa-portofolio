// Alat bantu pengembangan: ambil screenshot halaman pada posisi scroll tertentu (Edge headless).
// pemakaian: node scripts/dev-shot.mjs <url> <out.png> [scrollProgress 0..1] [width] [height] [mobile]
import puppeteer from 'puppeteer-core';
const [url, out, prog = '0', w = '1440', h = '900', mobile = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console.' + m.type() + ']', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => window.__siteReady === true, { timeout: 20000 }).catch(() => console.log('siteReady timeout'));
await new Promise((r) => setTimeout(r, 2500));
if (prog.startsWith('stop:')) {
  const target = parseFloat(prog.slice(5));
  await page.evaluate((v) => { const g = window.__gallery; const i = Math.floor(v); const a = g.scrollYForStop(i); const b = g.scrollYForStop(i + 1); window.scrollTo(0, a + (b - a) * (v - i)); }, target);
  // render perangkat lunak lambat: tunggu sampai progres scroll menetap di target, bukan jeda tetap
  await page.waitForFunction((v) => { const g = window.__gallery; return Math.abs(g.debug().p - v / (g.stops().length - 1)) < 0.004; }, { timeout: 90000 }, target).catch(() => console.log('settle timeout'));
  await new Promise((r) => setTimeout(r, 800));
} else if (prog.startsWith('#')) {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView(), prog);
  await new Promise((r) => setTimeout(r, 2500));
} else if (+prog > 0) {
  await page.evaluate((p) => {
    const j = document.querySelector('#journey');
    const range = j.offsetHeight - window.innerHeight;
    window.scrollTo(0, j.offsetTop + range * p);
  }, +prog);
  await new Promise((r) => setTimeout(r, 3500));
}
console.log(JSON.stringify(await page.evaluate(() => window.__gallery?.debug?.() ?? null)));
await page.screenshot({ path: out });
await browser.close();
