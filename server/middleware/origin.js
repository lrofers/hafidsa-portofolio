// Tolak permintaan lintas situs: POST /api/* hanya boleh dari situs ini sendiri (atau ALLOWED_ORIGINS).
import { config } from '../config.js';

export function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return res.status(403).json({ error: 'Permintaan ditolak (origin tidak diketahui).' });
  let host = '';
  try { host = new URL(origin).host; } catch { /* origin tidak valid */ }
  // bandingkan host saja: aman dari CSRF (browser tidak bisa memalsukan Host) dan tetap benar di balik proxy TLS
  if (host && host === req.get('host')) return next();
  if (config.allowedOrigins.includes(origin.replace(/\/+$/, ''))) return next();
  // saat development, Vite (port 5173) meneruskan /api ke server ini dengan origin berbeda
  if (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next();
  return res.status(403).json({ error: 'Permintaan ditolak (origin tidak diizinkan).' });
}
