// Admin › Media: upload (drag & drop, banyak file, status per file), pratinjau, edit judul & alt text,
// ganti file (semua pemakaian ikut berganti), salin URL, info pemakaian, dan hapus file yang tidak dipakai.
import { $, esc, formatBytes, formatDate } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, busy, unwrap, openDialog, loadingHTML, emptyHTML, humanError } from './core.js';
import {
  listMedia, usageCounts, uploadQueue, bindDropzone, mediaTileHTML, mediaFull, mediaName,
  replaceMediaFile, deleteMedia, ACCEPT_IMAGES,
} from './media-lib.js';

let rows = [];
let usage = new Map();
const filter = { q: '', use: 'all' };

export async function init() {
  $('#head-actions').innerHTML = `<label class="btn btn--primary"><i data-lucide="upload"></i>Upload gambar<input type="file" accept="${ACCEPT_IMAGES}" multiple hidden data-file></label>`;
  $('#view').innerHTML = `
    <div class="dropzone" data-drop><i data-lucide="upload"></i><strong>Tarik & lepas gambar ke sini</strong><span class="small">JPG, PNG, WebP, AVIF, GIF, atau SVG · maks. 15 MB setelah kompresi. Foto diperkecil otomatis (maks. 2400 px) dan metadata lokasi dihapus.</span></div>
    <div class="uploads" data-uploads></div>
    <div class="toolbar" style="margin-top:20px">
      <input class="input grow" type="search" placeholder="Cari judul, alt text, atau nama file…" aria-label="Cari media" data-q>
      <select class="select" aria-label="Filter pemakaian" data-use><option value="all">Semua media</option><option value="used">Sedang dipakai</option><option value="unused">Tidak dipakai</option><option value="noalt">Tanpa alt text</option></select>
      <button class="btn btn--danger" type="button" data-purge hidden><i data-lucide="trash-2"></i><span></span></button>
    </div>
    <p class="small muted" data-summary style="margin-bottom:12px"></p>
    <div class="media-grid" data-grid>${loadingHTML('Memuat media…')}</div>`;

  const onFiles = async (files) => {
    const added = await uploadQueue($('[data-uploads]'), files);
    if (added.length) { toast(`${added.length} gambar diunggah ke Storage.`); await refresh(); }
  };
  $('#head-actions [data-file]').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onFiles(f); });
  bindDropzone($('[data-drop]'), onFiles);
  $('[data-q]').addEventListener('input', (e) => { filter.q = e.target.value; paint(); });
  $('[data-use]').addEventListener('change', (e) => { filter.use = e.target.value; paint(); });
  $('[data-grid]').addEventListener('click', (e) => {
    const tile = e.target.closest('.media-tile');
    if (tile) openDetail(rows.find((r) => r.id === tile.dataset.id));
  });
  $('[data-purge]').addEventListener('click', purgeUnused);
  renderIcons();
  await refresh();
}

async function refresh() {
  try {
    [rows, usage] = await Promise.all([listMedia(), usageCounts()]);
    paint();
  } catch (err) {
    $('[data-grid]').innerHTML = `<p class="form-error">${esc(humanError(err))}</p>`;
    reportError(err);
  }
}

function paint() {
  const q = filter.q.trim().toLowerCase();
  const list = rows.filter((r) => {
    const n = usage.get(r.id) || 0;
    if (filter.use === 'used' && !n) return false;
    if (filter.use === 'unused' && n) return false;
    if (filter.use === 'noalt' && r.alt_text) return false;
    return !q || `${r.title} ${r.alt_text} ${r.path} ${r.external_url}`.toLowerCase().includes(q);
  });
  const unused = rows.filter((r) => !(usage.get(r.id) || 0));
  const total = rows.reduce((s, r) => s + (r.size_bytes || 0), 0);
  $('[data-summary]').textContent = `${rows.length} file · ${formatBytes(total)} di Storage · ${unused.length} tidak dipakai · ${rows.filter((r) => !r.alt_text).length} tanpa alt text`;
  const purge = $('[data-purge]');
  purge.hidden = !unused.length;
  purge.querySelector('span').textContent = `Hapus yang tidak dipakai (${unused.length})`;
  $('[data-grid]').innerHTML = list.length
    ? list.map((r) => mediaTileHTML(r, { usage: usage.get(r.id) || 0 })).join('')
    : emptyHTML(rows.length ? 'Tidak ada media yang cocok.' : 'Belum ada media. Upload gambar pertama Anda.', 'image');
  renderIcons($('[data-grid]'));
}

/** Rincian tempat media dipakai (untuk ditampilkan di dialog detail). */
async function usageDetails(id) {
  const [p, pi, g, s, st] = await Promise.all([
    supabase.from('projects').select('id, title').or(`thumbnail_media_id.eq.${id},cover_media_id.eq.${id}`),
    supabase.from('project_images').select('project:projects(id, title)').eq('media_id', id),
    supabase.from('gallery_artworks').select('id, title').eq('media_id', id),
    supabase.from('software_tools').select('id, name').eq('icon_media_id', id),
    supabase.from('site_settings').select('logo_media_id, favicon_media_id, og_media_id, profile_media_id').eq('id', 1).maybeSingle(),
  ]);
  const out = [];
  unwrap(p).forEach((x) => out.push({ label: `Proyek: ${x.title}`, href: `/admin/projects.html?edit=${x.id}` }));
  unwrap(pi).forEach((x) => x.project && out.push({ label: `Galeri foto proyek: ${x.project.title}`, href: `/admin/projects.html?edit=${x.project.id}` }));
  unwrap(g).forEach((x) => out.push({ label: `Karya galeri 3D: ${x.title}`, href: '/admin/gallery.html' }));
  unwrap(s).forEach((x) => out.push({ label: `Logo software: ${x.name}`, href: '/admin/skills.html?tab=software' }));
  const set = unwrap(st) || {};
  const names = { logo_media_id: 'Logo situs', favicon_media_id: 'Favicon', og_media_id: 'Gambar berbagi (OG)', profile_media_id: 'Foto profil' };
  Object.entries(names).forEach(([k, label]) => { if (set[k] === id) out.push({ label, href: k === 'profile_media_id' ? '/admin/about.html' : '/admin/settings.html' }); });
  return out;
}

function openDetail(row) {
  if (!row) return;
  const n = usage.get(row.id) || 0;
  const url = mediaFull(row);
  const { dialog, body, close } = openDialog({
    title: mediaName(row), size: 'xl',
    body: `
      <div class="media-detail">
        <div class="media-detail__preview"><img src="${esc(url)}" alt="${esc(row.alt_text || '')}" data-preview></div>
        <div class="stack">
          <form class="form-grid" data-meta novalidate>
            <div class="field full"><label for="m-title">Judul</label><input class="input" id="m-title" name="title" maxlength="160" value="${esc(row.title || '')}"></div>
            <div class="field full"><label for="m-alt">Alt text <span class="small muted">(deskripsi gambar untuk pembaca layar & SEO)</span></label>
              <textarea class="textarea" id="m-alt" name="alt_text" rows="3" maxlength="300" placeholder="Mis. Potret hitam-putih seorang penari di studio">${esc(row.alt_text || '')}</textarea></div>
            <div class="full"><button class="btn btn--primary" type="submit"><i data-lucide="save"></i>Simpan judul & alt text</button></div>
          </form>
          <dl class="kv-list">
            <div><dt>Ukuran gambar</dt><dd>${row.width && row.height ? `${row.width} × ${row.height} px` : '—'}</dd></div>
            <div><dt>Ukuran file</dt><dd>${esc(formatBytes(row.size_bytes))}</dd></div>
            <div><dt>Tipe</dt><dd>${esc(row.mime_type || '—')}</dd></div>
            <div><dt>Diunggah</dt><dd>${esc(formatDate(row.created_at))}</dd></div>
            <div><dt>Lokasi</dt><dd class="mono">${esc(row.path ? `${row.bucket}/${row.path}` : row.external_url || '—')}</dd></div>
          </dl>
          <div><h3 class="small" style="margin-bottom:6px">Dipakai di</h3><ul class="small" data-usage><li class="muted">Memeriksa…</li></ul></div>
          <div class="uploads" data-replace-status></div>
        </div>
      </div>`,
    actions: `
      <button class="btn btn--danger" type="button" data-delete ${n ? 'disabled title="Media sedang dipakai. Lepaskan dulu dari konten terkait."' : ''}><i data-lucide="trash-2"></i>Hapus</button>
      <span style="flex:1"></span>
      <button class="btn" type="button" data-copy><i data-lucide="link"></i>Salin URL</button>
      <a class="btn" href="${esc(url)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Buka</a>
      <label class="btn btn--primary"><i data-lucide="replace"></i>Ganti gambar<input type="file" accept="${ACCEPT_IMAGES}" hidden data-replace></label>`,
  });

  usageDetails(row.id).then((items) => {
    body.querySelector('[data-usage]').innerHTML = items.length
      ? items.map((u) => `<li><a href="${esc(u.href)}">${esc(u.label)}</a></li>`).join('')
      : '<li class="muted">Tidak dipakai di mana pun — aman dihapus.</li>';
  }).catch((err) => { body.querySelector('[data-usage]').innerHTML = `<li class="form-error">${esc(humanError(err))}</li>`; });

  body.querySelector('[data-meta]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await busy(f.querySelector('[type="submit"]'), async () => {
      try {
        const updated = unwrap(await supabase.from('media_assets').update({ title: f.elements.title.value.trim() || null, alt_text: f.elements.alt_text.value.trim() }).eq('id', row.id).select().single());
        Object.assign(row, updated);
        toast('Judul & alt text disimpan.');
        paint();
      } catch (err) { reportError(err); }
    });
  });

  dialog.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('URL disalin.'); } catch { window.prompt('Salin URL berikut:', url); }
  });

  dialog.querySelector('[data-replace]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const box = body.querySelector('[data-replace-status]');
    box.innerHTML = '<div class="upload-item"><span class="ph"></span><div><div class="upload-item__name"></div><div class="upload-item__status" aria-live="polite">Menyiapkan…</div><div class="progress"><i></i></div></div><span></span></div>';
    box.querySelector('.upload-item__name').textContent = `Mengganti dengan ${file.name}`;
    const status = box.querySelector('.upload-item__status');
    const bar = box.querySelector('.progress');
    try {
      const updated = await replaceMediaFile(row, file, {
        onStatus: ({ stage, progress, text }) => {
          status.textContent = text;
          bar.classList.toggle('progress--indeterminate', stage === 'processing' || stage === 'saving');
          if (typeof progress === 'number') bar.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
        },
      });
      Object.assign(row, updated);
      body.querySelector('[data-preview]').src = mediaFull(row);
      box.querySelector('.upload-item').classList.add('upload-item--done');
      status.textContent = 'Gambar diganti. Semua halaman & bingkai galeri yang memakai media ini kini menampilkan gambar baru.';
      bar.hidden = true;
      toast('Gambar diganti.');
      await refresh();
    } catch (err) {
      box.querySelector('.upload-item').classList.add('upload-item--error');
      status.textContent = `Gagal: ${humanError(err)}`;
      bar.hidden = true;
    }
  });

  dialog.querySelector('[data-delete]').addEventListener('click', async (e) => {
    if (!(await confirmDialog({ title: 'Hapus media ini?', message: 'File dihapus permanen dari Storage.', confirmText: 'Hapus', danger: true }))) return;
    await busy(e.currentTarget, async () => {
      try {
        await deleteMedia(row);
        toast('Media dihapus.');
        close('deleted');
        await refresh();
      } catch (err) { reportError(err); }
    });
  });
}

async function purgeUnused(e) {
  const unused = rows.filter((r) => !(usage.get(r.id) || 0));
  if (!unused.length) return;
  const ok = await confirmDialog({
    title: `Hapus ${unused.length} media yang tidak dipakai?`,
    message: 'Hanya file yang tidak dipakai di proyek, galeri, logo, maupun pengaturan yang dihapus. Tindakan ini permanen.',
    confirmText: 'Hapus semuanya', danger: true,
  });
  if (!ok) return;
  await busy(e.currentTarget, async () => {
    let done = 0; let failed = 0;
    for (const r of unused) {
      try { await deleteMedia(r); done++; } catch (err) { failed++; console.error(err); }
    }
    toast(failed ? `${done} dihapus, ${failed} gagal (mungkin baru saja dipakai).` : `${done} media dihapus.`, failed ? 'error' : 'success');
    await refresh();
  });
}
