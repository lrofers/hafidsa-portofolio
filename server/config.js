// Konfigurasi server dari environment. Rahasia (service role) hanya dibaca di sini, tidak pernah dikirim ke browser.
import 'dotenv/config';

const trim = (v) => (v || '').trim();
// nilai contoh dari .env.example dianggap kosong
const real = (v) => (/YOUR[-_]/i.test(v || '') ? '' : trim(v));

export const config = {
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',
  // jumlah reverse proxy tepercaya di depan server (Render/Railway/Fly = 1). 0 = langsung terekspos.
  trustProxy: Number.isFinite(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : 0,
  supabaseUrl: real(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  anonKey: real(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
  serviceKey: real(process.env.SUPABASE_SERVICE_ROLE_KEY),
  allowedOrigins: trim(process.env.ALLOWED_ORIGINS).split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  distDir: trim(process.env.DIST_DIR),
  ipHashSalt: trim(process.env.IP_HASH_SALT) || trim(process.env.SUPABASE_SERVICE_ROLE_KEY).slice(-16) || 'portfolio',
};

export const supabaseOrigin = (() => {
  try { return config.supabaseUrl ? new URL(config.supabaseUrl).origin : ''; } catch { return ''; }
})();

export const contactConfigured = Boolean(config.supabaseUrl && (config.serviceKey || config.anonKey));
