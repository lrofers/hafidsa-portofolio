// Mode DEMO: dipakai otomatis bila Supabase belum dikonfigurasi (.env kosong), supaya situs tetap bisa
// dilihat. Bentuk datanya sama dengan hasil normalisasi di api.js. Semua isi hanya placeholder.

const img = (n, w, h, alt) => ({ id: `demo-${n}`, url: `/demo/art-${String(n).padStart(2, '0')}.svg`, thumbUrl: `/demo/art-${String(n).padStart(2, '0')}.svg`, alt, width: w, height: h });

const IMAGES = {
  1: img(1, 1000, 1250, 'Komposisi abstrak: matahari di atas cakrawala bergaris'),
  2: img(2, 1000, 1250, 'Komposisi abstrak: lengkung bertumpuk berwarna hangat'),
  3: img(3, 1500, 1000, 'Komposisi abstrak: bidang warna persegi panjang'),
  4: img(4, 1250, 1250, 'Komposisi abstrak: gelombang berlapis hijau kebiruan'),
  5: img(5, 1000, 1250, 'Komposisi abstrak: lingkaran translusen di latar gelap'),
  6: img(6, 1500, 1000, 'Komposisi abstrak: garis diagonal berwarna'),
  7: img(7, 1500, 1000, 'Komposisi abstrak: matahari senja di atas air'),
  8: img(8, 1250, 1250, 'Komposisi abstrak: lengkung bertumpuk berwarna keemasan'),
  9: img(9, 1500, 1000, 'Komposisi abstrak: lingkaran translusen kehijauan'),
};

const software = [
  ['Adobe Photoshop', 'Desain & Foto', 'devicon', 'photoshop'],
  ['Adobe Illustrator', 'Desain & Foto', 'devicon', 'illustrator'],
  ['Adobe Premiere Pro', 'Video & Motion', 'devicon', 'premierepro'],
  ['Adobe After Effects', 'Video & Motion', 'devicon', 'aftereffects'],
  ['Figma', 'Desain & Foto', 'devicon', 'figma'],
  ['Blender', '3D', 'devicon', 'blender'],
  ['DaVinci Resolve', 'Video & Motion', 'simpleicons', 'davinciresolve'],
  ['Visual Studio Code', 'Web', 'devicon', 'vscode'],
  ['HTML5', 'Web', 'devicon', 'html5'],
  ['CSS3', 'Web', 'devicon', 'css3'],
  ['JavaScript', 'Web', 'devicon', 'javascript'],
  ['Three.js', 'Web', 'devicon', 'threejs'],
].map(([name, category, icon_source, icon_slug], i) => ({
  id: `sw-${i + 1}`, name, category, description: '', icon_source, icon_slug, icon_variant: 'original',
  icon_media: null, website_url: null, is_visible: true, sort_order: (i + 1) * 10,
}));

const project = (n, slug, title, category, year, featured, extra = {}) => ({
  id: `p-${n}`, slug, title, summary: 'Ringkasan singkat proyek contoh. Ganti lewat Admin › Projects.',
  description: 'Deskripsi panjang proyek contoh.\n\nParagraf kedua: jelaskan konteks, proses, dan hasil.',
  category, year, role: 'Peran Anda', client: null, external_url: null, video_url: null,
  is_featured: featured, status: 'published', sort_order: n * 10,
  thumbnail: IMAGES[n], cover: IMAGES[n], images: [], software: [], ...extra,
});

const projects = [
  project(1, 'contoh-proyek-satu', 'Contoh Proyek Satu', 'Fotografi', 2024, true, { images: [{ ...IMAGES[7], caption: 'Detail contoh' }, { ...IMAGES[8], caption: 'Detail contoh' }], software: [software[0]] }),
  project(2, 'contoh-proyek-dua', 'Contoh Proyek Dua', 'Desain Visual', 2023, true, { images: [{ ...IMAGES[9], caption: 'Detail contoh' }], software: [software[1]] }),
  project(3, 'contoh-proyek-tiga', 'Contoh Proyek Tiga', 'Motion', 2023, true, { software: [software[3]] }),
  project(4, 'contoh-proyek-empat', 'Contoh Proyek Empat', 'Web', 2022, false, { software: [software[11]] }),
  project(5, 'contoh-proyek-lima', 'Contoh Proyek Lima', 'Fotografi', 2022, false),
  project(6, 'contoh-proyek-enam', 'Contoh Proyek Enam', 'Desain Visual', 2021, false),
];

const art = (n, title, year, room, wall, frame, order, projIdx) => ({
  id: `a-${n}`, title, description: 'Deskripsi karya contoh. Edit di Admin › Gallery.', year, room, wall,
  frame_style: frame, status: 'published', sort_order: order, image: IMAGES[n],
  project: projIdx ? { slug: projects[projIdx - 1].slug, title: projects[projIdx - 1].title } : null,
});

export const demoData = {
  settings: {
    owner_name: 'Nama Anda', owner_role: 'Visual Creator', site_title: 'Portofolio — Nama Anda',
    meta_description: 'Galeri portofolio imersif 3D (mode demo).',
    hero_eyebrow: 'Galeri Digital', hero_title: 'Karya yang dipajang, bukan sekadar ditampilkan.',
    hero_subtitle: 'Gulir untuk berjalan melalui galeri.',
    theme: { accent: '#b4532a', paper: '#f4efe7', ink: '#1b1916', wall: '#efe9de' },
    animation: { enabled: true, intensity: 1, shadows: true, smoothing: 1.2 },
    page_visibility: { projects: true, about: true, contact: true, skills: true },
    gallery_rooms: [{ name: 'Ruang I', subtitle: 'Pengantar' }, { name: 'Ruang II', subtitle: 'Eksplorasi' }, { name: 'Ruang III', subtitle: 'Seri' }],
    email: null, phone: null, location: null, availability: null,
    contact_intro: 'Punya proyek atau ingin sekadar menyapa? Tulis pesan di bawah.',
    about_heading: 'Tentang',
    about_bio: 'Ini teks contoh. Ganti biografi Anda di Admin › About. Ceritakan latar belakang, cara bekerja, dan apa yang Anda cari dalam sebuah karya.',
    about_focus: ['Fokus kreatif pertama', 'Fokus kreatif kedua', 'Fokus kreatif ketiga'],
    about_extra: [{ label: 'Bahasa', value: 'Isi di Admin › About' }],
    logo: null, favicon: null, og: null,
    profile: { id: 'demo-profile', url: '/demo/profile-placeholder.svg', thumbUrl: '/demo/profile-placeholder.svg', alt: 'Placeholder foto profil', width: 800, height: 1000 },
  },
  social: [],
  projects,
  artworks: [
    art(1, 'Karya Contoh I', 2024, 1, 'left', 'black', 1, 1),
    art(2, 'Karya Contoh II', 2024, 1, 'left', 'black', 2, 2),
    art(3, 'Karya Contoh III', 2023, 1, 'right', 'oak', 1, 3),
    art(4, 'Karya Contoh IV', 2023, 2, 'left', 'white', 1, 4),
    art(5, 'Karya Contoh V', 2022, 2, 'right', 'black', 1, 5),
    art(6, 'Karya Contoh VI', 2022, 2, 'right', 'oak', 2, 6),
    art(7, 'Karya Contoh VII', 2021, 3, 'left', 'black', 1, 0),
    art(8, 'Karya Contoh VIII', 2021, 3, 'right', 'gold', 1, 0),
    art(9, 'Karya Contoh IX', 2020, 3, 'back', 'black', 1, 0),
  ],
  skills: [
    { id: 's1', name: 'Keahlian contoh satu', category: 'Kategori A', description: 'Deskripsi singkat keahlian.', level: null, is_visible: true, sort_order: 10 },
    { id: 's2', name: 'Keahlian contoh dua', category: 'Kategori A', description: 'Deskripsi singkat keahlian.', level: null, is_visible: true, sort_order: 20 },
    { id: 's3', name: 'Keahlian contoh tiga', category: 'Kategori B', description: 'Deskripsi singkat keahlian.', level: null, is_visible: true, sort_order: 30 },
  ],
  software,
  experiences: [{ id: 'e1', title: 'Posisi contoh', organization: 'Organisasi contoh', location: null, start_year: 2022, end_year: null, description: 'Placeholder — ganti dengan pengalaman Anda.' }],
  education: [{ id: 'd1', institution: 'Institusi contoh', program: 'Program studi contoh', start_year: 2018, end_year: 2022, description: 'Placeholder — ganti dengan riwayat pendidikan Anda.' }],
};
