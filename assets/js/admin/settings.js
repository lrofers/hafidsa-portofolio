// Admin › Pengaturan: identitas situs, logo & favicon, hero, warna tema (dengan cek kontras), kontak,
// media sosial (CRUD + urutan), visibilitas halaman, animasi, dan ganti kata sandi admin.
import { $, esc } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, busy, unwrap, moveItem, loadingHTML, emptyHTML, guardUnsaved } from './core.js';
import { formHTML, bindForm, openFormDialog } from './forms.js';
import { getSettings, saveSettings, saveOrder, nextSortOrder } from './data.js';

const DEFAULT_THEME = { accent: '#b4532a', paper: '#f4efe7', ink: '#1b1916', wall: '#efe9de' };
const PLATFORMS = ['Instagram', 'Behance', 'Dribbble', 'LinkedIn', 'GitHub', 'YouTube', 'Vimeo', 'X / Twitter', 'TikTok', 'Facebook', 'ArtStation', 'Website', 'Email', 'Lainnya'];

const SECTIONS = [
  {
    id: 'identity', title: 'Identitas situs', desc: 'Nama, judul, dan aset merek yang tampil di header, tab browser, dan saat tautan dibagikan.',
    fields: [
      { name: 'owner_name', label: 'Nama pemilik', type: 'text', required: true, maxlength: 80 },
      { name: 'owner_role', label: 'Identitas / peran', type: 'text', maxlength: 80, placeholder: 'mis. Fotografer & desainer' },
      { name: 'site_title', label: 'Judul website (tab browser & mesin pencari)', type: 'text', required: true, maxlength: 120, full: true },
      { name: 'meta_description', label: 'Deskripsi situs', type: 'textarea', rows: 2, maxlength: 300, full: true, help: 'Ringkasan 1–2 kalimat untuk hasil pencarian & pratinjau tautan.' },
      { name: 'logo_media_id', label: 'Logo (opsional)', type: 'media', help: 'Tampil di samping nama pada header. SVG/PNG transparan.' },
      { name: 'favicon_media_id', label: 'Favicon', type: 'media', help: 'Ikon tab browser. Persegi, min. 64×64 px (SVG/PNG).' },
      { name: 'og_media_id', label: 'Gambar berbagi (Open Graph)', type: 'media', full: true, help: 'Tampil saat tautan situs dibagikan. Ideal 1200×630 px.' },
    ],
  },
  {
    id: 'hero', title: 'Hero beranda', desc: 'Teks pembuka di atas galeri 3D (kalimat pembuka juga ditulis di dinding foyer).',
    fields: [
      { name: 'hero_eyebrow', label: 'Label kecil', type: 'text', maxlength: 60 },
      { name: 'hero_title', label: 'Judul editorial', type: 'textarea', rows: 2, required: true, maxlength: 160, full: true },
      { name: 'hero_subtitle', label: 'Subjudul / petunjuk scroll', type: 'text', maxlength: 160, full: true },
    ],
  },
  {
    id: 'theme', title: 'Warna tema', desc: 'Berlaku di seluruh situs publik dan dinding galeri 3D.',
    fields: [
      { name: 'theme_accent', label: 'Aksen (tautan, tombol, sorotan)', type: 'color' },
      { name: 'theme_paper', label: 'Latar halaman', type: 'color' },
      { name: 'theme_ink', label: 'Teks', type: 'color' },
      { name: 'theme_wall', label: 'Dinding galeri 3D', type: 'color' },
      { html: '<div class="field full"><span class="field__label">Pratinjau</span><div data-theme-preview style="border-radius:10px;padding:20px;border:1px solid var(--a-line)"></div></div>' },
    ],
  },
  {
    id: 'contact', title: 'Informasi kontak', desc: 'Tampil di halaman Kontak dan footer. Kosongkan yang tidak ingin ditampilkan.',
    fields: [
      { name: 'email', label: 'Email', type: 'email', nullable: true, maxlength: 254 },
      { name: 'phone', label: 'Telepon / WhatsApp', type: 'tel', nullable: true, maxlength: 40 },
      { name: 'location', label: 'Lokasi', type: 'text', nullable: true, maxlength: 120 },
      { name: 'availability', label: 'Ketersediaan', type: 'text', nullable: true, maxlength: 160, placeholder: 'mis. Menerima proyek mulai Januari' },
      { name: 'contact_intro', label: 'Pengantar halaman kontak', type: 'textarea', rows: 2, maxlength: 400, full: true },
    ],
  },
  {
    id: 'visibility', title: 'Visibilitas halaman', desc: 'Halaman yang dimatikan hilang dari navigasi dan menampilkan pesan “tidak tersedia”.',
    fields: [
      { name: 'vis_projects', label: 'Halaman Karya & detail proyek', type: 'checkbox' },
      { name: 'vis_about', label: 'Halaman Tentang', type: 'checkbox' },
      { name: 'vis_contact', label: 'Halaman Kontak', type: 'checkbox' },
      { name: 'vis_skills', label: 'Bagian Keahlian & Software', type: 'checkbox' },
    ],
  },
  {
    id: 'animation', title: 'Animasi', desc: 'Pengunjung yang mengaktifkan “kurangi gerakan” di perangkatnya otomatis mendapat versi tanpa animasi.',
    fields: [
      { name: 'anim_enabled', label: 'Aktifkan animasi (transisi halaman, reveal, gerak kamera ambient)', type: 'checkbox', full: true },
      { name: 'anim_intensity', label: 'Intensitas gerak kamera ambient', type: 'range', min: 0, max: 1.5, step: 0.1 },
      { name: 'anim_smoothing', label: 'Kehalusan scroll kamera (detik)', type: 'range', min: 0.1, max: 3, step: 0.1 },
      { name: 'anim_shadows', label: 'Bayangan real-time di desktop (lebih berat untuk GPU)', type: 'checkbox', full: true },
    ],
  },
];

let settings;
const ctls = {};

const flatten = (s) => ({
  ...s,
  theme_accent: s.theme?.accent || DEFAULT_THEME.accent, theme_paper: s.theme?.paper || DEFAULT_THEME.paper,
  theme_ink: s.theme?.ink || DEFAULT_THEME.ink, theme_wall: s.theme?.wall || DEFAULT_THEME.wall,
  vis_projects: s.page_visibility?.projects !== false, vis_about: s.page_visibility?.about !== false,
  vis_contact: s.page_visibility?.contact !== false, vis_skills: s.page_visibility?.skills !== false,
  anim_enabled: s.animation?.enabled !== false, anim_intensity: s.animation?.intensity ?? 1,
  anim_smoothing: s.animation?.smoothing ?? 1.2, anim_shadows: s.animation?.shadows !== false,
});

/** Ubah nilai formulir per bagian menjadi kolom site_settings. */
function toPatch(id, v) {
  switch (id) {
    case 'theme': return { theme: { accent: v.theme_accent, paper: v.theme_paper, ink: v.theme_ink, wall: v.theme_wall } };
    case 'visibility': return { page_visibility: { projects: v.vis_projects, about: v.vis_about, contact: v.vis_contact, skills: v.vis_skills } };
    case 'animation': return { animation: { enabled: v.anim_enabled, intensity: v.anim_intensity, smoothing: v.anim_smoothing, shadows: v.anim_shadows } };
    default: {
      const patch = { ...v };
      ['owner_role', 'meta_description', 'hero_eyebrow', 'hero_subtitle', 'contact_intro'].forEach((k) => { if (k in patch && patch[k] === null) patch[k] = ''; });
      return patch;
    }
  }
}

export async function init() {
  $('#view').innerHTML = loadingHTML();
  try { settings = await getSettings(); } catch (err) { $('#view').innerHTML = `<p class="form-error">${esc(err.message)}</p>`; reportError(err); return; }
  const values = flatten(settings);
  $('#view').innerHTML = `${SECTIONS.map((s) => `
    <form class="card" data-section="${s.id}" novalidate>
      <div class="card__head"><div><h2>${s.title}</h2><p>${s.desc}</p></div></div>
      <div class="card__body">${formHTML(s.fields, values)}
        <div class="form-actions"><button class="btn btn--primary" type="submit"><i data-lucide="save"></i>Simpan</button>
        ${s.id === 'theme' ? '<button class="btn btn--ghost" type="button" data-reset-theme>Kembalikan warna bawaan</button>' : ''}</div>
      </div>
    </form>`).join('')}
    <section class="card" data-social></section>
    <form class="card" data-password novalidate>
      <div class="card__head"><div><h2>Akun admin</h2><p>Ganti kata sandi akun yang sedang login.</p></div></div>
      <div class="card__body"><div class="form-grid">
        <div class="field"><label for="pw1">Kata sandi baru</label><input class="input" id="pw1" name="pw1" type="password" minlength="10" autocomplete="new-password" required></div>
        <div class="field"><label for="pw2">Ulangi kata sandi baru</label><input class="input" id="pw2" name="pw2" type="password" minlength="10" autocomplete="new-password" required></div>
      </div><div class="form-actions"><button class="btn btn--primary" type="submit"><i data-lucide="key-round"></i>Ganti kata sandi</button></div></div>
    </form>`;

  SECTIONS.forEach((s) => {
    const form = document.querySelector(`[data-section="${s.id}"]`);
    form.noValidate = false;
    const ctl = bindForm(form, s.fields);
    ctls[s.id] = ctl;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = ctl.validate();
      if (problem) { if (problem !== 'invalid') toast(problem, 'error'); return; }
      await busy(form.querySelector('[type="submit"]'), async () => {
        try {
          settings = await saveSettings(toPatch(s.id, ctl.read()));
          ctl.markClean();
          toast(`${s.title} disimpan.`);
        } catch (err) { reportError(err); }
      });
    });
  });
  guardUnsaved(() => Object.values(ctls).some((c) => c.isDirty()));

  // pratinjau tema + cek kontras teks/latar (WCAG AA = 4.5:1)
  const themeForm = document.querySelector('[data-section="theme"]');
  const paintTheme = () => {
    const v = ctls.theme.read();
    const ratio = contrast(v.theme_ink, v.theme_paper);
    themeForm.querySelector('[data-theme-preview]').innerHTML = `
      <div style="background:${esc(v.theme_paper)};color:${esc(v.theme_ink)};padding:18px;border-radius:8px;display:grid;gap:8px">
        <span style="font-family:var(--a-serif);font-size:1.8rem;line-height:1">Judul editorial</span>
        <span>Teks paragraf dengan <a style="color:${esc(v.theme_accent)}">tautan aksen</a>.</span>
        <span style="display:flex;gap:10px;align-items:center"><span style="background:${esc(v.theme_wall)};width:60px;height:34px;border-radius:4px;border:1px solid rgba(0,0,0,.1)"></span><span class="small">dinding galeri</span></span>
      </div>
      <p class="small" style="margin-top:8px;color:${ratio >= 4.5 ? 'var(--a-success)' : 'var(--a-danger)'}">Kontras teks : latar = ${ratio.toFixed(2)} : 1 ${ratio >= 4.5 ? '(lolos WCAG AA)' : '(di bawah 4.5 : 1 — teks sulit dibaca)'}</p>`;
  };
  themeForm.addEventListener('input', paintTheme);
  themeForm.querySelector('[data-reset-theme]').addEventListener('click', () => {
    Object.entries(DEFAULT_THEME).forEach(([k, val]) => {
      ctls.theme.set(`theme_${k}`, val);
      const text = themeForm.querySelector(`[name="theme_${k}"]`).parentElement.querySelector('[data-color-text]');
      if (text) text.value = val;
    });
    paintTheme();
    toast('Warna bawaan dipulihkan — klik Simpan untuk menerapkan.', 'info');
  });
  paintTheme();

  document.querySelector('[data-password]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    if (f.elements.pw1.value !== f.elements.pw2.value) { toast('Kedua kata sandi tidak sama.', 'error'); return; }
    await busy(f.querySelector('[type="submit"]'), async () => {
      const { error } = await supabase.auth.updateUser({ password: f.elements.pw1.value });
      if (error) reportError(error);
      else { f.reset(); toast('Kata sandi diganti.'); }
    });
  });

  await paintSocial();
  renderIcons();
}

/* ------------------------------ media sosial ------------------------------ */

let social = [];

async function paintSocial() {
  social = unwrap(await supabase.from('social_links').select('*').order('sort_order'));
  const box = document.querySelector('[data-social]');
  box.innerHTML = `
    <div class="card__head"><div><h2>Media sosial</h2><p>Tampil di footer dan halaman Kontak.</p></div><button class="btn btn--sm btn--primary" type="button" data-add><i data-lucide="plus"></i>Tambah tautan</button></div>
    <div class="rows">${social.length ? social.map((s, i) => `
      <div class="row row--noimg" data-id="${s.id}">
        <div class="row__order">
          <button class="icon-btn" type="button" data-act="up" aria-label="Naikkan ${esc(s.label || s.platform)}" ${i === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
          <button class="icon-btn" type="button" data-act="down" aria-label="Turunkan ${esc(s.label || s.platform)}" ${i === social.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
        </div>
        <div class="row__main"><div class="row__title">${esc(s.label || s.platform)}</div><div class="row__sub"><span class="badge">${esc(s.platform)}</span><span class="mono">${esc(s.url)}</span>${s.is_visible ? '' : '<span class="badge badge--hidden">Tersembunyi</span>'}</div></div>
        <div class="row__actions">
          <button class="icon-btn" type="button" data-act="toggle" aria-pressed="${s.is_visible}" aria-label="${s.is_visible ? 'Sembunyikan' : 'Tampilkan'}"><i data-lucide="${s.is_visible ? 'eye' : 'eye-off'}"></i></button>
          <button class="icon-btn" type="button" data-act="edit" aria-label="Edit"><i data-lucide="pencil"></i></button>
          <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Hapus"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('') : emptyHTML('Belum ada tautan media sosial.', 'globe')}</div>`;
  box.querySelector('[data-add]').addEventListener('click', () => editSocial(null));
  box.querySelector('.rows').addEventListener('click', onSocialAction);
  renderIcons(box);
}

async function onSocialAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const s = social.find((x) => x.id === btn.closest('[data-id]').dataset.id);
  try {
    if (btn.dataset.act === 'edit') return editSocial(s);
    if (btn.dataset.act === 'toggle') unwrap(await supabase.from('social_links').update({ is_visible: !s.is_visible }).eq('id', s.id).select('id').single());
    if (btn.dataset.act === 'up' || btn.dataset.act === 'down') {
      const i = social.indexOf(s);
      await saveOrder('social_links', moveItem(social, i, btn.dataset.act === 'up' ? i - 1 : i + 1).map((x) => x.id));
    }
    if (btn.dataset.act === 'delete') {
      if (!(await confirmDialog({ title: `Hapus tautan ${s.label || s.platform}?`, confirmText: 'Hapus', danger: true }))) return;
      unwrap(await supabase.from('social_links').delete().eq('id', s.id).select('id').single());
    }
    toast('Disimpan.');
    await paintSocial();
  } catch (err) { reportError(err); }
}

function editSocial(s) {
  return openFormDialog({
    title: s ? 'Edit tautan' : 'Tambah tautan media sosial',
    values: s || { platform: 'Instagram', is_visible: true },
    fields: [
      { name: 'platform', label: 'Platform', type: 'select', options: PLATFORMS.map((p) => ({ value: p, label: p })) },
      { name: 'label', label: 'Teks tautan', type: 'text', maxlength: 60, placeholder: 'mis. @namaanda' },
      { name: 'url', label: 'URL', type: 'text', required: true, maxlength: 500, full: true, placeholder: 'https://… atau mailto:…', help: 'Harus diawali https://, http://, atau mailto:', pattern: '(https?://|mailto:).+' },
      { name: 'is_visible', label: 'Tampilkan di situs', type: 'checkbox', full: true },
    ],
    onSubmit: async (v) => {
      const payload = { platform: v.platform, label: v.label || '', url: v.url, is_visible: v.is_visible };
      if (s) unwrap(await supabase.from('social_links').update(payload).eq('id', s.id).select('id').single());
      else unwrap(await supabase.from('social_links').insert({ ...payload, sort_order: await nextSortOrder('social_links') }).select('id').single());
      return true;
    },
  }).then(async (ok) => { if (ok) { toast('Tautan disimpan.'); await paintSocial(); } });
}

/* ------------------------------ util warna ------------------------------ */

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
