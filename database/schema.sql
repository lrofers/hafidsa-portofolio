-- =====================================================================
--  Immersive 3D Portfolio — skema database Supabase (PostgreSQL)
--  Jalankan sekali di Supabase Dashboard > SQL Editor (atau `supabase db push`).
--  Script ini idempotent: aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper umum
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. profiles  (1:1 dengan auth.users, menyimpan role)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Fungsi otorisasi utama. SECURITY DEFINER agar tidak rekursif terhadap RLS profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Setiap akun baru otomatis mendapat profil dengan role 'user' (BUKAN admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, split_part(new.email, '@', 1), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prosedur administrator pertama. Hanya bisa dijalankan dari SQL Editor / service role,
-- dan otomatis menolak jika sudah ada admin.
create or replace function public.bootstrap_first_admin(admin_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Administrator sudah ada. Gunakan panel admin atau SQL manual untuk mengubah role.';
  end if;

  select id into uid from auth.users where lower(email) = lower(admin_email);
  if uid is null then
    raise exception 'Pengguna % tidak ditemukan di auth.users. Buat dulu lewat Authentication > Users.', admin_email;
  end if;

  insert into public.profiles (id, display_name, role)
  values (uid, split_part(admin_email, '@', 1), 'admin')
  on conflict (id) do update set role = 'admin';

  return format('OK: %s sekarang adalah administrator.', admin_email);
end;
$$;

revoke all on function public.bootstrap_first_admin(text) from public, anon, authenticated;
-- service_role (dipakai `npm run create-admin`) tetap boleh memanggilnya
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.bootstrap_first_admin(text) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. media_assets  (metadata file di Supabase Storage)
-- ---------------------------------------------------------------------
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'portfolio',
  path         text,            -- objek utama di Storage
  thumb_path   text,            -- versi kecil untuk grid & smartphone
  external_url text,            -- aset yang dibundel bersama situs (mis. /demo/art-01.svg)
  title        text,
  alt_text     text not null default '',
  mime_type    text,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint media_assets_source_chk check (path is not null or external_url is not null)
);
create index if not exists media_assets_created_idx on public.media_assets (created_at desc);

-- ---------------------------------------------------------------------
-- 3. site_settings  (satu baris, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  id               smallint primary key default 1 check (id = 1),
  owner_name       text not null default 'Nama Anda',
  owner_role       text not null default 'Visual Creator',
  site_title       text not null default 'Portofolio — Nama Anda',
  meta_description text not null default 'Galeri portofolio imersif 3D.',
  hero_eyebrow     text not null default 'Galeri Digital',
  hero_title       text not null default 'Karya yang dipajang, bukan sekadar ditampilkan.',
  hero_subtitle    text not null default 'Gulir untuk berjalan melalui galeri.',
  logo_media_id    uuid references public.media_assets (id) on delete restrict,
  favicon_media_id uuid references public.media_assets (id) on delete restrict,
  og_media_id      uuid references public.media_assets (id) on delete restrict,
  profile_media_id uuid references public.media_assets (id) on delete restrict,
  theme            jsonb not null default '{"accent":"#b4532a","paper":"#f4efe7","ink":"#1b1916","wall":"#efe9de"}'::jsonb,
  animation        jsonb not null default '{"enabled":true,"intensity":1,"shadows":true,"smoothing":1.2}'::jsonb,
  page_visibility  jsonb not null default '{"projects":true,"about":true,"contact":true,"skills":true}'::jsonb,
  gallery_rooms    jsonb not null default '[{"name":"Ruang I","subtitle":"Pengantar"},{"name":"Ruang II","subtitle":"Eksplorasi"},{"name":"Ruang III","subtitle":"Seri"}]'::jsonb,
  email            text,
  phone            text,
  location         text,
  availability     text,
  contact_intro    text not null default 'Punya proyek atau ingin sekadar menyapa? Tulis pesan di bawah.',
  about_heading    text not null default 'Tentang',
  about_bio        text not null default '',
  about_focus      jsonb not null default '[]'::jsonb,   -- ["Fotografi", "Motion", ...]
  about_extra      jsonb not null default '[]'::jsonb,   -- [{"label":"Bahasa","value":"Indonesia, Inggris"}]
  hall_cards       jsonb not null default '[]'::jsonb,   -- tiga bingkai informasi profil di aula patung
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.site_settings
  add column if not exists hall_cards jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 4. projects, project_images
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null check (char_length(title) between 1 and 160),
  summary            text not null default '',
  description        text not null default '',
  category           text not null default 'Umum',
  year               integer check (year is null or year between 1900 and 2100),
  role               text,
  client             text,
  external_url       text check (external_url is null or external_url ~* '^https?://'),
  video_url          text check (video_url is null or video_url ~* '^https?://'),
  thumbnail_media_id uuid references public.media_assets (id) on delete restrict,
  cover_media_id     uuid references public.media_assets (id) on delete restrict,
  is_featured        boolean not null default false,
  status             text not null default 'draft' check (status in ('draft', 'published')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists projects_status_sort_idx on public.projects (status, sort_order);
create index if not exists projects_category_idx    on public.projects (category);
create index if not exists projects_featured_idx    on public.projects (is_featured) where is_featured;

create table if not exists public.project_images (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  media_id   uuid not null references public.media_assets (id) on delete restrict,
  caption    text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_images_project_idx on public.project_images (project_id, sort_order);
create index if not exists project_images_media_idx   on public.project_images (media_id);

-- ---------------------------------------------------------------------
-- 5. gallery_artworks  (karya yang tergantung di dinding galeri 3D)
-- ---------------------------------------------------------------------
create table if not exists public.gallery_artworks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  year        integer check (year is null or year between 1900 and 2100),
  media_id    uuid references public.media_assets (id) on delete restrict,
  project_id  uuid references public.projects (id) on delete set null,
  room        integer not null default 1 check (room between 1 and 12),
  wall        text not null default 'left' check (wall in ('left', 'right', 'back')),
  frame_style text not null default 'black' check (frame_style in ('black', 'oak', 'white', 'gold', 'none')),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gallery_layout_idx on public.gallery_artworks (status, room, wall, sort_order);
create index if not exists gallery_media_idx  on public.gallery_artworks (media_id);
create index if not exists gallery_project_idx on public.gallery_artworks (project_id);

-- ---------------------------------------------------------------------
-- 6. skills, software_tools, project_software
-- ---------------------------------------------------------------------
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  category    text not null default 'Umum',
  description text not null default '',
  level       smallint check (level is null or level between 0 and 100),
  is_visible  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists skills_visible_sort_idx on public.skills (is_visible, sort_order);

create table if not exists public.software_tools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  category      text not null default 'Software',
  description   text not null default '',
  icon_source   text not null default 'devicon' check (icon_source in ('devicon', 'simpleicons', 'custom')),
  icon_slug     text,                       -- mis. "photoshop" (devicon) atau "figma" (simpleicons)
  icon_variant  text not null default 'original' check (icon_variant in ('original', 'plain', 'line', 'wordmark')),
  icon_media_id uuid references public.media_assets (id) on delete restrict,   -- untuk logo kustom
  website_url   text check (website_url is null or website_url ~* '^https?://'),
  is_visible    boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint software_icon_chk check (
    (icon_source = 'custom' and icon_media_id is not null)
    or (icon_source <> 'custom' and icon_slug is not null)
  )
);
create index if not exists software_visible_sort_idx on public.software_tools (is_visible, sort_order);

create table if not exists public.project_software (
  project_id  uuid not null references public.projects (id) on delete cascade,
  software_id uuid not null references public.software_tools (id) on delete cascade,
  primary key (project_id, software_id)
);
create index if not exists project_software_software_idx on public.project_software (software_id);

-- ---------------------------------------------------------------------
-- 7. experiences, education, social_links
-- ---------------------------------------------------------------------
create table if not exists public.experiences (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  organization text not null default '',
  location     text,
  start_year   integer check (start_year is null or start_year between 1900 and 2100),
  end_year     integer check (end_year is null or end_year between 1900 and 2100),   -- NULL = sekarang
  description  text not null default '',
  is_visible   boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint experiences_years_chk check (end_year is null or start_year is null or end_year >= start_year)
);
create index if not exists experiences_sort_idx on public.experiences (is_visible, sort_order);

create table if not exists public.education (
  id          uuid primary key default gen_random_uuid(),
  institution text not null,
  program     text not null default '',
  start_year  integer check (start_year is null or start_year between 1900 and 2100),
  end_year    integer check (end_year is null or end_year between 1900 and 2100),
  description text not null default '',
  is_visible  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint education_years_chk check (end_year is null or start_year is null or end_year >= start_year)
);
create index if not exists education_sort_idx on public.education (is_visible, sort_order);

create table if not exists public.social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null,
  label      text not null default '',
  url        text not null check (url ~* '^(https?://|mailto:)'),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_sort_idx on public.social_links (is_visible, sort_order);

-- ---------------------------------------------------------------------
-- 8. contact_messages
-- ---------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 254 and email like '%_@_%.__%'),
  subject    text not null default '' check (char_length(subject) <= 200),
  message    text not null check (char_length(message) between 5 and 5000),
  status     text not null default 'new' check (status in ('new', 'read', 'archived')),
  ip_hash    text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_email_idx   on public.contact_messages (lower(email), created_at desc);

-- Pengiriman dari situs statis (tanpa server Express): validasi + throttling di dalam database.
create or replace function public.submit_contact_message(
  p_name text, p_email text, p_subject text, p_message text, p_website text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- honeypot: bot mengisi field tersembunyi -> abaikan diam-diam
  if coalesce(p_website, '') <> '' then
    return;
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or char_length(v_email) not between 3 and 254
     or v_email not like '%_@_%.__%'
     or char_length(btrim(coalesce(p_message, ''))) not between 5 and 5000
     or char_length(coalesce(p_subject, '')) > 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if (select count(*) from public.contact_messages
       where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.contact_messages
          where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.contact_messages (name, email, subject, message)
  values (btrim(p_name), v_email, btrim(coalesce(p_subject, '')), btrim(p_message));
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','media_assets','site_settings','projects','gallery_artworks',
    'skills','software_tools','experiences','education','social_links'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. View pemakaian media (untuk "hapus file yang tidak digunakan")
-- ---------------------------------------------------------------------
create or replace view public.media_usage
with (security_invoker = true) as
select
  m.id as media_id,
  (
    (select count(*) from public.projects p where p.thumbnail_media_id = m.id or p.cover_media_id = m.id)
  + (select count(*) from public.project_images pi where pi.media_id = m.id)
  + (select count(*) from public.gallery_artworks g where g.media_id = m.id)
  + (select count(*) from public.software_tools s where s.icon_media_id = m.id)
  + (select count(*) from public.site_settings st
       where st.logo_media_id = m.id or st.favicon_media_id = m.id
          or st.og_media_id = m.id or st.profile_media_id = m.id)
  )::int as usage_count
from public.media_assets m;

-- ---------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.media_assets     enable row level security;
alter table public.site_settings    enable row level security;
alter table public.projects         enable row level security;
alter table public.project_images   enable row level security;
alter table public.gallery_artworks enable row level security;
alter table public.skills           enable row level security;
alter table public.software_tools   enable row level security;
alter table public.project_software enable row level security;
alter table public.experiences      enable row level security;
alter table public.education        enable row level security;
alter table public.social_links     enable row level security;
alter table public.contact_messages enable row level security;

-- profiles: pengguna melihat profilnya sendiri; hanya admin yang boleh mengubah (termasuk role).
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;
create policy "profiles self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles admin all" on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- konten publik: baca bebas (hanya yang diterbitkan), tulis hanya admin
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('media_assets',     'true'),
      ('site_settings',    'true'),
      ('projects',         $c$status = 'published'$c$),
      ('gallery_artworks', $c$status = 'published'$c$),
      ('skills',           'is_visible'),
      ('software_tools',   'is_visible'),
      ('experiences',      'is_visible'),
      ('education',       'is_visible'),
      ('social_links',     'is_visible')
    ) as v(tbl, cond)
  loop
    execute format('drop policy if exists "public read" on public.%I', r.tbl);
    execute format('drop policy if exists "admin all" on public.%I', r.tbl);
    execute format('create policy "public read" on public.%I for select using (%s or public.is_admin())', r.tbl, r.cond);
    execute format('create policy "admin all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', r.tbl);
  end loop;
end $$;

drop policy if exists "public read" on public.project_images;
drop policy if exists "admin all"   on public.project_images;
create policy "public read" on public.project_images for select using (
  public.is_admin()
  or exists (select 1 from public.projects p where p.id = project_id and p.status = 'published')
);
create policy "admin all" on public.project_images for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.project_software;
drop policy if exists "admin all"   on public.project_software;
create policy "public read" on public.project_software for select using (
  public.is_admin()
  or exists (select 1 from public.projects p where p.id = project_id and p.status = 'published')
);
create policy "admin all" on public.project_software for all using (public.is_admin()) with check (public.is_admin());

-- contact_messages: tidak ada akses langsung untuk publik. Insert lewat submit_contact_message()/server.
drop policy if exists "admin all" on public.contact_messages;
create policy "admin all" on public.contact_messages for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.contact_messages from anon;

-- ---------------------------------------------------------------------
-- 12. Storage: bucket publik "portfolio"; tulis hanya admin
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio', 'portfolio', true, 15728640,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portfolio public read"   on storage.objects;
drop policy if exists "portfolio admin insert"  on storage.objects;
drop policy if exists "portfolio admin update"  on storage.objects;
drop policy if exists "portfolio admin delete"  on storage.objects;

create policy "portfolio public read"  on storage.objects for select
  using (bucket_id = 'portfolio');
create policy "portfolio admin insert" on storage.objects for insert
  with check (bucket_id = 'portfolio' and public.is_admin());
create policy "portfolio admin update" on storage.objects for update
  using (bucket_id = 'portfolio' and public.is_admin())
  with check (bucket_id = 'portfolio' and public.is_admin());
create policy "portfolio admin delete" on storage.objects for delete
  using (bucket_id = 'portfolio' and public.is_admin());
