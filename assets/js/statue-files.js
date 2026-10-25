// Berkas model patung di assets/models/ (dibundel Vite sebagai URL). Berkas yang belum ada tidak menghasilkan
// kunci, sehingga galeri tidak pernah meminta file yang tidak ada (tanpa 404 di konsol).
const found = import.meta.glob('../models/*.glb', { query: '?url', import: 'default', eager: true });

/** nama berkas (mis. 'angel-old-marble.glb') -> URL */
export const MODEL_FILES = Object.fromEntries(Object.entries(found).map(([path, url]) => [path.split('/').pop(), url]));
