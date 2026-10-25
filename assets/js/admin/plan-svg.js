// Denah galeri melingkar untuk Admin › Gallery (fungsi murni: tata letak -> string SVG).
// Koordinat SVG = koordinat dunia (x, z) dari gallery-layout.js, dilihat dari atas.
import { esc } from '../utils.js';
import { WALL_LABELS, polar } from '../gallery-layout.js';

const f = (v) => +v.toFixed(3);
const pt = (r, a) => polar(r, a).map(f).join(' ');

/** Sektor cincin r0..r1, sudut a0..a1 sebagai path SVG. */
function sectorPath(r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  // sudut membesar = searah jarum jam di SVG (sumbu y ke bawah = +z)
  return `M ${pt(r1, a0)} A ${f(r1)} ${f(r1)} 0 ${large} 0 ${pt(r1, a1)} L ${pt(r0, a1)} A ${f(r0)} ${f(r0)} 0 ${large} 1 ${pt(r0, a0)} Z`;
}

/**
 * @param {object} L hasil buildLayout()
 * @param {{roomName:(num:number)=>string}} o nama ruang untuk label aksesibilitas karya
 */
export function ringPlanSVG(L, { roomName }) {
  const { rIn, rMid, rOut } = L.ring;
  const S = f(rOut + 1.5);
  const full = (r0, r1) => `<path class="room" d="M ${f(r1)} 0 A ${f(r1)} ${f(r1)} 0 1 0 ${-f(r1)} 0 A ${f(r1)} ${f(r1)} 0 1 0 ${f(r1)} 0 M ${f(r0)} 0 A ${f(r0)} ${f(r0)} 0 1 1 ${-f(r0)} 0 A ${f(r0)} ${f(r0)} 0 1 1 ${f(r0)} 0 Z" fill-rule="evenodd"/>`;
  const sections = [{ name: 'Foyer', a0: L.foyer.a0, a1: L.foyer.a1 }, ...L.rooms];
  const label = (s) => { const [x, z] = polar(rMid, (s.a0 + s.a1) / 2); return `<text class="room-label" x="${f(x)}" y="${f(z)}" text-anchor="middle">${esc(s.name)}</text>`; };
  const rooms = sections.map((s) => `${s.a1 - s.a0 >= Math.PI * 2 - 1e-9 ? full(rIn, rOut) : `<path class="room" d="${sectorPath(rIn, rOut, s.a0, s.a1)}"/>`}${label(s)}`).join('');
  const walls = `<circle class="wall" cx="0" cy="0" r="${f(rOut)}" fill="none"/><circle class="wall" cx="0" cy="0" r="${f(rIn)}" fill="none"/>`;
  // partisi radial dengan celah pintu (dinding penutup di a = 0 tanpa pintu)
  const doorHalf = 1.7;
  const radial = (a, door) => (door
    ? `<path class="wall" d="M ${pt(rIn, a)} L ${pt(rMid - doorHalf, a)} M ${pt(rMid + doorHalf, a)} L ${pt(rOut, a)}"/>`
    : `<path class="wall" d="M ${pt(rIn, a)} L ${pt(rOut, a)}"/>`);
  const parts = [radial(0, false), ...(L.rooms.length ? [L.foyer.a1, ...L.rooms.filter((r) => !r.isLast).map((r) => r.a1)] : []).map((a) => radial(a, true))].join('');
  const hall = `<circle class="hall" cx="0" cy="0" r="${f(rIn - 0.3)}"/><circle class="statue" cx="0" cy="0" r="0.8"><title>Patung utama</title></circle>`;
  const [ex, ez] = polar(rMid, 0.6 / rMid);
  const entry = `<text x="${f(ex)}" y="${f(ez + 0.25)}">▶ masuk</text>`;
  const marks = L.placements.map((p, i) => {
    const deg = f((-p.rotY * 180) / Math.PI);
    return `<g class="art${p.art.status === 'draft' ? ' is-draft' : ''}" tabindex="0" role="button" data-plan="${esc(p.art.id)}" transform="translate(${f(p.x)} ${f(p.z)})" aria-label="Edit ${esc(p.art.title)} (${esc(WALL_LABELS[p.wall])}, ${esc(roomName(p.art.room))})">
      <title>${esc(p.art.title)}</title>
      <rect x="${f(-p.size.w / 2)}" y="-0.16" width="${f(p.size.w)}" height="0.32" rx="0.05" transform="rotate(${deg})"/>
      <text x="0" y="0.2" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="plan" viewBox="${-S} ${-S} ${2 * S} ${2 * S}" role="group" aria-label="Denah galeri">${rooms}${walls}${parts}${hall}${entry}${marks}</svg>`;
}
