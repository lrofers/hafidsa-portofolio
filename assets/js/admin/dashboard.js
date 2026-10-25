// Admin › Dashboard: statistik nyata dari database, aksi cepat, aktivitas terbaru, pesan terbaru,
// dan daftar periksa konten yang masih berupa contoh/placeholder.
import { $, esc, formatBytes, formatDate } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { reportError, unwrap, statusBadge } from './core.js';
import { mediaThumb } from './media-lib.js';

export async function init() {
  $('#head-actions').innerHTML = `
    <a class="btn" href="/" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Lihat situs</a>
    <a class="btn btn--primary" href="/admin/projects.html?new=1"><i data-lucide="plus"></i>Proyek baru</a>`;
  try {
    const [projects, artworks, media, messages, software, skills, settings, recent, exps, edus] = await Promise.all([
      supabase.from('projects').select('id, title, status, updated_at, thumbnail:media_assets!projects_thumbnail_media_id_fkey(*)').order('updated_at', { ascending: false }),
      supabase.from('gallery_artworks').select('id, title, status, updated_at, media:media_assets(*)').order('updated_at', { ascending: false }),
      supabase.from('media_assets').select('id, size_bytes, external_url, alt_text'),
      supabase.from('contact_messages').select('id, name, subject, message, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('software_tools').select('id, is_visible'),
      supabase.from('skills').select('id, is_visible, name'),
      supabase.from('site_settings').select('*').eq('id', 1).single(),
      supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('experiences').select('id, title, organization'),
      supabase.from('education').select('id, institution'),
    ]);
    render({
      projects: unwrap(projects), artworks: unwrap(artworks), media: unwrap(media), messages: unwrap(messages),
      software: unwrap(software), skills: unwrap(skills), settings: unwrap(settings), unread: recent.count ?? 0,
      exps: unwrap(exps), edus: unwrap(edus),
    });
  } catch (err) {
    $('#view').innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    reportError(err);
  }
}

function stat(label, icon, value, sub, href) {
  return `<a class="card stat" href="${href}"><span class="stat__label"><i data-lucide="${icon}"></i>${label}</span><span class="stat__value">${value}</span><span class="stat__sub">${sub}</span></a>`;
}

function render(d) {
  const pub = (list) => list.filter((x) => x.status === 'published').length;
  const totalBytes = d.media.reduce((s, m) => s + (m.size_bytes || 0), 0);
  const visibleSw = d.software.filter((s) => s.is_visible).length;
  const s = d.settings;
  const isDemo = (txt) => /contoh|placeholder|Nama Anda|Isi di Admin/i.test(txt || '');

  // daftar periksa: bantu pemilik mengganti konten contoh dengan data aslinya sendiri
  const checks = [
    { ok: !isDemo(s.owner_name), text: 'Isi nama Anda', href: '/admin/settings.html' },
    { ok: !!s.about_bio && !isDemo(s.about_bio), text: 'Tulis biografi', href: '/admin/about.html' },
    { ok: !!s.profile_media_id && !d.media.find((m) => m.id === s.profile_media_id)?.external_url, text: 'Upload foto profil', href: '/admin/about.html' },
    { ok: !!s.email, text: 'Isi email kontak', href: '/admin/settings.html' },
    { ok: visibleSw > 0, text: 'Tampilkan software yang Anda gunakan', href: '/admin/skills.html?tab=software' },
    { ok: d.skills.length > 0 && !d.skills.some((k) => isDemo(k.name)), text: 'Ganti keahlian contoh', href: '/admin/skills.html' },
    { ok: !d.exps.some((x) => isDemo(`${x.title} ${x.organization}`)) && !d.edus.some((x) => isDemo(x.institution)), text: 'Ganti pengalaman & pendidikan contoh', href: '/admin/about.html' },
    { ok: !d.projects.some((p) => isDemo(p.title)), text: 'Ganti proyek contoh dengan karya Anda', href: '/admin/projects.html' },
    { ok: !d.artworks.some((a) => isDemo(a.title)), text: 'Ganti karya contoh di galeri 3D', href: '/admin/gallery.html' },
    { ok: !d.media.some((m) => (m.external_url || '').startsWith('/demo/')), text: 'Ganti gambar demo dengan foto Anda', href: '/admin/media.html' },
    { ok: d.media.every((m) => m.alt_text), text: 'Lengkapi alt text semua gambar', href: '/admin/media.html' },
  ];
  const done = checks.filter((c) => c.ok).length;

  const recent = [
    ...d.projects.map((p) => ({ kind: 'Proyek', title: p.title, status: p.status, at: p.updated_at, img: p.thumbnail, href: `/admin/projects.html?edit=${p.id}` })),
    ...d.artworks.map((a) => ({ kind: 'Karya', title: a.title, status: a.status, at: a.updated_at, img: a.media, href: '/admin/gallery.html' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

  $('#view').innerHTML = `
    <div class="stats">
      ${stat('Proyek', 'folder-kanban', d.projects.length, `${pub(d.projects)} terbit · ${d.projects.length - pub(d.projects)} draf`, '/admin/projects.html')}
      ${stat('Karya galeri', 'frame', d.artworks.length, `${pub(d.artworks)} terbit · ${d.artworks.length - pub(d.artworks)} draf`, '/admin/gallery.html')}
      ${stat('Media', 'images', d.media.length, `${formatBytes(totalBytes)} di Storage`, '/admin/media.html')}
      ${stat('Pesan baru', 'inbox', d.unread, 'dari formulir kontak', '/admin/messages.html')}
      ${stat('Software tampil', 'layout-grid', visibleSw, `dari ${d.software.length} di katalog`, '/admin/skills.html?tab=software')}
      ${stat('Keahlian', 'wrench', d.skills.filter((k) => k.is_visible).length, `${d.skills.length} total`, '/admin/skills.html')}
    </div>
    <div class="dash-grid">
      <div class="stack">
        <section class="card"><div class="card__head"><h2>Aktivitas terbaru</h2></div>
          <div class="rows">${recent.length ? recent.map((r) => `
            <a class="row" href="${r.href}" style="text-decoration:none;grid-template-columns:56px minmax(0,1fr) auto">
              <div class="row__thumb">${mediaThumb(r.img) ? `<img src="${esc(mediaThumb(r.img))}" alt="" loading="lazy">` : '<i data-lucide="image"></i>'}</div>
              <div class="row__main"><div class="row__title">${esc(r.title)}</div><div class="row__sub"><span>${r.kind}</span>${statusBadge(r.status)}<span>${esc(formatDate(r.at))}</span></div></div>
              <i data-lucide="chevron-right"></i>
            </a>`).join('') : '<p class="muted" style="padding:16px">Belum ada konten.</p>'}</div></section>
        <section class="card"><div class="card__head"><h2>Pesan terbaru</h2><a class="btn btn--sm" href="/admin/messages.html">Semua pesan</a></div>
          <div class="rows">${d.messages.length ? d.messages.map((m) => `
            <a class="row row--noimg" href="/admin/messages.html" style="text-decoration:none;grid-template-columns:auto minmax(0,1fr) auto">
              <i data-lucide="${m.status === 'new' ? 'mail' : 'mail-open'}"></i>
              <div class="row__main"><div class="row__title">${esc(m.name)}${m.status === 'new' ? ' <span class="badge badge--new">Baru</span>' : ''}</div><div class="row__sub"><span>${esc((m.subject || m.message).slice(0, 80))}</span></div></div>
              <span class="small muted nowrap">${esc(formatDate(m.created_at))}</span>
            </a>`).join('') : '<p class="muted" style="padding:16px">Belum ada pesan.</p>'}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card__head"><div><h2>Lengkapi situs</h2><p>${done}/${checks.length} selesai</p></div></div>
          <div class="card__body"><ul class="checklist">${checks.map((c) => `
            <li><span class="dot${c.ok ? ' dot--ok' : ''}"><i data-lucide="${c.ok ? 'check' : 'circle-alert'}"></i></span>
            <span>${c.ok ? `<span class="muted">${esc(c.text)}</span>` : `<a href="${c.href}">${esc(c.text)}</a>`}</span></li>`).join('')}</ul></div></section>
        <section class="card"><div class="card__head"><h2>Aksi cepat</h2></div>
          <div class="card__body quick">
            <a class="btn" href="/admin/projects.html?new=1"><i data-lucide="plus"></i>Proyek</a>
            <a class="btn" href="/admin/gallery.html"><i data-lucide="frame"></i>Atur galeri</a>
            <a class="btn" href="/admin/media.html"><i data-lucide="upload"></i>Upload media</a>
            <a class="btn" href="/admin/settings.html"><i data-lucide="palette"></i>Tema & kontak</a>
            <a class="btn" href="/?preview=1" target="_blank" rel="noopener"><i data-lucide="eye"></i>Pratinjau draf</a>
          </div></section>
      </div>
    </div>`;
  renderIcons();
}
