-- =====================================================================
--  Seed data DEMO (konten placeholder — ganti semuanya lewat panel admin)
--  Jalankan SETELAH schema.sql. Aman dijalankan ulang (ON CONFLICT DO NOTHING).
--  Gambar merujuk ke file yang dibundel situs (/demo/art-XX.svg) lewat media_assets.external_url,
--  sehingga galeri 3D langsung terisi tanpa upload. Ganti dengan foto Anda dari Admin > Media.
-- =====================================================================

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- Media demo -----------------------------------------------------------
insert into public.media_assets (id, external_url, title, alt_text, mime_type, width, height) values
 ('10000000-0000-4000-8000-000000000001', '/demo/art-01.svg', 'Karya contoh 01', 'Komposisi abstrak: matahari di atas cakrawala bergaris',   'image/svg+xml', 1000, 1250),
 ('10000000-0000-4000-8000-000000000002', '/demo/art-02.svg', 'Karya contoh 02', 'Komposisi abstrak: lengkung bertumpuk berwarna hangat',    'image/svg+xml', 1000, 1250),
 ('10000000-0000-4000-8000-000000000003', '/demo/art-03.svg', 'Karya contoh 03', 'Komposisi abstrak: bidang warna persegi panjang',          'image/svg+xml', 1500, 1000),
 ('10000000-0000-4000-8000-000000000004', '/demo/art-04.svg', 'Karya contoh 04', 'Komposisi abstrak: gelombang berlapis hijau kebiruan',      'image/svg+xml', 1250, 1250),
 ('10000000-0000-4000-8000-000000000005', '/demo/art-05.svg', 'Karya contoh 05', 'Komposisi abstrak: lingkaran translusen di latar gelap',   'image/svg+xml', 1000, 1250),
 ('10000000-0000-4000-8000-000000000006', '/demo/art-06.svg', 'Karya contoh 06', 'Komposisi abstrak: garis diagonal berwarna',               'image/svg+xml', 1500, 1000),
 ('10000000-0000-4000-8000-000000000007', '/demo/art-07.svg', 'Karya contoh 07', 'Komposisi abstrak: matahari senja di atas air',            'image/svg+xml', 1500, 1000),
 ('10000000-0000-4000-8000-000000000008', '/demo/art-08.svg', 'Karya contoh 08', 'Komposisi abstrak: lengkung bertumpuk berwarna keemasan',  'image/svg+xml', 1250, 1250),
 ('10000000-0000-4000-8000-000000000009', '/demo/art-09.svg', 'Karya contoh 09', 'Komposisi abstrak: lingkaran translusen kehijauan',        'image/svg+xml', 1500, 1000),
 ('10000000-0000-4000-8000-000000000010', '/demo/profile-placeholder.svg', 'Placeholder foto profil', 'Placeholder foto profil — ganti dengan foto Anda', 'image/svg+xml', 800, 1000)
on conflict (id) do nothing;

update public.site_settings
   set profile_media_id = '10000000-0000-4000-8000-000000000010',
       about_bio = 'Ini teks contoh. Ganti biografi Anda di Admin > About. Ceritakan latar belakang, cara bekerja, dan apa yang Anda cari dalam sebuah karya.',
       about_focus = '["Fokus kreatif pertama", "Fokus kreatif kedua", "Fokus kreatif ketiga"]'::jsonb,
       about_extra = '[{"label":"Bahasa","value":"Isi di Admin > About"}]'::jsonb
 where id = 1 and profile_media_id is null and about_bio = '';

-- Proyek demo ----------------------------------------------------------
insert into public.projects
  (id, slug, title, summary, description, category, year, role, thumbnail_media_id, cover_media_id, is_featured, status, sort_order)
values
 ('20000000-0000-4000-8000-000000000001', 'contoh-proyek-satu', 'Contoh Proyek Satu', 'Ringkasan singkat proyek contoh. Ganti lewat Admin > Projects.', E'Deskripsi panjang proyek contoh.\n\nParagraf kedua: jelaskan konteks, proses, dan hasil.', 'Fotografi', 2024, 'Peran Anda', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', true,  'published', 10),
 ('20000000-0000-4000-8000-000000000002', 'contoh-proyek-dua',  'Contoh Proyek Dua',  'Ringkasan singkat proyek contoh.', E'Deskripsi panjang proyek contoh.\n\nParagraf kedua.', 'Desain Visual', 2023, 'Peran Anda', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', true,  'published', 20),
 ('20000000-0000-4000-8000-000000000003', 'contoh-proyek-tiga', 'Contoh Proyek Tiga', 'Ringkasan singkat proyek contoh.', E'Deskripsi panjang proyek contoh.', 'Motion', 2023, 'Peran Anda', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', true,  'published', 30),
 ('20000000-0000-4000-8000-000000000004', 'contoh-proyek-empat','Contoh Proyek Empat','Ringkasan singkat proyek contoh.', E'Deskripsi panjang proyek contoh.', 'Web', 2022, 'Peran Anda', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', false, 'published', 40),
 ('20000000-0000-4000-8000-000000000005', 'contoh-proyek-lima', 'Contoh Proyek Lima', 'Ringkasan singkat proyek contoh.', E'Deskripsi panjang proyek contoh.', 'Fotografi', 2022, 'Peran Anda', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', false, 'published', 50),
 ('20000000-0000-4000-8000-000000000006', 'contoh-proyek-enam', 'Contoh Proyek Enam', 'Ringkasan singkat proyek contoh.', E'Deskripsi panjang proyek contoh.', 'Desain Visual', 2021, 'Peran Anda', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', false, 'published', 60)
on conflict (id) do nothing;

insert into public.project_images (project_id, media_id, caption, sort_order)
select p, m, 'Detail contoh', n from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000007'::uuid, 1),
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000008'::uuid, 2),
  ('20000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000009'::uuid, 1)
) as v(p, m, n)
where not exists (select 1 from public.project_images);

-- Karya galeri 3D ------------------------------------------------------
insert into public.gallery_artworks
  (id, title, description, year, media_id, project_id, room, wall, frame_style, status, sort_order)
values
 ('30000000-0000-4000-8000-000000000001', 'Karya Contoh I',    'Deskripsi karya contoh. Edit di Admin > Gallery.', 2024, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'left',  'black', 'published', 1),
 ('30000000-0000-4000-8000-000000000002', 'Karya Contoh II',   'Deskripsi karya contoh.', 2024, '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 1, 'left',  'black', 'published', 2),
 ('30000000-0000-4000-8000-000000000003', 'Karya Contoh III',  'Deskripsi karya contoh.', 2023, '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 1, 'right', 'oak',   'published', 1),
 ('30000000-0000-4000-8000-000000000004', 'Karya Contoh IV',   'Deskripsi karya contoh.', 2023, '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 2, 'left',  'white', 'published', 1),
 ('30000000-0000-4000-8000-000000000005', 'Karya Contoh V',    'Deskripsi karya contoh.', 2022, '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 2, 'right', 'black', 'published', 1),
 ('30000000-0000-4000-8000-000000000006', 'Karya Contoh VI',   'Deskripsi karya contoh.', 2022, '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 2, 'right', 'oak',   'published', 2),
 ('30000000-0000-4000-8000-000000000007', 'Karya Contoh VII',  'Deskripsi karya contoh.', 2021, '10000000-0000-4000-8000-000000000007', null,                                   3, 'left',  'black', 'published', 1),
 ('30000000-0000-4000-8000-000000000008', 'Karya Contoh VIII', 'Deskripsi karya contoh.', 2021, '10000000-0000-4000-8000-000000000008', null,                                   3, 'right', 'gold',  'published', 1),
 ('30000000-0000-4000-8000-000000000009', 'Karya Contoh IX',   'Deskripsi karya contoh.', 2020, '10000000-0000-4000-8000-000000000009', null,                                   3, 'back',  'black', 'published', 1)
on conflict (id) do nothing;

-- Software (katalog awal; SEMUA tersembunyi — aktifkan hanya yang benar-benar Anda pakai) ---
insert into public.software_tools (id, name, category, icon_source, icon_slug, icon_variant, is_visible, sort_order, website_url) values
 ('40000000-0000-4000-8000-000000000001', 'Adobe Photoshop',     'Desain & Foto', 'devicon',     'photoshop',     'original', false, 10,  'https://www.adobe.com/products/photoshop.html'),
 ('40000000-0000-4000-8000-000000000002', 'Adobe Illustrator',   'Desain & Foto', 'devicon',     'illustrator',   'original', false, 20,  'https://www.adobe.com/products/illustrator.html'),
 ('40000000-0000-4000-8000-000000000003', 'Adobe Premiere Pro',  'Video & Motion','devicon',     'premierepro',   'original', false, 30,  'https://www.adobe.com/products/premiere.html'),
 ('40000000-0000-4000-8000-000000000004', 'Adobe After Effects', 'Video & Motion','devicon',     'aftereffects',  'original', false, 40,  'https://www.adobe.com/products/aftereffects.html'),
 ('40000000-0000-4000-8000-000000000005', 'Figma',               'Desain & Foto', 'devicon',     'figma',         'original', false, 50,  'https://www.figma.com'),
 ('40000000-0000-4000-8000-000000000006', 'Blender',             '3D',            'devicon',     'blender',       'original', false, 60,  'https://www.blender.org'),
 ('40000000-0000-4000-8000-000000000007', 'DaVinci Resolve',     'Video & Motion','simpleicons', 'davinciresolve','original', false, 70,  'https://www.blackmagicdesign.com/products/davinciresolve'),
 ('40000000-0000-4000-8000-000000000008', 'Visual Studio Code',  'Web',           'devicon',     'vscode',        'original', false, 80,  'https://code.visualstudio.com'),
 ('40000000-0000-4000-8000-000000000009', 'HTML5',               'Web',           'devicon',     'html5',         'original', false, 90,  null),
 ('40000000-0000-4000-8000-000000000010', 'CSS3',                'Web',           'devicon',     'css3',          'original', false, 100, null),
 ('40000000-0000-4000-8000-000000000011', 'JavaScript',          'Web',           'devicon',     'javascript',    'original', false, 110, null),
 ('40000000-0000-4000-8000-000000000012', 'Three.js',            'Web',           'devicon',     'threejs',       'original', false, 120, 'https://threejs.org')
on conflict (id) do nothing;

insert into public.project_software (project_id, software_id) values
 ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000004'),
 ('20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000012')
on conflict do nothing;

-- Skills, pengalaman, pendidikan (placeholder) ----------------------------
insert into public.skills (id, name, category, description, is_visible, sort_order) values
 ('50000000-0000-4000-8000-000000000001', 'Keahlian contoh satu', 'Kategori A', 'Deskripsi singkat keahlian. Edit di Admin > Skills.', true, 10),
 ('50000000-0000-4000-8000-000000000002', 'Keahlian contoh dua',  'Kategori A', 'Deskripsi singkat keahlian.', true, 20),
 ('50000000-0000-4000-8000-000000000003', 'Keahlian contoh tiga', 'Kategori B', 'Deskripsi singkat keahlian.', true, 30)
on conflict (id) do nothing;

insert into public.experiences (id, title, organization, start_year, end_year, description, is_visible, sort_order) values
 ('60000000-0000-4000-8000-000000000001', 'Posisi contoh', 'Organisasi contoh', 2022, null, 'Placeholder — ganti dengan pengalaman Anda yang sebenarnya.', true, 10)
on conflict (id) do nothing;

insert into public.education (id, institution, program, start_year, end_year, description, is_visible, sort_order) values
 ('70000000-0000-4000-8000-000000000001', 'Institusi contoh', 'Program studi contoh', 2018, 2022, 'Placeholder — ganti dengan riwayat pendidikan Anda yang sebenarnya.', true, 10)
on conflict (id) do nothing;
