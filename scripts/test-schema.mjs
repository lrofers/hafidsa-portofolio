// Menguji database/schema.sql + seed.sql pada PostgreSQL (PGlite/WASM) dengan stub skema Supabase.
// Memverifikasi: sintaks, idempotensi, RLS (anon / user biasa / admin), bootstrap admin, RPC kontak, view pemakaian media.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = (f) => readFileSync(join(root, 'database', f), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
};

// ---- stub lingkungan Supabase ----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
`);

console.log('1) Skema & seed');
try {
  await db.exec(sql('schema.sql'));
  await db.exec(sql('schema.sql'));
  ok('schema.sql dijalankan 2x tanpa error (idempotent)', true);
} catch (e) { ok('schema.sql', false, e.message); process.exit(1); }
try {
  await db.exec(sql('seed.sql'));
  await db.exec(sql('seed.sql'));
  ok('seed.sql dijalankan 2x tanpa error', true);
} catch (e) { ok('seed.sql', false, e.message); process.exit(1); }

await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
               grant select, insert, update, delete on all tables in schema storage to anon, authenticated;
               grant execute on all functions in schema public to anon, authenticated;`);
// bootstrap_first_admin harus tetap tidak bisa dieksekusi publik (grant di atas hanya simulasi default Supabase)
await db.exec(`revoke execute on function public.bootstrap_first_admin(text) from anon, authenticated, public;`);

const as = async (role, uid, query, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return { rows: (await db.query(query, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

console.log('2) Akun & admin pertama');
const { rows: [u1] } = await db.query(`insert into auth.users (email) values ('admin@example.com') returning id`);
const { rows: [u2] } = await db.query(`insert into auth.users (email) values ('visitor@example.com') returning id`);
let r = await db.query(`select role from public.profiles where id = $1`, [u1.id]);
ok('trigger membuat profil role=user (bukan admin)', r.rows[0]?.role === 'user');
r = await as('anon', null, `select public.bootstrap_first_admin('admin@example.com')`);
ok('anon TIDAK boleh memanggil bootstrap_first_admin', !!r.error);
r = await as('authenticated', u2.id, `select public.bootstrap_first_admin('visitor@example.com')`);
ok('user biasa TIDAK boleh memanggil bootstrap_first_admin', !!r.error);
r = await db.query(`select public.bootstrap_first_admin('admin@example.com') as m`);
ok('bootstrap_first_admin (postgres) berhasil', /OK/.test(r.rows[0].m));
r = await db.query(`select public.bootstrap_first_admin('visitor@example.com')`).catch((e) => ({ error: e.message }));
ok('bootstrap_first_admin kedua kali ditolak', !!r.error);

console.log('3) RLS — anon');
r = await as('anon', null, `select count(*)::int n from public.projects`);
ok('anon membaca proyek terbit', r.rows?.[0].n === 6, JSON.stringify(r));
await db.exec(`update public.projects set status='draft' where slug='contoh-proyek-enam'`);
r = await as('anon', null, `select count(*)::int n from public.projects`);
ok('anon TIDAK melihat draft', r.rows?.[0].n === 5, JSON.stringify(r));
r = await as('anon', null, `insert into public.projects (slug,title) values ('hack','hack')`);
ok('anon TIDAK bisa insert proyek', !!r.error);
r = await as('anon', null, `update public.site_settings set owner_name='hacked' returning 1`);
ok('anon TIDAK bisa update settings', !r.error && r.rows.length === 0);
r = await as('anon', null, `delete from public.gallery_artworks returning 1`);
ok('anon TIDAK bisa delete karya', !r.error && r.rows.length === 0);
r = await as('anon', null, `select count(*)::int n from public.software_tools`);
ok('anon tidak melihat software tersembunyi', r.rows?.[0].n === 0);
r = await as('anon', null, `select * from public.contact_messages`);
ok('anon TIDAK bisa membaca pesan kontak (RLS tanpa policy)', !!r.error || r.rows.length === 0);
r = await as('anon', null, `insert into public.contact_messages (name,email,message) values ('a','a@b.co','halo halo')`);
ok('anon TIDAK bisa insert langsung ke contact_messages', !!r.error);
r = await as('anon', null, `select count(*)::int n from public.project_images`);
ok('anon membaca gambar proyek terbit', r.rows?.[0].n === 3);

console.log('4) RLS — user biasa (login, bukan admin)');
r = await as('authenticated', u2.id, `insert into public.projects (slug,title) values ('x','x')`);
ok('user biasa TIDAK bisa insert proyek', !!r.error);
r = await as('authenticated', u2.id, `update public.profiles set role='admin' where id='${u2.id}' returning 1`);
ok('user biasa TIDAK bisa menaikkan role sendiri', !r.error && r.rows.length === 0);
r = await as('authenticated', u2.id, `select count(*)::int n from public.profiles`);
ok('user biasa hanya melihat profil sendiri', r.rows?.[0].n === 1);
r = await as('authenticated', u2.id, `insert into storage.objects (bucket_id, name) values ('portfolio','x.jpg')`);
ok('user biasa TIDAK bisa upload ke bucket', !!r.error);

console.log('5) RLS — admin');
r = await as('authenticated', u1.id, `select count(*)::int n from public.projects`);
ok('admin melihat semua proyek termasuk draft', r.rows?.[0].n === 6, JSON.stringify(r));
r = await as('authenticated', u1.id, `insert into public.projects (slug,title,status) values ('baru','Baru','draft') returning id`);
ok('admin bisa insert proyek', !r.error && r.rows.length === 1, r.error);
r = await as('authenticated', u1.id, `update public.site_settings set owner_name='Admin Test' returning owner_name`);
ok('admin bisa update settings', r.rows?.[0]?.owner_name === 'Admin Test', r.error);
r = await as('authenticated', u1.id, `insert into storage.objects (bucket_id, name) values ('portfolio','ok.jpg') returning 1`);
ok('admin bisa upload ke bucket portfolio', !r.error && r.rows.length === 1, r.error);
r = await as('authenticated', u1.id, `insert into storage.objects (bucket_id, name) values ('lain','ok.jpg')`);
ok('admin tidak bisa menulis ke bucket lain', !!r.error);
r = await as('authenticated', u1.id, `select count(*)::int n from public.software_tools`);
ok('admin melihat software tersembunyi', r.rows?.[0].n === 12);

console.log('6) Constraint');
r = await as('authenticated', u1.id, `insert into public.projects (slug,title) values ('Slug Salah','x')`);
ok('slug tidak valid ditolak', !!r.error);
r = await as('authenticated', u1.id, `insert into public.projects (slug,title,external_url) values ('xss','x','javascript:alert(1)')`);
ok('external_url non-http ditolak', !!r.error);
r = await as('authenticated', u1.id, `insert into public.software_tools (name,icon_source) values ('Tanpa slug','devicon')`);
ok('software tanpa icon_slug ditolak', !!r.error);
r = await as('authenticated', u1.id, `delete from public.media_assets where id='10000000-0000-4000-8000-000000000001'`);
ok('hapus media yang dipakai ditolak (FK RESTRICT)', !!r.error);
r = await as('authenticated', u1.id, `select usage_count from public.media_usage where media_id='10000000-0000-4000-8000-000000000001'`);
ok('media_usage menghitung pemakaian', r.rows?.[0]?.usage_count >= 2, JSON.stringify(r));
await db.exec(`insert into public.media_assets (id, path) values ('10000000-0000-4000-8000-0000000000ff','x/free.jpg')`);
r = await as('authenticated', u1.id, `select usage_count from public.media_usage where media_id='10000000-0000-4000-8000-0000000000ff'`);
ok('media_usage = 0 untuk file tidak terpakai', r.rows?.[0]?.usage_count === 0);
r = await as('authenticated', u1.id, `delete from public.media_assets where id='10000000-0000-4000-8000-0000000000ff' returning 1`);
ok('media tidak terpakai bisa dihapus', r.rows?.length === 1);

console.log('7) Formulir kontak (RPC)');
r = await as('anon', null, `select public.submit_contact_message('Budi','budi@example.com','Halo','Pesan uji coba yang valid','')`);
ok('anon dapat mengirim pesan via RPC', !r.error, r.error);
r = await as('anon', null, `select public.submit_contact_message('Bot','bot@example.com','','spam spam spam','http://spam')`);
ok('honeypot diabaikan diam-diam', !r.error);
r = await db.query(`select count(*)::int n from public.contact_messages`);
ok('hanya 1 pesan tersimpan (honeypot tidak masuk)', r.rows[0].n === 1, r.rows[0].n);
r = await as('anon', null, `select public.submit_contact_message('x','bukan-email','','pesan cukup panjang','')`);
ok('email tidak valid ditolak', !!r.error);
for (let i = 0; i < 2; i++) await as('anon', null, `select public.submit_contact_message('Budi','budi@example.com','','pesan ke-${i + 2} valid','')`);
r = await as('anon', null, `select public.submit_contact_message('Budi','budi@example.com','','pesan ke-4 harus ditolak','')`);
ok('rate limit: pesan ke-4 per jam ditolak', /rate_limited/.test(r.error ?? ''), r.error);
r = await as('authenticated', u1.id, `select count(*)::int n from public.contact_messages`);
ok('admin dapat membaca pesan', r.rows?.[0].n === 3);

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
