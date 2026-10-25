#!/usr/bin/env node
// Membuat administrator PERTAMA secara aman (dijalankan oleh pemilik situs di komputer/servernya sendiri).
//
//   npm run create-admin -- --email anda@contoh.com
//   npm run create-admin -- --email anda@contoh.com --password "kata-sandi-panjang"
//
// Membutuhkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env (kunci rahasia; jangan pernah ke browser).
// Langkah: buat/temukan akun di Supabase Auth (email langsung terkonfirmasi) -> panggil fungsi database
// bootstrap_first_admin(), yang MENOLAK bila sudah ada admin. Tidak ada pendaftaran admin terbuka.
import 'dotenv/config';
import crypto from 'node:crypto';
import readline from 'node:readline';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!url || !key) fail('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env (lihat .env.example).');
const email = (arg('email') || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('Gunakan: npm run create-admin -- --email anda@contoh.com');

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || text || res.statusText;
    const err = new Error(`${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = rl._writeToOutput.bind(rl);
      rl._writeToOutput = (s) => write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, '•'));
    }
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function findUser(target) {
  for (let page = 1; page <= 50; page++) {
    const data = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`\nSupabase: ${url}\nEmail admin: ${email}\n`);
  let user = await findUser(email);
  let generated = null;

  if (user) {
    console.log('• Akun sudah ada di Supabase Auth — akan dijadikan admin (kata sandi tidak diubah).');
  } else {
    let password = arg('password');
    if (!password && process.stdin.isTTY) {
      password = await ask('Kata sandi baru (min. 10 karakter): ', { hidden: true });
      const again = await ask('Ulangi kata sandi: ', { hidden: true });
      if (password !== again) fail('Kedua kata sandi tidak sama.');
    }
    if (!password) { generated = crypto.randomBytes(18).toString('base64url'); password = generated; }
    if (password.length < 10) fail('Kata sandi minimal 10 karakter.');
    user = await api('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true } });
    user = user?.user || user;
    console.log('• Akun dibuat dan email ditandai terkonfirmasi.');
  }

  try {
    const result = await api('/rest/v1/rpc/bootstrap_first_admin', { method: 'POST', body: { admin_email: email } });
    console.log(`• ${result}`);
  } catch (err) {
    if (/sudah ada/i.test(err.message)) {
      fail(`Administrator sudah ada, jadi bootstrap ditolak (sesuai desain).
  Untuk menambah admin lain, jalankan di Supabase SQL Editor sebagai pemilik proyek:
    update public.profiles set role = 'admin'
    where id = (select id from auth.users where lower(email) = lower('${email}'));`);
    }
    if (err.status === 404) fail('Fungsi bootstrap_first_admin tidak ditemukan. Jalankan database/schema.sql di SQL Editor terlebih dahulu.');
    throw err;
  }

  if (generated) console.log(`\n  Kata sandi sementara (tampil sekali, simpan sekarang):  ${generated}\n  Segera ganti lewat Admin › Pengaturan › Akun admin.`);
  console.log('\n✔ Selesai. Login di /admin/login.html\n');
}

main().catch((err) => fail(err.message));
