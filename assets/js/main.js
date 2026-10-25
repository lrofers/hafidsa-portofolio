// Titik masuk bersama semua halaman publik: tema, navigasi, footer, lalu halaman spesifik.
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource-variable/inter';
import '../css/main.css';
import '../css/gallery.css';
import '../css/responsive.css';

import { loadSettings, loadSocial, isDemo, isPreview } from './api.js';
import { $, $$, esc, safeUrl } from './utils.js';
import { renderIcons } from './icons.js';
import { setAnimationsEnabled, initReveal, initPageTransitions, initHeaderScroll } from './animations.js';

const page = document.body.dataset.page || 'home';

const PAGES = {
  home: () => import('./pages/home.js'),
  projects: () => import('./pages/projects.js'),
  'project-detail': () => import('./pages/project-detail.js'),
  about: () => import('./pages/about.js'),
  contact: () => import('./pages/contact.js'),
};

/** Terapkan warna tema dari pengaturan (divalidasi sebagai hex agar aman). */
export function applyTheme(settings) {
  const t = settings.theme || {};
  const root = document.documentElement.style;
  const ok = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
  if (ok(t.accent)) root.setProperty('--accent', t.accent);
  if (ok(t.paper)) root.setProperty('--paper', t.paper);
  if (ok(t.ink)) root.setProperty('--ink', t.ink);
  if (ok(t.wall)) root.setProperty('--wall', t.wall);
}

function applyMeta(settings) {
  const pageTitles = { projects: 'Karya', 'project-detail': 'Proyek', about: 'Tentang', contact: 'Kontak', 404: 'Halaman tidak ditemukan' };
  const t = pageTitles[page];
  document.title = t ? `${t} — ${settings.owner_name}` : settings.site_title || settings.owner_name;
  const setMeta = (sel, attr, val) => { const el = $(sel); if (el && val) el.setAttribute(attr, val); };
  setMeta('meta[name="description"]', 'content', settings.meta_description);
  setMeta('meta[property="og:title"]', 'content', document.title);
  setMeta('meta[property="og:description"]', 'content', settings.meta_description);
  if (settings.og?.url) setMeta('meta[property="og:image"]', 'content', new URL(settings.og.url, location.href).href);
  if (settings.favicon?.url) {
    let link = $('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.removeAttribute('type');
    link.href = settings.favicon.url;
  }
}

function fillSiteFields(settings) {
  $$('[data-site]').forEach((el) => {
    const key = el.dataset.site;
    if (key === 'logo') return;
    el.textContent = settings[key] ?? '';
  });
  const brand = $('.brand');
  if (brand && settings.logo?.url) {
    brand.classList.add('brand--logo');
    const img = document.createElement('img');
    img.src = settings.logo.url; img.alt = settings.owner_name; img.height = 28;
    brand.prepend(img);
  }
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

function applyVisibility(settings) {
  const vis = settings.page_visibility || {};
  $$('[data-page-link]').forEach((a) => {
    const key = a.dataset.pageLink;
    if (vis[key] === false) a.closest('li')?.remove() ?? a.remove();
  });
  $$('[data-section]').forEach((s) => { if (vis[s.dataset.section] === false) s.remove(); });
  const key = page === 'project-detail' ? 'projects' : page;
  if (vis[key] === false && !isPreview) {
    const main = $('main');
    if (main) main.innerHTML = `<section class="section notice"><h1 class="display">Halaman tidak tersedia</h1><p>Halaman ini sedang dinonaktifkan oleh pemilik situs.</p><p><a class="link-arrow" href="/">Kembali ke beranda</a></p></section>`;
    return false;
  }
  return true;
}

function renderFooter(settings, social) {
  const el = $('#footer-links');
  if (!el) return;
  const items = [];
  if (settings.email) items.push(`<li><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></li>`);
  social.forEach((s) => {
    const url = safeUrl(s.url);
    if (url) items.push(`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.label || s.platform)}<i data-lucide="arrow-up-right"></i></a></li>`);
  });
  el.innerHTML = items.join('');
}

function initNav(header) {
  const toggle = $('.nav-toggle', header);
  const nav = $('#site-nav', header);
  if (!toggle || !nav) return;
  const set = (open) => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    document.body.classList.toggle('nav-open', open);
  };
  toggle.addEventListener('click', () => set(!header.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && header.classList.contains('is-open')) { set(false); toggle.focus(); } });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  // samakan /about, /about.html, /index.html, dan / (hosting "pretty URL" menghapus .html)
  const norm = (p) => p.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/';
  const here = norm(location.pathname);
  $$('a', nav).forEach((a) => {
    const match = norm(new URL(a.href).pathname) === here || (page === 'project-detail' && a.dataset.pageLink === 'projects');
    if (match) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

export function showBanner(message, kind = 'info', { timeout = 9000 } = {}) {
  const b = document.createElement('div');
  b.className = `banner banner--${kind}`;
  b.setAttribute('role', 'status');
  b.innerHTML = `<span>${message}</span><button type="button" aria-label="Tutup pemberitahuan"><i data-lucide="x"></i></button>`;
  document.body.prepend(b);
  const hide = () => { b.classList.add('is-hidden'); setTimeout(() => b.remove(), 400); };
  b.querySelector('button').addEventListener('click', hide);
  if (timeout) setTimeout(hide, timeout);
  return b;
}

export function renderError(container, err) {
  console.error(err);
  container.innerHTML = `<div class="notice" role="alert"><p><strong>Konten belum bisa dimuat.</strong></p><p class="muted">${esc(err.message || String(err))}</p></div>`;
}

async function boot() {
  const header = $('.site-header');
  initNav(header);
  initHeaderScroll(header);
  renderIcons();

  let settings; let social = [];
  try {
    [settings, social] = await Promise.all([loadSettings(), loadSocial().catch(() => [])]);
  } catch (err) {
    document.documentElement.classList.add('is-ready');
    const main = $('main');
    if (main) renderError(main, err);
    return;
  }

  applyTheme(settings);
  setAnimationsEnabled(settings.animation?.enabled);
  applyMeta(settings);
  fillSiteFields(settings);
  renderFooter(settings, social);
  const allowed = applyVisibility(settings);
  renderIcons();
  initPageTransitions();

  if (isDemo) showBanner('Mode demo — Supabase belum dikonfigurasi, menampilkan konten contoh. Lihat README untuk setup.', 'info');
  if (isPreview) showBanner('Mode pratinjau — menampilkan juga konten draf (hanya terlihat bila Anda login sebagai admin).', 'warn', { timeout: 0 });

  if (allowed) {
    const mod = await (PAGES[page]?.() ?? Promise.resolve(null)).catch((e) => { console.error(e); return null; });
    await mod?.init?.({ settings, social });
  }
  renderIcons();
  initReveal();
  window.__siteReady = true;
}

boot();
