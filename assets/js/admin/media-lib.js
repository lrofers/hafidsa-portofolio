// Pustaka media admin: kompresi gambar di browser, upload ke Supabase Storage (dengan progres),
// penggantian file, penghapusan, dan dialog pemilih media yang dipakai di semua halaman admin.
import { supabase, supabaseUrl, supabaseKey, BUCKET, toImage } from '../supabase.js';
import { esc, formatBytes } from '../utils.js';
import { renderIcons } from '../icons.js';
import { toast, humanError, unwrap, openDialog } from './core.js';

export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml';
const MAX_FULL = 2400;   // sisi terpanjang gambar utama (px)
const MAX_THUMB = 960;   // thumbnail untuk grid, ponsel, dan tekstur galeri jarak jauh
const MAX_BYTES = 15 * 1024 * 1024;      // batas bucket
const MAX_INPUT = 40 * 1024 * 1024;      // foto kamera besar tetap diterima lalu dikompresi
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

/* --------------------------------- cache --------------------------------- */

const cache = new Map();
export function cacheMedia(rows) { rows.forEach((r) => r && cache.set(r.id, r)); }
export async function getMedia(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  const row = unwrap(await supabase.from('media_assets').select('*').eq('id', id).maybeSingle());
  if (row) cache.set(id, row);
  return row;
}
export async function listMedia() {
  const rows = unwrap(await supabase.from('media_assets').select('*').order('created_at', { ascending: false }).limit(1000));
  cacheMedia(rows);
  return rows;
}
export function mediaThumb(row) { return toImage(row)?.thumbUrl || ''; }
export function mediaFull(row) { return toImage(row)?.url || ''; }
export function mediaName(row) {
  return row?.title || row?.path?.split('/').pop() || row?.external_url?.split('/').pop() || 'Tanpa judul';
}

/* --------------------------- pemrosesan gambar --------------------------- */

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close?.() };
    } catch { /* lanjut ke <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error('Gambar tidak dapat dibaca (format tidak didukung browser ini).'); }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

async function measure(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let w = img.naturalWidth; let h = img.naturalHeight;
    if ((!w || !h) && file.type === 'image/svg+xml') {
      const vb = (await file.text()).match(/viewBox=["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      if (vb) { w = Math.round(+vb[1]); h = Math.round(+vb[2]); }
    }
    return { width: w || null, height: h || null };
  } catch { return { width: null, height: null }; } finally { URL.revokeObjectURL(url); }
}

const fit = (w, h, max) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };

async function draw(source, w, h, type, quality) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, type, quality));
  return blob && blob.type === type ? blob : null; // browser yang tidak bisa meng-encode WebP mengembalikan PNG
}

/**
 * Kompres & ubah ukuran gambar. Re-encode juga membuang metadata EXIF (mis. lokasi GPS) demi privasi.
 * SVG & GIF disimpan apa adanya (vektor / animasi).
 */
export async function processImage(file) {
  const type = file.type || '';
  if (!ACCEPT_IMAGES.split(',').includes(type)) throw new Error(`Format "${type || file.name}" tidak didukung. Gunakan JPG, PNG, WebP, AVIF, GIF, atau SVG.`);
  if (type === 'image/svg+xml' || type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('Ukuran file melebihi 15 MB.');
    const { width, height } = await measure(file);
    return { full: file, thumb: null, width, height, mime: type, ext: EXT[type] };
  }
  if (file.size > MAX_INPUT) throw new Error('Ukuran file melebihi 40 MB.');
  const { source, width, height, cleanup } = await decode(file);
  try {
    const [fw, fh] = fit(width, height, MAX_FULL);
    let mime = 'image/webp';
    let full = await draw(source, fw, fh, mime, 0.86);
    if (!full) { mime = type === 'image/png' ? 'image/png' : 'image/jpeg'; full = await draw(source, fw, fh, mime, 0.88); }
    if (!full) throw new Error('Browser gagal memproses gambar.');
    let thumb = null;
    if (Math.max(fw, fh) > MAX_THUMB * 1.15) {
      const [tw, th] = fit(width, height, MAX_THUMB);
      thumb = await draw(source, tw, th, mime, 0.8);
    }
    if (full.size > MAX_BYTES) throw new Error('Gambar masih melebihi 15 MB setelah dikompresi.');
    return { full, thumb, width: fw, height: fh, mime, ext: EXT[mime] };
  } finally { cleanup(); }
}

/* -------------------------------- upload -------------------------------- */

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Upload biner langsung ke Storage REST API (XHR dipakai agar progres upload bisa ditampilkan). */
async function putObject(path, blob, contentType, onProgress) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesi login berakhir. Silakan login ulang.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodePath(path)}`);
    xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', supabaseKey);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* bukan JSON */ }
      const err = new Error(body.message || body.error || `Upload gagal (HTTP ${xhr.status}).`);
      err.status = Number(body.statusCode) || xhr.status;
      if (err.status === 403) err.code = '42501';
      reject(err);
    };
    xhr.onerror = () => reject(new Error('Failed to fetch'));
    xhr.send(blob);
  });
}

async function removeObjects(paths, bucket = BUCKET) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from(bucket).remove(list);
  if (error) throw error;
}

function newPaths(ext, hasThumb) {
  const id = crypto.randomUUID();
  const d = new Date();
  const base = `uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}`;
  return { id, path: `${base}.${ext}`, thumbPath: hasThumb ? `${base}-thumb.${ext}` : null };
}

async function uploadProcessed(img, onStatus) {
  const { id, path, thumbPath } = newPaths(img.ext, !!img.thumb);
  const total = img.full.size + (img.thumb?.size || 0);
  onStatus({ stage: 'uploading', progress: 0, text: 'Mengunggah… 0%' });
  const report = (offset, size) => (f) => {
    const p = (offset + f * size) / total;
    onStatus({ stage: 'uploading', progress: p, text: `Mengunggah… ${Math.round(p * 100)}%` });
  };
  await putObject(path, img.full, img.mime, report(0, img.full.size));
  try {
    if (thumbPath) await putObject(thumbPath, img.thumb, img.mime, report(img.full.size, img.thumb.size));
  } catch (err) { await removeObjects([path]).catch(() => {}); throw err; }
  return { id, path, thumbPath, size: total };
}

const baseName = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120);

/** Upload satu gambar baru -> baris media_assets. `onStatus({stage, progress, text})`. */
export async function uploadMedia(file, { alt = '', title, onStatus = () => {} } = {}) {
  onStatus({ stage: 'processing', text: 'Memproses gambar…' });
  const img = await processImage(file);
  const up = await uploadProcessed(img, onStatus);
  onStatus({ stage: 'saving', text: 'Menyimpan ke database…' });
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const row = unwrap(await supabase.from('media_assets').insert({
      id: up.id, bucket: BUCKET, path: up.path, thumb_path: up.thumbPath, external_url: null,
      title: title ?? baseName(file.name), alt_text: alt, mime_type: img.mime,
      width: img.width, height: img.height, size_bytes: up.size, uploaded_by: session?.user?.id ?? null,
    }).select().single());
    cache.set(row.id, row);
    onStatus({ stage: 'done', progress: 1, text: 'Selesai' });
    return row;
  } catch (err) {
    await removeObjects([up.path, up.thumbPath]).catch(() => {});
    throw err;
  }
}

/**
 * Ganti file sebuah media tanpa mengubah id-nya: semua proyek/karya/logo yang memakai media ini
 * otomatis menampilkan gambar baru (termasuk bingkai di galeri 3D). File lama dihapus dari Storage.
 */
export async function replaceMediaFile(row, file, { onStatus = () => {} } = {}) {
  onStatus({ stage: 'processing', text: 'Memproses gambar…' });
  const img = await processImage(file);
  const up = await uploadProcessed(img, onStatus);
  onStatus({ stage: 'saving', text: 'Menyimpan ke database…' });
  let updated;
  try {
    updated = unwrap(await supabase.from('media_assets').update({
      bucket: BUCKET, path: up.path, thumb_path: up.thumbPath, external_url: null, mime_type: img.mime,
      width: img.width, height: img.height, size_bytes: up.size,
    }).eq('id', row.id).select().single());
  } catch (err) {
    await removeObjects([up.path, up.thumbPath]).catch(() => {});
    throw err;
  }
  cache.set(updated.id, updated);
  await removeObjects([row.path, row.thumb_path], row.bucket || BUCKET).catch((e) => console.warn('File lama gagal dihapus', e));
  onStatus({ stage: 'done', progress: 1, text: 'Selesai' });
  return updated;
}

/** Hapus media. Database menolak (FK RESTRICT) bila media masih dipakai, sehingga file tidak pernah hilang dari konten. */
export async function deleteMedia(row) {
  const rows = unwrap(await supabase.from('media_assets').delete().eq('id', row.id).select('id'));
  if (!rows.length) throw Object.assign(new Error('Media tidak ditemukan atau Anda tidak punya akses.'), { code: 'PGRST116' });
  cache.delete(row.id);
  try { await removeObjects([row.path, row.thumb_path], row.bucket || BUCKET); } catch (e) {
    console.warn(e);
    toast('Data media terhapus, tetapi file di Storage gagal dihapus. Hapus manual di Supabase Storage.', 'info');
  }
}

/** Jumlah pemakaian per media (view media_usage). */
export async function usageCounts() {
  const rows = unwrap(await supabase.from('media_usage').select('media_id, usage_count'));
  return new Map(rows.map((r) => [r.media_id, r.usage_count]));
}

/* ------------------------- antrean upload (UI) ------------------------- */

/**
 * Upload beberapa file berurutan sambil menampilkan status tiap file di `container`.
 * Mengembalikan baris media yang berhasil.
 */
export async function uploadQueue(container, files, { alt = '' } = {}) {
  const items = Array.from(files).map((file) => {
    const el = document.createElement('div');
    el.className = 'upload-item';
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    el.innerHTML = `${preview ? `<img src="${preview}" alt="">` : '<span class="ph"></span>'}
      <div><div class="upload-item__name"></div><div class="upload-item__status" aria-live="polite">Menunggu…</div><div class="progress"><i></i></div></div>
      <span class="small muted">${esc(formatBytes(file.size))}</span>`;
    el.querySelector('.upload-item__name').textContent = file.name;
    container.prepend(el);
    return { file, el, preview };
  });
  const done = [];
  for (const it of items) {
    const status = it.el.querySelector('.upload-item__status');
    const bar = it.el.querySelector('.progress');
    try {
      const row = await uploadMedia(it.file, {
        alt,
        onStatus: ({ stage, progress, text }) => {
          status.textContent = text;
          bar.classList.toggle('progress--indeterminate', stage === 'processing' || stage === 'saving');
          if (typeof progress === 'number') bar.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
        },
      });
      it.el.classList.add('upload-item--done');
      status.textContent = 'Tersimpan';
      bar.hidden = true;
      done.push(row);
    } catch (err) {
      console.error(err);
      it.el.classList.add('upload-item--error');
      status.textContent = `Gagal: ${humanError(err)}`;
      bar.hidden = true;
    } finally {
      if (it.preview) setTimeout(() => URL.revokeObjectURL(it.preview), 30000);
    }
  }
  return done;
}

/** Aktifkan drag & drop file pada elemen. */
export function bindDropzone(el, onFiles) {
  const on = (e) => { e.preventDefault(); el.classList.add('is-over'); };
  const off = () => el.classList.remove('is-over');
  el.addEventListener('dragenter', on);
  el.addEventListener('dragover', on);
  el.addEventListener('dragleave', off);
  el.addEventListener('drop', (e) => {
    e.preventDefault(); off();
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  });
}

/* ---------------------------- pemilih media ---------------------------- */

export function mediaTileHTML(row, { selected = false, usage } = {}) {
  const thumb = mediaThumb(row);
  const dims = row.width && row.height ? `${row.width}×${row.height}` : '';
  return `<button type="button" class="media-tile${selected ? ' is-selected' : ''}" data-id="${esc(row.id)}" aria-pressed="${selected}" title="${esc(mediaName(row))}">
    ${typeof usage === 'number' ? (usage ? `<span class="badge badge--ok">Dipakai ${usage}×</span>` : '<span class="badge">Tidak dipakai</span>') : ''}
    <span class="media-tile__img">${thumb ? `<img src="${esc(thumb)}" alt="${esc(row.alt_text || '')}" loading="lazy" decoding="async">` : ''}</span>
    <span class="media-tile__meta"><span class="media-tile__name">${esc(mediaName(row))}</span><span class="media-tile__sub">${esc([dims, formatBytes(row.size_bytes)].filter((x) => x && x !== '—').join(' · '))}</span></span>
  </button>`;
}

/**
 * Dialog pilih gambar dari Media Library atau upload baru.
 * @returns {Promise<object|object[]|null>} baris media_assets (array bila multiple)
 */
export function pickMedia({ title = 'Pilih gambar', multiple = false, selected = [] } = {}) {
  return new Promise((resolve) => {
    let rows = [];
    const chosen = new Set(selected.filter(Boolean));
    let result = null;
    const { dialog, body, close } = openDialog({
      title, size: 'wide',
      body: `
        <div class="toolbar">
          <input class="input grow" type="search" placeholder="Cari judul atau alt text…" aria-label="Cari media" data-q>
          <label class="btn btn--primary"><i data-lucide="upload"></i>Upload baru<input type="file" accept="${ACCEPT_IMAGES}" ${multiple ? 'multiple' : ''} hidden data-file></label>
        </div>
        <div class="dropzone" data-drop><i data-lucide="image"></i><span>Tarik & lepas gambar ke sini untuk mengunggah</span></div>
        <div class="uploads" data-uploads></div>
        <div class="media-grid" data-grid style="margin-top:16px">${'<div class="loading">Memuat media…</div>'}</div>`,
      actions: `<span class="small muted" data-count style="margin-right:auto"></span>
        <button type="button" class="btn btn--ghost" data-cancel>Batal</button>
        <button type="button" class="btn btn--primary" data-ok disabled>${multiple ? 'Tambahkan' : 'Pilih'}</button>`,
      onClose: () => resolve(result),
    });
    const grid = body.querySelector('[data-grid]');
    const q = body.querySelector('[data-q]');
    const ok = dialog.querySelector('[data-ok]');
    const countEl = dialog.querySelector('[data-count]');

    const sync = () => {
      ok.disabled = chosen.size === 0;
      countEl.textContent = multiple && chosen.size ? `${chosen.size} dipilih` : '';
    };
    const paint = () => {
      const term = q.value.trim().toLowerCase();
      const visible = rows.filter((r) => !term || `${r.title} ${r.alt_text} ${r.path} ${r.external_url}`.toLowerCase().includes(term));
      grid.innerHTML = visible.length
        ? visible.map((r) => mediaTileHTML(r, { selected: chosen.has(r.id) })).join('')
        : '<p class="muted">Belum ada media. Upload gambar terlebih dahulu.</p>';
      sync();
    };
    const finish = () => {
      const picked = rows.filter((r) => chosen.has(r.id));
      result = multiple ? picked : picked[0] || null;
      close('ok');
    };

    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('.media-tile');
      if (!tile) return;
      const id = tile.dataset.id;
      if (multiple) { if (chosen.has(id)) chosen.delete(id); else chosen.add(id); } else { chosen.clear(); chosen.add(id); }
      grid.querySelectorAll('.media-tile').forEach((t) => { const on = chosen.has(t.dataset.id); t.classList.toggle('is-selected', on); t.setAttribute('aria-pressed', String(on)); });
      sync();
    });
    grid.addEventListener('dblclick', (e) => { if (!multiple && e.target.closest('.media-tile')) finish(); });
    q.addEventListener('input', paint);
    dialog.querySelector('[data-cancel]').addEventListener('click', () => close('cancel'));
    ok.addEventListener('click', finish);

    const handleFiles = async (files) => {
      const added = await uploadQueue(body.querySelector('[data-uploads]'), files);
      if (!added.length) return;
      rows = [...added, ...rows];
      if (!multiple) chosen.clear();
      added.forEach((r) => chosen.add(r.id));
      paint();
      toast(`${added.length} gambar berhasil diunggah.`);
    };
    body.querySelector('[data-file]').addEventListener('change', (e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ''; });
    bindDropzone(body.querySelector('[data-drop]'), handleFiles);

    listMedia().then((r) => { rows = r; paint(); }).catch((err) => { grid.innerHTML = `<p class="form-error">${esc(humanError(err))}</p>`; });
    renderIcons(dialog);
  });
}
