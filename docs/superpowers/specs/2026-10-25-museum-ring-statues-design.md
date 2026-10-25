# Museum melingkar + patung malaikat — Rancangan

Tanggal: 2026-10-25. Proyek: `C:\Users\rofers\portfolio` (galeri 3D Three.js di beranda).

## Maksud

Galeri 3D di beranda sekarang satu koridor lurus ke arah -Z (foyer → ruang I → II → III → akhir). Pemilik ingin museum yang terasa seperti museum sungguhan: jalur **tidak lurus**, dan ada **patung** serta dekorasi. Dari tiga sketsa denah, pemilik memilih **C · Cincin mengelilingi aula patung**.

## Keputusan pemilik

- Bentuk: koridor melingkar mengelilingi aula tengah yang berisi satu patung besar. Kamera berputar satu kali mengelilingi cincin saat scroll dan berakhir dekat pintu masuk.
- Patung utama: malaikat marmer putih, sayap terbuka lebar, satu tangan terangkat (foto acuan pemilik; foto itu **tidak** dipasang di situs).
- Model 3D harus berlisensi bebas pakai. Tiga model disetujui:
  1. Sebastian Sosnowski, "Angel (old marble version)", CC BY 4.0, 9.880 segitiga, https://sketchfab.com/3d-models/angel-old-marble-version-2c879fc654b44f5e8d12527948535b51
  2. Meshy, "Antique-style angel statue", https://www.meshy.ai/3d-models/antique-style-angel-statue-019a31f7-93fb-7e98-84cd-b0827beef73e — **lisensi belum terbukti**.
  3. JJORIS, "free Angels Statues - Retopoed (kinda)", CC BY 4.0, 23.690 segitiga untuk tiga patung, https://sketchfab.com/3d-models/free-angels-statues-retopoed-kinda-4797a1710dd84e1cbe7a25585e4d3f20

## Keputusan saya (belum ditinjau pemilik)

1. **Ruang = sektor cincin**, bukan ruang bulat yang menonjol seperti di sketsa. Dinding melengkung dan partisi radial berpintu memakai ulang urutan foyer → ruang → akhir yang sudah ada, jauh lebih sederhana dibangun.
2. **Dinding kiri = dalam (menghadap aula), kanan = luar, ujung = partisi di akhir ruang.** Nilai `wall` di database tidak berubah; hanya label di admin.
3. Dinding dalam punya **bukaan lengkung (bay)** di setiap partisi antar-ruang dan foyer-ke-ruang I, supaya patung tengah terlihat dari koridor.
4. Patung utama = model Sosnowski. Model Meshy dan JJORIS berdiri di sisi dalam dekat pintu antar-ruang.
5. **File `.glb` tidak dibundel.** Sketchfab dan Meshy butuh login untuk mengunduh. Pemilik mengunduh dan menaruhnya di `assets/models/`. Tanpa file, patung utama diganti malaikat sederhana buatan kode; patung lain tidak ditampilkan.
6. Model Meshy `enabled: false` sampai pemilik memeriksa lisensinya.
7. Tidak ada lorong masuk terpisah: kamera mulai di foyer, dinding penutup ada di belakangnya.
8. "Dekorasi lain" = aula tengah (panggung bertingkat, lubang cahaya di langit-langit) dan alas patung berplakat. Tidak lebih.

## Tujuan

- Beranda memperlihatkan museum melingkar yang berfungsi penuh: scroll menggerakkan kamera, klik karya membuka modal, semua karya dari database tampil.
- Denah di Admin › Gallery ikut berbentuk lingkaran.
- Patung utama terlihat dari koridor melalui bay.
- Kredit CC BY tampil untuk setiap model asli yang dimuat.

## Bukan tujuan

- Admin untuk mengunggah/mengelola patung (cukup berkas manifest di kode).
- Patung yang bisa diklik atau dianimasikan.
- Perubahan skema database.
- Pengaturan bentuk museum dari admin.

## Anti-tujuan (dianggap gagal walau secara teknis jalan)

- Karya di dinding menumpuk, terpotong bay, atau keluar dari ruangnya.
- Kamera menembus dinding atau keluar koridor di titik mana pun saat scroll.
- Mobile jadi berat/patah-patah karena patung.
- Model berlisensi tak jelas ikut terkirim ke pengunjung.
- Konsol browser penuh error 404 karena file model belum ada.

## Batasan

- Tanpa dependensi npm baru (GLTFLoader sudah ada di `three/examples`).
- CSP tetap ketat (`script-src 'self'`); satu-satunya pelonggaran yang diizinkan: `blob:` pada `connect-src` untuk tekstur GLB.
- Tiga tingkat kualitas (`high`/`medium`/`low`) dipertahankan; `low` memuat paling banyak 2 patung.
- Fallback HTML tanpa WebGL tidak berubah.
