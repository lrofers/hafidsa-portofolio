// Halaman Contact: info kontak + formulir dengan validasi, status kirim, dan proteksi spam dasar
// (honeypot, waktu minimum pengisian, rate limit di server/database).
import { sendContact, ContactError } from '../api.js';
import { $, esc, safeUrl } from '../utils.js';
import { renderIcons } from '../icons.js';
import { introHero } from '../animations.js';

const MIN_FILL_MS = 2500;

export async function init({ settings, social }) {
  introHero();
  $('#contact-intro').textContent = settings.contact_intro || '';

  const info = [];
  if (settings.email) info.push(['Email', `<a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a>`]);
  if (settings.phone) info.push(['Telepon', `<a href="tel:${esc(settings.phone.replace(/[^+\d]/g, ''))}">${esc(settings.phone)}</a>`]);
  if (settings.location) info.push(['Lokasi', esc(settings.location)]);
  if (settings.availability) info.push(['Ketersediaan', esc(settings.availability)]);
  const links = social.map((s) => ({ url: safeUrl(s.url), label: s.label || s.platform })).filter((s) => s.url);
  if (links.length) info.push(['Sosial', `<ul class="inline-links">${links.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}<i data-lucide="arrow-up-right"></i></a></li>`).join('')}</ul>`]);
  $('#contact-info').innerHTML = info.length
    ? `<dl class="kv">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
    : '<p class="muted">Informasi kontak belum diisi.</p>';

  const form = $('#contact-form');
  const status = $('#form-status');
  const submit = form.querySelector('[type="submit"]');
  const openedAt = Date.now();

  const rules = {
    name: (v) => (v.trim().length >= 1 && v.length <= 120 ? '' : 'Nama wajib diisi (maks. 120 karakter).'),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.length <= 254 ? '' : 'Masukkan alamat email yang valid.'),
    subject: (v) => (v.length <= 200 ? '' : 'Subjek maksimal 200 karakter.'),
    message: (v) => (v.trim().length >= 5 && v.length <= 5000 ? '' : 'Pesan minimal 5 dan maksimal 5000 karakter.'),
  };

  function setError(field, msg) {
    const el = form.elements[field];
    const out = $(`#err-${field}`);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (out) out.textContent = msg;
    return !msg;
  }
  function validate() {
    let first = null;
    let ok = true;
    for (const [field, check] of Object.entries(rules)) {
      if (!setError(field, check(form.elements[field].value))) { ok = false; first ??= form.elements[field]; }
    }
    first?.focus();
    return ok;
  }
  Object.keys(rules).forEach((f) => form.elements[f].addEventListener('blur', () => setError(f, rules[f](form.elements[f].value))));

  const counter = $('#msg-count');
  form.elements.message.addEventListener('input', () => { counter.textContent = `${form.elements.message.value.length} / 5000`; });

  function show(kind, text) {
    status.className = `form-status form-status--${kind}`;
    status.textContent = text;
    status.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;
    if (!validate()) { show('error', 'Periksa kembali isian yang ditandai.'); return; }
    if (Date.now() - openedAt < MIN_FILL_MS) { show('error', 'Mohon tunggu sebentar sebelum mengirim.'); return; }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    show('pending', 'Mengirim pesan…');
    try {
      await sendContact({
        name: form.elements.name.value.trim(), email: form.elements.email.value.trim(),
        subject: form.elements.subject.value.trim(), message: form.elements.message.value.trim(),
        website: form.elements.website.value, elapsed: Date.now() - openedAt,
      });
      form.reset();
      counter.textContent = '0 / 5000';
      show('success', 'Terima kasih! Pesan Anda sudah terkirim.');
    } catch (err) {
      show('error', err instanceof ContactError ? err.message : 'Pesan gagal dikirim. Coba lagi nanti.');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });
  renderIcons();
}
