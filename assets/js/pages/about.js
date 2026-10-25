// Halaman About: foto profil, biografi, fokus kreatif, pendidikan, pengalaman, informasi tambahan, software.
import { loadExperiences, loadEducation, loadSkills, loadSoftware } from '../api.js';
import { $, esc, paragraphs, yearRange } from '../utils.js';
import { imgTag, softwareGridHTML, skillGroupsHTML } from '../projects.js';
import { renderIcons, bindIconFallbacks } from '../icons.js';
import { introHero, initParallax } from '../animations.js';

export async function init({ settings }) {
  introHero();
  const [exp, edu, skills, software] = await Promise.all([
    loadExperiences().catch(() => []), loadEducation().catch(() => []), loadSkills().catch(() => []), loadSoftware().catch(() => []),
  ]);

  $('#about-heading').textContent = settings.about_heading || 'Tentang';
  const photo = $('#about-photo');
  if (settings.profile?.url) photo.innerHTML = imgTag(settings.profile, { eager: true, full: true, sizes: '(min-width: 900px) 40vw, 80vw' });
  else photo.remove();

  $('#about-bio').innerHTML = paragraphs(settings.about_bio) || '<p class="muted">Biografi belum diisi.</p>';

  const focus = (Array.isArray(settings.about_focus) ? settings.about_focus : []).filter(Boolean);
  fill('#about-focus', focus.length, `<ul class="tag-list">${focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`);

  fill('#about-edu', edu.length, edu.map((e) => timelineItem(yearRange(e.start_year, e.end_year), e.institution, e.program, e.description)).join(''));
  fill('#about-exp', exp.length, exp.map((e) => timelineItem(yearRange(e.start_year, e.end_year), e.title, [e.organization, e.location].filter(Boolean).join(' · '), e.description)).join(''));

  const extra = (Array.isArray(settings.about_extra) ? settings.about_extra : []).filter((x) => x?.label);
  fill('#about-extra', extra.length, `<dl class="kv">${extra.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('')}</dl>`);

  fill('#about-software', software.length, softwareGridHTML(software));
  fill('#about-skills', skills.length, skillGroupsHTML(skills, { reveal: false }));

  renderIcons();
  bindIconFallbacks();
  initParallax();
}

function timelineItem(when, title, sub, desc) {
  return `<li class="tl" data-reveal><span class="tl__when">${esc(when)}</span><div><h3 class="tl__title">${esc(title)}</h3>${sub ? `<p class="tl__sub">${esc(sub)}</p>` : ''}${desc ? `<p class="tl__desc">${esc(desc)}</p>` : ''}</div></li>`;
}

/** Isi section yang membungkus selector; hapus seluruh section bila kosong. */
function fill(sel, hasData, html) {
  const box = $(sel);
  if (!box) return;
  if (!hasData) { box.closest('section')?.remove(); return; }
  box.innerHTML = html;
}
