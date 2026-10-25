// Autentikasi admin (Supabase Auth): login, lupa/reset kata sandi, penjaga halaman, logout.
// Peran admin TIDAK ditentukan di browser: fungsi database is_admin() + RLS yang memutuskan.
import { supabase, isConfigured } from '../supabase.js';
import { esc } from '../utils.js';
import { renderIcons } from '../icons.js';
import { humanError } from './core.js';

const LOGIN = '/admin/login.html';

/** Tujuan redirect setelah login — hanya path internal admin (cegah open redirect). */
function safeNext(raw) {
  try {
    const u = new URL(raw || '/admin/', location.origin);
    if (u.origin === location.origin && u.pathname.startsWith('/admin/') && !u.pathname.startsWith(LOGIN)) return u.pathname + u.search + u.hash;
  } catch { /* abaikan */ }
  return '/admin/';
}

async function checkAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

function gate(html) {
  document.body.classList.add('is-ready');
  document.body.innerHTML = `<div class="gate"><div class="card"><div class="card__body" style="display:grid;gap:14px">${html}</div></div></div>`;
  renderIcons();
}

export function setupRequiredHTML() {
  return `<h1 style="font-family:var(--a-serif);font-size:2rem">Supabase belum dikonfigurasi</h1>
    <p>Panel admin membutuhkan koneksi ke Supabase. Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code>, jalankan <code>database/schema.sql</code> di SQL Editor, lalu muat ulang halaman ini.</p>
    <p class="muted">Panduan lengkap ada di README.md, bagian “Setup Supabase”.</p>
    <p><a class="btn" href="/">Kembali ke situs</a></p>`;
}

/**
 * Pastikan pengunjung login DAN berperan admin. Bila tidak: arahkan ke login atau tampilkan pesan.
 * @returns {Promise<{session, user}|null>}
 */
export async function requireAdmin() {
  if (!isConfigured) { gate(setupRequiredHTML()); return null; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace(`${LOGIN}?next=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }
  // getUser() memverifikasi token ke server (sesi lokal bisa saja sudah dicabut)
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    location.replace(`${LOGIN}?next=${encodeURIComponent(location.pathname + location.search)}&expired=1`);
    return null;
  }
  let admin = false;
  try { admin = await checkAdmin(); } catch (err) {
    gate(`<h1 style="font-family:var(--a-serif);font-size:2rem">Tidak dapat memeriksa akses</h1><p class="notice-box notice-box--error">${esc(humanError(err))}</p><p class="muted">Pastikan <code>database/schema.sql</code> sudah dijalankan di Supabase.</p><p><button class="btn" type="button" data-reload>Coba lagi</button></p>`);
    document.querySelector('[data-reload]').addEventListener('click', () => location.reload());
    return null;
  }
  if (!admin) {
    gate(`<h1 style="font-family:var(--a-serif);font-size:2rem">Akses ditolak</h1>
      <p>Akun <strong>${esc(user.email)}</strong> tidak memiliki peran administrator.</p>
      <p class="muted">Administrator pertama dibuat lewat <code>npm run create-admin</code> atau fungsi SQL <code>bootstrap_first_admin()</code> (lihat README).</p>
      <p><button class="btn btn--primary" type="button" data-logout><i data-lucide="log-out"></i>Keluar</button></p>`);
    document.querySelector('[data-logout]').addEventListener('click', () => signOut());
    return null;
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace(LOGIN);
  });
  return { session, user };
}

export async function signOut() {
  await supabase.auth.signOut().catch(() => supabase.auth.signOut({ scope: 'local' }));
  location.replace(LOGIN);
}

/* ------------------------------ halaman login ------------------------------ */

export async function initLogin() {
  document.body.classList.add('is-ready');
  const panel = document.querySelector('#login-panel');
  if (!isConfigured) { panel.innerHTML = setupRequiredHTML(); return; }

  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get('next'));
  const form = document.querySelector('#login-form');
  const msg = document.querySelector('#login-msg');
  const show = (text, kind = 'error') => {
    msg.className = `notice-box notice-box--${kind}`;
    msg.textContent = text;
    msg.hidden = false;
  };
  if (params.get('expired')) show('Sesi Anda berakhir. Silakan login kembali.', 'warn');

  // Tautan pemulihan dari email -> tampilkan formulir kata sandi baru
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showResetForm();
  });

  // Sudah login sebagai admin? langsung masuk.
  const { data: { session } } = await supabase.auth.getSession();
  if (session && !location.hash.includes('type=recovery')) {
    try { if (await checkAdmin()) { location.replace(next); return; } } catch { /* tampilkan form */ }
  }

  const toggle = form.querySelector('[data-toggle-pw]');
  toggle.addEventListener('click', () => {
    const pw = form.elements.password;
    const visible = pw.type === 'text';
    pw.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi');
    toggle.innerHTML = `<i data-lucide="${visible ? 'eye' : 'eye-off'}"></i>`;
    renderIcons(toggle);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) { show('Email dan kata sandi wajib diisi.'); return; }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/invalid login credentials|invalid_credentials/i.test(error.message + error.code)) throw new Error('Email atau kata sandi salah.');
        if (/email not confirmed/i.test(error.message)) throw new Error('Email belum dikonfirmasi. Cek kotak masuk Anda.');
        if (error.status === 429) throw new Error('Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.');
        throw error;
      }
      if (!(await checkAdmin())) {
        await supabase.auth.signOut();
        throw new Error('Login berhasil, tetapi akun ini bukan administrator.');
      }
      location.replace(next);
    } catch (err) {
      show(humanError(err));
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  });

  document.querySelector('#forgot').addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) { show('Isi email Anda terlebih dahulu, lalu klik “Lupa kata sandi?”.', 'warn'); form.elements.email.focus(); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${LOGIN}` });
    if (error) show(humanError(error));
    else show('Jika email terdaftar, tautan untuk mengatur ulang kata sandi telah dikirim.', 'warn');
  });

  function showResetForm() {
    panel.innerHTML = `<div><p class="small muted" style="letter-spacing:.16em;text-transform:uppercase">Atur ulang</p><h1>Kata sandi baru</h1></div>
      <form id="reset-form" novalidate>
        <div class="field"><label for="np">Kata sandi baru</label><input class="input" id="np" name="password" type="password" minlength="10" autocomplete="new-password" required></div>
        <div class="field"><label for="np2">Ulangi kata sandi</label><input class="input" id="np2" name="password2" type="password" minlength="10" autocomplete="new-password" required></div>
        <p id="reset-msg" hidden></p>
        <button class="btn btn--primary" type="submit">Simpan kata sandi</button>
      </form>`;
    const rf = panel.querySelector('#reset-form');
    const rm = panel.querySelector('#reset-msg');
    rf.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p1 = rf.elements.password.value; const p2 = rf.elements.password2.value;
      const fail = (t) => { rm.className = 'notice-box notice-box--error'; rm.textContent = t; rm.hidden = false; };
      if (p1.length < 10) return fail('Kata sandi minimal 10 karakter.');
      if (p1 !== p2) return fail('Kedua kata sandi tidak sama.');
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) return fail(humanError(error));
      location.replace('/admin/');
    });
  }
}
