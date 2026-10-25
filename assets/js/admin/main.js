// Titik masuk semua halaman admin: gaya, penjaga akses, kerangka navigasi, lalu modul halaman.
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource-variable/inter';
import '../../css/admin.css';

import { renderIcons } from '../icons.js';
import { esc } from '../utils.js';
import { requireAdmin, signOut, initLogin } from './auth.js';
import { supabase } from '../supabase.js';
import { reportError } from './core.js';

const page = document.body.dataset.page;

// peta eksplisit agar setiap halaman hanya mengunduh modulnya sendiri
const PAGES = {
  dashboard: () => import('./dashboard.js'),
  projects: () => import('./projects.js'),
  gallery: () => import('./gallery.js'),
  skills: () => import('./skills.js'),
  about: () => import('./about.js'),
  media: () => import('./media.js'),
  messages: () => import('./messages.js'),
  settings: () => import('./settings.js'),
};

const NAV = [
  ['dashboard', '/admin/', 'layout-dashboard', 'Dashboard'],
  ['projects', '/admin/projects.html', 'folder-kanban', 'Proyek'],
  ['gallery', '/admin/gallery.html', 'frame', 'Galeri 3D'],
  ['skills', '/admin/skills.html', 'wrench', 'Keahlian & Software'],
  ['about', '/admin/about.html', 'user', 'Tentang'],
  ['media', '/admin/media.html', 'images', 'Media'],
  ['messages', '/admin/messages.html', 'inbox', 'Pesan'],
  ['settings', '/admin/settings.html', 'settings', 'Pengaturan'],
];

function renderShell(ctx, ownerName) {
  const side = document.querySelector('#a-sidebar');
  side.innerHTML = `
    <a class="a-brand" href="/admin/"><strong>${esc(ownerName || 'Portofolio')}</strong><span>Panel admin</span></a>
    <nav class="a-nav" aria-label="Menu admin">
      ${NAV.map(([key, href, icon, label]) => `<a href="${href}"${key === page ? ' aria-current="page"' : ''}><i data-lucide="${icon}"></i><span>${label}</span>${key === 'messages' ? '<span class="badge badge--count" data-unread hidden></span>' : ''}</a>`).join('')}
    </nav>
    <div class="a-sidebar__foot">
      <a class="btn btn--ghost" href="/" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Lihat situs</a>
      <div class="a-user"><strong class="small">Masuk sebagai</strong><span title="${esc(ctx.user.email)}">${esc(ctx.user.email)}</span></div>
      <button class="btn" type="button" data-logout><i data-lucide="log-out"></i>Keluar</button>
    </div>`;
  side.querySelector('[data-logout]').addEventListener('click', () => signOut());

  // navigasi samping sebagai drawer di layar kecil (Android)
  const openBtn = document.querySelector('[data-nav-open]');
  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    openBtn?.setAttribute('aria-expanded', String(open));
    if (open) side.querySelector('a')?.focus();
  };
  openBtn?.addEventListener('click', () => setOpen(true));
  document.querySelector('[data-nav-close]')?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); openBtn?.focus(); } });

  refreshUnread();
  renderIcons();
}

export async function refreshUnread() {
  const badge = document.querySelector('[data-unread]');
  if (!badge) return;
  const { count } = await supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new');
  badge.hidden = !count;
  badge.textContent = count > 99 ? '99+' : String(count || '');
}

async function boot() {
  if (page === 'login') { await initLogin(); renderIcons(); return; }
  const ctx = await requireAdmin();
  if (!ctx) return;
  const { data: settings } = await supabase.from('site_settings').select('owner_name').eq('id', 1).maybeSingle();
  renderShell(ctx, settings?.owner_name);
  document.body.classList.add('is-ready');
  try {
    const mod = await PAGES[page]();
    await mod.init({ ...ctx, refreshUnread });
  } catch (err) {
    reportError(err, `Gagal memuat halaman ${page}`);
  }
  renderIcons();
  window.__adminReady = true;
}

boot();
