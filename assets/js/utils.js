// Utilitas kecil yang dipakai bersama oleh situs publik dan admin.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape HTML — wajib untuk semua teks dari database yang disisipkan lewat innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hanya izinkan http(s)/mailto/path relatif; cegah javascript: dsb. */
export function safeUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^(https?:|mailto:)/i.test(s) || s.startsWith('/') || s.startsWith('./')) return s;
  return '';
}

/** Ubah teks polos (paragraf dipisah baris kosong) menjadi HTML aman. */
export function paragraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}

export function yearRange(start, end) {
  if (!start && !end) return '';
  return `${start ?? ''} — ${end ?? 'sekarang'}`;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Angka romawi untuk judul ruang. */
export function roman(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || String(n);
}

/** Gabungkan class dengan aman. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Ubah URL video (YouTube / Vimeo / berkas langsung) menjadi deskriptor embed. */
export function parseVideo(url) {
  const u = safeUrl(url);
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { type: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { type: 'video', src: u };
  return { type: 'link', src: u };
}
