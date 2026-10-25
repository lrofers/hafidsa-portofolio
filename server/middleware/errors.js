// Penanganan 404 untuk /api dan error umum (tanpa membocorkan detail internal ke klien).
export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Data terlalu besar.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  console.error('[server]', err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  return res.status(500).send('Terjadi kesalahan pada server.');
}
