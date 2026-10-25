// Halaman detail proyek: gambar besar, komposisi asimetris, galeri foto, video opsional, tautan eksternal.
import { loadProject, loadProjects } from '../api.js';
import { $, esc, paragraphs, safeUrl, parseVideo } from '../utils.js';
import { imgTag, projectHref, softwareGridHTML } from '../projects.js';
import { renderIcons, bindIconFallbacks } from '../icons.js';
import { openLightbox } from '../lightbox.js';
import { initParallax } from '../animations.js';
import { renderError } from '../main.js';

export async function init({ settings }) {
  const root = $('#project');
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) { root.innerHTML = notFound(); return; }

  let project; let all = [];
  try { [project, all] = await Promise.all([loadProject(slug), loadProjects()]); } catch (err) { renderError(root, err); return; }
  if (!project) { root.innerHTML = notFound(); document.title = `Proyek tidak ditemukan — ${settings.owner_name}`; return; }

  document.title = `${project.title} — ${settings.owner_name}`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc && project.summary) desc.setAttribute('content', project.summary);

  const video = parseVideo(project.video_url);
  const ext = safeUrl(project.external_url);
  const meta = [
    ['Kategori', project.category], ['Tahun', project.year], ['Peran', project.role], ['Klien', project.client],
  ].filter(([, v]) => v);

  const idx = all.findIndex((p) => p.id === project.id);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  root.innerHTML = `
    <header class="pd-head">
      <p class="eyebrow" data-intro>${esc(project.category)}${project.year ? ` · ${esc(project.year)}` : ''}</p>
      <h1 class="display" data-intro>${esc(project.title)}</h1>
      ${project.summary ? `<p class="lead" data-intro>${esc(project.summary)}</p>` : ''}
    </header>

    ${project.cover || project.thumbnail ? `<figure class="pd-cover" data-reveal><button type="button" class="pd-zoom" data-zoom="cover" aria-label="Perbesar gambar utama">${imgTag(project.cover || project.thumbnail, { eager: true, full: true, sizes: '100vw' })}</button></figure>` : ''}

    <div class="pd-body">
      <aside class="pd-meta" data-reveal>
        <dl>${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${project.software.length ? `<div class="pd-software"><h2 class="eyebrow">Software</h2>${softwareGridHTML(project.software)}</div>` : ''}
        ${ext ? `<a class="btn" href="${esc(ext)}" target="_blank" rel="noopener noreferrer">Kunjungi proyek<i data-lucide="arrow-up-right"></i></a>` : ''}
      </aside>
      <div class="pd-text prose" data-reveal>${paragraphs(project.description) || '<p class="muted">Deskripsi belum diisi.</p>'}</div>
    </div>

    ${video ? `<section class="pd-video" data-reveal aria-label="Video demo">${videoEmbed(video, project.title)}</section>` : ''}

    ${project.images.length ? `
      <section class="pd-gallery" aria-label="Galeri foto proyek">
        ${project.images.map((im, i) => `
          <figure class="pd-shot pd-shot--${i % 3}" data-reveal>
            <button type="button" class="pd-zoom" data-zoom="${i}" aria-label="Perbesar foto ${i + 1}">${imgTag(im, { sizes: '(min-width: 900px) 60vw, 100vw' })}</button>
            ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}
          </figure>`).join('')}
      </section>` : ''}

    <nav class="pd-nav" aria-label="Proyek lain">
      ${prev ? `<a href="${projectHref(prev)}" rel="prev"><span class="eyebrow">Sebelumnya</span><strong>${esc(prev.title)}</strong></a>` : '<span></span>'}
      <a class="pd-all" href="/projects.html">Semua proyek</a>
      ${next ? `<a href="${projectHref(next)}" rel="next" class="pd-next"><span class="eyebrow">Berikutnya</span><strong>${esc(next.title)}</strong></a>` : '<span></span>'}
    </nav>`;

  const items = [];
  const cover = project.cover || project.thumbnail;
  if (cover) items.push({ image: cover, title: project.title, meta: project.category, description: '' });
  project.images.forEach((im) => items.push({ image: im, title: project.title, meta: project.category, description: im.caption }));
  root.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (!z) return;
    const k = z.dataset.zoom === 'cover' ? 0 : Number(z.dataset.zoom) + (cover ? 1 : 0);
    openLightbox(items, k, { opener: z });
  });

  renderIcons(root);
  bindIconFallbacks(root);
  initParallax(root);
}

function videoEmbed(v, title) {
  if (v.type === 'iframe') {
    return `<div class="pd-video__frame"><iframe src="${esc(v.src)}" title="Video: ${esc(title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  }
  if (v.type === 'video') {
    return `<div class="pd-video__frame"><video src="${esc(v.src)}" controls preload="metadata" playsinline></video></div>`;
  }
  return `<a class="btn" href="${esc(v.src)}" target="_blank" rel="noopener noreferrer">Tonton video demo<i data-lucide="play"></i></a>`;
}

function notFound() {
  return `<section class="notice"><h1 class="display">Proyek tidak ditemukan</h1><p class="muted">Proyek yang Anda cari tidak ada atau belum diterbitkan.</p><p><a class="link-arrow" href="/projects.html">Lihat semua proyek</a></p></section>`;
}
