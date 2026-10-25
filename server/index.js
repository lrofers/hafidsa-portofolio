// Server produksi (Node.js + Express): menyajikan hasil build `dist/` dan endpoint /api.
// Jalankan: npm run build && npm start
import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { securityHeaders } from './middleware/security.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { contactRouter } from './routes/contact.js';
import { healthRouter } from './routes/health.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = config.distDir ? path.resolve(root, config.distDir) : path.join(root, 'dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders());
  app.use(compression());

  app.use('/api', healthRouter, contactRouter, apiNotFound);

  // _headers hanya untuk hosting statis (Cloudflare Pages/Netlify), tidak perlu disajikan
  app.use('/_headers', (req, res) => res.status(404).end());

  if (!fs.existsSync(dist)) console.warn('[server] Folder dist/ belum ada. Jalankan "npm run build" terlebih dahulu.');
  app.use(express.static(dist, {
    extensions: ['html'],
    index: 'index.html',
    setHeaders(res, file) {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=86400');
      if (file.includes(`${path.sep}admin${path.sep}`)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    },
  }));

  // halaman tidak ditemukan
  app.use((req, res) => {
    const page = path.join(dist, '404.html');
    if (fs.existsSync(page)) return res.status(404).sendFile(page);
    return res.status(404).type('text').send('Halaman tidak ditemukan.');
  });
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}  (formulir kontak: ${config.serviceKey ? 'service role' : config.anonKey ? 'RPC anon' : 'belum dikonfigurasi'})`);
  });
}
