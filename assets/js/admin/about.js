// Admin › Tentang: judul, foto profil, biografi, fokus kreatif, informasi tambahan (site_settings),
// serta pengalaman & pendidikan (CRUD, urutan, visibilitas).
import { $, esc, yearRange } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, busy, unwrap, moveItem, loadingHTML, emptyHTML, guardUnsaved } from './core.js';
import { formHTML, bindForm, openFormDialog } from './forms.js';
import { getSettings, saveSettings, saveOrder, nextSortOrder } from './data.js';

const PROFILE_FIELDS = [
  { name: 'about_heading', label: 'Judul halaman', type: 'text', required: true, maxlength: 80 },
  { name: 'owner_role', label: 'Identitas singkat (di atas judul)', type: 'text', maxlength: 80, help: 'Mis. “Fotografer & desainer visual”. Juga dipakai di foyer galeri.' },
  { name: 'profile_media_id', label: 'Foto profil', type: 'media', full: true, help: 'Rasio potret (4:5) tampil paling baik.' },
  { name: 'about_bio', label: 'Biografi', type: 'textarea', rows: 10, full: true, help: 'Pisahkan paragraf dengan satu baris kosong. Paragraf pertama juga tampil sebagai ringkasan di beranda.' },
  { name: 'about_focus', label: 'Fokus kreatif', type: 'tags', full: true, help: 'Tekan Enter setelah setiap item.' },
  { name: 'about_extra', label: 'Informasi tambahan', type: 'pairs', full: true, help: 'Pasangan label & isi, mis. Bahasa — Indonesia, Inggris; Domisili — Bandung.' },
  { html: '<div class="field full"><h3>Kartu Aula Patung</h3><p class="field__help">Edit judul dan deskripsi setiap kartu yang tampil di bingkai Aula Patung. Semua perubahan disimpan lewat tombol di bagian bawah formulir dan tampil di website publik; jangan masukkan alamat rumah, email pribadi, umur, atau detail sekolah.</p></div>' },
  { name: 'hall_card_1_title', label: 'Bingkai 1 — Judul', type: 'text', maxlength: 80 },
  { name: 'hall_card_1_image_media_id', label: 'Bingkai 1 — Foto', type: 'media', full: true, help: 'Kosongkan untuk menggunakan foto profil utama.' },
  { name: 'hall_card_1_description', label: 'Bingkai 1 — Deskripsi', type: 'textarea', rows: 4, full: true, maxlength: 600 },
  { name: 'hall_card_2_title', label: 'Bingkai 2 — Judul', type: 'text', maxlength: 80 },
  { name: 'hall_card_2_image_media_id', label: 'Bingkai 2 — Foto', type: 'media', full: true, help: 'Kosongkan untuk menggunakan foto profil utama.' },
  { name: 'hall_card_2_description', label: 'Bingkai 2 — Deskripsi', type: 'textarea', rows: 4, full: true, maxlength: 600 },
  { name: 'hall_card_3_title', label: 'Bingkai 3 — Judul', type: 'text', maxlength: 80 },
  { name: 'hall_card_3_image_media_id', label: 'Bingkai 3 — Foto', type: 'media', full: true, help: 'Kosongkan untuk menggunakan foto profil utama.' },
  { name: 'hall_card_3_description', label: 'Bingkai 3 — Deskripsi', type: 'textarea', rows: 4, full: true, maxlength: 600 },
];

const privateHallInfo = /\b(?:alamat|address|rumah|home|umur|usia|age|sekolah|school|pendidikan|education|institusi|institution|smp|sma|sd)\b|\b1[0-7]\s*tahun\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;

function profileFormSettings(settings) {
  const cards = Array.isArray(settings.hall_cards) && settings.hall_cards.length === 3
    ? settings.hall_cards
    : [
        {
          title: settings.owner_name || 'Tentang saya',
          description: [settings.owner_role, ...(settings.about_extra || [])
            .filter((item) => item?.label && item?.value && /bahasa|minat|fokus|keahlian|skill|hobi/i.test(item.label) && !privateHallInfo.test(`${item.label} ${item.value}`))
            .map((item) => `${item.label}: ${item.value}`)].filter((value) => value && !privateHallInfo.test(value)).join('\n'),
        },
        { title: 'Fokus kreatif', description: (settings.about_focus || []).filter((value) => value && !privateHallInfo.test(String(value))).join('\n') },
        { title: 'Tentang saya', description: settings.about_bio && !privateHallInfo.test(settings.about_bio) ? settings.about_bio : '' },
      ];
  return {
    ...settings,
    hall_card_1_title: cards[0]?.title || '',
    hall_card_1_image_media_id: cards[0]?.image_media_id || null,
    hall_card_1_description: cards[0]?.description || '',
    hall_card_2_title: cards[1]?.title || '',
    hall_card_2_image_media_id: cards[1]?.image_media_id || null,
    hall_card_2_description: cards[1]?.description || '',
    hall_card_3_title: cards[2]?.title || '',
    hall_card_3_image_media_id: cards[2]?.image_media_id || null,
    hall_card_3_description: cards[2]?.description || '',
  };
}

const TABLES = {
  experiences: {
    label: 'Pengalaman', empty: 'Belum ada pengalaman.', title: (r) => r.title, sub: (r) => [r.organization, r.location].filter(Boolean).join(' · '),
    fields: [
      { name: 'title', label: 'Posisi / peran', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'organization', label: 'Organisasi / perusahaan', type: 'text', maxlength: 160 },
      { name: 'location', label: 'Lokasi', type: 'text', maxlength: 120, nullable: true },
      { name: 'start_year', label: 'Tahun mulai', type: 'year', nullable: true },
      { name: 'end_year', label: 'Tahun selesai', type: 'year', nullable: true, help: 'Kosongkan bila masih berlangsung.' },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 4, full: true },
      { name: 'is_visible', label: 'Tampilkan di situs', type: 'checkbox', full: true },
    ],
  },
  education: {
    label: 'Pendidikan', empty: 'Belum ada riwayat pendidikan.', title: (r) => r.institution, sub: (r) => r.program,
    fields: [
      { name: 'institution', label: 'Institusi', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'program', label: 'Program / jurusan', type: 'text', maxlength: 160, full: true },
      { name: 'start_year', label: 'Tahun mulai', type: 'year', nullable: true },
      { name: 'end_year', label: 'Tahun selesai', type: 'year', nullable: true, help: 'Kosongkan bila masih berlangsung.' },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 3, full: true },
      { name: 'is_visible', label: 'Tampilkan di situs', type: 'checkbox', full: true },
    ],
  },
};

const data = { experiences: [], education: [] };
let profileCtl;

export async function init() {
  $('#view').innerHTML = loadingHTML();
  $('#head-actions').innerHTML = '<a class="btn" href="/about.html" target="_blank" rel="noopener"><i data-lucide="eye"></i>Lihat halaman</a>';
  let settings;
  try {
    [settings] = await Promise.all([getSettings(), loadList('experiences'), loadList('education')]);
  } catch (err) { $('#view').innerHTML = `<p class="form-error">${esc(err.message)}</p>`; reportError(err); return; }

  $('#view').innerHTML = `
    <form class="card" id="profile-form" novalidate>
      <div class="card__head"><div><h2>Profil & biografi</h2><p>Semua isi halaman Tentang dapat diubah di sini — jangan biarkan teks contoh tampil di situs Anda.</p></div></div>
      <div class="card__body">${formHTML(PROFILE_FIELDS, profileFormSettings(settings))}
        <div class="form-actions"><button class="btn btn--primary" type="submit"><i data-lucide="save"></i>Simpan profil & kartu aula</button></div>
      </div>
    </form>
    <section class="card" data-table="experiences"></section>
    <section class="card" data-table="education"></section>`;

  const form = $('#profile-form');
  form.noValidate = false;
  profileCtl = bindForm(form, PROFILE_FIELDS);
  guardUnsaved(() => profileCtl.isDirty());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = profileCtl.validate();
    if (problem) { if (problem !== 'invalid') toast(problem, 'error'); return; }
    const values = profileCtl.read();
    const hallCards = [1, 2, 3].map((i) => ({
      title: values[`hall_card_${i}_title`],
      image_media_id: values[`hall_card_${i}_image_media_id`],
      description: values[`hall_card_${i}_description`],
    }));
    if (hallCards.some((card) => privateHallInfo.test(`${card.title}\n${card.description}`))) {
      toast('Informasi pribadi terdeteksi. Jangan masukkan alamat, umur, sekolah, atau email pribadi ke bingkai publik.', 'error');
      return;
    }
    await busy(form.querySelector('[type="submit"]'), async () => {
      try {
        const v = values;
        await saveSettings({
          about_heading: v.about_heading, owner_role: v.owner_role || '', profile_media_id: v.profile_media_id,
          about_bio: v.about_bio || '', about_focus: v.about_focus, about_extra: v.about_extra,
          hall_cards: hallCards,
        });
        profileCtl.markClean();
        toast('Profil disimpan.');
      } catch (err) { reportError(err); }
    });
  });
  paintTable('experiences');
  paintTable('education');
  renderIcons();
}

async function loadList(table) {
  data[table] = unwrap(await supabase.from(table).select('*').order('sort_order'));
}

function paintTable(table) {
  const cfg = TABLES[table];
  const box = document.querySelector(`[data-table="${table}"]`);
  const rows = data[table];
  box.innerHTML = `
    <div class="card__head"><h2>${cfg.label}</h2><button class="btn btn--sm btn--primary" type="button" data-add><i data-lucide="plus"></i>Tambah</button></div>
    <div class="rows">${rows.length ? rows.map((r, i) => `
      <div class="row row--noimg" data-id="${r.id}">
        <div class="row__order">
          <button class="icon-btn" type="button" data-act="up" aria-label="Naikkan" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
          <button class="icon-btn" type="button" data-act="down" aria-label="Turunkan" ${i === rows.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
        </div>
        <div class="row__main">
          <div class="row__title">${esc(cfg.title(r))}</div>
          <div class="row__sub"><span>${esc(yearRange(r.start_year, r.end_year))}</span>${cfg.sub(r) ? `<span>${esc(cfg.sub(r))}</span>` : ''}${r.is_visible ? '' : '<span class="badge badge--hidden">Tersembunyi</span>'}</div>
        </div>
        <div class="row__actions">
          <button class="icon-btn" type="button" data-act="toggle" aria-pressed="${r.is_visible}" aria-label="${r.is_visible ? 'Sembunyikan' : 'Tampilkan'}"><i data-lucide="${r.is_visible ? 'eye' : 'eye-off'}"></i></button>
          <button class="icon-btn" type="button" data-act="edit" aria-label="Edit ${esc(cfg.title(r))}"><i data-lucide="pencil"></i></button>
          <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus ${esc(cfg.title(r))}"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('') : emptyHTML(cfg.empty, table === 'education' ? 'layers' : 'folder-kanban')}</div>`;
  box.querySelector('[data-add]').addEventListener('click', () => edit(table, null));
  box.querySelector('.rows').addEventListener('click', (e) => onAction(e, table));
  renderIcons(box);
}

async function onAction(e, table) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const list = data[table];
  const row = list.find((x) => x.id === btn.closest('[data-id]').dataset.id);
  try {
    if (btn.dataset.act === 'edit') return edit(table, row);
    if (btn.dataset.act === 'toggle') {
      unwrap(await supabase.from(table).update({ is_visible: !row.is_visible }).eq('id', row.id).select('id').single());
      toast(row.is_visible ? 'Disembunyikan dari situs.' : 'Ditampilkan di situs.');
    }
    if (btn.dataset.act === 'up' || btn.dataset.act === 'down') {
      const i = list.indexOf(row);
      const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
      await saveOrder(table, moveItem(list, i, j).map((x) => x.id));
      toast('Urutan disimpan.');
    }
    if (btn.dataset.act === 'delete') {
      if (!(await confirmDialog({ title: `Hapus “${TABLES[table].title(row)}”?`, confirmText: 'Hapus', danger: true }))) return;
      unwrap(await supabase.from(table).delete().eq('id', row.id).select('id').single());
      toast('Dihapus.');
    }
    await loadList(table);
    paintTable(table);
    if (btn.dataset.act === 'up' || btn.dataset.act === 'down') document.querySelector(`[data-id="${row.id}"] [data-act="${btn.dataset.act}"]`)?.focus();
  } catch (err) { reportError(err); }
}

function edit(table, row) {
  const cfg = TABLES[table];
  return openFormDialog({
    title: `${row ? 'Edit' : 'Tambah'} ${cfg.label.toLowerCase()}`,
    fields: cfg.fields,
    values: row || { is_visible: true },
    onSubmit: async (v) => {
      if (v.start_year && v.end_year && v.end_year < v.start_year) throw new Error('Tahun selesai tidak boleh lebih kecil dari tahun mulai.');
      const payload = { ...v, description: v.description || '' };
      if ('organization' in payload) payload.organization = payload.organization || '';
      if ('program' in payload) payload.program = payload.program || '';
      if (row) unwrap(await supabase.from(table).update(payload).eq('id', row.id).select('id').single());
      else unwrap(await supabase.from(table).insert({ ...payload, sort_order: await nextSortOrder(table) }).select('id').single());
      return true;
    },
  }).then(async (ok) => {
    if (!ok) return;
    toast('Disimpan.');
    await loadList(table);
    paintTable(table);
  });
}
