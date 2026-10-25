// Beranda: perjalanan kamera melalui galeri 3D + proyek unggulan, about, skills, kontak.
import { loadArtworks, loadProjects, loadSkills, loadSoftware } from '../api.js';
import { $, esc, clamp, paragraphs, roman } from '../utils.js';
import { renderIcons, bindIconFallbacks } from '../icons.js';
import { buildLayout, webglAvailable, detectQuality } from '../gallery-layout.js';
import { openLightbox, artworkToItem } from '../lightbox.js';
import { projectCardHTML, imgTag, softwareGridHTML, skillGroupsHTML } from '../projects.js';
import { introHero, initParallax, gsap, animationsEnabled } from '../animations.js';
import { renderError } from '../main.js';

export async function init({ settings }) {
  introHero();
  let artworks = []; let projects = []; let skills = []; let software = [];
  try {
    [artworks, projects, skills, software] = await Promise.all([loadArtworks(), loadProjects(), loadSkills().catch(() => []), loadSoftware().catch(() => [])]);
  } catch (err) {
    renderError($('#featured-list') || $('main'), err);
    enableFallback([], settings, 'Data galeri gagal dimuat.');
    return;
  }

  renderFeatured(projects);
  renderAbout(settings);
  renderSkills(skills, software);
  renderContact(settings);
  renderIcons();
  bindIconFallbacks();
  initParallax();

  await setupJourney({ artworks, settings });
}

/* ------------------------------ bagian statis ------------------------------ */

function renderFeatured(projects) {
  const el = $('#featured-list');
  if (!el) return;
  let list = projects.filter((p) => p.is_featured);
  if (!list.length) list = projects.slice(0, 4);
  list = list.slice(0, 6);
  if (!list.length) { $('#featured')?.remove(); return; }
  el.innerHTML = list.map((p, i) => projectCardHTML(p, i, { variant: `card--${i % 4}` })).join('');
}

function renderAbout(settings) {
  const sec = $('#about-summary');
  if (!sec) return;
  const firstPara = String(settings.about_bio || '').split(/\n{2,}/)[0] || '';
  const excerpt = firstPara.length > 420 ? `${firstPara.slice(0, 420).replace(/\s+\S*$/, '')}…` : firstPara;
  $('#about-text', sec).innerHTML = excerpt ? paragraphs(excerpt) : '<p class="muted">Biografi belum diisi.</p>';
  const fig = $('#about-photo', sec);
  if (settings.profile?.url) fig.innerHTML = imgTag(settings.profile, { sizes: '(min-width: 900px) 30vw, 70vw' });
  else fig.remove();
  const focus = $('#about-focus', sec);
  const items = Array.isArray(settings.about_focus) ? settings.about_focus.filter(Boolean) : [];
  focus.innerHTML = items.map((f) => `<li>${esc(f)}</li>`).join('');
  if (!items.length) focus.remove();
}

function renderSkills(skills, software) {
  const sec = $('#skills-summary');
  if (!sec) return;
  if (!skills.length && !software.length) { sec.remove(); return; }
  $('#skills-list', sec).innerHTML = skillGroupsHTML(skills);
  $('#software-list', sec).innerHTML = softwareGridHTML(software);
  if (!software.length) $('#software-wrap', sec)?.remove();
  if (!skills.length) $('#skills-list', sec)?.remove();
}

function renderContact(settings) {
  const a = $('#contact-email');
  if (!a) return;
  if (settings.email) { a.href = `mailto:${settings.email}`; a.textContent = settings.email; } else a.remove();
}

function hallProfileContent(settings) {
  const privateInfo = /\b(?:alamat|address|rumah|home|umur|usia|age|sekolah|school|pendidikan|education|institusi|institution|smp|sma|sd)\b|\b1[0-7]\s*tahun\b/i;
  const bio = String(settings.about_bio || '').trim();
  const details = [
    ['Lokasi', 'Tanah Laut, Kalimantan Selatan, Indonesia'],
    ['Minat', 'Bahasa Inggris dan informatika'],
  ];
  const focus = Array.isArray(settings.about_focus)
    ? settings.about_focus.filter((item) => item && !privateInfo.test(String(item)))
    : [];
  if (focus.length) details.push(['Fokus kreatif', focus.join(' · ')]);
  const extra = Array.isArray(settings.about_extra) ? settings.about_extra : [];
  const publicLabel = /bahasa|minat|fokus|keahlian|skill|software|alat|tool|hobi|interest/i;
  extra.forEach((item) => {
    const label = String(item?.label || '').trim();
    const value = String(item?.value || '').trim();
    if (label && value && publicLabel.test(label) && !privateInfo.test(value)) details.push([label, value]);
  });
  return {
    name: settings.owner_name || '',
    role: settings.owner_role || '',
    photoUrl: settings.profile?.url || '',
    biography: bio && !privateInfo.test(bio) ? bio.split(/\n{2,}/)[0] : '',
    details,
  };
}

/* ------------------------------ perjalanan 3D ------------------------------ */

function enableFallback(artworks, settings, reason) {
  const section = $('#journey');
  if (!section) return;
  section.classList.add('journey--fallback');
  section.style.removeProperty('--steps');
  $('#loader')?.remove();
  const box = $('#gallery-fallback');
  box.hidden = false;
  const roomNames = Array.isArray(settings.gallery_rooms) ? settings.gallery_rooms : [];
  const byRoom = new Map();
  artworks.forEach((a) => { if (!byRoom.has(a.room)) byRoom.set(a.room, []); byRoom.get(a.room).push(a); });
  const flat = [];
  const html = [...byRoom.entries()].sort((a, b) => a[0] - b[0]).map(([num, list]) => {
    const name = roomNames[num - 1]?.name || `Ruang ${roman(num)}`;
    list.forEach((a) => { a.room_name = name; });
    return `<section class="fb-room" aria-label="${esc(name)}"><h2 class="eyebrow">${esc(name)}</h2><ul class="fb-grid">${list.map((a) => {
      const idx = flat.push(a) - 1;
      return `<li data-reveal><button type="button" class="fb-art" data-i="${idx}">${imgTag(a.image, { sizes: '(min-width: 900px) 30vw, 90vw' })}<span class="fb-art__t">${esc(a.title)}</span><span class="fb-art__y">${esc(a.year ?? '')}</span></button></li>`;
    }).join('')}</ul></section>`;
  }).join('');
  box.innerHTML = `${reason ? `<p class="fb-note">${esc(reason)}</p>` : ''}${html || '<p class="muted">Belum ada karya yang diterbitkan.</p>'}`;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.fb-art');
    if (b) openLightbox(flat.map(artworkToItem), Number(b.dataset.i), { opener: b });
  });
  renderIcons();
}

async function setupJourney({ artworks, settings }) {
  const section = $('#journey');
  const stage = $('#stage');
  const canvas = $('#gallery-canvas');
  if (!section || !stage || !canvas) return;

  const forceFallback = new URLSearchParams(location.search).get('nowebgl') === '1';
  if (forceFallback || !webglAvailable()) {
    return enableFallback(artworks, settings, 'Peramban Anda tidak mendukung WebGL, jadi galeri ditampilkan dalam bentuk daftar.');
  }
  if (!artworks.length) {
    return enableFallback(artworks, settings, 'Belum ada karya yang diterbitkan di galeri.');
  }

  const quality = detectQuality();
  const pre = buildLayout(artworks, settings, { aspect: window.innerWidth / window.innerHeight });
  const per = quality === 'low' ? 78 : 92;
  section.style.setProperty('--steps', pre.stops.length - 1);
  section.style.setProperty('--per', per);

  const caption = $('#caption');
  const enterHall = $('.caption__enter', caption);
  const heroEl = $('#hero');
  const tip = $('#hover-tip');
  const loader = $('#loader');
  const roomsNav = $('#rooms-nav');
  const bar = $('#journey-bar');
  function setHallUi(inside) {
    if (hallControls) hallControls.hidden = !inside;
    caption.hidden = inside;
    roomsNav.hidden = inside;
    if (inside) {
      heroEl.style.opacity = '0';
      heroEl.style.visibility = 'hidden';
      heroEl.style.pointerEvents = 'none';
    } else if (gallery) {
      onProgress(gallery.debug().p);
    }
  }
  const list = $('#art-list');
  const hallControls = $('#hall-controls');
  let gallery; let layout = pre;
  let lastCap = null;

  // daftar aksesibel untuk pembaca layar / keyboard
  const named = (a) => { a.room_name = pre.rooms[pre.placements.find((p) => p.art === a)?.room]?.name; return a; };
  artworks.forEach(named);
  list.innerHTML = pre.placements.map((p) => `<li><button type="button" data-i="${p.index}">${esc(p.art.title)}${p.art.year ? `, ${esc(p.art.year)}` : ''} — ${esc(p.art.room_name || '')}</button></li>`).join('');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) openLightbox(pre.placements.map((p) => artworkToItem(p.art)), Number(b.dataset.i), { opener: b });
  });

  const openArt = (idx) => openLightbox(layout.placements.map((p) => artworkToItem(p.art)), idx, { opener: canvas });

  function updateCaption(i, stop) {
    if (!caption) return;
    const c = stop?.caption;
    const key = `${i}`;
    if (key === lastCap) return;
    lastCap = key;
    if (roomsNav) {
      const btns = [...roomsNav.querySelectorAll('button')];
      const active = btns.reduce((acc, b, k) => (Number(b.dataset.stop) <= i ? k : acc), 0);
      btns.forEach((b, k) => { b.classList.toggle('is-active', k === active); if (k === active) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    if (!c) {
      if (enterHall) enterHall.hidden = true;
      caption.classList.remove('is-visible');
      return;
    }
    const swap = () => {
      const art = c.art;
      $('.caption__room', caption).textContent = c.room || '';
      $('.caption__title', caption).textContent = art ? art.title : c.title || '';
      $('.caption__desc', caption).textContent = art ? [art.year, (art.description || '').slice(0, 140)].filter(Boolean).join(' — ') : c.subtitle || '';
      const open = $('.caption__open', caption);
      open.hidden = !art;
      open.dataset.i = stop.placement ?? '';
      const down = $('.caption__down', caption);
      down.hidden = !c.isEnd;
      if (enterHall) enterHall.hidden = stop?.kind !== 'hall';
      caption.classList.add('is-visible');
    };
    if (animationsEnabled()) {
      gsap.fromTo(caption, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out', onStart: swap });
    } else swap();
  }

  caption.addEventListener('click', (e) => {
    if (e.target.closest('.caption__open')) openArt(Number($('.caption__open', caption).dataset.i));
    if (e.target.closest('.caption__enter') && gallery && hallControls) {
      gallery.enterHall();
      setHallUi(true);
      renderIcons(hallControls);
    }
    const nav = e.target.closest('[data-step]');
    if (nav && gallery) gallery.goToStop(clamp(gallery.currentStop() + Number(nav.dataset.step), 0, gallery.stops().length - 1));
    if (e.target.closest('.caption__down')) $('#featured')?.scrollIntoView({ behavior: animationsEnabled() ? 'smooth' : 'auto' });
  });
  hallControls?.addEventListener('click', (e) => {
    if (e.target.closest('[data-hall-exit]')) {
      gallery?.exitHall();
      setHallUi(false);
    }
  });
  stage.addEventListener('wheel', (e) => {
    if (!hallControls || hallControls.hidden) return;
    e.preventDefault();
    gallery?.walkScroll(e.deltaY);
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hallControls && !hallControls.hidden) {
      gallery?.exitHall();
      setHallUi(false);
    }
  });

  $('#scroll-cue')?.addEventListener('click', () => gallery?.goToStop(1));

  const onProgress = (p) => {
    const n = (gallery?.stops().length ?? pre.stops.length) - 1;
    const seg = p * n;
    heroEl.style.opacity = String(clamp(1 - seg / 0.55, 0, 1));
    heroEl.style.visibility = seg > 0.6 ? 'hidden' : 'visible';
    heroEl.style.pointerEvents = seg > 0.1 ? 'none' : '';
    if (bar) bar.style.transform = `scaleX(${p})`;
    $('#scroll-cue')?.toggleAttribute('hidden', seg > 0.1);
  };

  let hideLoaderTimer = setTimeout(() => hideLoader(), 9000);
  function hideLoader() {
    clearTimeout(hideLoaderTimer);
    if (!loader || loader.dataset.done) return;
    loader.dataset.done = '1';
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 700);
  }

  try {
    // three.js hanya diunduh bila WebGL tersedia (perangkat tanpa WebGL langsung memakai fallback ringan)
    const { createGallery } = await import('../gallery-3d.js');
    gallery = await createGallery({
      trigger: section, stage, canvas, artworks, settings, quality, hallProfile: hallProfileContent(settings),
      onSelect: (idx) => openArt(idx),
      onHover: (idx, ev) => {
        if (!tip) return;
        if (idx < 0 || !ev) { tip.hidden = true; return; }
        tip.hidden = false;
        tip.textContent = layout.placements[idx].art.title;
        tip.style.transform = `translate(${ev.clientX + 16}px, ${ev.clientY + 16}px)`;
      },
      onStop: updateCaption,
      onProgress,
      onLoadProgress: (loaded, total) => {
        const t = $('.loader__text', loader || document);
        if (t) t.textContent = `Menyiapkan galeri… ${loaded}/${total}`;
        const f = $('.loader__bar i', loader || document);
        if (f) f.style.transform = `scaleX(${total ? loaded / total : 1})`;
        if (loaded >= total) hideLoader();
      },
    });
  } catch (err) {
    console.error(err);
    enableFallback(artworks, settings, 'Galeri 3D tidak dapat dijalankan di perangkat ini, jadi ditampilkan dalam bentuk daftar.');
    return;
  }
  gallery.onFatal = (err) => {
    console.error(err);
    gallery.destroy();
    section.classList.remove('is-3d');
    enableFallback(artworks, settings, 'Konteks grafis terputus, jadi galeri ditampilkan dalam bentuk daftar.');
  };
  layout = gallery.layout();
  section.classList.add('is-3d');
  window.__gallery = gallery; // diagnostik/pengujian
  gallery.statuesReady.then(() => {
    const el = $('#model-credits');
    const list = gallery.credits();
    if (!el) return;
    el.hidden = !list.length;
    el.innerHTML = list.length
      ? 'Model 3D: ' + list.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">“${esc(c.title)}”</a> oleh ${esc(c.author)} (${esc(c.license)})`).join(' · ')
      : '';
  });

  // navigasi ruang
  const stops = gallery.stops();
  const items = [{ label: 'Foyer', stop: 0 }];
  stops.forEach((s, i) => { if (s.kind === 'door') items.push({ label: layout.rooms[s.room].name, stop: i }); });
  items.push({ label: 'Akhir', stop: stops.length - 1 });
  roomsNav.innerHTML = items.map((it) => `<button type="button" data-stop="${it.stop}" aria-label="Menuju ${esc(it.label)}"><span>${esc(it.label)}</span></button>`).join('');
  roomsNav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-stop]');
    if (b) gallery.goToStop(Number(b.dataset.stop));
  });
  lastCap = null;
  updateCaption(gallery.currentStop(), stops[gallery.currentStop()]);
  onProgress(0);
  if (!pre.stops.length) hideLoader();
  const total = artworks.filter((a) => a.image).length;
  if (!total) hideLoader();
  renderIcons();
}
