// Logo software (Devicon / Simple Icons / unggahan kustom) + ikon antarmuka Lucide.
import { createIcons, Menu, X, ArrowUpRight, ArrowRight, ArrowLeft, ArrowDown, ChevronLeft, ChevronRight, ExternalLink,
  Mail, MapPin, Phone, Send, Check, AlertTriangle, Info, Image as ImageIcon, Plus, Pencil, Trash2, Copy, Eye, EyeOff,
  GripVertical, ArrowUp, Upload, Search, LogOut, LayoutDashboard, FolderKanban, Frame, Wrench, User, Settings,
  Images, Save, RefreshCw, Link as LinkIcon, Play, Inbox, Globe, Palette, Film, Replace, FileImage, Layers,
  Star, Monitor, Tablet, Smartphone, Archive, Reply, KeyRound, LogIn, MailOpen, CircleCheck, CircleAlert, LayoutGrid } from 'lucide';
import { esc, safeUrl } from './utils.js';
import { toImage } from './supabase.js';

const ICONS = {
  Menu, X, ArrowUpRight, ArrowRight, ArrowLeft, ArrowDown, ChevronLeft, ChevronRight, ExternalLink, Mail, MapPin, Phone,
  Send, Check, AlertTriangle, Info, Image: ImageIcon, Plus, Pencil, Trash2, Copy, Eye, EyeOff, GripVertical, ArrowUp,
  Upload, Search, LogOut, LayoutDashboard, FolderKanban, Frame, Wrench, User, Settings, Images, Save, RefreshCw,
  Link: LinkIcon, Play, Inbox, Globe, Palette, Film, Replace, FileImage, Layers,
  Star, Monitor, Tablet, Smartphone, Archive, Reply, KeyRound, LogIn, MailOpen, CircleCheck, CircleAlert, LayoutGrid,
};

/** Render semua <i data-lucide="nama"> di dalam root menjadi SVG. */
export function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'aria-hidden': 'true', focusable: 'false' } });
}

// Versi dipatok agar logo tidak berubah tiba-tiba. Simple Icons >=v16 tidak lagi memuat logo Adobe,
// karena itu logo Adobe memakai Devicon.
const DEVICON_BASE = 'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0/icons';
const SIMPLEICONS_BASE = 'https://cdn.simpleicons.org';

/** URL logo untuk satu baris software_tools (atau null bila belum ada). */
export function softwareIconUrl(tool) {
  if (!tool) return null;
  if (tool.icon_source === 'custom') return tool.icon_media ? toImage(tool.icon_media)?.url : null;
  const slug = String(tool.icon_slug || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(slug)) return null;
  if (tool.icon_source === 'simpleicons') return `${SIMPLEICONS_BASE}/${slug}`;
  const variant = tool.icon_variant || 'original';
  return `${DEVICON_BASE}/${slug}/${slug}-${variant}.svg`;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * HTML logo software: ukuran konsisten (CSS .sw-logo), proporsi dijaga (object-fit: contain),
 * dan fallback monogram bila gambar gagal dimuat (ditangani oleh bindIconFallbacks()).
 */
export function softwareLogoHTML(tool, { showName = true, link = true } = {}) {
  const src = softwareIconUrl(tool);
  const name = esc(tool.name);
  const tip = esc(tool.description ? `${tool.name} — ${tool.description}` : tool.name);
  const mono = `<span class="sw-logo__fallback" ${src ? 'hidden' : ''} aria-hidden="true">${esc(initials(tool.name))}</span>`;
  const img = src
    ? `<img src="${esc(src)}" alt="" width="40" height="40" loading="lazy" decoding="async" data-icon-img>`
    : '';
  const inner = `<span class="sw-logo__mark">${img}${mono}</span>${showName ? `<span class="sw-logo__name">${name}</span>` : ''}`;
  const url = link ? safeUrl(tool.website_url) : '';
  return url
    ? `<a class="sw-logo" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${tip}" aria-label="${name}">${inner}</a>`
    : `<span class="sw-logo" title="${tip}" role="img" aria-label="${name}">${inner}</span>`;
}

/** Pasang fallback onerror (CSP-friendly: tanpa atribut inline). Panggil setelah innerHTML diisi. */
export function bindIconFallbacks(root = document) {
  root.querySelectorAll('img[data-icon-img]').forEach((img) => {
    if (img.dataset.bound) return;
    img.dataset.bound = '1';
    const fail = () => {
      img.hidden = true;
      const fb = img.parentElement?.querySelector('.sw-logo__fallback');
      if (fb) fb.hidden = false;
    };
    img.addEventListener('error', fail, { once: true });
    if (img.complete && img.naturalWidth === 0 && img.src) fail();
  });
}

/** Katalog preset untuk "tambah cepat" di admin. */
export const SOFTWARE_PRESETS = [
  { name: 'Adobe Photoshop', category: 'Desain & Foto', icon_source: 'devicon', icon_slug: 'photoshop' },
  { name: 'Adobe Illustrator', category: 'Desain & Foto', icon_source: 'devicon', icon_slug: 'illustrator' },
  { name: 'Adobe Lightroom', category: 'Desain & Foto', icon_source: 'devicon', icon_slug: 'lightroom' },
  { name: 'Adobe InDesign', category: 'Desain & Foto', icon_source: 'devicon', icon_slug: 'indesign' },
  { name: 'Adobe Premiere Pro', category: 'Video & Motion', icon_source: 'devicon', icon_slug: 'premierepro' },
  { name: 'Adobe After Effects', category: 'Video & Motion', icon_source: 'devicon', icon_slug: 'aftereffects' },
  { name: 'DaVinci Resolve', category: 'Video & Motion', icon_source: 'simpleicons', icon_slug: 'davinciresolve' },
  { name: 'Figma', category: 'Desain & Foto', icon_source: 'devicon', icon_slug: 'figma' },
  { name: 'Blender', category: '3D', icon_source: 'devicon', icon_slug: 'blender' },
  { name: 'Visual Studio Code', category: 'Web', icon_source: 'devicon', icon_slug: 'vscode' },
  { name: 'HTML5', category: 'Web', icon_source: 'devicon', icon_slug: 'html5' },
  { name: 'CSS3', category: 'Web', icon_source: 'devicon', icon_slug: 'css3' },
  { name: 'JavaScript', category: 'Web', icon_source: 'devicon', icon_slug: 'javascript' },
  { name: 'Three.js', category: 'Web', icon_source: 'devicon', icon_slug: 'threejs' },
  { name: 'Git', category: 'Web', icon_source: 'devicon', icon_slug: 'git' },
  { name: 'Notion', category: 'Produktivitas', icon_source: 'simpleicons', icon_slug: 'notion' },
];
