// POST /api/contact — formulir kontak dengan validasi, honeypot, waktu minimum, dan rate limit.
import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { sameOrigin } from '../middleware/origin.js';
import { contactIpLimiter, contactEmailLimiter } from '../middleware/rate-limit.js';
import { storeContactMessage } from '../supabase-rest.js';
import { config, contactConfigured } from '../config.js';

export const contactRouter = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_FILL_MS = 2500;

/** Validasi + normalisasi. Mengembalikan { data } atau { error }. */
export function validateContact(body = {}) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const data = { name: str(body.name), email: str(body.email).toLowerCase(), subject: str(body.subject), message: str(body.message) };
  if (data.name.length < 1 || data.name.length > 120) return { error: 'Nama wajib diisi (maks. 120 karakter).' };
  if (data.email.length > 254 || !EMAIL.test(data.email)) return { error: 'Alamat email tidak valid.' };
  if (data.subject.length > 200) return { error: 'Subjek maksimal 200 karakter.' };
  if (data.message.length < 5 || data.message.length > 5000) return { error: 'Pesan minimal 5 dan maksimal 5000 karakter.' };
  return { data };
}

/** Bot biasanya mengisi field tersembunyi atau mengirim seketika. */
export function looksLikeBot(body = {}) {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const elapsed = Number(body.elapsed);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS;
}

contactRouter.post('/contact',
  sameOrigin,
  contactIpLimiter,
  express.json({ limit: '16kb' }),
  contactEmailLimiter,
  async (req, res, next) => {
    try {
      // respons sukses palsu untuk bot agar tidak mencoba cara lain; pesan tidak disimpan
      if (looksLikeBot(req.body)) return res.json({ ok: true });
      const { data, error } = validateContact(req.body);
      if (error) return res.status(422).json({ error });
      if (!contactConfigured) return res.status(503).json({ error: 'Formulir belum aktif: Supabase belum dikonfigurasi di server.' });
      const ipHash = crypto.createHash('sha256').update(`${config.ipHashSalt}:${req.ip}`).digest('hex').slice(0, 32);
      try {
        await storeContactMessage(data, { ipHash, userAgent: String(req.get('user-agent') || '').slice(0, 300) });
      } catch (err) {
        if (/rate_limited/.test(err.body || '')) return res.status(429).json({ error: 'Terlalu banyak pesan. Silakan coba lagi nanti.' });
        if (/invalid_input|check constraint/.test(err.body || '')) return res.status(422).json({ error: 'Data tidak valid.' });
        throw err;
      }
      return res.json({ ok: true });
    } catch (err) { return next(err); }
  });
