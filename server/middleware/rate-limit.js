// Pembatas laju formulir kontak: per alamat IP dan per alamat email.
import { rateLimit } from 'express-rate-limit';

const tooMany = (req, res) => res.status(429).json({ error: 'Terlalu banyak pesan. Silakan coba lagi nanti.' });

/** Maks. 5 pesan / 15 menit / IP. */
export const contactIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooMany,
});

/** Maks. 3 pesan / jam / email (dijalankan setelah body JSON di-parse). */
export const contactEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => `email:${String(req.body?.email || '').trim().toLowerCase()}`,
  handler: tooMany,
});
