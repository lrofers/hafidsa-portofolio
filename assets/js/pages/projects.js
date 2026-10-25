// Daftar proyek dengan filter kategori (data dari database).
import { loadProjects } from '../api.js';
import { $, esc } from '../utils.js';
import { projectCardHTML } from '../projects.js';
import { renderIcons } from '../icons.js';
import { initReveal } from '../animations.js';
import { renderError } from '../main.js';

export async function init() {
  const grid = $('#project-grid');
  const filters = $('#filters');
  const count = $('#project-count');
  let projects;
  try { projects = await loadProjects(); } catch (err) { renderError(grid, err); return; }

  if (!projects.length) {
    grid.innerHTML = '<p class="muted empty">Belum ada proyek yang diterbitkan.</p>';
    filters.remove();
    return;
  }

  const cats = [...new Set(projects.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'id'));
  const params = new URLSearchParams(location.search);
  let active = cats.includes(params.get('cat')) ? params.get('cat') : 'all';

  filters.innerHTML = ['all', ...cats].map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === active}">${c === 'all' ? 'Semua' : esc(c)}</button>`).join('');

  function draw() {
    const list = active === 'all' ? projects : projects.filter((p) => p.category === active);
    grid.innerHTML = list.map((p, i) => projectCardHTML(p, i, { variant: `card--${i % 4}` })).join('');
    count.textContent = `${list.length} ${list.length === 1 ? 'proyek' : 'proyek'}`;
    filters.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === active)));
    const url = new URL(location.href);
    if (active === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', active);
    history.replaceState(null, '', url);
    renderIcons(grid);
    initReveal(grid);
  }

  filters.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    active = b.dataset.cat;
    draw();
  });
  draw();
}
