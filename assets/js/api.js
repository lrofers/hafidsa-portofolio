// Lapisan data situs publik. Membaca dari Supabase (RLS membatasi ke konten terbit) atau mode demo.
import { isConfigured, supabase, toImage } from './supabase.js';

export const isDemo = !isConfigured;
export const isPreview = new URLSearchParams(location.search).get('preview') === '1';

let demoPromise;
const demo = () => (demoPromise ??= import('./demo-data.js').then((m) => m.demoData));

function fail(error, what) {
  const e = new Error(`Gagal memuat ${what}: ${error.message || error}`);
  e.cause = error;
  throw e;
}

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/* ---------- normalisasi ---------- */

function normSettings(row) {
  return {
    ...row,
    logo: toImage(row.logo),
    favicon: toImage(row.favicon),
    og: toImage(row.og),
    profile: toImage(row.profile),
  };
}

function normSoftware(row) {
  const { icon_media, ...rest } = row;
  return { ...rest, icon_media: icon_media || null };
}

function normProject(row) {
  return {
    ...row,
    thumbnail: toImage(row.thumbnail),
    cover: toImage(row.cover),
    images: (row.images || [])
      .slice().sort(byOrder)
      .map((i) => ({ ...toImage(i.media), caption: i.caption || '' }))
      .filter((i) => i.url),
    software: (row.software || []).map((x) => x.software).filter(Boolean).map(normSoftware),
  };
}

function normArtwork(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    year: row.year,
    room: row.room,
    wall: row.wall,
    frame_style: row.frame_style,
    status: row.status,
    sort_order: row.sort_order,
    image: toImage(row.media),
    project: row.project || null,
  };
}

/* ---------- loader ---------- */

const SETTINGS_SELECT = `*,
  logo:media_assets!site_settings_logo_media_id_fkey(*),
  favicon:media_assets!site_settings_favicon_media_id_fkey(*),
  og:media_assets!site_settings_og_media_id_fkey(*),
  profile:media_assets!site_settings_profile_media_id_fkey(*)`;

let settingsPromise;
export function loadSettings() {
  settingsPromise ??= (async () => {
    if (isDemo) return (await demo()).settings;
    const { data, error } = await supabase.from('site_settings').select(SETTINGS_SELECT).eq('id', 1).maybeSingle();
    if (error) fail(error, 'pengaturan situs');
    if (!data) throw new Error('Baris site_settings belum ada. Jalankan database/seed.sql (atau INSERT INTO site_settings (id) VALUES (1)).');
    return normSettings(data);
  })();
  return settingsPromise;
}

export async function loadSocial() {
  if (isDemo) return (await demo()).social;
  const { data, error } = await supabase.from('social_links').select('*').eq('is_visible', true).order('sort_order');
  if (error) fail(error, 'social media');
  return data;
}

const PROJECT_SELECT = `*,
  thumbnail:media_assets!projects_thumbnail_media_id_fkey(*),
  cover:media_assets!projects_cover_media_id_fkey(*),
  images:project_images(id, caption, sort_order, media:media_assets(*)),
  software:project_software(software:software_tools(*, icon_media:media_assets(*)))`;

export async function loadProjects() {
  if (isDemo) return (await demo()).projects;
  let q = supabase.from('projects').select(PROJECT_SELECT).order('sort_order');
  if (!isPreview) q = q.eq('status', 'published');
  const { data, error } = await q;
  if (error) fail(error, 'proyek');
  return data.map(normProject);
}

export async function loadProject(slug) {
  if (isDemo) return (await demo()).projects.find((p) => p.slug === slug) || null;
  let q = supabase.from('projects').select(PROJECT_SELECT).eq('slug', slug);
  if (!isPreview) q = q.eq('status', 'published');
  const { data, error } = await q.maybeSingle();
  if (error) fail(error, 'proyek');
  return data ? normProject(data) : null;
}

export async function loadArtworks() {
  if (isDemo) return (await demo()).artworks;
  let q = supabase
    .from('gallery_artworks')
    .select('*, media:media_assets(*), project:projects(slug,title)')
    .order('room').order('sort_order');
  if (!isPreview) q = q.eq('status', 'published');
  const { data, error } = await q;
  if (error) fail(error, 'galeri');
  return data.map(normArtwork);
}

export async function loadSkills() {
  if (isDemo) return (await demo()).skills;
  const { data, error } = await supabase.from('skills').select('*').eq('is_visible', true).order('sort_order');
  if (error) fail(error, 'keahlian');
  return data;
}

export async function loadSoftware() {
  if (isDemo) return (await demo()).software;
  const { data, error } = await supabase
    .from('software_tools').select('*, icon_media:media_assets(*)').eq('is_visible', true).order('sort_order');
  if (error) fail(error, 'software');
  return data.map(normSoftware);
}

export async function loadExperiences() {
  if (isDemo) return (await demo()).experiences;
  const { data, error } = await supabase.from('experiences').select('*').eq('is_visible', true).order('sort_order');
  if (error) fail(error, 'pengalaman');
  return data;
}

export async function loadEducation() {
  if (isDemo) return (await demo()).education;
  const { data, error } = await supabase.from('education').select('*').eq('is_visible', true).order('sort_order');
  if (error) fail(error, 'pendidikan');
  return data;
}

/* ---------- formulir kontak ---------- */

export class ContactError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Kirim pesan. Utama: endpoint server Express (/api/contact, rate-limit per IP + honeypot + waktu minimum).
 * Cadangan untuk hosting statis: RPC `submit_contact_message` (validasi + throttle di dalam database).
 */
export async function sendContact(payload) {
  let res = null;
  try {
    res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* server tidak tersedia -> coba RPC */ }

  const isApi = res && (res.headers.get('content-type') || '').includes('application/json');
  if (isApi) {
    const body = await res.json().catch(() => ({}));
    if (res.ok) return true;
    if (res.status === 429) throw new ContactError('rate_limited', 'Terlalu banyak pesan. Coba lagi nanti.');
    if (res.status === 400 || res.status === 422) throw new ContactError('invalid', body.error || 'Data tidak valid.');
    // 404/503 = endpoint tidak ada / server belum dikonfigurasi -> coba jalur database langsung
    if (res.status !== 404 && res.status !== 503) throw new ContactError('server', body.error || 'Server gagal memproses pesan.');
  }

  if (!supabase) throw new ContactError('unavailable', 'Formulir belum aktif (server/Supabase belum dikonfigurasi).');
  const { error } = await supabase.rpc('submit_contact_message', {
    p_name: payload.name, p_email: payload.email, p_subject: payload.subject || '',
    p_message: payload.message, p_website: payload.website || '',
  });
  if (error) {
    if (/rate_limited/.test(error.message)) throw new ContactError('rate_limited', 'Terlalu banyak pesan. Coba lagi nanti.');
    if (/invalid_input/.test(error.message)) throw new ContactError('invalid', 'Data tidak valid.');
    throw new ContactError('server', 'Pesan gagal dikirim. Coba lagi nanti.');
  }
  return true;
}
