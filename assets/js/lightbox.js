// Lightbox / modal detail (dipakai galeri 3D, fallback HTML, dan galeri foto proyek).
import { esc, safeUrl, paragraphs } from './utils.js';
import { renderIcons } from './icons.js';

let dialog;
let state = { items: [], index: 0, opener: null, onIndex: null };

function ensure() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-labelledby', 'lb-title');
  dialog.innerHTML = `
    <div class="lightbox__inner">
      <button class="lightbox__close" type="button" aria-label="Tutup"><i data-lucide="x"></i></button>
      <figure class="lightbox__figure"><img class="lightbox__img" alt="" decoding="async"></figure>
      <div class="lightbox__info">
        <p class="eyebrow lightbox__meta"></p>
        <h2 id="lb-title" class="lightbox__title"></h2>
        <div class="lightbox__desc prose"></div>
        <a class="link-arrow lightbox__link" hidden></a>
        <div class="lightbox__nav">
          <button type="button" class="icon-btn" data-dir="-1" aria-label="Sebelumnya"><i data-lucide="arrow-left"></i></button>
          <span class="lightbox__count" aria-live="polite"></span>
          <button type="button" class="icon-btn" data-dir="1" aria-label="Berikutnya"><i data-lucide="arrow-right"></i></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  renderIcons(dialog);

  dialog.querySelector('.lightbox__close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-modal');
    state.opener?.focus?.({ preventScroll: true });
  });
  dialog.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.dir))));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  return dialog;
}

function step(d) {
  const n = state.items.length;
  if (n < 2) return;
  state.index = (state.index + d + n) % n;
  paint();
}

function paint() {
  const it = state.items[state.index];
  const img = dialog.querySelector('.lightbox__img');
  const hasImg = !!it.image?.url;
  img.hidden = !hasImg;
  if (hasImg) {
    img.src = it.image.thumbUrl && it.image.thumbUrl !== it.image.url ? it.image.thumbUrl : it.image.url;
    img.alt = it.image.alt || it.title || '';
    if (it.image.thumbUrl && it.image.thumbUrl !== it.image.url) {
      const full = new Image();
      full.onload = () => { if (state.items[state.index] === it) img.src = it.image.url; };
      full.src = it.image.url;
    }
  }
  dialog.querySelector('.lightbox__meta').textContent = it.meta || '';
  dialog.querySelector('.lightbox__title').textContent = it.title || '';
  dialog.querySelector('.lightbox__desc').innerHTML = paragraphs(it.description || '');
  const link = dialog.querySelector('.lightbox__link');
  const href = safeUrl(it.href);
  link.hidden = !href;
  if (href) { link.href = href; link.innerHTML = `${esc(it.hrefLabel || 'Lihat proyek')}<i data-lucide="arrow-up-right"></i>`; renderIcons(link); }
  dialog.querySelector('.lightbox__nav').hidden = state.items.length < 2;
  dialog.querySelector('.lightbox__count').textContent = `${state.index + 1} / ${state.items.length}`;
  state.onIndex?.(state.index);
}

/**
 * @param {Array<{image:{url,thumbUrl,alt}, title, meta, description, href, hrefLabel}>} items
 */
export function openLightbox(items, index = 0, { opener = document.activeElement, onIndex } = {}) {
  ensure();
  state = { items, index, opener, onIndex };
  paint();
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add('has-modal');
  dialog.querySelector('.lightbox__close').focus({ preventScroll: true });
}

export function artworkToItem(art) {
  return {
    image: art.image,
    title: art.title,
    meta: [art.year, art.room_name].filter(Boolean).join(' · '),
    description: art.description,
    href: art.project ? `/project-detail.html?slug=${encodeURIComponent(art.project.slug)}` : '',
    hrefLabel: art.project ? `Lihat proyek: ${art.project.title}` : '',
  };
}
