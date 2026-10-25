// Komponen tampilan proyek yang dipakai beranda, daftar proyek, dan detail proyek.
import { esc } from './utils.js';
import { softwareLogoHTML } from './icons.js';

export function imgTag(image, { sizes = '(min-width: 900px) 50vw, 100vw', eager = false, full = false, cls = '' } = {}) {
  if (!image?.url) return `<div class="img-empty ${cls}" role="img" aria-label="Belum ada gambar"></div>`;
  const src = full ? image.url : image.thumbUrl || image.url;
  const dims = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : '';
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(image.alt)}"${dims} sizes="${sizes}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

export function projectHref(p) {
  return `/project-detail.html?slug=${encodeURIComponent(p.slug)}`;
}

export function projectCardHTML(p, i, { variant = '' } = {}) {
  const n = String(i + 1).padStart(2, '0');
  const aspect = p.thumbnail?.width && p.thumbnail?.height ? Math.max(0.7, Math.min(1.6, p.thumbnail.width / p.thumbnail.height)) : 1.25;
  return `
    <article class="card ${variant}" data-reveal data-category="${esc(p.category)}">
      <a class="card__link" href="${projectHref(p)}" aria-label="${esc(p.title)}">
        <div class="card__media" style="--ar:${aspect.toFixed(3)}">${imgTag(p.thumbnail || p.cover, { sizes: '(min-width: 900px) 45vw, 92vw' })}</div>
        <div class="card__meta">
          <span class="card__num">${n}</span>
          <h3 class="card__title">${esc(p.title)}</h3>
          <p class="card__sub"><span>${esc(p.category)}</span>${p.year ? `<span>${esc(p.year)}</span>` : ''}</p>
          ${p.summary ? `<p class="card__desc">${esc(p.summary)}</p>` : ''}
        </div>
      </a>
    </article>`;
}

/** Keahlian dikelompokkan per kategori; tingkat (0–100) opsional tampil sebagai garis tipis. */
export function skillGroupsHTML(skills, { reveal = true } = {}) {
  const groups = new Map();
  skills.forEach((s) => { if (!groups.has(s.category)) groups.set(s.category, []); groups.get(s.category).push(s); });
  return [...groups.entries()].map(([cat, items]) => `
    <div class="skill-group"${reveal ? ' data-reveal' : ''}>
      <h3 class="eyebrow">${esc(cat)}</h3>
      <ul>${items.map((s) => `<li><span>${esc(s.name)}</span>${Number.isFinite(s.level) ? `<span class="skill-level" role="img" aria-label="Tingkat penguasaan ${s.level} persen"><i style="width:${Math.max(0, Math.min(100, s.level))}%"></i></span>` : ''}${s.description ? `<small>${esc(s.description)}</small>` : ''}</li>`).join('')}</ul>
    </div>`).join('');
}

export function softwareGridHTML(list, opts) {
  if (!list.length) return '';
  return `<ul class="sw-grid">${list.map((s) => `<li>${softwareLogoHTML(s, opts)}</li>`).join('')}</ul>`;
}
