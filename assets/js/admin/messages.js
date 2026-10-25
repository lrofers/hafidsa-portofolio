// Admin › Pesan: kotak masuk formulir kontak (filter, tandai dibaca, arsipkan, hapus, balas via email).
import { $, esc, formatDate } from '../utils.js';
import { renderIcons } from '../icons.js';
import { supabase } from '../supabase.js';
import { toast, reportError, confirmDialog, unwrap, loadingHTML, emptyHTML } from './core.js';

const FILTERS = [['new', 'Baru'], ['read', 'Dibaca'], ['archived', 'Arsip'], ['all', 'Semua']];
let current = 'new';
let messages = [];
let refreshUnread = () => {};

export async function init(ctx) {
  refreshUnread = ctx.refreshUnread || refreshUnread;
  $('#view').innerHTML = `<div class="tabs" role="tablist" aria-label="Filter pesan">${FILTERS.map(([k, l]) => `<button type="button" role="tab" data-f="${k}" aria-selected="${k === current}">${l}</button>`).join('')}</div><div class="card" data-list></div>`;
  $('#view').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    current = b.dataset.f;
    $('#view').querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    load();
  }));
  $('[data-list]').addEventListener('click', onAction);
  $('[data-list]').addEventListener('toggle', onToggle, true);
  await load();
}

async function load() {
  const box = $('[data-list]');
  box.innerHTML = loadingHTML('Memuat pesan…');
  try {
    let q = supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300);
    if (current !== 'all') q = q.eq('status', current);
    messages = unwrap(await q);
  } catch (err) { box.innerHTML = `<p class="form-error" style="margin:16px">${esc(err.message)}</p>`; reportError(err); return; }
  box.innerHTML = messages.length ? messages.map((m) => `
    <details class="msg${m.status === 'new' ? ' is-new' : ''}" data-id="${m.id}">
      <summary>
        <i data-lucide="${m.status === 'new' ? 'mail' : m.status === 'archived' ? 'archive' : 'mail-open'}"></i>
        <div style="min-width:0"><div class="msg__from">${esc(m.name)} <span class="small muted">&lt;${esc(m.email)}&gt;</span></div>
          <div class="msg__excerpt">${esc(m.subject ? `${m.subject} — ` : '')}${esc(m.message.slice(0, 140))}</div></div>
        <span class="small muted nowrap">${esc(formatDate(m.created_at))}</span>
      </summary>
      <div class="msg__body">
        ${m.subject ? `<p><strong>${esc(m.subject)}</strong></p>` : ''}
        <div class="msg__text">${esc(m.message)}</div>
        <div class="quick">
          <a class="btn btn--sm btn--primary" href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject || 'Pesan dari situs portofolio'}`)}"><i data-lucide="reply"></i>Balas via email</a>
          ${m.status !== 'new' ? '<button class="btn btn--sm" type="button" data-act="new"><i data-lucide="mail"></i>Tandai belum dibaca</button>' : ''}
          ${m.status !== 'archived' ? '<button class="btn btn--sm" type="button" data-act="archived"><i data-lucide="archive"></i>Arsipkan</button>' : '<button class="btn btn--sm" type="button" data-act="read"><i data-lucide="mail-open"></i>Keluarkan dari arsip</button>'}
          <button class="btn btn--sm btn--danger" type="button" data-act="delete"><i data-lucide="trash-2"></i>Hapus</button>
        </div>
      </div>
    </details>`).join('') : emptyHTML(current === 'new' ? 'Tidak ada pesan baru.' : 'Tidak ada pesan.', 'inbox');
  renderIcons(box);
}

/** Membuka pesan baru otomatis menandainya sebagai dibaca. */
async function onToggle(e) {
  const d = e.target;
  if (!d.matches?.('details.msg') || !d.open) return;
  const m = messages.find((x) => x.id === d.dataset.id);
  if (m?.status !== 'new') return;
  try {
    unwrap(await supabase.from('contact_messages').update({ status: 'read' }).eq('id', m.id).select('id').single());
    m.status = 'read';
    d.classList.remove('is-new');
    refreshUnread();
  } catch (err) { reportError(err); }
}

async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  try {
    if (btn.dataset.act === 'delete') {
      if (!(await confirmDialog({ title: 'Hapus pesan ini?', message: 'Pesan dihapus permanen.', confirmText: 'Hapus', danger: true }))) return;
      unwrap(await supabase.from('contact_messages').delete().eq('id', id).select('id').single());
      toast('Pesan dihapus.');
    } else {
      unwrap(await supabase.from('contact_messages').update({ status: btn.dataset.act }).eq('id', id).select('id').single());
      toast(btn.dataset.act === 'archived' ? 'Pesan diarsipkan.' : 'Status pesan diperbarui.');
    }
    refreshUnread();
    await load();
  } catch (err) { reportError(err); }
}
