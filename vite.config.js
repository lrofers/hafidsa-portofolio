import { defineConfig, loadEnv } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Semua file .html di root dan di admin/ dibangun sebagai halaman terpisah (multi-page).
const pages = {};
for (const dir of ['', 'admin']) {
  for (const f of readdirSync(resolve(import.meta.dirname, dir || '.'))) {
    if (f.endsWith('.html')) pages[`${dir ? `${dir}_` : ''}${f.replace('.html', '')}`] = resolve(import.meta.dirname, dir, f);
  }
}

/**
 * Hasilkan dist/_headers (Cloudflare Pages / Netlify) dengan CSP yang otomatis memuat origin Supabase
 * dari VITE_SUPABASE_URL — tidak ada placeholder yang lupa diganti. Server Express memakai CSP sendiri (helmet).
 */
function staticHostHeaders(supabaseUrl) {
  let origin = '';
  try { origin = supabaseUrl ? new URL(supabaseUrl).origin : ''; } catch { origin = ''; }
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin} https://cdn.jsdelivr.net https://cdn.simpleicons.org`.replace(/\s+/g, ' '),
    "font-src 'self' data:", `connect-src 'self' blob: ${origin}`.trim(), "media-src 'self' blob: https:",
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com", "frame-ancestors 'self'",
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; ');
  return {
    name: 'static-host-headers',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: ${csp}\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/admin/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    appType: 'mpa',
    plugins: [staticHostHeaders(env.VITE_SUPABASE_URL)],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: { input: pages },
    },
    server: {
      port: 5173,
      // formulir kontak -> server Express (npm run dev:server)
      proxy: { '/api': { target: `http://localhost:${env.PORT || 3000}`, changeOrigin: false } },
    },
    preview: { port: 4173 },
  };
});
