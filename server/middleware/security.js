// Header keamanan (helmet) + Content-Security-Policy yang mengizinkan hanya sumber yang dipakai situs:
// Supabase (API & Storage), CDN logo software (jsDelivr/Simple Icons), dan pemutar YouTube/Vimeo.
import helmet from 'helmet';
import { config, supabaseOrigin } from '../config.js';

export function securityHeaders() {
  const supabase = supabaseOrigin ? [supabaseOrigin] : [];
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...supabase, 'https://cdn.jsdelivr.net', 'https://cdn.simpleicons.org'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'blob:', ...supabase],
    'media-src': ["'self'", 'blob:', 'https:'],
    'frame-src': ["'self'", 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
    'frame-ancestors': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  if (config.isProd) directives['upgrade-insecure-requests'] = [];
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: config.isProd ? { maxAge: 15552000, includeSubDomains: false } : false,
  });
}
