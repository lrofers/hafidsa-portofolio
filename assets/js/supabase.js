// Klien Supabase (hanya memakai kunci publishable/anon — keamanan ditegakkan oleh RLS di database).
import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const BUCKET = 'portfolio';

/** true bila variabel lingkungan Supabase sudah diisi dengan nilai nyata. */
export const isConfigured = /^https?:\/\/.+/.test(url) && key.length > 20 && !/YOUR[_-]/i.test(url + key);

export const supabase = isConfigured
  ? createClient(url, key, {
      // detectSessionInUrl hanya di halaman login admin (tautan pemulihan kata sandi dari email)
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: location.pathname.startsWith('/admin/login') },
    })
  : null;

export const supabaseUrl = url;
export const supabaseKey = key;

/** URL publik objek Storage. */
export function storageUrl(path, bucket = BUCKET) {
  if (!path) return '';
  return `${url}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Ubah baris media_assets menjadi objek gambar siap pakai.
 * `thumb` dipakai untuk grid & perangkat ringan; `url` untuk tampilan penuh.
 */
export function toImage(media) {
  if (!media) return null;
  const full = media.external_url || storageUrl(media.path, media.bucket);
  const thumb = media.thumb_path ? storageUrl(media.thumb_path, media.bucket) : full;
  const bust = media.updated_at ? `?v=${new Date(media.updated_at).getTime()}` : '';
  return {
    id: media.id,
    url: media.external_url ? full : full + bust,
    thumbUrl: media.external_url ? thumb : thumb + bust,
    alt: media.alt_text || media.title || '',
    width: media.width || null,
    height: media.height || null,
  };
}
