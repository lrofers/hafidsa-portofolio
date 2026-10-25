// Klien REST Supabase minimal untuk server (tanpa dependensi): simpan pesan kontak.
import { config } from './config.js';

async function request(path, { key, body, prefer } = {}) {
  const res = await fetch(`${config.supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res;
}

/**
 * Simpan pesan. Dengan service role: insert langsung (beserta hash IP & user agent).
 * Tanpa service role: lewat fungsi database submit_contact_message (anon key; validasi & throttle di DB).
 */
export async function storeContactMessage(msg, meta) {
  if (config.serviceKey) {
    await request('/rest/v1/contact_messages', {
      key: config.serviceKey,
      prefer: 'return=minimal',
      body: { ...msg, ip_hash: meta.ipHash, user_agent: meta.userAgent },
    });
    return;
  }
  await request('/rest/v1/rpc/submit_contact_message', {
    key: config.anonKey,
    body: { p_name: msg.name, p_email: msg.email, p_subject: msg.subject, p_message: msg.message, p_website: '' },
  });
}
