// Admin › Galeri 3D: ruang (nama & subjudul), denah otomatis, karya per ruang/dinding (urutan, ganti foto,
// terbit/draf, edit, hapus), dan pratinjau galeri 3D sebelum diterbitkan (draf hanya terlihat oleh admin).
import { $, esc, roman, debounce } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, busy, unwrap, statusBadge, moveItem, loadingHTML, emptyHTML } from './core.js';
import { openFormDialog } from './forms.js';
import { pickMedia, cacheMedia, mediaThumb } from './media-lib.js';
import { saveOrder, getSettings, saveSettings } from './data.js';
import { buildLayout, WALL_LABELS } from '../gallery-layout.js';
import { ringPlanSVG } from './plan-svg.js';

const FRAME_LABELS = { black: 'Hitam', oak: 'Kayu oak', white: 'Putih', gold: 'Emas', none: 'Tanpa bingkai' };
const FRAME_COLORS = { black: '#15130f', oak: '#a98558', white: '#f3f0ea', gold: '#b8923f', none: 'transparent' };
const MAX_ROOMS = 12;

let artworks = [];
let projects = [];
let rooms = [];      // [{ name, subtitle }] indeks = nomor ruang - 1
let previewOpen = false;

export async function init() {
  $('#view').innerHTML = loadingHTML('Memuat galeri…');
  $('#head-actions').innerHTML = `
    <button class="btn" type="button" data-preview><i data-lucide="monitor"></i>Pratinjau</button>
    <button class="btn btn--primary" type="button" data-add><i data-lucide="plus"></i>Tambah karya</button>`;
  $('#head-actions [data-add]').addEventListener('click', () => editArtwork(null));
  $('#head-actions [data-preview]').addEventListener('click', () => togglePreview());
  try { await load(); } catch (err) { $('#view').innerHTML = `<p class="form-error">${esc(err.message)}</p>`; reportError(err); return; }
  $('#view').innerHTML = `${previewCardHTML()}<div class="stack" id="gallery-body"></div>`;
  bindPreview();
  render();
}

async function load() {
  const [a, p, s] = await Promise.all([
    supabase.from('gallery_artworks').select('*, media:media_assets(*), project:projects(id, title, slug)').order('room').order('sort_order'),
    supabase.from('projects').select('id, title, slug, status').order('sort_order'),
    getSettings(),
  ]);
  artworks = unwrap(a);
  projects = unwrap(p);
  cacheMedia(artworks.map((x) => x.media));
  rooms = Array.isArray(s.gallery_rooms) ? s.gallery_rooms.map((r) => ({ name: r?.name || '', subtitle: r?.subtitle || '' })) : [];
  const maxRoom = Math.max(0, ...artworks.map((x) => x.room));
  while (rooms.length < Math.max(1, maxRoom)) rooms.push({ name: '', subtitle: '' });
}

const roomName = (n) => rooms[n - 1]?.name || `Ruang ${roman(n)}`;
const byOrder = (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title);

function previewCardHTML() {
  return `
    <section class="card" id="preview-card" hidden style="margin-bottom:20px">
      <div class="card__head">
        <div><h2>Pratinjau galeri</h2><p>Menampilkan karya terbit <strong>dan draf</strong> — pengunjung hanya melihat karya terbit.</p></div>
        <div class="quick">
          <div class="tabs" role="tablist" aria-label="Ukuran layar" style="margin:0">
            <button type="button" role="tab" aria-selected="true" data-w="100%"><i data-lucide="monitor"></i><span class="sr-only">Desktop</span></button>
            <button type="button" role="tab" aria-selected="false" data-w="820px"><i data-lucide="tablet"></i><span class="sr-only">Tablet</span></button>
            <button type="button" role="tab" aria-selected="false" data-w="390px"><i data-lucide="smartphone"></i><span class="sr-only">Ponsel</span></button>
          </div>
          <button class="btn btn--sm" type="button" data-reload><i data-lucide="refresh-cw"></i>Muat ulang</button>
          <a class="btn btn--sm" href="/?preview=1" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Tab baru</a>
        </div>
      </div>
      <div class="card__body preview-shell"><iframe class="preview-frame" title="Pratinjau galeri 3D" data-frame></iframe></div>
    </section>`;
}

function bindPreview() {
  const card = $('#preview-card');
  card.querySelector('[data-reload]').addEventListener('click', () => loadPreview());
  card.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
    card.querySelectorAll('[data-w]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    card.querySelector('[data-frame]').style.width = b.dataset.w;
  }));
}

function render() {
  const drafts = artworks.filter((a) => a.status === 'draft').length;
  $('#gallery-body').innerHTML = `
    <section class="card">
      <div class="card__head">
        <div><h2>Denah</h2><p>Dihitung otomatis dari ruang, dinding, dan urutan karya. Klik karya untuk mengedit. Garis putus-putus = draf.</p></div>
        ${drafts ? `<button class="btn btn--accent btn--sm" type="button" data-publish-all><i data-lucide="globe"></i>Terbitkan semua draf (${drafts})</button>` : ''}
      </div>
      <div class="card__body plan-wrap">${planSVG()}</div>
    </section>

    <section class="card">
      <div class="card__head"><div><h2>Ruang</h2><p>Nama dan subjudul tampil di atas ambang pintu setiap ruang.</p></div>
        <div class="quick"><button class="btn btn--sm" type="button" data-room-add ${rooms.length >= MAX_ROOMS ? 'disabled' : ''}><i data-lucide="plus"></i>Tambah ruang</button>
        <button class="btn btn--sm btn--primary" type="button" data-rooms-save><i data-lucide="save"></i>Simpan ruang</button></div></div>
      <div class="rows" data-rooms>${rooms.map((r, i) => {
        const n = artworks.filter((a) => a.room === i + 1).length;
        return `<div class="row row--noimg" data-room="${i + 1}">
          <span class="badge">${i + 1}</span>
          <div class="form-grid">
            <input class="input" type="text" value="${esc(r.name)}" placeholder="Ruang ${roman(i + 1)}" aria-label="Nama ruang ${i + 1}" maxlength="60" data-k="name">
            <input class="input" type="text" value="${esc(r.subtitle)}" placeholder="Subjudul (opsional)" aria-label="Subjudul ruang ${i + 1}" maxlength="80" data-k="subtitle">
          </div>
          <div class="row__actions"><span class="small muted nowrap">${n} karya</span>
            <button class="icon-btn icon-btn--danger" type="button" data-room-del aria-label="Hapus ruang ${i + 1}" ${n || i !== rooms.length - 1 || rooms.length === 1 ? 'disabled title="Hanya ruang terakhir yang kosong yang bisa dihapus"' : ''}><i data-lucide="trash-2"></i></button></div>
        </div>`;
      }).join('')}</div>
    </section>

    <section class="card">
      <div class="card__head"><div><h2>Karya</h2><p>Urutan berlaku per dinding. “Ganti foto” langsung memperbarui bingkai di galeri 3D.</p></div></div>
      <div data-list>${listHTML()}</div>
    </section>`;
  bindEvents();
  renderIcons();
}

function listHTML() {
  if (!artworks.length) return emptyHTML('Belum ada karya di galeri.', 'frame', '<button class="btn btn--primary" type="button" data-act="add"><i data-lucide="plus"></i>Tambah karya pertama</button>');
  const numbers = planNumbers();
  return rooms.map((_, ri) => {
    const num = ri + 1;
    const inRoom = artworks.filter((a) => a.room === num);
    if (!inRoom.length) return '';
    return ['left', 'right', 'back'].map((wall) => {
      const list = inRoom.filter((a) => a.wall === wall).sort(byOrder);
      if (!list.length) return '';
      return `<div class="group-title">${esc(roomName(num))} · ${WALL_LABELS[wall]}</div><div class="rows">${list.map((a, i) => `
        <div class="row" data-id="${a.id}">
          <div class="row__order">
            <button class="icon-btn" type="button" data-act="up" aria-label="Geser ${esc(a.title)} lebih awal" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
            <button class="icon-btn" type="button" data-act="down" aria-label="Geser ${esc(a.title)} lebih akhir" ${i === list.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
          </div>
          <div class="row__thumb">${mediaThumb(a.media) ? `<img src="${esc(mediaThumb(a.media))}" alt="${esc(a.media?.alt_text || '')}" loading="lazy">` : '<i data-lucide="image"></i>'}</div>
          <div class="row__main">
            <div class="row__title">${numbers.get(a.id) ? `<span class="badge">${numbers.get(a.id)}</span> ` : ''}${esc(a.title)}</div>
            <div class="row__sub">${statusBadge(a.status)}${a.year ? `<span>${esc(a.year)}</span>` : ''}<span><span class="frame-swatch" style="background:${FRAME_COLORS[a.frame_style]}"></span> ${FRAME_LABELS[a.frame_style]}</span>${a.project ? `<span>↳ ${esc(a.project.title)}</span>` : ''}${a.media ? '' : '<span class="badge badge--draft">Tanpa foto</span>'}</div>
          </div>
          <div class="row__actions">
            <button class="btn btn--sm" type="button" data-act="photo"><i data-lucide="replace"></i>Ganti foto</button>
            <button class="btn btn--sm" type="button" data-act="publish">${a.status === 'published' ? 'Jadikan draf' : 'Terbitkan'}</button>
            <button class="icon-btn" type="button" data-act="edit" aria-label="Edit ${esc(a.title)}" title="Edit"><i data-lucide="pencil"></i></button>
            <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus ${esc(a.title)}" title="Hapus"><i data-lucide="trash-2"></i></button>
          </div>
        </div>`).join('')}</div>`;
    }).join('');
  }).join('');
}

/* --------------------------------- denah --------------------------------- */

function layoutFor() {
  const items = artworks.map((a) => ({ ...a, image: a.media ? { width: a.media.width, height: a.media.height } : null }));
  return buildLayout(items, { gallery_rooms: rooms }, { aspect: 16 / 9 });
}

function planNumbers() {
  const map = new Map();
  layoutFor().placements.forEach((p, i) => map.set(p.art.id, i + 1));
  return map;
}

function planSVG() {
  return ringPlanSVG(layoutFor(), { roomName });
}

/* --------------------------------- aksi --------------------------------- */

function bindEvents() {
  const view = $('#gallery-body');
  view.querySelector('[data-publish-all]')?.addEventListener('click', async (e) => {
    const n = artworks.filter((a) => a.status === 'draft').length;
    if (!(await confirmDialog({ title: `Terbitkan ${n} karya draf?`, message: 'Semua karya draf akan langsung terlihat oleh pengunjung.', confirmText: 'Terbitkan semua' }))) return;
    await busy(e.currentTarget, async () => {
      try {
        unwrap(await supabase.from('gallery_artworks').update({ status: 'published' }).eq('status', 'draft').select('id'));
        toast('Semua karya diterbitkan.');
        await refresh();
      } catch (err) { reportError(err); }
    });
  });
  view.querySelector('[data-room-add]')?.addEventListener('click', () => {
    readRooms();
    if (rooms.length >= MAX_ROOMS) return;
    rooms.push({ name: '', subtitle: '' });
    render();
    toast('Ruang ditambahkan — isi namanya lalu klik “Simpan ruang”.', 'info');
  });
  view.querySelector('[data-rooms]')?.addEventListener('click', (e) => {
    if (!e.target.closest('[data-room-del]')) return;
    readRooms();
    rooms.pop();
    render();
    toast('Ruang dihapus dari daftar — klik “Simpan ruang” untuk menyimpan.', 'info');
  });
  view.querySelector('[data-rooms-save]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    readRooms();
    try {
      await saveSettings({ gallery_rooms: rooms.map((r) => ({ name: r.name.trim(), subtitle: r.subtitle.trim() })) });
      toast('Ruang disimpan.');
      await refresh();
    } catch (err) { reportError(err); }
  }));
  view.querySelector('.plan')?.addEventListener('click', (e) => {
    const g = e.target.closest('[data-plan]');
    if (g) editArtwork(artworks.find((a) => a.id === g.dataset.plan));
  });
  view.querySelector('.plan')?.addEventListener('keydown', (e) => {
    const g = e.target.closest('[data-plan]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); editArtwork(artworks.find((a) => a.id === g.dataset.plan)); }
  });
  view.querySelector('[data-list]').addEventListener('click', onListAction);
}

function readRooms() {
  document.querySelectorAll('[data-room]').forEach((row) => {
    const i = Number(row.dataset.room) - 1;
    rooms[i] = { name: row.querySelector('[data-k="name"]').value, subtitle: row.querySelector('[data-k="subtitle"]').value };
  });
}

async function refresh() {
  readRooms();
  const local = rooms.map((r) => ({ ...r }));
  await load();
  // pertahankan nama/ruang yang sedang diedit tetapi belum disimpan
  rooms = local.concat(rooms.slice(local.length));
  render();
  reloadPreview();
}

async function onListAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'add') return editArtwork(null);
  const a = artworks.find((x) => x.id === btn.closest('[data-id]')?.dataset.id);
  if (!a) return;
  try {
    switch (btn.dataset.act) {
      case 'edit': return editArtwork(a);
      case 'up': case 'down': {
        const group = artworks.filter((x) => x.room === a.room && x.wall === a.wall).sort(byOrder);
        const i = group.indexOf(a);
        const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= group.length) return;
        const next = moveItem(group, i, j);
        await saveOrder('gallery_artworks', next.map((x) => x.id));
        next.forEach((x, k) => { x.sort_order = (k + 1) * 10; });
        render();
        reloadPreview();
        document.querySelector(`[data-id="${a.id}"] [data-act="${btn.dataset.act}"]`)?.focus();
        return toast('Urutan disimpan.');
      }
      case 'photo': {
        const row = await pickMedia({ title: `Ganti foto “${a.title}”`, selected: [a.media_id] });
        if (!row || row.id === a.media_id) return;
        unwrap(await supabase.from('gallery_artworks').update({ media_id: row.id }).eq('id', a.id).select('id').single());
        toast('Foto diganti. Bingkai di galeri 3D sudah memakai foto baru.');
        return refresh();
      }
      case 'publish': {
        const status = a.status === 'published' ? 'draft' : 'published';
        await busy(btn, async () => { unwrap(await supabase.from('gallery_artworks').update({ status }).eq('id', a.id).select('id').single()); });
        toast(status === 'published' ? 'Karya diterbitkan.' : 'Karya dijadikan draf.');
        return refresh();
      }
      case 'delete': {
        const ok = await confirmDialog({ title: `Hapus “${a.title}”?`, message: 'Karya dihapus dari galeri. Fotonya tetap tersimpan di Media.', confirmText: 'Hapus karya', danger: true });
        if (!ok) return;
        unwrap(await supabase.from('gallery_artworks').delete().eq('id', a.id).select('id').single());
        toast('Karya dihapus.');
        return refresh();
      }
      default:
    }
  } catch (err) { reportError(err); }
}

function editArtwork(a) {
  readRooms();
  const roomOptions = rooms.map((_, i) => ({ value: i + 1, label: `${i + 1}. ${roomName(i + 1)}` }));
  const fields = [
    { name: 'title', label: 'Judul karya', type: 'text', required: true, maxlength: 160, full: true },
    { name: 'media_id', label: 'Foto karya', type: 'media', full: true, help: 'Rasio gambar menentukan ukuran bingkai di dinding.' },
    { name: 'year', label: 'Tahun', type: 'year', nullable: true },
    { name: 'project_id', label: 'Tautkan ke proyek (opsional)', type: 'select', options: [{ value: '', label: '— Tidak ditautkan —' }, ...projects.map((p) => ({ value: p.id, label: `${p.title}${p.status === 'draft' ? ' (draf)' : ''}` }))] },
    { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 4, full: true, help: 'Tampil di caption dan jendela detail saat karya diklik.' },
    { name: 'room', label: 'Ruang', type: 'select', options: roomOptions },
    { name: 'wall', label: 'Posisi dinding', type: 'select', options: Object.entries(WALL_LABELS).map(([value, label]) => ({ value, label })), help: 'Galeri berbentuk cincin: dinding dalam menghadap aula patung, dinding luar di seberangnya. Dinding ujung (di samping pintu) memuat maks. 2 karya; ruang terakhir maks. 3. Karya yang tidak muat di dinding dalam ditampilkan di dinding luar.' },
    { name: 'frame_style', label: 'Bingkai', type: 'select', options: Object.entries(FRAME_LABELS).map(([value, label]) => ({ value, label })) },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draf (hanya di pratinjau)' }, { value: 'published', label: 'Terbit' }] },
    { name: 'sort_order', label: 'Urutan di dinding', type: 'number', nullable: true, help: 'Kosongkan untuk menaruh di akhir.' },
  ];
  const values = a ? { ...a, project_id: a.project_id || '' } : { room: 1, wall: 'left', frame_style: 'black', status: 'draft' };
  return openFormDialog({
    title: a ? `Edit karya` : 'Tambah karya', fields, values, size: 'wide', submitText: a ? 'Simpan' : 'Tambah karya',
    onSubmit: async (v) => {
      const payload = {
        title: v.title, description: v.description || '', year: v.year, media_id: v.media_id, project_id: v.project_id || null,
        room: Number(v.room) || 1, wall: v.wall, frame_style: v.frame_style, status: v.status,
      };
      if (v.sort_order !== null) payload.sort_order = v.sort_order;
      else if (!a || a.room !== payload.room || a.wall !== payload.wall) {
        const same = artworks.filter((x) => x.room === payload.room && x.wall === payload.wall && x.id !== a?.id);
        payload.sort_order = (Math.max(0, ...same.map((x) => x.sort_order)) || 0) + 10;
      }
      if (a) unwrap(await supabase.from('gallery_artworks').update(payload).eq('id', a.id).select('id').single());
      else unwrap(await supabase.from('gallery_artworks').insert(payload).select('id').single());
      return true;
    },
  }).then(async (saved) => {
    if (!saved) return;
    toast(a ? 'Karya disimpan.' : 'Karya ditambahkan.');
    await refresh();
  });
}

/* -------------------------------- pratinjau -------------------------------- */

function togglePreview() {
  previewOpen = !previewOpen;
  const card = $('#preview-card');
  card.hidden = !previewOpen;
  if (previewOpen) { loadPreview(); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else card.querySelector('[data-frame]').src = 'about:blank';
}

function loadPreview() {
  const frame = $('[data-frame]');
  if (frame) frame.src = `/?preview=1&t=${Date.now()}`;
}

const reloadPreview = debounce(() => { if (previewOpen) loadPreview(); }, 400);
