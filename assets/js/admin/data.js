// Akses data admin ke Supabase (semua operasi dilindungi RLS: hanya role admin yang bisa menulis).
import { supabase } from '../supabase.js';
import { unwrap } from './core.js';

export { supabase };

export async function list(table, { select = '*', order = 'sort_order', ascending = true, then } = {}) {
  let q = supabase.from(table).select(select);
  if (order) q = q.order(order, { ascending });
  if (then) q = q.order(then, { ascending: true });
  return unwrap(await q);
}

export async function getOne(table, id, select = '*') {
  return unwrap(await supabase.from(table).select(select).eq('id', id).single());
}

export async function insertRow(table, row, select = '*') {
  return unwrap(await supabase.from(table).insert(row).select(select).single());
}

/** Update satu baris. `.single()` memastikan error bila baris tidak ada / ditolak RLS (0 baris). */
export async function updateRow(table, id, patch, select = '*') {
  return unwrap(await supabase.from(table).update(patch).eq('id', id).select(select).single());
}

export async function deleteRow(table, id) {
  const rows = unwrap(await supabase.from(table).delete().eq('id', id).select('id'));
  if (!rows.length) {
    const e = new Error('Data tidak ditemukan atau Anda tidak punya akses.');
    e.code = 'PGRST116';
    throw e;
  }
  return true;
}

/** Simpan urutan baru: sort_order = 10, 20, 30 … sesuai urutan id. */
export async function saveOrder(table, ids) {
  const results = await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: (i + 1) * 10 }).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

export async function nextSortOrder(table, filter) {
  let q = supabase.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  if (filter) q = filter(q);
  const rows = unwrap(await q);
  return (rows[0]?.sort_order ?? 0) + 10;
}

export async function getSettings() {
  return unwrap(await supabase.from('site_settings').select('*').eq('id', 1).single());
}

export async function saveSettings(patch) {
  return unwrap(await supabase.from('site_settings').update(patch).eq('id', 1).select('*').single());
}

export async function count(table, filter) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}
