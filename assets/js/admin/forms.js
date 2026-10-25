// Pembangun formulir admin: field teks/angka/pilihan/switch/warna/rentang, field media (pilih/upload),
// editor tag, editor pasangan label–nilai, slug otomatis, deteksi perubahan, dan dialog formulir.
import { esc, slugify } from '../utils.js';
import { renderIcons } from '../icons.js';
import { openDialog, busy, humanError } from './core.js';
import { getMedia, pickMedia, mediaThumb, mediaName } from './media-lib.js';

let uid = 0;
const nextId = (name) => `f-${name}-${++uid}`;

/**
 * Spesifikasi field: { name, label, type, required, help, placeholder, options:[{value,label}], min, max, step,
 *   rows, maxlength, full, datalist:[], nullable, slugFrom, readonly, inputmode, autocomplete }
 * type: text | email | url | tel | number | year | textarea | select | checkbox | color | range | media | tags | pairs | hidden
 */
export function fieldHTML(f, value) {
  const id = nextId(f.name);
  const req = f.required ? ' required' : '';
  const label = f.label ? `<label for="${id}">${esc(f.label)}${f.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>` : '';
  const help = f.help ? `<p class="field__help" id="${id}-help">${f.help}</p>` : '';
  const describedBy = f.help ? ` aria-describedby="${id}-help"` : '';
  const common = `id="${id}" name="${esc(f.name)}"${req}${describedBy}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.readonly ? ' readonly' : ''}${f.maxlength ? ` maxlength="${f.maxlength}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.pattern ? ` pattern="${esc(f.pattern)}"` : ''}`;
  const v = value ?? '';
  const wrap = (inner, extraClass = '') => `<div class="field${f.full ? ' full' : ''}${extraClass}" data-field="${esc(f.name)}">${inner}</div>`;

  switch (f.type) {
    case 'hidden':
      return `<input type="hidden" name="${esc(f.name)}" value="${esc(v)}">`;
    case 'textarea':
      return wrap(`${label}<textarea class="textarea" ${common} rows="${f.rows || 5}">${esc(v)}</textarea>${help}`);
    case 'select':
      return wrap(`${label}<select class="select" ${common}>${(f.options || []).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}`);
    case 'checkbox':
      return wrap(`<label class="switch" for="${id}"><input type="checkbox" id="${id}" name="${esc(f.name)}"${v ? ' checked' : ''}${describedBy}><span class="switch__track" aria-hidden="true"></span><span>${esc(f.label)}</span></label>${help}`);
    case 'color':
      return wrap(`${label}<div class="color-row"><input type="color" ${common} value="${esc(v || '#000000')}"><input class="input mono" type="text" value="${esc(v)}" data-color-text aria-label="${esc(f.label)} (hex)" pattern="#[0-9a-fA-F]{6}" maxlength="7"></div>${help}`);
    case 'range':
      return wrap(`${label}<div class="range-row"><input type="range" ${common} min="${f.min ?? 0}" max="${f.max ?? 1}" step="${f.step ?? 0.1}" value="${esc(v)}"><output for="${id}">${esc(v)}</output></div>${help}`);
    case 'media':
      return wrap(`<span class="field__label" id="${id}-l">${esc(f.label)}${f.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</span>
        <div class="media-field" role="group" aria-labelledby="${id}-l" data-media-field="${esc(f.name)}">
          <input type="hidden" name="${esc(f.name)}" value="${esc(v)}">
          <div class="media-field__thumb"><i data-lucide="image"></i></div>
          <div class="media-field__meta">
            <div class="media-field__name muted">Belum ada gambar</div>
            <div class="media-field__btns">
              <button type="button" class="btn btn--sm" data-act="pick"><i data-lucide="images"></i>Pilih / upload</button>
              <button type="button" class="btn btn--sm btn--ghost" data-act="clear"${f.required ? ' hidden' : ''}>Lepas</button>
            </div>
          </div>
        </div>${help}`);
    case 'tags':
      return wrap(`${label}<div class="tags" data-tags="${esc(f.name)}"><input type="text" id="${id}" placeholder="${esc(f.placeholder || 'Ketik lalu tekan Enter')}"${describedBy}></div><input type="hidden" name="${esc(f.name)}" value="${esc(JSON.stringify(Array.isArray(v) ? v : []))}">${help}`);
    case 'pairs':
      return wrap(`<span class="field__label">${esc(f.label)}</span><div class="pairs" data-pairs="${esc(f.name)}"></div>
        <button type="button" class="btn btn--sm" data-add-pair="${esc(f.name)}" style="justify-self:start"><i data-lucide="plus"></i>Tambah baris</button>
        <input type="hidden" name="${esc(f.name)}" value="${esc(JSON.stringify(Array.isArray(v) ? v : []))}">${help}`);
    default: {
      const type = f.type === 'year' ? 'number' : f.type || 'text';
      const min = f.type === 'year' ? (f.min ?? 1900) : f.min;
      const max = f.type === 'year' ? (f.max ?? 2100) : f.max;
      const dl = f.datalist?.length ? `<datalist id="${id}-dl">${f.datalist.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
      return wrap(`${label}<input class="input" type="${type}" ${common} value="${esc(v)}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${f.step ? ` step="${f.step}"` : ''}${dl ? ` list="${id}-dl"` : ''}${f.inputmode ? ` inputmode="${f.inputmode}"` : ''}>${dl}${help}`);
    }
  }
}

export function formHTML(fields, values = {}) {
  return `<div class="form-grid">${fields.map((f) => (f.html ? f.html : fieldHTML(f, values[f.name]))).join('')}</div>`;
}

/* ------------------------------- binding ------------------------------- */

async function paintMedia(box, id) {
  const thumb = box.querySelector('.media-field__thumb');
  const name = box.querySelector('.media-field__name');
  const clear = box.querySelector('[data-act="clear"]');
  if (!id) {
    thumb.innerHTML = '<i data-lucide="image"></i>';
    name.textContent = 'Belum ada gambar';
    name.classList.add('muted');
    if (clear) clear.disabled = true;
    renderIcons(thumb);
    return;
  }
  if (clear) clear.disabled = false;
  try {
    const row = await getMedia(id);
    if (!row) { name.textContent = 'Media tidak ditemukan'; return; }
    const src = mediaThumb(row);
    thumb.innerHTML = src ? `<img src="${esc(src)}" alt="${esc(row.alt_text || '')}">` : '';
    name.textContent = mediaName(row);
    name.classList.remove('muted');
  } catch (err) { name.textContent = humanError(err); }
}

function bindTags(root, name) {
  const box = root.querySelector(`[data-tags="${name}"]`);
  const hidden = root.querySelector(`input[type="hidden"][name="${name}"]`);
  const input = box.querySelector('input');
  let tags = JSON.parse(hidden.value || '[]');
  const draw = () => {
    box.querySelectorAll('.chip').forEach((c) => c.remove());
    tags.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span></span><button type="button" aria-label="Hapus ${esc(t)}" data-i="${i}"><i data-lucide="x"></i></button>`;
      chip.firstChild.textContent = t;
      box.insertBefore(chip, input);
    });
    hidden.value = JSON.stringify(tags);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    renderIcons(box);
  };
  const add = () => {
    const v = input.value.trim().replace(/,$/, '');
    if (v && !tags.includes(v)) tags = [...tags, v.slice(0, 80)];
    input.value = '';
    draw();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input.value && tags.length) { tags = tags.slice(0, -1); draw(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) add(); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) { tags = tags.filter((_, i) => i !== Number(b.dataset.i)); draw(); input.focus(); }
    else if (e.target === box) input.focus();
  });
  draw();
}

function bindPairs(root, name) {
  const box = root.querySelector(`[data-pairs="${name}"]`);
  const hidden = root.querySelector(`input[type="hidden"][name="${name}"]`);
  const sync = () => {
    hidden.value = JSON.stringify(Array.from(box.querySelectorAll('.pair')).map((r) => ({
      label: r.querySelector('[data-k]').value.trim(), value: r.querySelector('[data-v]').value.trim(),
    })).filter((p) => p.label || p.value));
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const addRow = (p = { label: '', value: '' }) => {
    const row = document.createElement('div');
    row.className = 'pair input-group';
    row.style.marginBottom = '8px';
    row.innerHTML = `<input class="input" data-k placeholder="Label (mis. Bahasa)" aria-label="Label" maxlength="60">
      <input class="input" data-v placeholder="Isi" aria-label="Isi" maxlength="200">
      <button type="button" class="icon-btn icon-btn--danger" aria-label="Hapus baris"><i data-lucide="trash-2"></i></button>`;
    row.querySelector('[data-k]').value = p.label || '';
    row.querySelector('[data-v]').value = p.value || '';
    row.querySelector('button').addEventListener('click', () => { row.remove(); sync(); });
    row.addEventListener('input', sync);
    box.appendChild(row);
    renderIcons(row);
    return row;
  };
  JSON.parse(hidden.value || '[]').forEach(addRow);
  root.querySelector(`[data-add-pair="${name}"]`).addEventListener('click', () => addRow().querySelector('[data-k]').focus());
}

/**
 * Hubungkan perilaku interaktif pada formulir yang dirender dengan formHTML().
 * @returns {{ read(): object, validate(): string|null, isDirty(): boolean, markClean(): void, set(name, value): void }}
 */
export function bindForm(form, fields) {
  renderIcons(form);
  const byName = Object.fromEntries(fields.filter((f) => f.name).map((f) => [f.name, f]));

  fields.forEach((f) => {
    if (f.type === 'media') {
      const box = form.querySelector(`[data-media-field="${f.name}"]`);
      const hidden = box.querySelector('input[type="hidden"]');
      paintMedia(box, hidden.value);
      box.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'pick') {
          const row = await pickMedia({ title: f.label, selected: [hidden.value] });
          if (row) { hidden.value = row.id; paintMedia(box, row.id); hidden.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        if (act === 'clear') { hidden.value = ''; paintMedia(box, ''); hidden.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    if (f.type === 'tags') bindTags(form, f.name);
    if (f.type === 'pairs') bindPairs(form, f.name);
    if (f.type === 'range') {
      const input = form.querySelector(`[name="${f.name}"]`);
      const out = input.parentElement.querySelector('output');
      input.addEventListener('input', () => { out.textContent = input.value; });
    }
    if (f.type === 'color') {
      const input = form.querySelector(`[name="${f.name}"]`);
      const text = input.parentElement.querySelector('[data-color-text]');
      input.addEventListener('input', () => { text.value = input.value; });
      text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) { input.value = text.value; input.dispatchEvent(new Event('input', { bubbles: true })); } });
    }
    if (f.slugFrom) {
      const slug = form.querySelector(`[name="${f.name}"]`);
      const src = form.querySelector(`[name="${f.slugFrom}"]`);
      let manual = !!slug.value;
      slug.addEventListener('input', () => { manual = slug.value.length > 0; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); });
      slug.addEventListener('blur', () => { slug.value = slugify(slug.value); });
      src.addEventListener('input', () => { if (!manual) slug.value = slugify(src.value); });
    }
  });

  const read = () => {
    const out = {};
    fields.forEach((f) => {
      if (!f.name) return;
      const el = form.querySelector(`[name="${f.name}"]`);
      if (!el) return;
      switch (f.type) {
        case 'checkbox': out[f.name] = el.checked; break;
        case 'number': case 'year': case 'range': out[f.name] = el.value === '' ? null : Number(el.value); break;
        case 'tags': case 'pairs': out[f.name] = JSON.parse(el.value || '[]'); break;
        case 'media': out[f.name] = el.value || null; break;
        default: {
          const v = el.value.trim();
          out[f.name] = v === '' && f.nullable ? null : v;
        }
      }
    });
    return out;
  };

  /** Validasi tambahan yang tidak tercakup validasi bawaan browser. */
  const validate = () => {
    if (!form.reportValidity()) return 'invalid';
    for (const f of fields) {
      if (f.type === 'media' && f.required && !form.querySelector(`[name="${f.name}"]`).value) {
        form.querySelector(`[data-media-field="${f.name}"] [data-act="pick"]`)?.focus();
        return `${f.label} wajib diisi.`;
      }
    }
    return null;
  };

  let initial = JSON.stringify(read());
  return {
    read,
    validate,
    isDirty: () => JSON.stringify(read()) !== initial,
    markClean: () => { initial = JSON.stringify(read()); },
    set(name, value) {
      const f = byName[name];
      const el = form.querySelector(`[name="${name}"]`);
      if (!f || !el) return;
      if (f.type === 'checkbox') el.checked = !!value;
      else el.value = value ?? '';
      if (f.type === 'media') paintMedia(form.querySelector(`[data-media-field="${name}"]`), value);
    },
  };
}

/* ------------------------------ dialog formulir ------------------------------ */

/**
 * Buka formulir dalam dialog. `onSubmit(values)` boleh async; bila melempar error, dialog tetap terbuka
 * dan pesan error ditampilkan. Mengembalikan hasil onSubmit, atau null bila dibatalkan.
 */
export function openFormDialog({ title, fields, values = {}, submitText = 'Simpan', size = '', intro = '', onSubmit, onReady }) {
  return new Promise((resolve) => {
    const formId = nextId('form');
    let result = null;
    let ctl;
    const { dialog, body, close } = openDialog({
      title, size,
      body: `${intro}<form id="${formId}" novalidate>${formHTML(fields, values)}<p class="form-error" role="alert" hidden></p></form>`,
      actions: `<button type="button" class="btn btn--ghost" data-cancel>Batal</button><button type="submit" class="btn btn--primary" form="${formId}">${esc(submitText)}</button>`,
      onClose: () => resolve(result),
    });
    const form = body.querySelector('form');
    form.noValidate = false; // gunakan validasi bawaan browser saat reportValidity()
    ctl = bindForm(form, fields);
    const errBox = form.querySelector('.form-error');
    const leave = () => !ctl.isDirty() || window.confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?');
    dialog.addEventListener('cancel', (e) => { if (!leave()) e.preventDefault(); });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => { if (leave()) close('cancel'); });
    dialog.querySelector('[data-close]').replaceWith(dialog.querySelector('[data-close]').cloneNode(true));
    dialog.querySelector('[data-close]').addEventListener('click', () => { if (leave()) close('cancel'); });
    renderIcons(dialog);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const problem = ctl.validate();
      if (problem) { if (problem !== 'invalid') { errBox.textContent = problem; errBox.hidden = false; } return; }
      const submitBtn = dialog.querySelector(`button[form="${formId}"]`);
      await busy(submitBtn, async () => {
        try {
          result = (await onSubmit?.(ctl.read(), ctl)) ?? true;
          close('ok');
        } catch (err) {
          console.error(err);
          errBox.textContent = humanError(err);
          errBox.hidden = false;
        }
      });
    });
    onReady?.(form, ctl, dialog);
    form.querySelector('input:not([type="hidden"]), textarea, select')?.focus();
  });
}
