// Admin › Proyek: daftar (cari, filter, urutkan, terbitkan, unggulan, duplikasi, hapus) + editor lengkap
// (konten, thumbnail, gambar utama, galeri foto berurutan dengan keterangan, tautan & video, software).
import { $, esc, slugify } from '../utils.js';
import { renderIcons, softwareLogoHTML, bindIconFallbacks } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, busy, unwrap, statusBadge, moveItem, guardUnsaved, loadingHTML, emptyHTML } from './core.js';
import { formHTML, bindForm } from './forms.js';
import { pickMedia, cacheMedia, mediaThumb, uploadQueue, ACCEPT_IMAGES } from './media-lib.js';
import { saveOrder, nextSortOrder } from './data.js';

const SELECT = `*, thumbnail:media_assets!projects_thumbnail_media_id_fkey(*), cover:media_assets!projects_cover_media_id_fkey(*),
  images:project_images(id, media_id, caption, sort_order, media:media_assets(*)), software:project_software(software_id)`;

const view = () => $('#view');
const headActions = () => $('#head-actions');
let projects = [];
let software = [];
const filter = { q: '', status: 'all', cat: 'all' };
let editor = null; // { id, isDirty() }

export async function init() {
  view().innerHTML = loadingHTML('Memuat proyek…');
  try { await load(); } catch (err) { view().innerHTML = `<p class="form-error">${esc(err.message)}</p>`; reportError(err); return; }
  window.addEventListener('popstate', () => {
    if (editor?.isDirty() && !window.confirm('Perubahan belum disimpan. Tinggalkan editor?')) {
      history.pushState(null, '', editor.url);
      return;
    }
    route();
  });
  guardUnsaved(() => !!editor?.isDirty());
  route();
}

async function load() {
  const [p, s] = await Promise.all([
    supabase.from('projects').select(SELECT).order('sort_order'),
    supabase.from('software_tools').select('*, icon_media:media_assets(*)').order('sort_order'),
  ]);
  projects = unwrap(p);
  software = unwrap(s);
  projects.forEach((pr) => { cacheMedia([pr.thumbnail, pr.cover, ...pr.images.map((i) => i.media)]); pr.images.sort((a, b) => a.sort_order - b.sort_order); });
}

function route() {
  const params = new URLSearchParams(location.search);
  if (params.get('edit')) {
    const p = projects.find((x) => x.id === params.get('edit'));
    if (p) return renderEditor(p);
    toast('Proyek tidak ditemukan.', 'error');
    history.replaceState(null, '', location.pathname);
  }
  if (params.has('new')) return renderEditor(null);
  renderList();
}

function go(search) {
  history.pushState(null, '', `${location.pathname}${search}`);
  route();
  window.scrollTo(0, 0);
}

/* =================================== daftar =================================== */

function renderList() {
  editor = null;
  headActions().innerHTML = '<button class="btn btn--primary" type="button" data-new><i data-lucide="plus"></i>Tambah proyek</button>';
  headActions().querySelector('[data-new]').addEventListener('click', () => go('?new=1'));
  const cats = [...new Set(projects.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  view().innerHTML = `
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Cari judul, slug, atau kategori…" aria-label="Cari proyek" data-q value="${esc(filter.q)}">
      <select class="select" aria-label="Filter status" data-status>
        <option value="all">Semua status</option><option value="published">Terbit</option><option value="draft">Draf</option>
      </select>
      <select class="select" aria-label="Filter kategori" data-cat>
        <option value="all">Semua kategori</option>${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
    </div>
    <p class="small muted" data-hint style="margin:-6px 0 12px"></p>
    <div class="card"><div class="rows" id="rows"></div></div>`;
  $('[data-status]').value = filter.status;
  $('[data-cat]').value = cats.includes(filter.cat) ? filter.cat : 'all';
  $('[data-q]').addEventListener('input', (e) => { filter.q = e.target.value; paintRows(); });
  $('[data-status]').addEventListener('change', (e) => { filter.status = e.target.value; paintRows(); });
  $('[data-cat]').addEventListener('change', (e) => { filter.cat = e.target.value; paintRows(); });
  $('#rows').addEventListener('click', onRowAction);
  paintRows();
  renderIcons();
}

function filtered() {
  const q = filter.q.trim().toLowerCase();
  return projects.filter((p) => (filter.status === 'all' || p.status === filter.status)
    && (filter.cat === 'all' || p.category === filter.cat)
    && (!q || `${p.title} ${p.slug} ${p.category}`.toLowerCase().includes(q)));
}

function paintRows() {
  const rows = $('#rows');
  if (!rows) return;
  const list = filtered();
  const ordering = list.length === projects.length;
  $('[data-hint]').textContent = ordering ? 'Gunakan panah untuk mengatur urutan tampil di situs.' : 'Hapus filter/pencarian untuk mengatur urutan.';
  if (!projects.length) {
    rows.innerHTML = emptyHTML('Belum ada proyek.', 'folder-kanban', '<button class="btn btn--primary" type="button" data-act="new"><i data-lucide="plus"></i>Tambah proyek pertama</button>');
  } else if (!list.length) {
    rows.innerHTML = emptyHTML('Tidak ada proyek yang cocok dengan filter.', 'search');
  } else {
    rows.innerHTML = list.map((p, i) => `
      <div class="row" data-id="${p.id}">
        <div class="row__order">
          <button class="icon-btn" type="button" data-act="up" aria-label="Naikkan ${esc(p.title)}" ${!ordering || i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
          <button class="icon-btn" type="button" data-act="down" aria-label="Turunkan ${esc(p.title)}" ${!ordering || i === list.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
        </div>
        <div class="row__thumb">${mediaThumb(p.thumbnail || p.cover) ? `<img src="${esc(mediaThumb(p.thumbnail || p.cover))}" alt="" loading="lazy">` : '<i data-lucide="image"></i>'}</div>
        <div class="row__main">
          <div class="row__title">${esc(p.title)}</div>
          <div class="row__sub">${statusBadge(p.status)}${p.is_featured ? '<span class="badge badge--new">Unggulan</span>' : ''}<span>${esc(p.category)}</span>${p.year ? `<span>${esc(p.year)}</span>` : ''}<span class="mono">/${esc(p.slug)}</span><span>${p.images.length} foto</span></div>
        </div>
        <div class="row__actions">
          <button class="icon-btn${p.is_featured ? ' is-on' : ''}" type="button" data-act="feature" aria-pressed="${p.is_featured}" aria-label="${p.is_featured ? 'Hapus dari unggulan' : 'Jadikan unggulan'}" title="Unggulan di beranda"><i data-lucide="star"></i></button>
          <button class="btn btn--sm" type="button" data-act="publish">${p.status === 'published' ? 'Jadikan draf' : 'Terbitkan'}</button>
          <a class="icon-btn" href="/project-detail.html?slug=${encodeURIComponent(p.slug)}&preview=1" target="_blank" rel="noopener" aria-label="Pratinjau ${esc(p.title)}" title="Pratinjau"><i data-lucide="eye"></i></a>
          <button class="icon-btn" type="button" data-act="edit" aria-label="Edit ${esc(p.title)}" title="Edit"><i data-lucide="pencil"></i></button>
          <button class="icon-btn" type="button" data-act="duplicate" aria-label="Duplikasi ${esc(p.title)}" title="Duplikasi"><i data-lucide="copy"></i></button>
          <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus ${esc(p.title)}" title="Hapus"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('');
  }
  renderIcons(rows);
}

async function onRowAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'new') return go('?new=1');
  const id = btn.closest('[data-id]')?.dataset.id;
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  try {
    if (act === 'edit') return go(`?edit=${id}`);
    if (act === 'up' || act === 'down') {
      const i = projects.indexOf(p);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= projects.length) return;
      projects = moveItem(projects, i, j);
      paintRows();
      await saveOrder('projects', projects.map((x) => x.id));
      projects.forEach((x, k) => { x.sort_order = (k + 1) * 10; });
      toast('Urutan disimpan.');
      $(`[data-id="${id}"] [data-act="${act}"]`)?.focus();
    }
    if (act === 'publish') {
      await busy(btn, async () => {
        const status = p.status === 'published' ? 'draft' : 'published';
        unwrap(await supabase.from('projects').update({ status }).eq('id', id).select('id').single());
        p.status = status;
        toast(status === 'published' ? 'Proyek diterbitkan.' : 'Proyek dijadikan draf.');
      });
      paintRows();
    }
    if (act === 'feature') {
      const v = !p.is_featured;
      unwrap(await supabase.from('projects').update({ is_featured: v }).eq('id', id).select('id').single());
      p.is_featured = v;
      paintRows();
      toast(v ? 'Ditandai sebagai unggulan.' : 'Dihapus dari unggulan.');
    }
    if (act === 'duplicate') await busy(btn, () => duplicate(p));
    if (act === 'delete') {
      const ok = await confirmDialog({
        title: `Hapus “${p.title}”?`,
        message: 'Proyek beserta daftar fotonya dihapus permanen. File gambar tetap tersimpan di Media, dan karya galeri yang tertaut akan dilepas dari proyek ini.',
        confirmText: 'Hapus proyek', danger: true,
      });
      if (!ok) return;
      const rows = unwrap(await supabase.from('projects').delete().eq('id', id).select('id'));
      if (!rows.length) throw Object.assign(new Error('Tidak ada data yang terhapus.'), { code: 'PGRST116' });
      projects = projects.filter((x) => x.id !== id);
      paintRows();
      toast('Proyek dihapus.');
    }
  } catch (err) {
    reportError(err);
    await load().catch(() => {});
    paintRows();
  }
}

function uniqueSlug(base, exceptId) {
  const taken = new Set(projects.filter((p) => p.id !== exceptId).map((p) => p.slug));
  let slug = slugify(base) || 'proyek';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

async function duplicate(p) {
  const copy = {
    title: `${p.title} (salinan)`.slice(0, 160), slug: uniqueSlug(`${p.slug}-salinan`), summary: p.summary, description: p.description,
    category: p.category, year: p.year, role: p.role, client: p.client, external_url: p.external_url, video_url: p.video_url,
    thumbnail_media_id: p.thumbnail_media_id, cover_media_id: p.cover_media_id, is_featured: false, status: 'draft', sort_order: p.sort_order + 5,
  };
  const row = unwrap(await supabase.from('projects').insert(copy).select('id').single());
  if (p.images.length) {
    unwrap(await supabase.from('project_images').insert(p.images.map((im) => ({ project_id: row.id, media_id: im.media_id, caption: im.caption, sort_order: im.sort_order }))));
  }
  if (p.software.length) {
    unwrap(await supabase.from('project_software').insert(p.software.map((s) => ({ project_id: row.id, software_id: s.software_id }))));
  }
  await load();
  await saveOrder('projects', projects.map((x) => x.id));
  paintRows();
  toast('Proyek diduplikasi sebagai draf.');
}

/* =================================== editor =================================== */

const VIDEO_HELP = 'YouTube, Vimeo, atau tautan langsung file .mp4/.webm. Kosongkan bila tidak ada.';

function fieldsFor(p) {
  const cats = [...new Set(projects.map((x) => x.category).filter(Boolean))];
  return {
    content: [
      { name: 'title', label: 'Judul', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'slug', label: 'Slug URL', type: 'text', required: true, maxlength: 80, slugFrom: 'title', help: 'Huruf kecil, angka, dan tanda strip. Dipakai di alamat halaman proyek.', pattern: '[a-z0-9]+(-[a-z0-9]+)*' },
      { name: 'category', label: 'Kategori', type: 'text', required: true, maxlength: 60, datalist: cats, help: 'Dipakai sebagai filter di halaman Karya.' },
      { name: 'year', label: 'Tahun', type: 'year', nullable: true },
      { name: 'role', label: 'Peran Anda', type: 'text', maxlength: 120, nullable: true },
      { name: 'client', label: 'Klien / institusi', type: 'text', maxlength: 120, nullable: true },
      { name: 'summary', label: 'Ringkasan', type: 'textarea', rows: 2, maxlength: 300, full: true, help: 'Satu–dua kalimat untuk kartu proyek.' },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 9, full: true, help: 'Pisahkan paragraf dengan satu baris kosong.' },
    ],
    media: [
      { name: 'thumbnail_media_id', label: 'Thumbnail (kartu & daftar)', type: 'media' },
      { name: 'cover_media_id', label: 'Gambar utama (halaman detail)', type: 'media' },
    ],
    links: [
      { name: 'external_url', label: 'Tautan eksternal', type: 'url', nullable: true, placeholder: 'https://', full: true, help: 'Situs langsung, Behance, repositori, dsb. Harus diawali https://' },
      { name: 'video_url', label: 'Video demo', type: 'url', nullable: true, placeholder: 'https://www.youtube.com/watch?v=…', full: true, help: VIDEO_HELP },
    ],
    publish: [
      { name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draf (tidak tampil di situs)' }, { value: 'published', label: 'Terbit' }] },
      { name: 'sort_order', label: 'Urutan', type: 'number', nullable: true, help: 'Angka kecil tampil lebih dulu.' },
      { name: 'is_featured', label: 'Tampilkan sebagai proyek unggulan di beranda', type: 'checkbox', full: true },
    ],
  };
}

function renderEditor(p) {
  const isNew = !p;
  const values = p || { status: 'draft', is_featured: false, category: '', title: '', slug: '' };
  const F = fieldsFor(p);
  let images = (p?.images || []).map((im) => ({ id: im.id, media_id: im.media_id, caption: im.caption || '', media: im.media }));
  const selectedSw = new Set((p?.software || []).map((s) => s.software_id));
  const url = location.pathname + location.search;

  headActions().innerHTML = `<button class="btn" type="button" data-back><i data-lucide="arrow-left"></i>Kembali ke daftar</button>
    ${p ? `<a class="btn" href="/project-detail.html?slug=${encodeURIComponent(p.slug)}&preview=1" target="_blank" rel="noopener"><i data-lucide="eye"></i>Pratinjau</a>` : ''}`;
  headActions().querySelector('[data-back]').addEventListener('click', () => go(''));

  view().innerHTML = `
    <form id="project-form" class="stack" novalidate>
      <h2 class="sr-only">${isNew ? 'Proyek baru' : `Edit ${esc(p.title)}`}</h2>
      <section class="card"><div class="card__head"><h2>${isNew ? 'Proyek baru' : 'Konten'}</h2></div><div class="card__body">${formHTML(F.content, values)}</div></section>
      <section class="card"><div class="card__head"><div><h2>Gambar</h2><p>Thumbnail tampil di daftar proyek; gambar utama tampil besar di halaman detail.</p></div></div>
        <div class="card__body">${formHTML(F.media, values)}
          <div class="fieldset" style="margin-top:22px;padding-top:20px;border-top:1px solid var(--a-line)">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px">
              <h3 style="font-size:.95rem">Galeri foto proyek</h3>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn--sm" type="button" data-add-images><i data-lucide="images"></i>Pilih dari Media</button>
                <label class="btn btn--sm btn--primary"><i data-lucide="upload"></i>Upload foto<input type="file" accept="${ACCEPT_IMAGES}" multiple hidden data-upload-images></label>
              </div>
            </div>
            <div class="uploads" data-uploads></div>
            <div class="rows card" style="box-shadow:none" data-images></div>
          </div>
        </div></section>
      <section class="card"><div class="card__head"><h2>Tautan & video</h2></div><div class="card__body">${formHTML(F.links, values)}</div></section>
      <section class="card"><div class="card__head"><div><h2>Software yang dipakai</h2><p>Logo tampil di halaman detail proyek. Kelola daftar software di menu Keahlian & Software.</p></div></div>
        <div class="card__body">${software.length ? `<div class="sw-cards" style="padding:0">${software.map((s) => `
          <label class="sw-card${s.is_visible ? '' : ' is-hidden'}" style="cursor:pointer">
            ${softwareLogoHTML(s, { showName: false, link: false })}
            <span style="display:grid;gap:2px"><span class="check" style="min-height:0"><input type="checkbox" value="${s.id}" data-sw${selectedSw.has(s.id) ? ' checked' : ''}> ${esc(s.name)}</span>
            <span class="small muted">${esc(s.category)}${s.is_visible ? '' : ' · tersembunyi di situs'}</span></span>
          </label>`).join('')}</div>` : '<p class="muted">Belum ada software. Tambahkan di menu <a href="/admin/skills.html">Keahlian & Software</a>.</p>'}</div></section>
      <section class="card"><div class="card__head"><h2>Publikasi</h2></div><div class="card__body">${formHTML(F.publish, values)}</div></section>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit" data-save><i data-lucide="save"></i>Simpan</button>
        ${isNew ? '' : '<button class="btn btn--accent" type="button" data-save-publish><i data-lucide="globe"></i>Simpan & terbitkan</button>'}
        <button class="btn btn--ghost" type="button" data-cancel>Batal</button>
        <span class="spacer"></span>
        ${isNew ? '' : '<button class="btn btn--danger" type="button" data-delete><i data-lucide="trash-2"></i>Hapus proyek</button>'}
      </div>
    </form>`;

  const form = $('#project-form');
  form.noValidate = false;
  const allFields = [...F.content, ...F.media, ...F.links, ...F.publish];
  const ctl = bindForm(form, allFields);
  bindIconFallbacks(form);
  const imagesBox = form.querySelector('[data-images]');
  let imagesInitial = JSON.stringify(images.map(({ id, media_id, caption }) => ({ id, media_id, caption })));
  let swInitial = JSON.stringify([...selectedSw].sort());
  const swNow = () => [...form.querySelectorAll('[data-sw]:checked')].map((c) => c.value).sort();
  const imagesNow = () => JSON.stringify(images.map(({ id, media_id, caption }) => ({ id, media_id, caption })));
  editor = { url, isDirty: () => ctl.isDirty() || imagesNow() !== imagesInitial || JSON.stringify(swNow()) !== swInitial };

  const paintImages = () => {
    imagesBox.innerHTML = images.length ? images.map((im, i) => `
      <div class="row" data-i="${i}">
        <div class="row__order">
          <button class="icon-btn" type="button" data-img="up" aria-label="Naikkan foto ${i + 1}" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
          <button class="icon-btn" type="button" data-img="down" aria-label="Turunkan foto ${i + 1}" ${i === images.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
        </div>
        <div class="row__thumb">${mediaThumb(im.media) ? `<img src="${esc(mediaThumb(im.media))}" alt="${esc(im.media?.alt_text || '')}">` : ''}</div>
        <div class="row__main"><input class="input" type="text" value="${esc(im.caption)}" placeholder="Keterangan foto (opsional)" aria-label="Keterangan foto ${i + 1}" maxlength="200" data-caption></div>
        <div class="row__actions"><button class="icon-btn icon-btn--danger" type="button" data-img="remove" aria-label="Lepas foto ${i + 1} dari proyek"><i data-lucide="trash-2"></i></button></div>
      </div>`).join('') : '<p class="muted" style="padding:16px">Belum ada foto tambahan.</p>';
    renderIcons(imagesBox);
  };
  paintImages();

  imagesBox.addEventListener('input', (e) => {
    if (e.target.matches('[data-caption]')) images[Number(e.target.closest('[data-i]').dataset.i)].caption = e.target.value;
  });
  imagesBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-img]');
    if (!b) return;
    const i = Number(b.closest('[data-i]').dataset.i);
    if (b.dataset.img === 'remove') images = images.filter((_, k) => k !== i);
    if (b.dataset.img === 'up' && i > 0) images = moveItem(images, i, i - 1);
    if (b.dataset.img === 'down' && i < images.length - 1) images = moveItem(images, i, i + 1);
    paintImages();
  });
  const addMedia = (rows) => {
    const have = new Set(images.map((im) => im.media_id));
    rows.filter((r) => !have.has(r.id)).forEach((r) => images.push({ id: null, media_id: r.id, caption: '', media: r }));
    paintImages();
  };
  form.querySelector('[data-add-images]').addEventListener('click', async () => {
    const rows = await pickMedia({ title: 'Tambah foto ke proyek', multiple: true });
    if (rows?.length) addMedia(rows);
  });
  form.querySelector('[data-upload-images]').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const rows = await uploadQueue(form.querySelector('[data-uploads]'), files);
    addMedia(rows);
    if (rows.length) toast(`${rows.length} foto diunggah — klik Simpan untuk menyimpan proyek.`, 'info');
  });

  const submit = async (publish = false) => {
    const problem = ctl.validate();
    if (problem) { if (problem !== 'invalid') toast(problem, 'error'); return; }
    const values2 = ctl.read();
    if (publish) values2.status = 'published';
    values2.slug = slugify(values2.slug || values2.title);
    if (projects.some((x) => x.slug === values2.slug && x.id !== p?.id)) {
      toast('Slug sudah dipakai proyek lain. Ganti slug-nya.', 'error');
      form.querySelector('[name="slug"]').focus();
      return;
    }
    const btn = form.querySelector(publish ? '[data-save-publish]' : '[data-save]');
    await busy(btn, async () => {
      try {
        const saved = await saveProject(p?.id || null, values2, images, swNow());
        imagesInitial = imagesNow(); swInitial = JSON.stringify(swNow()); ctl.markClean();
        await load();
        toast(isNew ? 'Proyek dibuat.' : 'Perubahan disimpan.');
        history.replaceState(null, '', `${location.pathname}?edit=${saved.id}`);
        route();
      } catch (err) { reportError(err, 'Simpan proyek'); }
    });
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(false); });
  form.querySelector('[data-save-publish]')?.addEventListener('click', () => submit(true));
  form.querySelector('[data-cancel]').addEventListener('click', () => {
    if (editor.isDirty() && !window.confirm('Buang perubahan yang belum disimpan?')) return;
    editor = null;
    go('');
  });
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: `Hapus “${p.title}”?`, message: 'Proyek dihapus permanen. File gambar tetap ada di Media.', confirmText: 'Hapus proyek', danger: true });
    if (!ok) return;
    try {
      unwrap(await supabase.from('projects').delete().eq('id', p.id).select('id').single());
      editor = null;
      await load();
      toast('Proyek dihapus.');
      go('');
    } catch (err) { reportError(err); }
  });
  renderIcons();
  form.querySelector('[name="title"]').focus({ preventScroll: true });
}

/** Simpan proyek + sinkronkan foto (tambah/ubah/hapus) dan relasi software secara diferensial. */
async function saveProject(id, values, images, softwareIds) {
  const payload = {
    title: values.title, slug: values.slug, summary: values.summary || '', description: values.description || '',
    category: values.category || 'Umum', year: values.year, role: values.role, client: values.client,
    external_url: values.external_url, video_url: values.video_url,
    thumbnail_media_id: values.thumbnail_media_id, cover_media_id: values.cover_media_id,
    is_featured: !!values.is_featured, status: values.status || 'draft',
  };
  if (values.sort_order !== null && values.sort_order !== undefined) payload.sort_order = values.sort_order;
  let row;
  if (id) row = unwrap(await supabase.from('projects').update(payload).eq('id', id).select('id, slug').single());
  else {
    if (payload.sort_order === undefined) payload.sort_order = await nextSortOrder('projects');
    row = unwrap(await supabase.from('projects').insert(payload).select('id, slug').single());
  }
  const pid = row.id;

  const ordered = images.map((im, i) => ({ ...im, sort_order: (i + 1) * 10 }));
  const existing = id ? unwrap(await supabase.from('project_images').select('id').eq('project_id', pid)).map((r) => r.id) : [];
  const keep = new Set(ordered.filter((im) => im.id).map((im) => im.id));
  const inserts = ordered.filter((im) => !im.id).map((im) => ({ project_id: pid, media_id: im.media_id, caption: im.caption || '', sort_order: im.sort_order }));
  if (inserts.length) unwrap(await supabase.from('project_images').insert(inserts));
  const updates = await Promise.all(ordered.filter((im) => im.id).map((im) => supabase.from('project_images').update({ caption: im.caption || '', sort_order: im.sort_order }).eq('id', im.id)));
  updates.forEach(unwrap);
  const removed = existing.filter((x) => !keep.has(x));
  if (removed.length) unwrap(await supabase.from('project_images').delete().in('id', removed));

  const current = id ? unwrap(await supabase.from('project_software').select('software_id').eq('project_id', pid)).map((r) => r.software_id) : [];
  const add = softwareIds.filter((s) => !current.includes(s)).map((software_id) => ({ project_id: pid, software_id }));
  const del = current.filter((s) => !softwareIds.includes(s));
  if (add.length) unwrap(await supabase.from('project_software').insert(add));
  if (del.length) unwrap(await supabase.from('project_software').delete().eq('project_id', pid).in('software_id', del));
  return row;
}
