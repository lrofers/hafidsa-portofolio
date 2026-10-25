// Animasi umum (GSAP + ScrollTrigger): reveal saat scroll, intro hero, transisi halaman, paralaks.
// Semua dimatikan bila pengguna memilih prefers-reduced-motion atau admin menonaktifkan animasi.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utils.js';

gsap.registerPlugin(ScrollTrigger);

let enabled = true;

export function setAnimationsEnabled(v) { enabled = v !== false && !prefersReducedMotion(); }
export const animationsEnabled = () => enabled;

/** Fade-up elemen [data-reveal] ketika masuk viewport (berurutan per kelompok). */
export function initReveal(root = document) {
  const els = Array.from(root.querySelectorAll('[data-reveal]:not([data-revealed])'));
  if (!els.length) return;
  if (!enabled) { els.forEach((el) => el.setAttribute('data-revealed', '')); return; }
  gsap.set(els, { autoAlpha: 0, y: 28 });
  ScrollTrigger.batch(els, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => {
      batch.forEach((el) => el.setAttribute('data-revealed', ''));
      gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09, overwrite: true });
    },
  });
}

/** Paralaks lembut pada gambar dengan [data-parallax]. */
export function initParallax(root = document) {
  if (!enabled) return;
  root.querySelectorAll('[data-parallax]').forEach((el) => {
    const amount = Number(el.dataset.parallax) || 40;
    gsap.fromTo(el, { yPercent: -amount / 10 }, {
      yPercent: amount / 10, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}

/** Animasi masuk teks hero. */
export function introHero(root = document) {
  const items = root.querySelectorAll('[data-intro]');
  if (!items.length) return;
  if (!enabled) return;
  gsap.fromTo(items, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 1.3, ease: 'power3.out', stagger: 0.14, delay: 0.25 });
}

/** Fade keluar saat berpindah halaman internal. */
export function initPageTransitions() {
  document.documentElement.classList.add('is-ready');
  if (!enabled) return;
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // anchor di halaman yang sama
    e.preventDefault();
    document.documentElement.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, 320);
  });
  // tombol back/forward dari bfcache
  window.addEventListener('pageshow', (e) => { if (e.persisted) document.documentElement.classList.remove('is-leaving'); });
}

/** Header: sembunyi saat scroll turun, muncul saat naik. */
export function initHeaderScroll(header) {
  if (!header) return;
  let lastY = window.scrollY;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      const open = header.classList.contains('is-open');
      header.classList.toggle('is-hidden', !open && y > lastY && y > 400 && !header.matches(':focus-within'));
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}

export { gsap, ScrollTrigger };
