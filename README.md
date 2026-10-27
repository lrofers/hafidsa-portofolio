# Portofolio Galeri 3D Imersif + Panel Admin

Website portofolio pribadi berbentuk **galeri seni digital 3D**: pengunjung “berjalan” melewati foyer dan ruang-ruang pameran berdinding putih hangat. Kamera bergerak mengikuti scroll, karya berbingkai tergantung di dinding dengan lampu sorot dan bayangan lembut, lalu situs berlanjut ke halaman proyek bergaya editorial. Seluruh konten dikelola lewat **panel admin** yang terhubung ke Supabase (PostgreSQL, Auth, Storage).

> Terinspirasi dari pengalaman visual *Dawson Wells Gallery* sebagai acuan suasana. Tidak ada identitas, kode, maupun aset dari situs tersebut yang disalin. Semua gambar demo (`public/demo/`) adalah karya abstrak orisinal yang dihasilkan skrip `scripts/generate-demo-art.mjs`.

---

## Daftar isi

1. [Fitur](#fitur)
2. [Arsitektur & teknologi](#arsitektur--teknologi)
3. [Struktur proyek](#struktur-proyek)
4. [Menjalankan secara lokal](#menjalankan-secara-lokal)
5. [Setup Supabase](#setup-supabase)
6. [Storage & Row Level Security](#storage--row-level-security)
7. [Membuat akun admin pertama](#membuat-akun-admin-pertama)
8. [Deployment](#deployment)
9. [Mengganti konten dari admin](#mengganti-konten-dari-admin)
10. [Logo software](#logo-software)
11. [Pengujian](#pengujian)
12. [Keamanan](#keamanan)
13. [Performa, responsif, aksesibilitas](#performa-responsif-aksesibilitas)
14. [Pemecahan masalah](#pemecahan-masalah)

---

## Fitur

**Situs publik**
- **Beranda / galeri 3D** (Three.js): museum **melingkar**: koridor berbentuk cincin mengelilingi **aula patung** (panggung, lubang cahaya, patung malaikat), foyer dengan nama & kalimat pembuka di dinding melengkung, ruang-ruang pameran berurutan dengan ambang pintu dan bukaan ke aula, lantai kayu, strip lampu langit-langit, lampu rel, *spotlight* yang berpindah ke karya terdekat, bayangan lembut, partikel debu (desktop), bangku galeri, dan label museum di samping karya.
- **Kamera digerakkan scroll** (GSAP ScrollTrigger) dengan jeda di setiap karya, jalur yang selalu melewati tengah ambang pintu, transisi sinematik antar-ruang, caption karya, navigasi “lompat ke ruang”, tombol karya sebelumnya/berikutnya, dan indikator progres.
- **Klik karya** → modal detail (gambar besar, deskripsi, tautan ke proyek terkait), navigasi panah & keyboard.
- **Loading indicator**, penanganan **error WebGL** & *context lost*, serta **fallback HTML/CSS** (grid karya per ruang) bila WebGL tidak tersedia. three.js bahkan tidak diunduh pada perangkat tanpa WebGL.
- Proyek unggulan (layout asimetris), ringkasan Tentang, Keahlian & logo software, ajakan kontak.
- **Karya**: daftar proyek dari database + filter kategori (tersimpan di URL).
- **Detail proyek**: hero image besar, meta (kategori, tahun, peran, klien), deskripsi, galeri foto asimetris + lightbox, video demo opsional (YouTube/Vimeo/MP4), tautan eksternal, logo software, navigasi proyek sebelumnya/berikutnya.
- **Tentang**: foto profil, biografi, fokus kreatif, pengalaman, pendidikan, keahlian, software, informasi tambahan.
- **Kontak**: email, telepon, lokasi, ketersediaan, media sosial, formulir dengan validasi, status kirim, dan proteksi spam (honeypot, waktu minimum, rate limit per IP/email, throttle di database).
- Mode **demo** otomatis bila Supabase belum dikonfigurasi (situs tetap bisa dilihat).
- Mode **pratinjau** (`?preview=1`): admin melihat konten draf sebelum diterbitkan.

**Panel admin** (`/admin/`)
- Login Supabase Auth, lupa/atur ulang kata sandi, ganti kata sandi, logout. Hanya akun ber-*role* `admin` yang bisa masuk; pengecekan dilakukan oleh database.
- **Dashboard**: statistik nyata, aktivitas terbaru, pesan terbaru, daftar periksa konten contoh yang belum diganti.
- **Proyek**: tambah, edit, hapus, **duplikasi**, urutkan, terbitkan/draf, unggulan, thumbnail & gambar utama, **banyak foto** (urutan + keterangan), kategori, tahun, peran, klien, tautan, video, software, slug otomatis, peringatan perubahan belum disimpan.
- **Galeri 3D**: ruang (nama/subjudul), **denah otomatis**, karya per ruang & dinding (dalam/luar/ujung), urutan, bingkai (hitam/oak/putih/emas/tanpa), judul, deskripsi, tahun, tautan proyek, **ganti foto**, terbit/draf, **pratinjau galeri** (desktop/tablet/ponsel) sebelum diterbitkan.
- **Keahlian & Software**: CRUD, urutan, visibilitas, kategori, deskripsi, tingkat (opsional); **pemilih logo** dari katalog atau slug Devicon/Simple Icons dengan pratinjau langsung, atau upload logo kustom.
- **Tentang**: biografi, foto profil, fokus kreatif, informasi tambahan, pengalaman & pendidikan (CRUD + urutan + visibilitas).
- **Media**: upload banyak file (drag & drop) dengan **progres per file**, kompresi otomatis di browser (maks. 2400 px, WebP; metadata EXIF/GPS dibuang), thumbnail otomatis, pratinjau, **edit alt text**, **ganti gambar** (semua pemakaian ikut berganti), salin URL, info “dipakai di”, hapus aman (database menolak menghapus media yang masih dipakai), hapus massal file tidak terpakai.
- **Pesan**: kotak masuk formulir kontak (baru/dibaca/arsip), balas via email.
- **Pengaturan**: nama pemilik, logo, favicon, gambar OG, judul situs, deskripsi, hero, **warna tema** (dengan cek kontras WCAG), kontak, media sosial (CRUD + urutan), visibilitas halaman, pengaturan animasi.
- Nyaman dipakai dari **browser Android** (menu laci, target sentuh besar, dialog layar penuh).

---

## Arsitektur & teknologi

```
Browser ──► Situs statis (HTML/CSS/JS ES Modules, dibangun Vite)
   │            ├─ Three.js (galeri 3D), GSAP + ScrollTrigger, Lucide (ikon UI)
   │            └─ Devicon / Simple Icons via CDN (logo software)
   │
   ├──► Supabase (langsung dari browser, kunci publishable/anon + RLS)
   │        ├─ PostgreSQL  : konten, RLS, fungsi is_admin(), view media_usage
   │        ├─ Auth        : login admin
   │        └─ Storage     : bucket publik "portfolio" (tulis hanya admin)
   │
   └──► /api/contact  (opsional: server Node.js + Express)
            rate limit per IP & email, cek Origin, honeypot, service role di server
```

- **Frontend publik & admin**: HTML, CSS, dan JavaScript native (tanpa framework). Vite hanya dipakai untuk bundling, *code splitting*, dan *hash* aset.
- **Keamanan data** ditegakkan di **database** (Row Level Security), bukan di JavaScript — sehingga situs bisa di-host secara statis.
- **Formulir kontak** punya dua jalur: (1) server Express `/api/contact` bila tersedia, (2) fungsi database `submit_contact_message` (validasi + throttle) untuk hosting statis. Frontend memilih otomatis.

**Pilihan deployment** (keduanya didukung, konfigurasi tidak saling bertentangan):

| Target | Cocok untuk | Formulir kontak |
|---|---|---|
| **Cloudflare Pages / Netlify** (statis) — *disarankan* | gratis, cepat, tanpa server | fungsi database (RPC) |
| **Render / Railway / VPS** (Node.js persisten) | butuh endpoint server sendiri | Express `/api/contact` |

---

## Struktur proyek

```text
portfolio/
├── index.html                 Beranda + galeri 3D
├── projects.html              Daftar proyek + filter
├── project-detail.html        Detail proyek (?slug=…)
├── about.html                 Tentang
├── contact.html               Kontak + formulir
├── 404.html                   Halaman tidak ditemukan
├── admin/
│   ├── login.html             Masuk / atur ulang kata sandi
│   ├── index.html             Dashboard
│   ├── projects.html          Proyek
│   ├── gallery.html           Galeri 3D (ruang, denah, karya, pratinjau)
│   ├── skills.html            Keahlian & software
│   ├── about.html             Tentang
│   ├── media.html             Media library
│   ├── messages.html          Pesan kontak
│   └── settings.html          Pengaturan situs
├── assets/
│   ├── css/  main.css · gallery.css · responsive.css · admin.css
│   └── js/
│       ├── main.js            Bootstrap situs publik (tema, nav, footer, halaman)
│       ├── gallery-3d.js      Scene Three.js + kamera scroll + interaksi
│       ├── gallery-layout.js  Tata letak ruang/karya/stop kamera (fungsi murni)
│       ├── animations.js      GSAP: reveal, paralaks, transisi halaman
│       ├── projects.js        Komponen kartu proyek, keahlian, software
│       ├── api.js             Pembaca data publik + kirim kontak
│       ├── supabase.js        Klien Supabase (anon key) + URL Storage
│       ├── icons.js           Lucide + logo software (Devicon/Simple Icons) + fallback
│       ├── lightbox.js        Modal detail karya/foto
│       ├── utils.js · demo-data.js
│       ├── pages/             home · projects · project-detail · about · contact
│       └── admin/
│           ├── main.js        Bootstrap admin (penjaga akses, navigasi)
│           ├── auth.js        Login, reset sandi, requireAdmin()
│           ├── core.js        Toast, dialog, error, util UI
│           ├── forms.js       Pembangun formulir (media, tag, pasangan)
│           ├── data.js        Helper CRUD Supabase
│           ├── media-lib.js   Kompresi, upload ber-progres, ganti, hapus, pemilih media
│           ├── dashboard.js · projects.js · gallery.js · skills.js
│           └── about.js · media.js · messages.js · settings.js
├── public/
│   ├── favicon.svg
│   └── demo/                  Karya abstrak demo (orisinal) + placeholder profil
├── server/
│   ├── index.js               Express: sajikan dist/ + /api
│   ├── config.js · supabase-rest.js
│   ├── routes/                contact.js · health.js
│   ├── middleware/            security.js (helmet+CSP) · origin.js · rate-limit.js · errors.js
│   └── scripts/create-admin.js
├── database/
│   ├── schema.sql             Tabel, relasi, indeks, constraint, RLS, Storage, fungsi
│   └── seed.sql               Data demo (placeholder)
├── scripts/
│   ├── generate-demo-art.mjs  Membuat gambar demo
│   ├── test-schema.mjs        Uji skema + RLS di PostgreSQL (PGlite)
│   ├── e2e.mjs                Uji end-to-end browser (lihat “Pengujian”)
│   └── dev-shot.mjs           Alat screenshot pengembangan
├── tools/local-supabase/      Emulasi Supabase lokal tanpa Docker (khusus dev/test)
├── vite.config.js · wrangler.toml · render.yaml
├── .env.example · .gitignore · package.json
└── README.md
```

> Penyesuaian dari struktur awal: gambar statis ada di `public/` (disalin apa adanya oleh Vite) alih-alih `assets/images/`; ditambahkan `gallery-layout.js`, modul admin bersama (`core/forms/data/media-lib`), halaman `admin/messages.html`, serta `404.html`.

---

## Menjalankan secara lokal

Prasyarat: **Node.js 20+** (diuji dengan Node 24).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev                 # http://localhost:5173
```

- Tanpa mengisi `.env`, situs berjalan dalam **mode demo** (konten contoh dari `assets/js/demo-data.js`). Panel admin menampilkan petunjuk setup karena membutuhkan Supabase.
- Setelah `.env` diisi kredensial Supabase (lihat bagian berikut), muat ulang halaman.
- Untuk mencoba endpoint server formulir kontak saat development, jalankan juga `npm run dev:server` (Vite meneruskan `/api` ke port 3000).

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run build` | Build produksi ke `dist/` |
| `npm run preview` | Pratinjau hasil build (statis) |
| `npm start` | Server Express produksi (sajikan `dist/` + `/api`) |
| `npm run create-admin -- --email x@y.com` | Buat administrator pertama |
| `npm run test:schema` | Uji skema & RLS (tanpa internet/Docker) |
| `npm run test:e2e` | Uji end-to-end di browser |
| `npm run local:setup` / `npm run local:supabase` | Siapkan & jalankan Supabase lokal (dev/test) |

### Supabase lokal tanpa Docker (opsional)

Untuk mencoba admin tanpa akun Supabase, tersedia emulasi lokal di `tools/local-supabase/` (PostgreSQL + PostgREST asli, ditambah emulasi Auth & Storage). **Hanya untuk pengembangan/pengujian**, bukan produksi. Lihat `tools/local-supabase/README.md`. Ringkasnya:

```bash
npm run local:setup        # sekali: dependensi + unduh PostgREST
npm run local:supabase     # jalankan; mencetak URL & kunci, menulis tools/local-supabase/.env.local
```

Salin nilai dari `tools/local-supabase/.env.local` ke `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), lalu `npm run create-admin -- --email admin@example.com` dan `npm run dev`.

---

## Setup Supabase

1. Buat proyek di <https://supabase.com> (paket gratis cukup).
2. **SQL Editor › New query** → tempel isi **`database/schema.sql`** → *Run*. Script ini idempotent (aman dijalankan ulang). Isinya:
   - 13 tabel: `profiles`, `site_settings`, `projects`, `project_images`, `gallery_artworks`, `skills`, `software_tools`, `project_software`, `experiences`, `education`, `social_links`, `media_assets`, `contact_messages` — dengan primary key, foreign key, timestamp + trigger `updated_at`, indeks, dan constraint (slug, URL `https://`, rentang tahun, status, dll.).
   - Fungsi `is_admin()`, trigger profil otomatis untuk pengguna baru (role `user`), `bootstrap_first_admin()`, `submit_contact_message()`, view `media_usage`.
   - Kebijakan RLS seluruh tabel, bucket Storage `portfolio`, dan kebijakan `storage.objects`.
   Jika database sudah pernah dibuat, jalankan ulang `database/schema.sql` untuk menambahkan kolom `site_settings.hall_cards`; setelah itu judul, deskripsi, dan foto untuk ketiga bingkai Aula Patung dapat diedit dari **Admin › Tentang**. Foto bingkai boleh berbeda satu sama lain; kosongkan pilihan foto untuk memakai foto profil utama. Isi bingkai tampil publik, jadi jangan masukkan alamat rumah, umur, sekolah, atau email pribadi.
3. (Opsional tapi disarankan) jalankan **`database/seed.sql`** untuk data demo agar galeri langsung terisi. Semua isinya placeholder — ganti dari admin.
4. **Project Settings › API**: salin *Project URL* dan *publishable key* (atau *anon public key*) ke `.env`:
   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_xxx   # atau eyJ… (anon)
   ```
   Untuk `npm run create-admin` / server, isi juga `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (*secret/service_role key*) — **hanya di `.env` lokal/server**, jangan pernah ke frontend.
5. **Authentication › Sign In / Providers**:
   - **Matikan “Allow new users to sign up”**. Akun admin dibuat lewat skrip/dashboard, bukan pendaftaran publik. (Bila pendaftaran tetap aktif, akun baru hanya ber-*role* `user` dan tidak bisa menulis apa pun — tetapi tidak ada alasan membiarkannya terbuka.)
   - Email provider tetap aktif.
6. **Authentication › URL Configuration**: isi *Site URL* dengan domain situs Anda, dan tambahkan `https://domain-anda/admin/login.html` (serta `http://localhost:5173/admin/login.html` untuk lokal) ke *Redirect URLs* agar tautan “lupa kata sandi” bekerja.

---

## Storage & Row Level Security

**Bucket** `portfolio` dibuat oleh `schema.sql`: publik (gambar bisa ditampilkan tanpa login), batas 15 MB, hanya tipe `image/jpeg, png, webp, avif, gif, svg+xml`.

**Kebijakan Storage** (`storage.objects`):

| Operasi | Siapa |
|---|---|
| Baca (`select`) di bucket `portfolio` | semua orang |
| Upload / ganti / hapus | hanya `public.is_admin()` |

Bila SQL Editor menolak membuat bucket/kebijakan Storage (izin proyek berbeda), buat manual: **Storage › New bucket** → nama `portfolio`, *Public bucket* aktif, batas ukuran 15 MB, MIME di atas. Lalu **Storage › Policies › New policy** (For full customization) untuk `storage.objects`:
- `SELECT` — *USING*: `bucket_id = 'portfolio'`
- `INSERT` — *WITH CHECK*: `bucket_id = 'portfolio' and public.is_admin()`
- `UPDATE` — *USING* & *WITH CHECK*: `bucket_id = 'portfolio' and public.is_admin()`
- `DELETE` — *USING*: `bucket_id = 'portfolio' and public.is_admin()`

(Jangan menjalankan `alter table storage.objects …` — tabel itu milik Supabase dan RLS-nya sudah aktif.)

**RLS tabel**:
- Konten publik (`projects`, `gallery_artworks`, `skills`, `software_tools`, `experiences`, `education`, `social_links`) → pengunjung hanya bisa **membaca** baris yang `published` / `is_visible`. `site_settings` & `media_assets` dapat dibaca publik.
- **Semua penulisan** (insert/update/delete) hanya untuk `is_admin()`.
- `contact_messages` → tidak bisa dibaca/ditulis publik; pesan masuk lewat `submit_contact_message()` (validasi, honeypot, maks. 3 pesan/jam/email, 60/jam global) atau server dengan service role. Hanya admin yang dapat membaca.
- `profiles` → pengguna hanya melihat profilnya sendiri; tidak ada yang bisa menaikkan *role* sendiri.
- `media_assets` direferensikan dengan `ON DELETE RESTRICT`, sehingga media yang masih dipakai **tidak bisa dihapus**.

Semua aturan ini diuji otomatis oleh `npm run test:schema`.

---

## Membuat akun admin pertama

Pilih salah satu. Keduanya **menolak** bila sudah ada admin, jadi tidak bisa disalahgunakan untuk membuat admin tambahan.

**A. Skrip (disarankan)** — membutuhkan `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` di `.env`:

```bash
npm run create-admin -- --email anda@contoh.com
# akan meminta kata sandi (min. 10 karakter, tidak ditampilkan di layar)
```
Skrip membuat akun di Supabase Auth (email langsung terkonfirmasi) lalu memanggil `bootstrap_first_admin()`. Tanpa terminal interaktif, skrip membuat kata sandi acak dan menampilkannya sekali.

**B. Dashboard Supabase**:
1. **Authentication › Users › Add user › Create new user** → isi email & kata sandi, centang *Auto Confirm User*.
2. **SQL Editor**: `select public.bootstrap_first_admin('anda@contoh.com');`

Menambah admin lain kemudian (hanya dari SQL Editor, sebagai pemilik proyek):
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where lower(email) = lower('rekan@contoh.com'));
```

Login di **`/admin/login.html`**.

---

## Deployment

Isi variabel `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` **saat build** (nilainya ditanam ke JavaScript publik — aman karena RLS). Jangan pernah menaruh service-role key sebagai variabel `VITE_*`.

### A. Cloudflare Pages (statis, disarankan)

1. Push proyek ke GitHub/GitLab.
2. Cloudflare Dashboard › **Workers & Pages › Create › Pages › Connect to Git** → pilih repositori.
3. Build settings: **Framework preset** None, **Build command** `npm run build`, **Build output directory** `dist`.
4. **Environment variables** (Production & Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `NODE_VERSION` = `22`.
5. Deploy. Tambahkan domain situs ke Supabase *Site URL / Redirect URLs*.

Alternatif lewat CLI: autentikasi dulu dengan `npx wrangler login`, lalu jalankan `npm run deploy:pages`. Perintah ini membangun situs dan mengirim folder `dist` ke proyek Pages `hafidsa-portofolio`. Jangan gunakan `npx wrangler deploy` untuk situs ini: perintah itu untuk Cloudflare Workers, sedangkan proyek ini menggunakan Cloudflare Pages.

Catatan: build otomatis menghasilkan `dist/_headers` berisi header keamanan + **Content-Security-Policy yang sudah memuat origin Supabase Anda** (dari `VITE_SUPABASE_URL`). Cloudflare Pages menyajikan `about.html` juga di `/about` — semua tautan tetap bekerja. Formulir kontak otomatis memakai fungsi database karena tidak ada server.

### B. Netlify (statis)

Build command `npm run build`, publish directory `dist`, variabel lingkungan sama seperti di atas. `_headers` juga didukung Netlify.

### C. Render / Railway / VPS (Node.js persisten)

Server Express menyajikan `dist/` sekaligus `/api/contact` (rate limit per IP & email, cek Origin, hash IP).

- **Render**: *New › Blueprint* → pilih repositori (membaca `render.yaml`), lalu isi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Railway / VPS**: build `npm ci && npm run build`, start `npm start`, set `NODE_ENV=production`, `TRUST_PROXY=1` (bila di balik proxy/load balancer), plus variabel di atas. Health check: `GET /api/health`.

`SUPABASE_SERVICE_ROLE_KEY` di server bersifat opsional: tanpa kunci ini server tetap menyimpan pesan lewat fungsi database (anon key).

---

## Mengganti konten dari admin

Semua teks contoh bertanda “contoh/placeholder” — **ganti dengan data Anda sendiri**; situs ini sengaja tidak mengarang data pribadi atau prestasi. Dashboard menampilkan daftar periksa bagian yang masih contoh.

| Ingin mengubah… | Buka |
|---|---|
| Nama, peran, judul situs, logo, favicon, gambar berbagi | **Pengaturan › Identitas situs** |
| Kalimat pembuka beranda | **Pengaturan › Hero beranda** |
| Warna situs & dinding galeri | **Pengaturan › Warna tema** |
| Email, telepon, lokasi, media sosial | **Pengaturan › Informasi kontak / Media sosial** |
| Menyembunyikan halaman (Karya/Tentang/Kontak/Keahlian) | **Pengaturan › Visibilitas halaman** |
| Mematikan/menghaluskan animasi | **Pengaturan › Animasi** |
| Biografi, foto profil, fokus, pengalaman, pendidikan | **Tentang** |
| Proyek (teks, foto, video, software, urutan, status) | **Proyek** |
| Karya di dinding galeri 3D, ruang, posisi, bingkai | **Galeri 3D** (pakai *Pratinjau* sebelum menerbitkan) |
| Keahlian & logo software | **Keahlian & Software** |
| Upload/ganti/hapus foto, alt text | **Media** |

Alur umum: upload foto di **Media** (atau langsung dari formulir mana pun lewat tombol *Pilih / upload*) → isi alt text → pasang di proyek/karya → simpan sebagai **Draf** → periksa lewat **Pratinjau** → **Terbitkan**.

**Mengganti foto karya di galeri 3D**: *Galeri 3D › Ganti foto* (memilih media lain untuk karya itu), atau *Media › (pilih gambar) › Ganti gambar* (mengganti file media tersebut di semua tempat pemakaiannya). Bingkai 3D otomatis memakai gambar baru; ukuran bingkai menyesuaikan rasio gambar.

---

## Galeri melingkar & patung

- **Bentuk**: koridor cincin di sekeliling aula patung. Kamera mulai di foyer, berhenti sejenak di *Aula Patung* (menatap patung lewat bukaan dinding), lalu berkeliling ruang demi ruang dan berakhir di dinding penutup.
- **Dinding** (Admin › Galeri 3D): *dalam (kiri)* menghadap aula, *luar (kanan)* di seberangnya, *ujung* = partisi di akhir ruang. Dinding dalam lebih pendek; karya yang tidak muat ditampilkan di dinding luar (denah admin selalu menampilkan posisi sebenarnya).
- **Patung**: daftarnya di `assets/js/statues.js` (`STATUES`). Tanpa berkas model, patung utama memakai malaikat sederhana buatan kode. Untuk model asli, unduh (format **glTF/GLB**) lalu taruh di `assets/models/` dengan nama persis:

| Berkas | Model | Lisensi |
|---|---|---|
| `angel-old-marble.glb` | [Angel (old marble version)](https://sketchfab.com/3d-models/angel-old-marble-version-2c879fc654b44f5e8d12527948535b51) — Sebastian Sosnowski | CC BY 4.0 |
| `cemetery-angels.glb` | [free Angels Statues - Retopoed (kinda)](https://sketchfab.com/3d-models/free-angels-statues-retopoed-kinda-4797a1710dd84e1cbe7a25585e4d3f20) — JJORIS | CC BY 4.0 |
| `angel-praying.glb` (opsional) | [Antique-style angel statue](https://www.meshy.ai/3d-models/antique-style-angel-statue-019a31f7-93fb-7e98-84cd-b0827beef73e) — Meshy | **belum diperiksa**: `enabled: false` sampai lisensinya dipastikan |

  Model CC BY wajib diberi kredit: footer beranda otomatis menampilkan kredit untuk setiap model asli yang berhasil dimuat. Berkas yang belum ada tidak pernah diminta (tanpa 404). Build ulang setelah menambah berkas.

---

## Logo software

- Sumber: **Devicon** (`cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0`, versi dipatok) dan **Simple Icons** (`cdn.simpleicons.org`), atau upload logo kustom.
- Katalog awal (seed): Photoshop, Illustrator, Premiere Pro, After Effects, Figma, Blender, DaVinci Resolve, VS Code, HTML5, CSS3, JavaScript, Three.js — **semuanya tersembunyi secara bawaan**. Aktifkan hanya yang benar-benar Anda gunakan (*Keahlian & Software › Software › ikon mata*).
- Logo tampil dengan ukuran konsisten (kotak 52 px, `object-fit: contain` menjaga proporsi), selalu disertai nama, dan **fallback inisial** otomatis bila ikon gagal dimuat. Tidak ada emoji.
- Simple Icons versi terbaru tidak lagi memuat merek Adobe; karena itu logo Adobe memakai Devicon.

---

## Pengujian

```bash
npm run build          # harus selesai tanpa error
npm run test:layout    # tata letak cincin, jalur kamera, denah admin (tanpa browser)
npm run test:ring      # geometri cincin & aula (tanpa browser)
npm run test:statues   # patung: pas-tinggi, cadangan, kredit (tanpa browser)
npm run test:gallery   # galeri 3D mode demo di Edge/Chrome headless
npm run test:schema    # skema + RLS di PostgreSQL WASM (PGlite)
npm run test:e2e       # uji end-to-end di browser terhadap Supabase lokal
```

- `test:schema`: menjalankan `schema.sql` & `seed.sql` dua kali (idempotensi) lalu memverifikasi RLS untuk anon, pengguna biasa, dan admin; bootstrap admin; constraint; FK RESTRICT media; view pemakaian; formulir kontak (honeypot, validasi, rate limit).
- `test:e2e`: menyalakan Supabase lokal (`tools/local-supabase`), build situs, menjalankan server Express, lalu mengendalikan **Microsoft Edge/Chrome headless** untuk memeriksa: semua halaman terbuka, galeri 3D benar-benar dirender, scroll menggerakkan kamera, proyek dibaca dari database, login admin, membuat & mengedit proyek, upload foto tersimpan di Storage, ganti foto memperbarui karya di galeri, About & Skills dapat diedit, logo software tampil (dan fallback bekerja), data bertahan setelah refresh/restart, pengguna biasa ditolak, tampilan smartphone tanpa *horizontal overflow*, fallback tanpa WebGL, formulir kontak, dan tidak ada error JavaScript. Screenshot disimpan di `test-output/e2e/`. Butuh Edge/Chrome terpasang (atau set `BROWSER_PATH`).

---

## Keamanan

- Browser hanya memakai **publishable/anon key**; semua otorisasi ditegakkan oleh **RLS** & fungsi `is_admin()` di database. Service-role key hanya dipakai skrip `create-admin` dan server (opsional), tidak pernah dibundel ke frontend.
- Pendaftaran publik dimatikan; admin pertama hanya bisa dibuat lewat service role / SQL Editor, dan `bootstrap_first_admin()` menolak bila admin sudah ada.
- Upload hanya untuk admin (kebijakan Storage), dibatasi tipe & ukuran; file dikompresi ulang di browser sehingga metadata EXIF (termasuk lokasi GPS) terbuang.
- Semua teks dari database di-*escape* sebelum dirender; URL eksternal dibatasi ke `http(s)`/`mailto` (dicek di frontend **dan** constraint database).
- CSP ketat (`script-src 'self'`), `frame-ancestors 'self'`, `X-Content-Type-Options`, `Referrer-Policy`; halaman admin `noindex`.
- Formulir kontak: honeypot, waktu pengisian minimum, rate limit per IP & email (server) + throttle di database, validasi panjang di tiga lapis (browser, server, database).

---

## Performa, responsif, aksesibilitas

- **Desktop**: scene lengkap (bayangan real-time, 3 spotlight, partikel, antialias, DPR ≤ 2). **Tablet**: tanpa bayangan real-time, FOV kamera disesuaikan. **Smartphone**: scene ringan (tanpa bayangan/partikel/lampu rel, 2 spotlight, DPR ≤ 1,5, tekstur thumbnail).
- Tekstur bertingkat: thumbnail (≤ 960 px) untuk semua karya, resolusi penuh hanya untuk 1–2 karya terdekat kamera (dilepas saat menjauh) — hemat memori GPU.
- Render *on-demand* (hanya saat scroll/interaksi, kecuali efek ambient desktop), pengurangan resolusi adaptif bila FPS rendah, berhenti saat tab tersembunyi/kanvas di luar layar.
- Kamera menyesuaikan orientasi layar (FOV & framing potret).
- Tanpa *horizontal overflow*; navigasi publik & admin berfungsi dengan keyboard (skip link, fokus terlihat, Escape menutup menu/dialog, panah di lightbox); daftar karya tersembunyi untuk pembaca layar; semua gambar memakai alt text dari Media Library.
- `prefers-reduced-motion` dihormati (tanpa transisi, reveal, sway kamera, dan partikel); admin juga dapat mematikan animasi global.
- Tanpa WebGL: galeri berubah menjadi grid HTML yang tetap berisi semua karya dan detailnya.

---

## Pemecahan masalah

| Gejala | Solusi |
|---|---|
| Banner “Mode demo” tetap muncul | `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` belum terisi saat **build/dev**. Isi `.env`, hentikan & jalankan ulang `npm run dev` (atau build ulang di hosting). |
| “Baris site_settings belum ada” | Jalankan `database/seed.sql`, atau `insert into public.site_settings (id) values (1);` |
| Admin: “Akses ditolak” setelah login | Akun belum admin → `select public.bootstrap_first_admin('email');` |
| Upload gagal “Akses ditolak” | Kebijakan Storage belum dibuat (lihat bagian Storage) atau akun bukan admin. |
| Upload gagal “jenis file” | Bucket hanya menerima JPG/PNG/WebP/AVIF/GIF/SVG. Foto HEIC iPhone: ubah ke JPG dulu. |
| Gambar tidak tampil di hosting statis | Build ulang setelah mengisi `VITE_SUPABASE_URL` agar CSP di `_headers` memuat domain Supabase Anda. |
| Galeri 3D tampil sebagai daftar | Browser/perangkat tanpa WebGL atau WebGL dinonaktifkan — ini fallback yang disengaja. |
| Link “lupa kata sandi” tidak kembali ke situs | Tambahkan `https://domain/admin/login.html` ke *Redirect URLs* Supabase. |
| Formulir kontak: “Terlalu banyak pesan” | Batas anti-spam tercapai (3/jam per email). Tunggu lalu coba lagi. |
