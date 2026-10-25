# Museum Melingkar + Patung Malaikat — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti galeri 3D yang berupa satu koridor lurus menjadi museum melingkar mengelilingi aula patung, lengkap dengan patung malaikat (model `.glb` berlisensi bebas, dengan cadangan buatan kode) dan kredit CC BY.

**Architecture:** Tata letak tetap fungsi murni di `gallery-layout.js`, tetapi kini dalam koordinat polar (sudut `a`, jari-jari `r`) dan tetap mengeluarkan `x, z, rotY` dunia sehingga `buildArtwork`, pemilihan lampu, dan modal klik hampir tidak berubah. Geometri ruang dipindah ke modul baru `ring-architecture.js` (dinding busur, lantai/langit-langit sektor, partisi radial). Patung hidup di modul `statues.js` (manifest, pas-tinggi, cadangan malaikat, pemuat GLB) yang dapat diuji di Node.

**Tech Stack:** Three.js 0.186 (+ `GLTFLoader` dari `three/examples`), GSAP ScrollTrigger, Vite 8, Node ≥ 20, puppeteer-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-25-museum-ring-statues-design.md`

## Global Constraints

- Proyek **bukan repositori git**: tidak ada langkah commit. Titik cek tiap task = tes lulus.
- Task 1–5 membuat beranda sementara rusak (tata letak lama dibuang). Kerjakan berurutan; jangan deploy di tengah.
- Tidak ada dependensi npm baru. Komentar dan teks UI berbahasa Indonesia, gaya sama dengan kode sekitarnya.
- Skema database dan nilai `wall` (`left`/`right`/`back`) serta `room` (integer) **tidak berubah**.
- Konvensi koordinat: titik pada sudut `a`, jari-jari `r` adalah `polar(r, a) = [r*sin(a), r*cos(a)]` (x, z). Kamera bergerak dengan `a` **membesar**. Kiri = dinding **dalam** (`rIn`), kanan = dinding **luar** (`rOut`), ujung = partisi pada `a1` ruang.
- `rotY` agar sumbu +z lokal menghadap ke koridor: dinding kiri (dalam) `rotY = a`; dinding kanan (luar) `rotY = a + π`; dinding ujung dan partisi `rotY = a - π/2`.
- Konstanta `DIMENSIONS` (nilai persis): `W: 9, H: 4.6, T: 0.4, DOOR_W: 3.4, DOOR_H: 3.7, EYE: 1.62, ART_Y: 1.65, FOYER_LEN: 12, ROOM_MIN: 13, SPACING: 4.3, BACK_MAX: 3, R_MID_MIN: 10, BAY_W: 2.6, BAY_H: 3.5, ART_EDGE: 2.6`. `FOYER_START` dan `FOYER_END` dihapus.
- CSP: satu-satunya pelonggaran yang boleh adalah `blob:` pada `connect-src` (di `server/middleware/security.js` dan meta CSP di `vite.config.js`).
- Kualitas `low` memuat paling banyak 2 patung. Tidak boleh ada permintaan jaringan ke file model yang tidak ada.

## Review Focus

Masukan/kondisi yang tidak disebut spec tetapi paling mungkin merusak; tiap baris punya tes di task yang disebut.

1. Satu ruang dengan banyak karya di dinding dalam (lebih pendek dari dinding luar): karya tidak boleh bertumpuk atau menyentuh bay → T1 (`tidak bertumpuk`, `kelebihan dinding dalam`).
2. Nol karya dan satu karya: cincin tetap valid, kamera tidak menghasilkan `NaN` → T1 (`galeri kosong`, `satu karya`), T2.
3. Layar diputar/diubah ukurannya: hanya `stops` yang berubah, posisi karya tetap → T1 (`placements tidak bergantung aspek`).
4. File model rusak atau tidak bisa diurai: patung utama jatuh ke cadangan, patung lain dilewati, tanpa error di konsol → T7.
5. Model berukuran tidak lazim (satuan cm, pusat tidak di dasar): hasil tetap setinggi target dan berdiri di lantai → T7 (`fitToHeight`).
6. Kredit hanya untuk model asli yang benar-benar dimuat dan `enabled` → T7 (`kredit`), T8.

---

### Task 1: Tata letak polar (fungsi murni)

**Files:**
- Modify: `assets/js/gallery-layout.js` (tulis ulang `DIMENSIONS`, `WALL_LABELS`, `buildLayout`; tambah `polar`; `artSize`, `webglAvailable`, `detectQuality`, `viewFov` tidak berubah)
- Create: `scripts/test-layout.mjs`
- Modify: `package.json` (script `test:layout`; `test` menjalankan `test:layout` lebih dulu)

**Interfaces:**
- Produces:
  - `polar(r: number, a: number): [x: number, z: number]`
  - `WALL_LABELS = { left: 'Dinding dalam (kiri)', right: 'Dinding luar (kanan)', back: 'Dinding ujung' }`
  - `buildLayout(artworks, settings, view): Layout` dengan
    ```
    Layout = {
      ring: { rIn, rMid, rOut },
      foyer: { a0: 0, a1 },
      rooms: [{ index, number, name, subtitle, a0, a1, length, isLast, count }],   // length = (a1-a0)*rMid; a1 ruang terakhir = 2π
      placements: [{ art, wall, room, index, size:{w,h,aspect}, r, a, x, z, rotY }],
      stops: [{ kind:'intro'|'wall'|'door'|'art'|'end', dwell, pos:[x,y,z], look:[x,y,z], caption, room?, placement? }],
      dims, fov
    }
    ```
    Tidak ada lagi `zStart`, `zEnd`, `zLast`.

- [ ] **Step 1: Tulis `scripts/test-layout.mjs` (gagal dulu).** Pola keluaran sama dengan `test-schema.mjs` (`PASS  nama` / `FAIL  nama`, akhir `Hasil: N lulus, M gagal`, exit code 1 bila ada gagal), memakai `node:assert/strict`. Fixture `mk(spec)` membuat karya dari `{ [room]: { left, right, back } }` (jumlah per dinding, gambar 1600×1000). Tes (nama persis):
  - `cincin menutup`: untuk spec `{}`, `{1:{left:1}}`, `{1:{left:2,right:2},2:{left:1,right:1,back:1},3:{left:2,right:2,back:3}}`, dan 7 ruang padat: `foyer.a0 === 0`, `foyer.a1 === rooms[0].a0`, `rooms[i].a0 === rooms[i-1].a1`, `Math.abs(rooms.at(-1).a1 - 2*Math.PI) < 1e-9` (untuk `{}`: `foyer.a1 === 2π`).
  - `jari-jari`: `ring.rMid >= R_MID_MIN`; `ring.rOut - ring.rIn === W` (toleransi 1e-9).
  - `karya berada di dindingnya`: kiri `|hypot(x,z) - rIn| < 1e-6`; kanan `|hypot(x,z) - rOut| < 1e-6`; dinding ujung `a` sama dengan `a1` ruangnya (±1e-9); kiri/kanan `a0 + ART_EDGE/r <= a <= a1 - ART_EDGE/r` (±1e-9). `[x,z]` sama dengan `polar(r, a)`.
  - `karya menghadap koridor`: `n = [sin(rotY), cos(rotY)]`; kiri/kanan `n · (polar(rMid,a) - [x,z]) > 0`; ujung `n · [cos(a), -sin(a)] < 0` (menghadap kamera yang datang).
  - `tidak bertumpuk`: pada satu dinding, selisih busur `|Δa|*r >= (w_i + w_j)/2 + 0.4`.
  - `kelebihan dinding dalam`: ruang dengan 8 karya `left` dan 0 `right` tetap lulus dua tes di atas dan semua karya ada di salah satu dinding (tidak hilang: `placements.length === 8`); karya limpahan boleh pindah ke `right` atau ruang memanjang.
  - `stop di dalam koridor`: setiap `pos` punya `y === EYE` dan `rIn + 0.6 <= hypot(x,z) <= rOut - 0.6`; urutan `kind`: `intro`, `wall`, lalu per ruang `door` + `art`×n, terakhir `end`; jumlah stop = `3 + rooms.length + placements.length`.
  - `placements tidak bergantung aspek`: `buildLayout` dengan `aspect` 0.5 dan 1.78 menghasilkan `placements` identik (`deepStrictEqual` pada `x,z,rotY,r,a,wall`) dan `stops` berbeda.
  - `galeri kosong` dan `satu karya`: tidak melempar; semua angka di `stops` terbatas (`Number.isFinite`).
  - `deterministik`: dua pemanggilan identik `deepStrictEqual`.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node scripts/test-layout.mjs` → Expected: error `polar` tidak diekspor / tes gagal.
- [ ] **Step 3: Implementasikan `buildLayout` polar di `gallery-layout.js`.** Keputusan yang tidak boleh diubah pelaksana:
  - Panjang ruang di jari-jari tengah: `len = max(ROOM_MIN, SPACING*max(nLuar, nDalam*rMid/rIn) + 2*ART_EDGE)`. `rMid = max(R_MID_MIN, (FOYER_LEN + Σlen)/(2π))`; hitung ulang `len` dengan `rMid` terbaru sampai stabil (maksimum 8 putaran). Sudut tiap ruang `= 2π*len/total`. Aturan limpahan dinding ujung (`backCap = isLast ? BACK_MAX : 2`) sama dengan kode lama.
  - Dinding dalam: bila `n` karya tidak muat di `busur_dalam - 2*ART_EDGE` dengan jarak `SPACING`, kelebihannya pindah ke dinding luar; bila dinding luar juga penuh, `len` ruang bertambah.
  - Karya kiri/kanan dibagi merata di rentang `[a0 + ART_EDGE/r, a1 - ART_EDGE/r]`, kiri dan kanan digeser seperti kode lama (`0.4` / `0.62`) agar tidak berhadapan persis.
  - Dinding ujung non-terakhir: dua karya mengapit pintu pada `r = rMid ± (DOOR_W/2 + (W/2 - DOOR_W/2)/2)`, lebar maksimum 2.0. Ruang terakhir: sampai `BACK_MAX` karya, `r = rMid + (i - (n-1)/2)*slot`, `slot = min(3.6, (W-1.2)/n)`.
  - Stop: `intro` di `polar(rMid, 2.6/rMid)` menatap `polar(rMid, a+9/rMid)` setinggi 1.85; `wall` di `r = rMid - 2.3`, sudut tengah foyer, menatap dinding luar (`rOut`) setinggi `2.4 - lookDrop`; `door` di `polar(rMid, a0 - 2.2/rMid)` menatap 9 m ke depan setinggi 1.9; `art` kiri: kamera `r = clamp(rIn + d, rIn+0.8, rOut-0.8)`, kanan: `r = clamp(rOut - d, ...)`, sudut `a_karya - 1.1/r`, `d = clamp(max(3.1, needH, needV), 3.1, W-0.9)` (needH/needV seperti kode lama); `art` ujung: `r = rMid + clamp(0.5*(r_karya - rMid), -2, 2)`, sudut `a1 - clamp(max(5.2, needH, needV), 5.2, 9)/rMid`; `end` di `polar(rMid, 2π - 3.4/rMid)` menatap `polar(rMid, 2π)` setinggi `2.0 - lookDrop`. `lookDrop`, `dwell` dan isi `caption` sama dengan kode lama.
- [ ] **Step 4: Jalankan tes.** Run: `node scripts/test-layout.mjs` → Expected: `Hasil: N lulus, 0 gagal`.
- [ ] **Step 5: Tambah script.** `package.json`: `"test:layout": "node scripts/test-layout.mjs"`, dan `"test": "npm run test:layout && npm run test:schema && npm run test:e2e"`. Run: `npm run test:layout` → Expected: lulus semua.

---

### Task 2: Waypoint jalur kamera (fungsi murni)

**Files:**
- Modify: `assets/js/gallery-layout.js` (tambah `segmentWaypoints`, `partitionAngles`)
- Modify: `scripts/test-layout.mjs`

**Interfaces:**
- Consumes: `Layout` dari Task 1.
- Produces:
  - `partitionAngles(layout): number[]` — sudut partisi berpintu: `foyer.a1` dan `a1` setiap ruang yang bukan terakhir.
  - `segmentWaypoints(a: Stop, b: Stop, layout): { pos: [x,y,z][], look: [x,y,z][] }` — titik pertama/terakhir = `a.pos/a.look` dan `b.pos/b.look`.

- [ ] **Step 1: Tulis tes** di `test-layout.mjs` (fixture 3 ruang):
  - `waypoint mengikuti busur`: untuk setiap pasangan stop berurutan, jarak antar `pos` berurutan ≤ 2.6 m dan semua `pos` punya `rIn + 0.6 <= r <= rOut - 0.6`.
  - `waypoint melewati pintu`: bila sudut partisi `ap` berada di antara sudut kedua stop, daftar `pos` memuat titik `r = rMid` pada `ap - off/rMid` dan `ap + off/rMid`, `off = min(1.1, ½·jarak busur ke tiap stop)`, dan `look` memuat titik menatap `ap + 7/rMid`.
  - `waypoint galeri kosong`: dua stop `intro`→`wall`→`end` menghasilkan angka terbatas.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node scripts/test-layout.mjs` → Expected: FAIL pada tiga tes baru.
- [ ] **Step 3: Implementasikan.** Titik antara diambil di antara setiap dua titik jangkar (stop dan titik pintu) sehingga jarak lurus berurutan ≤ 2.5 m, dengan interpolasi linear `(r, a)`. Bila sisi berganti (kiri↔kanan) dan tidak ada partisi di antaranya, sisipkan titik di `r = rMid` pada sudut tengah, seperti perilaku lama.
- [ ] **Step 4: Jalankan tes.** Run: `node scripts/test-layout.mjs` → Expected: `Hasil: N lulus, 0 gagal`.

---

### Task 3: Geometri sektor cincin

**Files:**
- Create: `assets/js/ring-architecture.js` (bagian helper di task ini)
- Create: `scripts/test-ring-architecture.mjs`
- Modify: `package.json` (`test:ring` ditambahkan ke `test`)

**Interfaces:**
- Produces:
  - `sectorGeometry(r0: number, r1: number, a0: number, a1: number, opts?: { up?: boolean }): THREE.BufferGeometry` — sektor cincin datar di `y = 0`, normal `+y` (`up !== false`) atau `-y`, UV = `(x/3, z/3)`, jumlah segmen `max(2, ceil((a1-a0)/(π/48)))`.
  - `arcWallGeometry(r: number, a0: number, a1: number, h: number): THREE.BufferGeometry` — busur dinding terbuka `y ∈ [0,h]`, titik di `polar(r, a)`, UV `(arc/4, y/4)`.

- [ ] **Step 1: Tulis `scripts/test-ring-architecture.mjs`** (format keluaran sama dengan `test-layout.mjs`):
  - `sektor: luas`: jumlah luas segitiga `sectorGeometry(5, 14, 0.3, 1.7)` = `(a1-a0)/2*(r1²-r0²)` dengan toleransi 0.5%.
  - `sektor: batas`: semua titik berjari-jari di `[5,14]` (±1e-6) dan bersudut di `[0.3,1.7]` (sudut = `atan2(x, z)`).
  - `sektor: arah normal`: rata-rata normal `y > 0.99` untuk `up`, `< -0.99` untuk `up:false`; normal wajah dari urutan titik (winding) searah dengan atribut `normal`.
  - `dinding busur: bentuk`: semua titik berjari-jari `r` (±1e-6), `y ∈ [0,h]`, sudut di `[a0,a1]`.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node scripts/test-ring-architecture.mjs` → Expected: modul tidak ditemukan.
- [ ] **Step 3: Implementasikan kedua fungsi** memakai `BufferGeometry` manual (jangan `RingGeometry`/`CylinderGeometry`; sistem sudutnya berbeda dan winding-nya rawan terbalik).
- [ ] **Step 4: Jalankan tes.** Run: `node scripts/test-ring-architecture.mjs` → Expected: `Hasil: N lulus, 0 gagal`.

---

### Task 4: Pasang cincin ke galeri 3D

**Files:**
- Modify: `assets/js/ring-architecture.js` (tambah `buildRingArchitecture`)
- Modify: `assets/js/gallery-3d.js` (hapus `buildSection`/`buildPartition`; ganti `buildPaths`, pembatas kamera, debu; tambah `cameraAt`, `screenPointOfPlacement`; `debug()` menambah `ring` dan `radius`)
- Modify: `scripts/e2e.mjs` (tes 3b dan tes baru 2c)

**Interfaces:**
- Consumes: `buildLayout`, `partitionAngles`, `segmentWaypoints`, `polar` (Task 1–2); `sectorGeometry`, `arcWallGeometry` (Task 3).
- Produces:
  - `buildRingArchitecture(ctx: { root, mats, layout, addMesh, box, useShadows }): { partitions: number[] }` — lantai, langit-langit, dinding luar utuh, dinding dalam dengan bay (lubang `BAY_W` lebar, tinggi `BAY_H`, di atasnya penutup sampai `H`) di setiap sudut partisi berpintu, partisi radial berpintu (`DOOR_W`×`DOOR_H`, kusen, ambang) di tiap `partitions`, dinding penutup tanpa pintu pada `a = 0` (≡ 2π), plint dan strip lampu langit-langit berbentuk busur (`r = rMid ± 1.9`). Material memakai `mats` yang sudah ada.
  - `api.cameraAt(p: number): { pos: [x,y,z], look: [x,y,z] }` — posisi kamera pada progres scroll `p ∈ [0,1]` tanpa efek sway.
  - `api.screenPointOfPlacement(i: number): { x: number, y: number } | null` — koordinat klien (px) pusat karya `i`, `null` bila di luar layar atau di belakang kamera.
  - `api.debug()` menambah `ring: { rIn, rMid, rOut }` dan `radius: number` (jari-jari kamera saat ini).

- [ ] **Step 1: Tulis tes e2e dulu** di `scripts/e2e.mjs`:
  - Ubah tes `3b`: ganti `page.mouse.click(720, 400)` dengan klik pada `screenPointOfPlacement(stops[3].placement)` (ambil lewat `page.evaluate`) setelah `goToStop(3, false)`; assert modal terbuka.
  - Tambah `await check('2c. Kamera tetap di dalam koridor melingkar sepanjang scroll', ...)` setelah tes 2: untuk `p` dari 0 sampai 1 langkah 0.01 ambil `cameraAt(p)` lewat `page.evaluate`, hitung `r = hypot(x, z)`, assert `ring.rIn + 0.5 <= r <= ring.rOut - 0.5`, `y` dalam `[1.4, 1.9]`, dan semua angka terbatas. Return string ringkas `r ∈ [min, max]`.
- [ ] **Step 2: Jalankan e2e, pastikan tes baru gagal.** Run: `npm run test:e2e` → Expected: `2c` dan `3b` gagal (API belum ada). Bila Edge tidak ditemukan, set `BROWSER_PATH`.
- [ ] **Step 3: Implementasikan `buildRingArchitecture`** dan pakai di `createGallery`. Detail yang diputuskan: kedua dinding `DoubleSide`; bangku, teks, dan aula tengah **belum** dikerjakan di task ini (blok kode lama untuk itu dikomentari sementara, tidak dihapus, sampai Task 5).
- [ ] **Step 4: Ganti `buildPaths`** agar tiap segmen memakai `segmentWaypoints` (`CatmullRomCurve3` dari `pos` dan `look`, `'centripetal'`, 0.5 seperti sekarang). Ganti `camPos.x = clamp(...)` dengan batas radial: `r' = clamp(r, rIn+0.6, rOut-0.6)` lalu `polar` kembali; sway digeser sepanjang radial, bukan sumbu x. Pindahkan partikel debu ke sektor cincin (`r ∈ [rIn+0.5, rOut-0.5]`, `a ∈ [0, 2π)`, tinggi seperti sekarang). Tambah `cameraAt` dan `screenPointOfPlacement`.
- [ ] **Step 5: Verifikasi visual.** Run `npm run dev` (latar belakang; mode demo), lalu `node scripts/dev-shot.mjs http://localhost:<port>/ test-output/ring-stop3.png stop:3` dan `stop:8`, `stop:0`. Baca PNG-nya. Expected: dinding melengkung terlihat jelas, tidak ada celah di antara sektor, tidak ada kedip/z-fighting di sambungan, bay di dinding dalam menembus ke aula, karya terbingkai menempel di dinding dan menghadap koridor.
- [ ] **Step 6: Jalankan e2e.** Run: `npm run test:e2e` → Expected: `2c` dan `3b` lulus; tes lain yang menyebut perabot atau teks mungkin masih gagal sampai Task 5 — catat, jangan perbaiki di sini.

---

### Task 5: Perabot, teks, dan aula tengah

**Files:**
- Modify: `assets/js/ring-architecture.js` (tambah `buildCentralHall`)
- Modify: `assets/js/gallery-3d.js` (bangku, teks foyer, judul ruang, aktifkan kembali blok yang dikomentari di Task 4)

**Interfaces:**
- Consumes: `buildRingArchitecture` (Task 4).
- Produces: `buildCentralHall(ctx): { center: [x, y, z] }` — lantai cakram `r < rIn`, langit-langit cincin `r ∈ [2.4, rIn]` di tinggi `H`, lubang cahaya (cakram emisif `mats.strip`) `r < 2.4` di `H`, panggung bertingkat dua (`r` 2.9 dan 2.4, tinggi 0.12 dan 0.24) di pusat; `center` = titik atas panggung `[0, 0.24, 0]`.

- [ ] **Step 1: Verifikasi dasar sebelum perubahan.** Run: `npm run test:e2e` → catat tes yang gagal sebagai garis dasar (diharapkan hanya yang terkait perabot/teks).
- [ ] **Step 2: Implementasikan `buildCentralHall`** dan panggil dari `createGallery`; tambah `SpotLight` tanpa bayangan di atas panggung (`intensity` 40, mengarah ke `center`).
- [ ] **Step 3: Pindahkan bangku:** satu per ruang di sudut tengah ruang, `r = rMid ± 2.7` bergantian, sumbu panjang bangku searah koridor (`rotation.y = a`, pada sudut tengah ruang); satu bangku di foyer.
- [ ] **Step 4: Pindahkan teks.** Nama pemilik di dinding **luar** foyer di sudut tengah foyer (lebar teks = `min(7.2, busur_luar_foyer - 1.5)`); kalimat pembuka di dinding **dalam** foyer di `a0 + 0.38*(a1-a0)` (lebar = `min(5.4, busur_dalam_foyer - BAY_W - 1.2)`), tinggi seperti sekarang. Judul ruang di ambang pintu pada `polar(rMid, a0)` bergeser `T/2 + 0.012` ke arah kamera, `rotY = a0 - π/2`, `y = lintelY`.
- [ ] **Step 5: Verifikasi visual + e2e.** Dev-shot `stop:0`, `stop:1`, `stop:2` (pintu ruang I). Baca PNG. Expected: nama pemilik terbaca penuh di dinding luar foyer, judul ruang di atas pintu, aula tengah terlihat lewat bay dengan cahaya jatuh ke panggung. Run: `npm run test:e2e` → Expected: semua tes bernomor 1–15 lulus (bila ada yang gagal karena patung, itu masuk Task 7).

---

### Task 6: Denah admin melingkar

**Files:**
- Modify: `assets/js/admin/gallery.js` (`planSVG`; tidak perlu mengubah `layoutFor`, `planNumbers`, `bindEvents`)
- Modify: `assets/css/admin.css` (hanya bila kelas denah baru diperlukan)
- Modify: `scripts/e2e.mjs` (tambah pemeriksaan di tes admin gallery yang sudah ada)

**Interfaces:**
- Consumes: `buildLayout` (Task 1) — `ring`, `foyer`, `rooms[].a0/a1`, `placements[].r/a/size/wall`.
- Produces: `planSVG(): string` — SVG `viewBox` persegi berpusat di `(0,0)` selebar `2*(rOut+1.5)`; setiap ruang adalah sektor cincin (`<path class="room">`) dengan label nama, dinding luar/dalam busur (`class="wall"`), garis partisi radial dengan celah pintu, aula tengah (`<circle class="hall">` dan titik patung), setiap karya kotak kecil (`<g class="art" data-plan="<id>">`) pada `polar(r, a)` diputar mengikuti dinding, nomor `i+1`, serta tanda `▶ masuk` di `a ≈ 0`. Atribut `role`, `aria-label`, `tabindex`, dan `<title>` per karya dipertahankan seperti sekarang.

- [ ] **Step 1: Tambah pemeriksaan e2e** pada tes admin gallery (sekitar `scripts/e2e.mjs:361`): setelah halaman terbuka, assert `.plan .room` berjumlah `ruang + 1` (foyer), `.plan [data-plan]` berjumlah sama dengan karya, dan klik pada salah satu `[data-plan]` membuka dialog edit.
- [ ] **Step 2: Jalankan e2e, pastikan gagal.** Run: `npm run test:e2e` → Expected: pemeriksaan denah gagal (SVG lama masih berbasis sumbu Z dan membaca `zStart`).
- [ ] **Step 3: Implementasikan `planSVG`** memakai busur SVG (`A`) untuk sektor. Gunakan kelas yang sudah ada (`room`, `room-label`, `wall`, `art`, `is-draft`).
- [ ] **Step 4: Verifikasi.** Run: `npm run test:e2e` → Expected: lulus; ambil screenshot `admin-gallery` yang dihasilkan e2e (`test-output/e2e/`) dan baca: sektor berurutan melingkar, nomor karya terbaca, tidak ada karya di luar sektornya.

---

### Task 7: Patung (manifest, cadangan, pemuat GLB)

**Files:**
- Create: `assets/js/statues.js`, `assets/js/statue-files.js`, `scripts/test-statues.mjs`
- Create: `assets/models/README.txt` (satu kalimat: berkas `.glb` model patung ditaruh di folder ini)
- Modify: `assets/js/gallery-3d.js` (panggil `createStatues`, `debug().statues`, `api.credits()`, `destroy`)
- Modify: `server/middleware/security.js`, `vite.config.js` (`blob:` pada `connect-src`)
- Modify: `package.json` (`test:statues` ditambahkan ke `test`)

**Interfaces:**
- Consumes: `Layout` (Task 1), `buildCentralHall().center` (Task 5), kualitas `'high'|'medium'|'low'`.
- Produces:
  - `statue-files.js`: `export const MODEL_FILES: Record<string, string>` = `import.meta.glob('../models/*.glb', { query: '?url', import: 'default', eager: true })` dinormalkan ke `{ 'angel-old-marble.glb': url, ... }`. Berkas tidak ada → kunci tidak ada (tanpa 404).
  - `statues.js`:
    ```
    STATUES: [{ id, slot:'center'|'door-0'|'door-1', file, height, plinth, enabled, pick?, credit:{ title, author, url, license } }]
    fitToHeight(object: THREE.Object3D, height: number): THREE.Object3D   // skala seragam, dasar di y=0, pusat xz di 0
    buildFallbackAngel(height: number, material?: THREE.Material): THREE.Group
    createStatues({ layout, quality, files, parent, useShadows, hallCenter, loadModel? }): Promise<{ group: THREE.Group, loaded: string[], credits(): Credit[], triangles(): number, dispose(): void }>
    // hallCenter = buildCentralHall().center, mis. [0, 0.24, 0]
    ```
    `loadModel(url, pick?) => Promise<THREE.Object3D>` default memakai `GLTFLoader` lalu memilih simpul bernama `pick` bila ada.
  - Isi `STATUES` (nilai persis): `center-angel` (`slot:'center'`, `file:'angel-old-marble.glb'`, `height:3.4`, `plinth:1.1`, `enabled:true`, kredit Sebastian Sosnowski / CC BY 4.0 / URL Sketchfab di spec); `praying-angel` (`slot:'door-0'`, `file:'angel-praying.glb'`, `height:2.6`, `plinth:0.9`, **`enabled:false`** dengan komentar bahwa lisensi Meshy belum terbukti); `cemetery-angel` (`slot:'door-1'`, `file:'cemetery-angels.glb'`, `height:2.4`, `plinth:0.9`, `enabled:true`, kredit JJORIS / CC BY 4.0 / URL Sketchfab di spec, `pick` diisi di Task 9).
  - Penempatan: `center` di `hallCenter` (alas + patung berdiri di atasnya) menghadap `rotY = 0`; `door-k` di `polar(rIn + 1.6, ap - 1.0/rIn)` dengan `ap = partitionAngles(layout)[k]`, `rotY = ap`, di atas alas silinder bertepi plakat; slot tanpa partisi dilewati.  - Aturan: patung `center` selalu tampil (cadangan bila file tidak ada/gagal); patung lain tampil hanya bila `enabled` **dan** file ada **dan** berhasil dimuat; `low` → total ≤ 2 patung; materi model diatur `roughness ≥ 0.55`, `metalness = 0`.

- [ ] **Step 1: Tulis `scripts/test-statues.mjs`** (format sama dengan tes lain; `files`/`loadModel` disuntikkan agar tak perlu Vite/DOM):
  - `fitToHeight: satuan cm`: kotak 40×340×40 (tinggi 340) → tinggi hasil `3.4` (±1e-6), `min.y = 0`, pusat x dan z `0` (±1e-6).
  - `fitToHeight: pusat jauh dari dasar`: objek yang bbox-nya `y ∈ [-10, 5]` → `min.y = 0`, tinggi sesuai target.
  - `cadangan: bentuk`: `buildFallbackAngel(3.4)` tinggi `3.4` (±0.05), segitiga `500..4000`.
  - Semua tes `createStatues` memakai `hallCenter = [0, 0.24, 0]`.
  - `patung utama tanpa file`: `files = {}` → `loaded` kosong, grup memuat tepat 1 patung (cadangan) dan `credits()` kosong.
  - `kredit`: `files` memuat tiga berkas dan `loadModel` sukses → `credits()` berisi `center-angel` dan `cemetery-angel`, **tidak** `praying-angel` (karena `enabled:false`); tanpa duplikat.
  - `model rusak`: `loadModel` melempar untuk `center-angel` → patung utama jatuh ke cadangan, `credits()` tidak memuatnya, `createStatues` tidak melempar dan tidak memanggil `console.error` (stub `console.error` dan assert 0 panggilan).
  - `model sekunder rusak`: `loadModel` melempar untuk `cemetery-angel` → dilewati tanpa error.
  - `kualitas low`: tiga model tersedia, `quality:'low'` → grup memuat ≤ 2 patung.
  - `penempatan door`: untuk tata letak 3 ruang, posisi `door-0` memiliki jari-jari `rIn + 1.6` (±1e-6) dan jarak ke partisi pertama ≥ 0.9 m.
  - `dispose`: setelah `dispose()` grup kosong dan tidak melempar saat dipanggil dua kali.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node scripts/test-statues.mjs` → Expected: modul tidak ditemukan.
- [ ] **Step 3: Implementasikan `statues.js` dan `statue-files.js`.** Cadangan: jubah dari `LatheGeometry`, kepala bola, dua sayap `ExtrudeGeometry` dari `Shape` berbentuk bulu lebar, satu lengan terangkat — semua berbahan marmer putih (`MeshStandardMaterial`, `color '#ece8e0'`, `roughness 0.6`). Kegagalan memuat ditangkap diam-diam; hanya `console.warn` tunggal untuk model sekunder yang `enabled` dan filenya ada tetapi gagal.
- [ ] **Step 4: Jalankan tes.** Run: `node scripts/test-statues.mjs` → Expected: `Hasil: N lulus, 0 gagal`.
- [ ] **Step 5: Integrasi di `createGallery`.** Panggil `createStatues` setelah aula tengah dibangun; `Q.statues = { high: 3, medium: 3, low: 2 }` ditambahkan ke tabel `QUALITY` dan diteruskan; `api.credits = () => statues.credits()`; `debug().statues = statues.loaded` dan `triangles` ikut terhitung lewat `renderer.info`. Tambah `blob:` ke `connect-src` di dua tempat CSP.
- [ ] **Step 6: Verifikasi.** Run: `npm run build` → Expected: sukses, tanpa peringatan `import.meta.glob`. Run: `npm run test:e2e` → Expected: lulus, **tanpa** satu pun error/peringatan konsol soal model (file belum ada). Dev-shot `stop:2` dan `stop:0`; baca PNG: malaikat cadangan berdiri di panggung aula, terlihat melalui bay.

---

### Task 8: Kredit, dokumentasi, dan CSP

**Files:**
- Modify: `index.html` (footer: `<p id="model-credits" class="footer-credit" hidden></p>`)
- Modify: `assets/js/pages/home.js` (isi kredit dari `gallery.credits()` setelah galeri siap)
- Modify: `assets/css/main.css` (gaya `.footer-credit` kecil, kontras cukup)
- Modify: `README.md` (bagian galeri 3D: bentuk cincin, istilah dinding dalam/luar, cara menambah model, kredit)
- Modify: `assets/js/admin/gallery.js` (hanya teks bantuan yang menyebut kiri/kanan/ujung bila ada)

**Interfaces:**
- Consumes: `api.credits(): Credit[]` (Task 7) dengan `Credit = { title, author, url, license }`.
- Produces: baris kredit `Model 3D: “<title>” oleh <author> (<license>)`, tautan ke `url` dengan `rel="noopener noreferrer"`, teks di-escape; disembunyikan bila daftar kosong.

- [ ] **Step 1: Tulis tes e2e** (tambahan di tes 2): `#model-credits` **tersembunyi** saat tidak ada file model (kondisi saat ini). Assert `hidden === true` dan teks kosong.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `npm run test:e2e` → Expected: elemen tidak ada.
- [ ] **Step 3: Implementasikan** footer, pengisian kredit, dan gaya. Pakai helper `esc` yang sudah ada.
- [ ] **Step 4: Dokumentasi README.** Jelaskan: istilah dinding dalam/luar/ujung, cara mengunduh tiga model (tautan di spec), nama berkas persis di `assets/models/`, kewajiban kredit CC BY, dan bahwa Meshy harus diperiksa lisensinya sebelum `enabled` diubah menjadi `true`.
- [ ] **Step 5: Jalankan.** Run: `npm run test:e2e` → Expected: lulus.

---

### Task 9: Pasang model asli (menunggu berkas dari pemilik)

Task ini **tidak bisa dimulai** sebelum pemilik menaruh berkas hasil unduhan di `assets/models/` dengan nama `angel-old-marble.glb` dan `cemetery-angels.glb` (opsional `angel-praying.glb`). Berhenti dan minta berkasnya bila belum ada.

**Files:**
- Create: `scripts/inspect-glb.mjs`
- Modify: `assets/js/statues.js` (hanya nilai `pick`, `height`, `plinth`, dan `enabled` Meshy bila pemilik memastikan lisensinya)

**Interfaces:**
- Produces: `node scripts/inspect-glb.mjs <path.glb>` mencetak per simpul `nama | jumlah segitiga | tinggi bbox` dan total segitiga.

- [ ] **Step 1: Tulis `scripts/inspect-glb.mjs`** (membaca berkas model lewat `GLTFLoader.parse` pada `ArrayBuffer`; path berkas hanya diterima sebagai argumen, tidak ada kode yang dijalankan dari folder model). Run: `node scripts/inspect-glb.mjs assets/models/angel-old-marble.glb` → Expected: daftar simpul dan total ≈ 9.880 segitiga.
- [ ] **Step 2: Periksa `cemetery-angels.glb`.** Run: `node scripts/inspect-glb.mjs assets/models/cemetery-angels.glb`; pilih simpul malaikat paling anggun (bertudung jubah, tangan di pipi) sebagai `pick`, isi di `STATUES`.
- [ ] **Step 3: Verifikasi visual.** `npm run dev`, dev-shot `stop:0`, `stop:2`, `stop:5`. Baca PNG. Expected: patung tinggi proporsional (3.4 m / 2.4 m), berdiri di alasnya, tidak melayang/tertanam, marmer terbaca terang tanpa terlalu gelap.
- [ ] **Step 4: Pemeriksaan kredit.** Buka beranda; footer menampilkan dua kredit (Sosnowski, JJORIS) dengan tautan benar.
- [ ] **Step 5: Anggaran mobile.** Run: `node scripts/dev-shot.mjs http://localhost:<port>/ test-output/mobile-statue.png stop:2 390 844 mobile` → Expected: `debug().triangles` < 120.000 dan gambar terbaca; `debug().statues` berisi ≤ 2 patung.

---

### Task 10: Verifikasi akhir

- [ ] **Step 1:** Run: `npm run build` → Expected: selesai tanpa error.
- [ ] **Step 2:** Run: `npm test` → Expected: `test:layout`, `test:ring`, `test:statues`, `test:schema`, dan `test:e2e` semuanya lulus, tidak ada error konsol kritis.
- [ ] **Step 3:** Ambil dan baca screenshot desktop (`stop:0`, `stop:2`, `stop:8`, akhir), tablet (`1024 768`), dan ponsel (`390 844 mobile`). Expected: tidak ada dinding menembus, tidak ada karya terpotong bay, tidak ada overflow horizontal.
- [ ] **Step 4:** Matikan WebGL (tes 14 di e2e) → Expected: fallback grid tetap berisi semua karya.
- [ ] **Step 5:** Laporkan hasil jujur ke pemilik: apa yang lulus, apa yang belum diuji (mis. model Meshy), dan folder `.superpowers/` serta `test-output/` yang bisa dihapus.
