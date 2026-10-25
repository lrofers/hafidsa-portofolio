// Admin › Keahlian & Software: CRUD, urutan, visibilitas; pemilih logo software (Devicon / Simple Icons /
// upload kustom) dengan pratinjau langsung dan fallback bila logo gagal dimuat.
import { $, esc } from '../utils.js';
import { renderIcons, softwareLogoHTML, bindIconFallbacks, softwareIconUrl, SOFTWARE_PRESETS } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, unwrap, moveItem, loadingHTML, emptyHTML } from './core.js';
import { openFormDialog } from './forms.js';
import { cacheMedia, getMedia } from './media-lib.js';
import { saveOrder, nextSortOrder } from './data.js';

let tab = new URLSearchParams(location.search).get('tab') === 'software' ? 'software' : 'skills';
let skills = [];
let software = [];

export async function init() {
  $('#view').innerHTML = loadingHTML();
  try { await load(); } catch (err) { $('#view').innerHTML = `<p class="form-error">${esc(err.message)}</p>`; reportError(err); return; }
  render();
}

async function load() {
  const [a, b] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('software_tools').select('*, icon_media:media_assets(*)').order('sort_order'),
  ]);
  skills = unwrap(a);
  software = unwrap(b);
  cacheMedia(software.map((s) => s.icon_media));
}

function render() {
  $('#head-actions').innerHTML = tab === 'skills'
    ? '<button class="btn btn--primary" type="button" data-add><i data-lucide="plus"></i>Tambah keahlian</button>'
    : '<button class="btn btn--primary" type="button" data-add><i data-lucide="plus"></i>Tambah software</button>';
  $('#head-actions [data-add]').addEventListener('click', () => (tab === 'skills' ? editSkill(null) : editSoftware(null)));
  const visibleSw = software.filter((s) => s.is_visible).length;
  $('#view').innerHTML = `
    <div class="tabs" role="tablist" aria-label="Bagian">
      <button type="button" role="tab" aria-selected="${tab === 'skills'}" data-tab="skills">Keahlian (${skills.length})</button>
      <button type="button" role="tab" aria-selected="${tab === 'software'}" data-tab="software">Software (${visibleSw}/${software.length} tampil)</button>
    </div>
    <div data-panel></div>`;
  $('#view').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    const u = new URL(location.href); u.searchParams.set('tab', tab); history.replaceState(null, '', u);
    render();
  }));
  if (tab === 'skills') renderSkills(); else renderSoftware();
  renderIcons();
}

/* -------------------------------- keahlian -------------------------------- */

function renderSkills() {
  const panel = $('[data-panel]');
  panel.innerHTML = `<div class="card"><div class="rows">${skills.length ? skills.map((s, i) => `
    <div class="row row--noimg" data-id="${s.id}">
      <div class="row__order">
        <button class="icon-btn" type="button" data-act="up" aria-label="Naikkan ${esc(s.name)}" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
        <button class="icon-btn" type="button" data-act="down" aria-label="Turunkan ${esc(s.name)}" ${i === skills.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
      </div>
      <div class="row__main">
        <div class="row__title">${esc(s.name)}</div>
        <div class="row__sub"><span class="badge">${esc(s.category)}</span>${s.is_visible ? '' : '<span class="badge badge--hidden">Tersembunyi</span>'}${s.level !== null ? `<span>Tingkat ${s.level}%</span>` : ''}${s.description ? `<span>${esc(s.description.slice(0, 90))}</span>` : ''}</div>
      </div>
      <div class="row__actions">
        <button class="icon-btn" type="button" data-act="toggle" aria-pressed="${s.is_visible}" aria-label="${s.is_visible ? 'Sembunyikan' : 'Tampilkan'} ${esc(s.name)}" title="${s.is_visible ? 'Sembunyikan dari situs' : 'Tampilkan di situs'}"><i data-lucide="${s.is_visible ? 'eye' : 'eye-off'}"></i></button>
        <button class="icon-btn" type="button" data-act="edit" aria-label="Edit ${esc(s.name)}"><i data-lucide="pencil"></i></button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus ${esc(s.name)}"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`).join('') : emptyHTML('Belum ada keahlian.', 'wrench')}</div></div>`;
  panel.addEventListener('click', (e) => rowAction(e, 'skills', skills, editSkill));
  renderIcons(panel);
}

function editSkill(s) {
  const cats = [...new Set(skills.map((x) => x.category))];
  return openFormDialog({
    title: s ? 'Edit keahlian' : 'Tambah keahlian',
    values: s || { is_visible: true, category: cats[0] || '' },
    fields: [
      { name: 'name', label: 'Nama keahlian', type: 'text', required: true, maxlength: 120, full: true },
      { name: 'category', label: 'Kategori', type: 'text', required: true, maxlength: 60, datalist: cats, help: 'Keahlian dikelompokkan per kategori di situs.' },
      { name: 'level', label: 'Tingkat penguasaan (0–100, opsional)', type: 'number', min: 0, max: 100, nullable: true, help: 'Tampil sebagai garis tipis di halaman Tentang. Kosongkan bila tidak ingin ditampilkan.' },
      { name: 'description', label: 'Deskripsi singkat', type: 'textarea', rows: 3, maxlength: 400, full: true },
      { name: 'is_visible', label: 'Tampilkan di situs', type: 'checkbox', full: true },
    ],
    onSubmit: async (v) => {
      const payload = { name: v.name, category: v.category, level: v.level, description: v.description || '', is_visible: v.is_visible };
      if (s) unwrap(await supabase.from('skills').update(payload).eq('id', s.id).select('id').single());
      else unwrap(await supabase.from('skills').insert({ ...payload, sort_order: await nextSortOrder('skills') }).select('id').single());
      return true;
    },
  }).then(async (ok) => { if (ok) { toast(s ? 'Keahlian disimpan.' : 'Keahlian ditambahkan.'); await load(); render(); } });
}

/* -------------------------------- software -------------------------------- */

function renderSoftware() {
  const panel = $('[data-panel]');
  panel.innerHTML = `
    <p class="small muted" style="margin-bottom:12px">Hanya software dengan status <strong>tampil</strong> yang muncul di situs. Aktifkan hanya yang benar-benar Anda gunakan.</p>
    <div class="card">${software.length ? `<div class="sw-cards">${software.map((s, i) => `
      <div class="sw-card${s.is_visible ? '' : ' is-hidden'}" data-id="${s.id}">
        ${softwareLogoHTML(s, { showName: false, link: false })}
        <div style="min-width:0"><div class="row__title">${esc(s.name)}</div>
          <div class="row__sub"><span>${esc(s.category)}</span>${s.is_visible ? '<span class="badge badge--published">Tampil</span>' : '<span class="badge badge--hidden">Tersembunyi</span>'}</div></div>
        <div class="sw-card__actions">
          <button class="icon-btn" type="button" data-act="up" aria-label="Geser ${esc(s.name)} lebih awal" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
          <button class="icon-btn" type="button" data-act="down" aria-label="Geser ${esc(s.name)} lebih akhir" ${i === software.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
          <button class="icon-btn" type="button" data-act="toggle" aria-pressed="${s.is_visible}" aria-label="${s.is_visible ? 'Sembunyikan' : 'Tampilkan'} ${esc(s.name)}"><i data-lucide="${s.is_visible ? 'eye' : 'eye-off'}"></i></button>
          <button class="icon-btn" type="button" data-act="edit" aria-label="Edit ${esc(s.name)}"><i data-lucide="pencil"></i></button>
          <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus ${esc(s.name)}"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('')}</div>` : emptyHTML('Belum ada software.', 'layout-grid')}</div>`;
  panel.addEventListener('click', (e) => rowAction(e, 'software_tools', software, editSoftware));
  bindIconFallbacks(panel);
  renderIcons(panel);
}

const SOURCE_HELP = {
  devicon: 'Cari slug di <a href="https://devicon.dev" target="_blank" rel="noopener">devicon.dev</a> (mis. <code>photoshop</code>, <code>figma</code>, <code>blender</code>).',
  simpleicons: 'Cari slug di <a href="https://simpleicons.org" target="_blank" rel="noopener">simpleicons.org</a> (mis. <code>davinciresolve</code>, <code>notion</code>).',
  custom: 'Upload logo sendiri (SVG/PNG transparan disarankan).',
};

function editSoftware(s) {
  const cats = [...new Set([...software.map((x) => x.category), ...SOFTWARE_PRESETS.map((p) => p.category)])];
  const intro = s ? '' : `<details class="card" style="box-shadow:none;margin-bottom:18px" open><summary class="card__head" style="cursor:pointer"><h2>Pilih dari katalog</h2><span class="small muted">mengisi formulir otomatis</span></summary>
    <div class="card__body"><div class="preset-grid">${SOFTWARE_PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${softwareLogoHTML(p, { showName: false, link: false })}<span>${esc(p.name)}</span></button>`).join('')}</div></div></details>`;
  return openFormDialog({
    title: s ? `Edit ${s.name}` : 'Tambah software', size: 'wide', intro,
    values: s || { icon_source: 'devicon', icon_variant: 'original', is_visible: true, category: 'Desain & Foto' },
    fields: [
      { name: 'name', label: 'Nama software', type: 'text', required: true, maxlength: 120 },
      { name: 'category', label: 'Kategori', type: 'text', required: true, maxlength: 60, datalist: cats },
      { name: 'icon_source', label: 'Sumber logo', type: 'select', options: [{ value: 'devicon', label: 'Devicon' }, { value: 'simpleicons', label: 'Simple Icons' }, { value: 'custom', label: 'Upload kustom' }] },
      { name: 'icon_slug', label: 'Slug ikon', type: 'text', maxlength: 60, nullable: true, placeholder: 'mis. photoshop', help: SOURCE_HELP.devicon },
      { name: 'icon_variant', label: 'Varian (Devicon)', type: 'select', options: ['original', 'plain', 'line', 'wordmark'].map((v) => ({ value: v, label: v })) },
      { name: 'icon_media_id', label: 'Logo kustom', type: 'media' },
      { html: '<div class="field full"><span class="field__label">Pratinjau logo</span><div class="logo-preview" data-logo-preview aria-live="polite"></div></div>' },
      { name: 'website_url', label: 'Situs resmi (opsional)', type: 'url', nullable: true, placeholder: 'https://', full: true },
      { name: 'description', label: 'Deskripsi (opsional)', type: 'textarea', rows: 2, maxlength: 300, full: true, help: 'Muncul sebagai keterangan saat logo disorot.' },
      { name: 'is_visible', label: 'Tampilkan di situs (hanya software yang benar-benar Anda gunakan)', type: 'checkbox', full: true },
    ],
    onReady: (form, ctl, dialog) => {
      const preview = form.querySelector('[data-logo-preview]');
      const show = (name, field) => { const el = form.querySelector(`[data-field="${name}"]`); if (el) el.hidden = !field; };
      const paint = async () => {
        const v = ctl.read();
        show('icon_slug', v.icon_source !== 'custom');
        show('icon_variant', v.icon_source === 'devicon');
        show('icon_media_id', v.icon_source === 'custom');
        const help = form.querySelector('[data-field="icon_slug"] .field__help');
        if (help) help.innerHTML = SOURCE_HELP[v.icon_source] || '';
        form.querySelector('[name="icon_slug"]').required = v.icon_source !== 'custom';
        const tool = { ...v, name: v.name || '?', icon_media: v.icon_source === 'custom' ? await getMedia(v.icon_media_id) : null };
        const url = softwareIconUrl(tool);
        preview.innerHTML = `${softwareLogoHTML(tool, { showName: false, link: false })}<div><strong>${esc(v.name || 'Nama software')}</strong><p class="small muted mono" style="overflow-wrap:anywhere">${url ? esc(url) : 'Belum ada logo'}</p><p class="small" data-logo-state></p></div>`;
        const img = preview.querySelector('img');
        const state = preview.querySelector('[data-logo-state]');
        if (img) {
          img.addEventListener('load', () => { state.textContent = 'Logo berhasil dimuat.'; state.style.color = 'var(--a-success)'; });
          img.addEventListener('error', () => { state.textContent = 'Logo gagal dimuat — periksa slug/varian. Situs akan menampilkan inisial sebagai cadangan.'; state.style.color = 'var(--a-danger)'; });
        }
        bindIconFallbacks(preview);
      };
      let t;
      form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 350); });
      form.addEventListener('change', paint);
      dialog.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        const p = SOFTWARE_PRESETS[Number(b.dataset.preset)];
        ctl.set('name', p.name); ctl.set('category', p.category); ctl.set('icon_source', p.icon_source); ctl.set('icon_slug', p.icon_slug); ctl.set('icon_variant', 'original');
        paint();
        form.querySelector('[name="name"]').focus();
      }));
      bindIconFallbacks(dialog);
      paint();
    },
    onSubmit: async (v) => {
      if (v.icon_source === 'custom' && !v.icon_media_id) throw new Error('Pilih atau upload logo kustom terlebih dahulu.');
      const payload = {
        name: v.name, category: v.category, description: v.description || '', icon_source: v.icon_source,
        icon_slug: v.icon_source === 'custom' ? null : String(v.icon_slug || '').toLowerCase().trim(),
        icon_variant: v.icon_variant || 'original', icon_media_id: v.icon_source === 'custom' ? v.icon_media_id : null,
        website_url: v.website_url, is_visible: v.is_visible,
      };
      if (s) unwrap(await supabase.from('software_tools').update(payload).eq('id', s.id).select('id').single());
      else unwrap(await supabase.from('software_tools').insert({ ...payload, sort_order: await nextSortOrder('software_tools') }).select('id').single());
      return true;
    },
  }).then(async (ok) => { if (ok) { toast(s ? 'Software disimpan.' : 'Software ditambahkan.'); await load(); render(); } });
}

/* -------------------------------- aksi umum -------------------------------- */

async function rowAction(e, table, list, edit) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const item = list.find((x) => x.id === btn.closest('[data-id]')?.dataset.id);
  if (!item) return;
  try {
    const act = btn.dataset.act;
    if (act === 'edit') return edit(item);
    if (act === 'toggle') {
      unwrap(await supabase.from(table).update({ is_visible: !item.is_visible }).eq('id', item.id).select('id').single());
      toast(item.is_visible ? `${item.name} disembunyikan.` : `${item.name} ditampilkan di situs.`);
    }
    if (act === 'up' || act === 'down') {
      const i = list.indexOf(item);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      await saveOrder(table, moveItem(list, i, j).map((x) => x.id));
      toast('Urutan disimpan.');
    }
    if (act === 'delete') {
      const ok = await confirmDialog({ title: `Hapus “${item.name}”?`, message: table === 'software_tools' ? 'Software juga dilepas dari semua proyek yang memakainya.' : 'Keahlian dihapus permanen.', confirmText: 'Hapus', danger: true });
      if (!ok) return;
      unwrap(await supabase.from(table).delete().eq('id', item.id).select('id').single());
      toast('Dihapus.');
    }
    await load();
    render();
    if (act === 'up' || act === 'down') document.querySelector(`[data-id="${item.id}"] [data-act="${act}"]`)?.focus();
  } catch (err) { reportError(err); }
}
