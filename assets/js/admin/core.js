// Komponen UI bersama panel admin: toast, dialog konfirmasi, pesan error yang manusiawi, status sibuk.
import { esc } from '../utils.js';
import { renderIcons } from '../icons.js';

export { esc };

/* ---------------------------------- toast ---------------------------------- */

let toastBox;
export function toast(message, kind = 'success') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    document.body.appendChild(toastBox);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const icon = kind === 'error' ? 'alert-triangle' : kind === 'info' ? 'info' : 'check';
  el.innerHTML = `<i data-lucide="${icon}"></i><span></span><button type="button" class="toast__close" aria-label="Tutup notifikasi"><i data-lucide="x"></i></button>`;
  el.querySelector('span').textContent = message;
  toastBox.appendChild(el);
  renderIcons(el);
  const remove = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); };
  el.querySelector('.toast__close').addEventListener('click', remove);
  setTimeout(remove, kind === 'error' ? 9000 : 4000);
  return el;
}

/* ------------------------------ pesan error ------------------------------ */

/** Ubah error Supabase/PostgREST/jaringan menjadi kalimat yang dapat dipahami. */
export function humanError(err) {
  const msg = String(err?.message || err || 'Terjadi kesalahan.');
  const code = err?.code || '';
  if (code === '23505' || /duplicate key/i.test(msg)) {
    if (/slug/i.test(msg)) return 'Slug sudah dipakai proyek lain. Ganti slug-nya.';
    return 'Data yang sama sudah ada.';
  }
  if (code === '23503' || /foreign key/i.test(msg)) return 'Data ini masih dipakai di bagian lain sehingga tidak bisa dihapus/diubah.';
  if (code === '23514' || /check constraint/i.test(msg)) return 'Ada isian yang tidak sesuai aturan (mis. URL harus diawali https://, tahun 1900–2100, slug huruf kecil-dan-strip).';
  if (code === '42501' || /row-level security|permission denied|not authorized|Unauthorized/i.test(msg)) return 'Akses ditolak. Hanya administrator yang boleh melakukan ini.';
  if (code === 'PGRST116') return 'Data tidak ditemukan atau Anda tidak punya akses.';
  if (/JWT expired|invalid JWT|session.*(missing|expired)/i.test(msg)) return 'Sesi login berakhir. Muat ulang halaman lalu login kembali.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'Ukuran file melebihi batas (maks. 15 MB).';
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Jenis file tidak didukung. Gunakan JPG, PNG, WebP, AVIF, GIF, atau SVG.';
  return msg;
}

export function reportError(err, context = '') {
  console.error(context, err);
  toast(humanError(err), 'error');
}

/** Lempar error bila respons Supabase gagal, kembalikan data bila sukses. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ------------------------------ dialog konfirmasi ------------------------------ */

export function confirmDialog({ title = 'Yakin?', message = '', confirmText = 'Ya, lanjutkan', cancelText = 'Batal', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg dlg--confirm';
    d.setAttribute('aria-labelledby', 'confirm-title');
    d.innerHTML = `<form method="dialog" class="dlg__body">
        <h2 class="dlg__title" id="confirm-title"></h2>
        <p class="dlg__msg"></p>
        <div class="dlg__actions">
          <button class="btn btn--ghost" value="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn--danger btn--solid' : 'btn--primary'}" value="ok">${esc(confirmText)}</button>
        </div>
      </form>`;
    d.querySelector('.dlg__title').textContent = title;
    d.querySelector('.dlg__msg').textContent = message;
    document.body.appendChild(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    d.showModal();
    d.querySelector(danger ? '[value="cancel"]' : '[value="ok"]').focus();
  });
}

/* ------------------------------ dialog umum ------------------------------ */

/**
 * Dialog modal dengan header + isi + aksi. Mengembalikan elemen dialog & fungsi close.
 * `size`: '' | 'wide' | 'xl'.
 */
export function openDialog({ title, body = '', actions = '', size = '', onClose } = {}) {
  const d = document.createElement('dialog');
  d.className = `dlg ${size ? `dlg--${size}` : ''}`;
  const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  d.setAttribute('aria-labelledby', id);
  d.innerHTML = `
    <div class="dlg__head"><h2 class="dlg__title" id="${id}"></h2><button type="button" class="icon-btn" data-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
    <div class="dlg__body">${body}</div>
    ${actions ? `<div class="dlg__actions">${actions}</div>` : ''}`;
  d.querySelector('.dlg__title').textContent = title;
  document.body.appendChild(d);
  renderIcons(d);
  const close = (value) => { if (d.open) d.close(value ?? ''); };
  d.querySelector('[data-close]').addEventListener('click', () => close('cancel'));
  d.addEventListener('close', () => { onClose?.(d.returnValue); d.remove(); });
  d.showModal();
  return { dialog: d, close, body: d.querySelector('.dlg__body') };
}

/* ------------------------------ status sibuk ------------------------------ */

/** Jalankan fn sambil menonaktifkan tombol (mencegah klik ganda). */
export async function busy(button, fn) {
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

export function loadingHTML(text = 'Memuat…') {
  return `<div class="loading" role="status">${esc(text)}</div>`;
}

export function emptyHTML(text, icon = 'inbox', action = '') {
  return `<div class="empty"><i data-lucide="${icon}"></i><p>${esc(text)}</p>${action}</div>`;
}

/* ------------------------------ urutan ------------------------------ */

/** Pindahkan elemen array (immutably) dari indeks i ke j. */
export function moveItem(list, i, j) {
  const copy = list.slice();
  const [it] = copy.splice(i, 1);
  copy.splice(j, 0, it);
  return copy;
}

export function statusBadge(status) {
  return status === 'published'
    ? '<span class="badge badge--published">Terbit</span>'
    : '<span class="badge badge--draft">Draf</span>';
}

/** Peringatkan saat meninggalkan halaman bila ada perubahan yang belum disimpan. */
export function guardUnsaved(isDirty) {
  const handler = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
