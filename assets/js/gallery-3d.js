// Galeri 3D (Three.js): bangun ruang, karya berbingkai, pencahayaan, kamera yang digerakkan scroll
// (GSAP ScrollTrigger), interaksi klik/hover, serta penanganan error WebGL.
// Tata letak dihitung oleh gallery-layout.js (fungsi murni) agar admin bisa memakai denah yang sama.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, prefersReducedMotion } from './utils.js';
import { DIMENSIONS as D, buildLayout, detectQuality, polar, segmentWaypoints, viewFov, webglAvailable } from './gallery-layout.js';
import { bendToWall, buildCentralHall, buildRingArchitecture, wallOffset } from './ring-architecture.js';
import { createStatues } from './statues.js';
import { MODEL_FILES } from './statue-files.js';

gsap.registerPlugin(ScrollTrigger);

const FRAMES = {
  black: { color: '#15130f', metal: 0.2, rough: 0.5, width: 0.07, mat: true },
  oak:   { color: '#a98558', metal: 0.0, rough: 0.6, width: 0.09, mat: true },
  white: { color: '#f3f0ea', metal: 0.0, rough: 0.7, width: 0.06, mat: true },
  gold:  { color: '#b8923f', metal: 0.75, rough: 0.35, width: 0.08, mat: true },
  none:  { color: '#d8d2c6', metal: 0.0, rough: 0.8, width: 0.02, mat: false },
};

// hiRes = jumlah karya terdekat yang memakai gambar resolusi penuh (sisanya thumbnail).
const QUALITY = {
  high:   { dpr: 2,    antialias: true,  shadows: true,  spots: 3, mapSize: 1024, aniso: 8, particles: 220, fixtures: true,  hiRes: 2 },
  medium: { dpr: 1.75, antialias: true,  shadows: false, spots: 3, mapSize: 512,  aniso: 4, particles: 0,   fixtures: true,  hiRes: 1 },
  low:    { dpr: 1.5,  antialias: false, shadows: false, spots: 2, mapSize: 512,  aniso: 2, particles: 0,   fixtures: false, hiRes: 0 },
};

/* ============================= helper tekstur ============================= */

function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Inter Variable", Inter, system-ui, sans-serif';

function noiseTexture(base, amount = 10) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true });
}

function woodTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rows = 8;
    const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -((r * 97) % 160);
      while (x < w) {
        const pw = 150 + ((r * 53 + x * 7) % 90);
        const tone = 172 + ((x * 13 + r * 29) % 30) - 15;
        ctx.fillStyle = `rgb(${tone + 12},${tone - 12},${tone - 56})`;
        ctx.fillRect(x, r * ph, pw, ph);
        ctx.strokeStyle = 'rgba(60,40,20,.22)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, r * ph + 0.5, pw, ph);
        ctx.strokeStyle = 'rgba(90,60,30,.07)';
        for (let g = 0; g < 4; g++) {
          const gy = r * ph + 6 + g * (ph / 4.4);
          ctx.beginPath(); ctx.moveTo(x + 4, gy); ctx.lineTo(x + pw - 4, gy + (g % 2 ? 2 : -2)); ctx.stroke();
        }
        x += pw;
      }
    }
  }, { repeat: true });
}

function radialTexture(stops) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

function placeholderTexture(title, aspect) {
  const w = 512; const h = Math.round(512 / aspect);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#e8e1d3'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#8b7f6a'; ctx.font = `italic 400 34px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wrapText(ctx, title || 'Tanpa gambar', w - 100).slice(0, 4).forEach((l, i, a) => ctx.fillText(l, w / 2, h / 2 + (i - (a.length - 1) / 2) * 42));
  });
}

function plaqueTexture(art, roomName) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f7f4ee'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1916'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 44px ${SERIF}`;
    wrapText(ctx, art.title, w - 56).slice(0, 2).forEach((l, i) => ctx.fillText(l, 28, 70 + i * 48));
    ctx.fillStyle = '#6b655b'; ctx.font = `400 26px ${SANS}`;
    ctx.fillText([art.year, roomName].filter(Boolean).join('  ·  '), 28, h - 34);
  });
}

/* =============================== galeri =============================== */

/**
 * @param {object} o
 * @param {HTMLElement} o.trigger   elemen tinggi yang discroll (pemicu ScrollTrigger)
 * @param {HTMLElement} o.stage     elemen sticky yang berisi canvas
 * @param {HTMLCanvasElement} o.canvas
 * @param {Array} o.artworks        hasil api.loadArtworks()
 * @param {object} o.settings       site_settings
 */
export async function createGallery({ trigger, stage, canvas, artworks, settings, quality = detectQuality(), hallProfile = {}, onSelect, onHover, onStop, onProgress, onLoadProgress }) {
  if (!webglAvailable()) throw new Error('WebGL tidak tersedia');
  const Q = QUALITY[quality] || QUALITY.medium;
  const anim = { enabled: true, intensity: 1, shadows: true, smoothing: 1.2, ...(settings.animation || {}) };
  const reduced = prefersReducedMotion() || anim.enabled === false;
  const intensity = clamp(Number(anim.intensity) || 0, 0, 2);
  const wallColor = new THREE.Color(/^#[0-9a-f]{6}$/i.test(settings.theme?.wall || '') ? settings.theme.wall : '#efe9de');

  /* --- renderer --- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.antialias, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { throw new Error('Gagal membuat konteks WebGL: ' + e.message); }
  let dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const useShadows = Q.shadows && anim.shadows !== false;
  if (useShadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const scene = new THREE.Scene();
  scene.background = wallColor.clone();
  scene.fog = new THREE.Fog(wallColor.clone().multiplyScalar(0.98), 16, 58);
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 120);

  /* --- ukuran & tata letak --- */
  const viewInfo = () => {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    return { w, h, aspect: w / h, fov: viewFov(w / h) };
  };
  let view = viewInfo();
  let layout = buildLayout(artworks, settings, view);
  camera.fov = view.fov; camera.aspect = view.aspect; camera.updateProjectionMatrix();

  /* --- bahan bersama --- */
  const maxAniso = Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy());
  const floorTex = woodTexture();
  floorTex.anisotropy = maxAniso;
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.92, map: noiseTexture('#ffffff', 7) }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#fbf9f4', roughness: 1, emissive: '#fffaf0', emissiveIntensity: 0.28 }),
    floor: new THREE.MeshStandardMaterial({ color: '#ffffff', map: floorTex, roughness: 0.5, metalness: 0.02 }),
    strip: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
    trim: new THREE.MeshStandardMaterial({ color: '#f8f5ee', roughness: 0.7 }),
    bench: new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.6 }),
    cushion: new THREE.MeshStandardMaterial({ color: '#d9d1c3', roughness: 0.95 }),
    fixture: new THREE.MeshStandardMaterial({ color: '#232120', roughness: 0.5, metalness: 0.4 }),
    mat: new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.95 }),
  };
  const shadowMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(0,0,0,.55)'], [0.3, 'rgba(0,0,0,.42)'], [0.6, 'rgba(0,0,0,.2)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, opacity: 0.8,
  });
  const washMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(255,244,222,.55)'], [1, 'rgba(255,244,222,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
  });
  const frameMats = {};
  Object.entries(FRAMES).forEach(([k, f]) => { frameMats[k] = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.rough, metalness: f.metal }); });

  const root = new THREE.Group();
  scene.add(root);

  const scaleUV = (geom, su, sv) => {
    const uv = geom.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geom;
  };
  const addMesh = (geom, mat, x, y, z, { shadow = false, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow && useShadows; m.receiveShadow = receive && useShadows;
    parent.add(m);
    return m;
  };
  const box = (w, h, d) => scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) / 4, h / 4);

  /* --- bangun ruang (cincin) --- */
  buildRingArchitecture({ root, mats, layout, addMesh, box });
  const { rIn, rMid, rOut } = layout.ring;
  const hallAngle = layout.foyer.a1 - D.HALL_DOOR_OFFSET / rIn;

  /* --- aula patung di tengah cincin --- */
  const hall = buildCentralHall({ root, mats, layout, addMesh });
  const hallSpot = new THREE.SpotLight('#fff4e0', 40, 9, 0.55, 0.6, 2);
  hallSpot.position.set(0, D.H - 0.1, 0); hallSpot.target.position.set(0, 1.5, 0);
  scene.add(hallSpot, hallSpot.target);

  // patung dimuat asinkron; galeri tidak menunggu (cadangan buatan kode bila berkas model belum ada)
  let statues = null;
  const statuesReady = createStatues({ layout, quality, files: MODEL_FILES, parent: root, useShadows, hallCenter: hall.center })
    .then((s) => { if (destroyed) { s.dispose(); return; } statues = s; invalidate(); })
    .catch((e) => console.warn('Patung tidak dapat dibuat:', e?.message || e));

  // bangku: sumbu panjang searah koridor
  const benchGeom = new THREE.BoxGeometry(2.0, 0.08, 0.6);
  const legGeom = new THREE.BoxGeometry(0.08, 0.42, 0.5);
  const cushGeom = new THREE.BoxGeometry(1.9, 0.06, 0.52);
  const benchShadowGeom = new THREE.PlaneGeometry(3, 1.4);
  const addBench = (r, a) => {
    const [x, z] = polar(r, a);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = a; root.add(g);
    addMesh(benchGeom, mats.bench, 0, 0.44, 0, { shadow: true, parent: g });
    addMesh(cushGeom, mats.cushion, 0, 0.51, 0, { shadow: true, parent: g });
    [-0.8, 0.8].forEach((lx) => addMesh(legGeom, mats.fixture, lx, 0.21, 0, { shadow: true, parent: g }));
    const sh = new THREE.Mesh(benchShadowGeom, shadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.006; g.add(sh);
  };
  addBench(rMid + 2.7, layout.foyer.a1 / 2 + 1.5 / rMid);
  layout.rooms.forEach((room, i) => addBench(rMid + (i % 2 ? 2.7 : -2.7), (room.a0 + room.a1) / 2));

  /* --- teks dinding (dirender setelah font editorial termuat) --- */
  const fontsReady = Promise.all([
    document.fonts.load(`italic 400 80px ${SERIF}`), document.fonts.load(`500 80px ${SERIF}`), document.fonts.load(`400 30px ${SANS}`),
  ]).catch(() => {});

  const textPlanes = [];
  const addWallText = (w, h, pos, rotY, draw, { intro = false, bend = null } = {}) => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
    const geom = new THREE.PlaneGeometry(w, h, bend ? Math.ceil(w / 0.3) : 1, 1);
    const mesh = new THREE.Mesh(bend ? bendToWall(geom, ...bend) : geom, mat);   // bend = [R, sign] untuk dinding melengkung
    mesh.position.set(...pos); mesh.rotation.y = rotY; root.add(mesh);
    textPlanes.push({ mat, w, h, draw, intro, ready: false });
  };
  // teks foyer muncul perlahan saat judul hero (HTML) memudar, agar keduanya tidak bertumpuk
  const introOpacity = () => clamp((state.p * (stops.length - 1) - 0.25) / 0.5, 0, 1);

  // foyer: nama pemilik (dinding luar) & kalimat pembuka (dinding dalam), dilengkungkan mengikuti dinding
  const aName = layout.foyer.a1 / 2;
  const nameW = Math.min(7.2, layout.foyer.a1 * rOut - 1.5);
  const [nx, nz] = polar(rOut - 0.02, aName);
  addWallText(nameW, 2.4, [nx, 3.0, nz], aName + Math.PI, (ctx, w, h) => {
    ctx.fillStyle = '#1b1916';
    const name = settings.owner_name || '';
    let size = 250; ctx.font = `500 ${size}px ${SERIF}`;
    while (ctx.measureText(name).width > w - 80 && size > 60) { size -= 8; ctx.font = `500 ${size}px ${SERIF}`; }
    ctx.fillText(name, 40, h * 0.62);
    ctx.fillStyle = '#6b655b'; ctx.font = `400 ${Math.round(h * 0.085)}px ${SANS}`;
    ctx.fillText((settings.owner_role || '').toUpperCase().split('').join(String.fromCharCode(8202)), 46, h * 0.86);
  }, { intro: true, bend: [rOut, 1] });
  if (settings.profile?.url) {
    const photoW = 1.0; const photoH = 1.25;
    const photoOffset = nameW / 2 + photoW / 2 + 0.05;
    const photoAngle = aName + photoOffset / rOut;
    const [photoX, photoZ] = polar(rOut - 0.02, photoAngle);
    const photoGroup = new THREE.Group();
    photoGroup.position.set(photoX, 3.0, photoZ);
    photoGroup.rotation.y = photoAngle + Math.PI;
    root.add(photoGroup);
    const bendFrame = (w, h) => bendToWall(new THREE.PlaneGeometry(w, h, 8, 1), rOut, 1);
    const frame = new THREE.Mesh(bendFrame(photoW + 0.16, photoH + 0.16), frameMats.oak);
    photoGroup.add(frame);
    const photoMat = new THREE.MeshBasicMaterial({ color: '#f4efe7' });
    const photo = new THREE.Mesh(bendFrame(photoW, photoH), photoMat);
    photo.position.z = 0.012;
    photoGroup.add(photo);
    new THREE.TextureLoader().load(settings.profile.url, (texture) => {
      if (destroyed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAniso;
      photoMat.map = texture;
      photoMat.needsUpdate = true;
      invalidate();
    }, undefined, (error) => {
      console.warn('Foto foyer tidak dapat dimuat:', error?.message || error);
      photoGroup.visible = false;
    });
  }
  const aHero = layout.foyer.a1 * 0.38;
  const heroW = Math.max(2, Math.min(5.4, layout.foyer.a1 * rIn - D.BAY_W - 1.2));
  const [hx, hz] = polar(rIn + 0.02, aHero);
  addWallText(heroW, (heroW * 2.4) / 5.4, [hx, 2.6, hz], aHero, (ctx, w, h) => {
    ctx.fillStyle = '#1b1916';
    ctx.font = `italic 400 ${Math.round(h * 0.2)}px ${SERIF}`;
    wrapText(ctx, settings.hero_title || '', w - 80).slice(0, 4).forEach((l, i) => ctx.fillText(l, 40, h * 0.3 + i * h * 0.23));
  }, { intro: true, bend: [rIn, -1] });

  function hallBoardTexture(title, lines) {
    return canvasTexture(900, 760, (ctx, w, h) => {
      ctx.fillStyle = '#f7f4ee'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(27,25,22,.2)'; ctx.lineWidth = 3;
      ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#8b6a3d'; ctx.font = `500 22px ${SANS}`;
      ctx.fillText('AULA PATUNG', 42, 38);
      ctx.fillStyle = '#1b1916'; ctx.font = `500 48px ${SERIF}`;
      const wrappedTitle = wrapText(ctx, title, w - 84).slice(0, 2);
      wrappedTitle.forEach((part, index) => ctx.fillText(part, 42, 82 + index * 56));
      ctx.fillStyle = '#514b43'; ctx.font = `500 38px ${SANS}`;
      let y = wrappedTitle.length > 1 ? 218 : 166;
      lines.forEach((line) => {
        const wrapped = wrapText(ctx, line, w - 84);
        wrapped.slice(0, 2).forEach((part) => { if (y < h - 42) ctx.fillText(part, 42, y); y += 46; });
        y += 10;
      });
    });
  }

  const hallRadiusOnWall = Math.max(3.6, layout.ring.rIn - 0.72);
  const detailLines = [...(hallProfile.details || []).map(([label, value]) => `${label}: ${value}`)];
  if (hallProfile.biography) detailLines.push(hallProfile.biography);
  const focusLines = detailLines.filter((line) => /minat|fokus|keahlian|bahasa/i.test(line));
  const defaultBoards = [
    { title: hallProfile.name || 'Tentang saya', lines: [hallProfile.role, ...detailLines].filter(Boolean).slice(0, 5) },
    { title: 'Fokus kreatif', lines: focusLines.length ? focusLines : ['Bahasa Inggris', 'Informatika'] },
    { title: 'Tentang saya', lines: hallProfile.biography ? [hallProfile.biography] : ['Jelajahi aula untuk mengenal profil dan karya saya.'] },
  ];
  const boards = defaultBoards.map((fallback, index) => {
    const card = hallProfile.cards?.[index];
    return {
      angle: hallAngle + [Math.PI / 3, Math.PI, (5 * Math.PI) / 3][index],
      title: card ? card.title : fallback.title,
      lines: card ? card.description.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 5) : fallback.lines,
      portrait: hallProfile.photoUrl,
    };
  });
  const hallPortraitTexture = hallProfile.photoUrl
    ? new THREE.TextureLoader().load(hallProfile.photoUrl, (texture) => {
      if (destroyed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAniso;
      invalidate();
    }, undefined, (error) => console.warn('Foto aula tidak dapat dimuat:', error?.message || error))
    : null;
  const hallTourAngles = boards.map((board) => board.angle);
  boards.forEach((board) => {
    const [x, z] = polar(hallRadiusOnWall, board.angle);
    const group = new THREE.Group();
    group.position.set(x, 2.05, z);
    group.rotation.y = board.angle + Math.PI;
    root.add(group);
    const hasPortrait = !!board.portrait;
    const backingWidth = 3.2;
    const backingHeight = 1.8;
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(backingWidth, backingHeight), frameMats.oak);
    group.add(backing);

    const mat = new THREE.Mesh(new THREE.PlaneGeometry(3.02, 1.62), mats.mat);
    mat.position.z = 0.015;
    group.add(mat);

    if (hasPortrait) {
      const photoMat = new THREE.MeshBasicMaterial({ color: '#e8e1d3', map: hallPortraitTexture });
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.44), photoMat);
      photo.position.set(-0.78, 0, 0.035);
      group.add(photo);
    }

    const textTexture = hallBoardTexture(board.title, board.lines);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 1.44), new THREE.MeshBasicMaterial({ map: textTexture }));
    text.position.set(0.7, 0, 0.04);
    group.add(text);

    const brass = frameMats.gold;
    const sconceGlow = new THREE.MeshStandardMaterial({
      color: '#fff0c8',
      emissive: '#ffd27a',
      emissiveIntensity: 1.8,
      roughness: 0.32,
    });
    [-1, 1].forEach((side) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.06), brass);
      plate.position.set(side * 1.82, 0.02, 0.075);
      group.add(plate);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), brass);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * 1.82, 0.05, 0.18);
      group.add(arm);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 12), brass);
      shade.position.set(side * 1.82, 0.02, 0.25);
      shade.rotation.x = Math.PI;
      group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), sconceGlow);
      bulb.position.set(side * 1.82, 0.02, 0.32);
      group.add(bulb);
    });
    const sconceLight = new THREE.PointLight('#ffe3a8', 3.5, 4.5, 2);
    sconceLight.position.set(0, 0.12, 0.38);
    group.add(sconceLight);
  });

  // judul ruang di atas ambang pintu, di muka partisi yang menghadap kamera
  const lintelY = D.DOOR_H + (D.H - D.DOOR_H) / 2;
  layout.rooms.forEach((room) => {
    const [px, pz] = polar(rMid, room.a0);
    const off = D.T / 2 + 0.012;
    addWallText(3.3, 0.78, [px - off * Math.cos(room.a0), lintelY, pz + off * Math.sin(room.a0)], room.a0 - Math.PI / 2, (ctx, w, h) => {
      ctx.fillStyle = '#1b1916'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${Math.round(h * 0.48)}px ${SERIF}`;
      ctx.fillText(room.name, w / 2, h * 0.42);
      if (room.subtitle) { ctx.fillStyle = '#6b655b'; ctx.font = `400 ${Math.round(h * 0.17)}px ${SANS}`; ctx.fillText(room.subtitle.toUpperCase(), w / 2, h * 0.82); }
    });
  });

  /* --- karya --- */
  const pickables = [];
  const artObjects = [];
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  let loadedCount = 0; let totalToLoad = 0;

  const prepTexture = (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso; return tex; };
  function setPicture(o, tex, src) {
    const old = o.picMat.map;
    o.picMat.map = tex; o.picMat.emissiveMap = tex; o.picMat.needsUpdate = true;
    o.currentSrc = src;
    if (old && old !== o.baseTex && old !== o.hiTex) old.dispose();
    invalidate();
  }

  function buildArtwork(p) {
    const { art, size } = p;
    const style = FRAMES[art.frame_style] || FRAMES.black;
    const fw = style.width; const depth = 0.07; const margin = style.mat ? 0.1 : 0;
    const ow = size.w + 2 * (margin + fw); const oh = size.h + 2 * (margin + fw);
    const g = new THREE.Group();
    g.position.set(p.x, D.ART_Y, p.z);
    g.rotation.y = p.rotY;
    root.add(g);

    // bayangan lembut & sorot cahaya pada dinding; dilengkungkan mengikuti dinding (dinding ujung datar)
    const onWall = (w, h) => {
      const geom = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 0.4)), 1);
      return p.wall === 'back' ? geom : bendToWall(geom, p.r, p.wall === 'right' ? 1 : -1);
    };
    const sh = new THREE.Mesh(onWall(ow + 0.8, oh + 0.8), shadowMat);
    sh.position.set(0.04, -0.07, 0.004); g.add(sh);
    const wash = new THREE.Mesh(onWall(ow + 2.4, oh + 2.2), washMat);
    wash.position.set(0, 0.25, 0.006); g.add(wash);

    // dinding luar cekung: majukan bingkai agar sudut-sudutnya tidak tertanam di dinding
    const wallSign = p.wall === 'right' ? 1 : p.wall === 'left' ? -1 : 0;
    const body = new THREE.Group();
    body.position.z = wallSign > 0 ? wallOffset(p.r, 1, ow / 2).z : 0;
    g.add(body);

    // bingkai: 4 batang digabung menjadi satu geometri (1 draw call)
    const bars = [
      new THREE.BoxGeometry(ow, fw, depth).translate(0, oh / 2 - fw / 2, depth / 2),
      new THREE.BoxGeometry(ow, fw, depth).translate(0, -oh / 2 + fw / 2, depth / 2),
      new THREE.BoxGeometry(fw, oh - 2 * fw, depth).translate(-ow / 2 + fw / 2, 0, depth / 2),
      new THREE.BoxGeometry(fw, oh - 2 * fw, depth).translate(ow / 2 - fw / 2, 0, depth / 2),
    ];
    const frame = new THREE.Mesh(mergeGeometries(bars), frameMats[art.frame_style] || frameMats.black);
    frame.castShadow = useShadows; frame.receiveShadow = useShadows; body.add(frame);
    bars.forEach((b) => b.dispose());

    if (style.mat) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ow - 2 * fw, oh - 2 * fw), mats.mat);
      m.position.z = depth * 0.42; m.receiveShadow = useShadows; body.add(m);
    }

    const picMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65, emissive: '#ffffff', emissiveIntensity: 0.16 });
    picMat.map = placeholderTexture(art.title, size.aspect);
    picMat.emissiveMap = picMat.map;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), picMat);
    pic.position.z = depth * 0.42 + 0.004; pic.receiveShadow = useShadows;
    pic.userData.placement = p.index;
    body.add(pic); pickables.push(pic);

    // label museum di samping karya
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: plaqueTexture(art, layout.rooms[p.room]?.name), roughness: 0.8 }));
    const plaqueX = ow / 2 + 0.36;
    const po = wallSign ? wallOffset(p.r, wallSign, plaqueX) : { z: 0, rotY: 0 };
    plaque.position.set(plaqueX, Math.max(1.1 - D.ART_Y, -oh / 2 + 0.3), po.z + 0.012);
    plaque.rotation.y = po.rotY;
    g.add(plaque);

    if (Q.fixtures) { // lampu rel di langit-langit
      const out = 1.5;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), mats.fixture);
      rod.position.set(0, D.H - D.ART_Y - 0.25, out); g.add(rod);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 12), mats.fixture);
      head.position.set(0, D.H - D.ART_Y - 0.55, out); head.rotation.x = -Math.atan2(out, D.H - 0.65 - D.ART_Y); g.add(head);
    }

    const center = new THREE.Vector3(); g.getWorldPosition(center);
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, p.rotY, 0));
    const baseSrc = art.image ? art.image.thumbUrl || art.image.url : null;
    const hiSrc = art.image && art.image.url && art.image.url !== baseSrc ? art.image.url : null;
    const o = { pic, picMat, center, normal, placement: p, baseSrc, hiSrc, baseTex: null, hiTex: null, hiLoading: false, currentSrc: null };
    artObjects[p.index] = o;

    if (baseSrc) {
      totalToLoad++;
      loader.load(baseSrc, (tex) => {
        o.baseTex = prepTexture(tex);
        // bila metadata dimensi tidak ada, sesuaikan proporsi dengan gambar asli
        if (!art.image.width && tex.image?.width) {
          const asp = clamp(tex.image.width / tex.image.height, 0.3, 4);
          if (asp >= size.aspect) pic.scale.set(1, size.aspect / asp, 1); else pic.scale.set(asp / size.aspect, 1, 1);
        }
        if (!o.hiTex) setPicture(o, tex, baseSrc);
        loadedCount++; onLoadProgress?.(loadedCount, totalToLoad);
      }, undefined, () => { loadedCount++; onLoadProgress?.(loadedCount, totalToLoad); });
    }
  }

  /** Muat gambar resolusi penuh untuk karya terdekat, lepaskan yang sudah jauh (hemat memori GPU). */
  let keep = new Set();
  function updateHiRes(nearest) {
    if (!Q.hiRes) return;
    const want = new Set(nearest.slice(0, Q.hiRes));
    keep = new Set(nearest.slice(0, Q.hiRes + 2));
    artObjects.forEach((o, idx) => {
      if (!o?.hiSrc) return;
      if (want.has(idx) && !o.hiTex && !o.hiLoading) {
        o.hiLoading = true;
        loader.load(o.hiSrc, (tex) => {
          o.hiLoading = false;
          if (destroyed || !keep.has(idx)) { tex.dispose(); return; }
          o.hiTex = prepTexture(tex);
          setPicture(o, tex, o.hiSrc);
        }, undefined, () => { o.hiLoading = false; o.hiSrc = null; });
      } else if (!keep.has(idx) && o.hiTex) {
        const t = o.hiTex;
        o.hiTex = null;
        if (o.baseTex) setPicture(o, o.baseTex, o.baseSrc); // setPicture membuang tekstur lama
        else t.dispose();
      }
    });
  }

  /* --- lampu --- */
  scene.add(new THREE.HemisphereLight('#fff8ee', '#f2e8d6', 2.15));
  const fill = new THREE.PointLight('#fff1dc', 6, 14, 2);
  scene.add(fill);

  const spots = [];
  for (let i = 0; i < Q.spots; i++) {
    const s = new THREE.SpotLight('#fff0d8', 55, 11, 0.62, 0.75, 2);
    if (useShadows) {
      s.castShadow = true; s.shadow.mapSize.set(Q.mapSize, Q.mapSize);
      s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.radius = 4;
      s.shadow.camera.near = 0.5; s.shadow.camera.far = 12;
    }
    const target = new THREE.Object3D();
    scene.add(s, target); s.target = target;
    spots.push({ light: s, target, assigned: -1 });
  }

  // partikel debu yang melayang (hanya desktop)
  let dust = null; let dustBase = null;
  if (Q.particles && !reduced) {
    const n = Q.particles; const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = layout.ring.rIn + 0.5 + Math.random() * (D.W - 1);
      const a = Math.random() * Math.PI * 2;
      arr[i * 3] = r * Math.sin(a);
      arr[i * 3 + 1] = 0.4 + Math.random() * (D.H - 0.8);
      arr[i * 3 + 2] = r * Math.cos(a);
    }
    dustBase = arr.slice();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const dot = radialTexture([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff7e6', map: dot, alphaTest: 0.05, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(dust);
  }

  layout.placements.forEach(buildArtwork);

  fontsReady.then(() => {
    if (destroyed) return;
    textPlanes.forEach((tp) => {
      const tw = 1536; const th = Math.round((tw * tp.h) / tp.w);
      tp.mat.map = canvasTexture(tw, th, (ctx, cw, ch) => tp.draw(ctx, cw, ch));
      tp.mat.opacity = tp.intro ? introOpacity() : 1; tp.mat.needsUpdate = true;
      tp.ready = true;
    });
    invalidate();
  });

  /* --- jalur kamera: satu kurva per segmen antar-stop --- */
  // Kamera berhenti (dwell) di tiap stop sehingga segmen boleh berdiri sendiri. Titik bantu segmen
  // (gallery-layout.js › segmentWaypoints) mengikuti busur koridor dan melewati tengah ambang pintu.
  let stops = layout.stops;
  let segments = [];
  const V = (a) => new THREE.Vector3(...a);
  function buildPaths() {
    stops = layout.stops;
    segments = stops.slice(0, -1).map((a, i) => {
      const wp = segmentWaypoints(a, stops[i + 1], layout);
      return {
        pos: new THREE.CatmullRomCurve3(wp.pos.map(V), false, 'centripetal', 0.5),
        look: new THREE.CatmullRomCurve3(wp.look.map(V), false, 'centripetal', 0.5),
      };
    });
  }
  buildPaths();

  const smooth = (x) => x * x * (3 - 2 * x);
  /** p (0..1 scroll) -> segmen + progres ter-easing, dengan jeda (dwell) di setiap stop. */
  function pathAt(p) {
    const n = stops.length;
    if (n < 2) return { i: 0, e: 0 };
    const seg = clamp(p, 0, 1) * (n - 1);
    const i = Math.min(Math.floor(seg), n - 2);
    const u = seg - i;
    const ds = stops[i].dwell ?? 0.2; const de = stops[i + 1].dwell ?? 0.2;
    const span = Math.max(0.25, 1 - ds - de);
    return { i, e: smooth(clamp((u - ds) / span, 0, 1)) };
  }

  /* --- status & loop --- */
  const state = { p: 0 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const lastAssignPos = new THREE.Vector3(1e9, 0, 0);
  const hallView = { progress: 0 };
  const hallRadius = Math.min(2.4, layout.ring.rIn - 3.0);
  const hallPathControlRadius = hallRadius + 3.5;
  const hallStartAngle = hallTourAngles[0] ?? hallAngle;
  const hallStation = (angle, radius = hallRadius) => {
    const [x, z] = polar(radius, angle);
    return new THREE.Vector3(x, D.EYE, z);
  };
  const hallPosition = new THREE.Vector3(
    hallRadius * Math.sin(hallStartAngle),
    D.EYE,
    hallRadius * Math.cos(hallStartAngle),
  );
  const hallWalk = { active: false, progress: 0, targetProgress: 0, fromProgress: 0, startedAt: 0 };
  let hallScrollAnimating = false;
  let hallPointerY = null;
  let hallTransition = null;
  let needsRender = true;
  let visible = true;
  let running = false;
  let frameId = 0;
  let destroyed = false;
  let lastStop = -1;
  let hoverIndex = -1;
  const sway = !reduced && intensity > 0 && !window.matchMedia('(pointer: coarse)').matches;

  function assignLights() {
    const ranked = artObjects
      .map((o, idx) => ({ idx, d: o ? o.center.distanceToSquared(camPos) : Infinity }))
      .filter((r) => r.d < Infinity)
      .sort((a, b) => a.d - b.d)
      .map((r) => r.idx);
    spots.forEach((sp, k) => {
      const idx = ranked[k];
      if (idx === undefined) { sp.light.visible = false; return; }
      sp.light.visible = true;
      if (sp.assigned !== idx) {
        const o = artObjects[idx];
        sp.light.position.copy(o.center).addScaledVector(o.normal, 1.7);
        sp.light.position.y = D.H - 0.5;
        sp.target.position.copy(o.center);
        sp.assigned = idx;
      }
    });
    updateHiRes(ranked);
  }

  /** Jaga kamera tetap di dalam koridor melingkar (0,6 m dari kedua dinding). */
  const clampRadial = (v) => {
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-6) return v;
    const rc = clamp(r, layout.ring.rIn + 0.6, layout.ring.rOut - 0.6);
    if (rc !== r) { v.x *= rc / r; v.z *= rc / r; }
    return v;
  };
  /** Posisi & titik tatap kamera pada progres scroll p (0..1), tanpa efek sway. */
  function cameraAtProgress(p, outPos, outLook) {
    const { i, e } = pathAt(p);
    const segment = segments[i];
    if (segment) { segment.pos.getPoint(e, outPos); segment.look.getPoint(e, outLook); }
    else { outPos.set(...stops[0].pos); outLook.set(...stops[0].look); }
    clampRadial(outPos);
    return { i, e };
  }

  function applyCamera(time) {
    const { i, e } = cameraAtProgress(state.p, camPos, camLook);
    if (hallView.progress > 0) {
      camPos.lerp(hallPosition, hallView.progress);
      const initialWall = new THREE.Vector3(
        hallRadiusOnWall * Math.sin(hallStartAngle),
        2.05,
        hallRadiusOnWall * Math.cos(hallStartAngle),
      );
      camLook.lerp(initialWall, hallView.progress);
    }
    if (hallWalk.active && hallView.progress >= 0.999) {
      const segment = Math.min(Math.floor(hallWalk.progress), hallTourAngles.length - 2);
      const mix = hallWalk.progress - segment;
      const angleA = hallTourAngles[segment];
      const angleB = hallTourAngles[segment + 1];
      const angleMid = (angleA + angleB) / 2;
      const pointA = hallStation(angleA);
      const pointB = hallStation(angleB);
      const control = hallStation(angleMid, hallPathControlRadius);
      const inv = 1 - mix;
      camPos.copy(pointA).multiplyScalar(inv * inv)
        .addScaledVector(control, 2 * inv * mix)
        .addScaledVector(pointB, mix * mix);
      const lookA = new THREE.Vector3(
        hallRadiusOnWall * Math.sin(angleA), 2.05, hallRadiusOnWall * Math.cos(angleA),
      );
      const lookB = new THREE.Vector3(
        hallRadiusOnWall * Math.sin(angleB), 2.05, hallRadiusOnWall * Math.cos(angleB),
      );
      camLook.lerpVectors(lookA, lookB, mix);
    }
    const hallFov = view.fov + (78 - view.fov) * hallView.progress;
    if (Math.abs(camera.fov - hallFov) > 0.01) {
      camera.fov = hallFov;
      camera.updateProjectionMatrix();
    }
    if (sway && !hallWalk.active) {
      const r = Math.hypot(camPos.x, camPos.z) || 1;
      const swing = Math.sin(time * 0.45) * 0.04 * intensity;      // menggeser kamera sepanjang radial
      camPos.x += (camPos.x / r) * swing; camPos.z += (camPos.z / r) * swing;
      camPos.y += Math.sin(time * 0.9) * 0.018 * intensity;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      // geser titik tatap ke kanan/kiri relatif arah pandang (bukan sumbu x dunia)
      const fx = camLook.x - camPos.x; const fz = camLook.z - camPos.z; const fl = Math.hypot(fx, fz) || 1;
      camLook.x += (-fz / fl) * pointer.x * 0.9 * intensity; camLook.z += (fx / fl) * pointer.x * 0.9 * intensity;
      camLook.y += pointer.y * 0.45 * intensity;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    fill.position.set(camPos.x, camPos.y + 1.2, camPos.z);

    if (camPos.distanceToSquared(lastAssignPos) > 0.09) { lastAssignPos.copy(camPos); assignLights(); }
    const fade = introOpacity();
    textPlanes.forEach((tp) => { if (tp.intro && tp.ready) tp.mat.opacity = hallWalk.active ? 0 : fade; });

    const nearest = e < 0.5 ? i : i + 1;
    if (nearest !== lastStop) { lastStop = nearest; onStop?.(nearest, stops[nearest]); }
  }

  function render(time) {
    applyCamera(time);
    if (dust) {
      const pos = dust.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        pos.setY(k, dustBase[k * 3 + 1] + Math.sin(time * 0.25 + k) * 0.12);
        pos.setX(k, dustBase[k * 3] + Math.cos(time * 0.18 + k * 1.7) * 0.1);
      }
      pos.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  // render on-demand: hanya saat ada perubahan, kecuali efek ambient (sway/debu) aktif
  let frames = 0; let acc = 0; let last = performance.now(); let adapt = 0;
  function tick() {
    frameId = 0;
    if (destroyed || !running) return;
    const now = performance.now();
    const dt = now - last; last = now;
    if (hallTransition) {
      const t = hallTransition.duration ? clamp((now - hallTransition.startedAt) / hallTransition.duration, 0, 1) : 1;
      const eased = t * t * (3 - 2 * t);
      hallView.progress = hallTransition.from + (hallTransition.to - hallTransition.from) * eased;
      if (t === 1) hallTransition = null;
      needsRender = true;
    }
    if (hallScrollAnimating) {
      const t = clamp((now - hallWalk.startedAt) / (reduced ? 1 : 1800), 0, 1);
      const eased = t * t * (3 - 2 * t);
      hallWalk.progress = hallWalk.fromProgress + (hallWalk.targetProgress - hallWalk.fromProgress) * eased;
      if (t === 1) {
        hallScrollAnimating = false;
      }
      needsRender = true;
    }
    if (visible && (needsRender || sway || dust || hallTransition || hallScrollAnimating)) {
      render(now / 1000);
      needsRender = false;
      // turunkan resolusi bila perangkat kesulitan mempertahankan ~30 fps
      if (adapt < 3 && dpr > 0.9) {
        acc += dt; frames++;
        if (frames >= 90) {
          if (acc / frames > 36) { dpr = Math.max(0.75, dpr - 0.35); renderer.setPixelRatio(dpr); resize(true); adapt++; }
          frames = 0; acc = 0;
        }
      }
    }
    if (visible && !document.hidden && (sway || dust || hallTransition || hallScrollAnimating)) frameId = requestAnimationFrame(tick);
    else running = false;
  }
  function start() {
    if (!running && !destroyed && visible && !document.hidden && (needsRender || sway || dust || hallScrollAnimating)) {
      running = true;
      last = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  }
  function stop() {
    running = false;
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }
  function invalidate() {
    needsRender = true;
    start();
  }
  function setHallView(inside) {
    if (inside) {
      hallWalk.progress = 0;
      hallWalk.targetProgress = 0;
      hallWalk.fromProgress = 0;
      hallWalk.active = true;
      canvas.style.touchAction = 'none';
      canvas.style.cursor = '';
    } else {
      hallWalk.active = false;
      hallPointerY = null;
      canvas.style.touchAction = '';
      canvas.style.cursor = '';
    }
    hallTransition = {
      from: hallView.progress,
      to: inside ? 1 : 0,
      startedAt: performance.now(),
      duration: reduced ? 0 : 900,
    };
    invalidate();
  }
  function walkScroll(delta) {
    if (!hallWalk.active || hallScrollAnimating || delta === 0) return;
    hallWalk.targetProgress = clamp(Math.round(hallWalk.progress) + Math.sign(delta), 0, hallTourAngles.length - 1);
    hallWalk.fromProgress = hallWalk.progress;
    hallWalk.startedAt = performance.now();
    hallScrollAnimating = Math.abs(hallWalk.targetProgress - hallWalk.progress) > 0.001;
    invalidate();
  }

  /* --- scroll --- */
  const tween = gsap.to(state, {
    p: 1, ease: 'none',
    scrollTrigger: { trigger, start: 'top top', end: 'bottom bottom', scrub: reduced ? true : clamp(Number(anim.smoothing) || 1.2, 0.1, 4) },
    onUpdate: () => { invalidate(); onProgress?.(state.p); },
  });

  /* --- ukuran --- */
  function resize(force = false) {
    const next = viewInfo();
    renderer.setSize(next.w, next.h, false);
    camera.aspect = next.aspect;
    if (next.fov !== view.fov || force) {
      camera.fov = next.fov;
      layout = { ...layout, stops: buildLayout(artworks, settings, next).stops };
      buildPaths();
    }
    view = next;
    camera.updateProjectionMatrix();
    invalidate();
  }
  renderer.setSize(view.w, view.h, false);
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);

  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) invalidate();
    else stop();
  }, { rootMargin: '10% 0px' });
  io.observe(stage);

  /* --- interaksi --- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.placement : -1;
  }
  function setHover(idx, ev) {
    if (idx !== hoverIndex) {
      if (hoverIndex >= 0) artObjects[hoverIndex].picMat.emissiveIntensity = 0.16;
      hoverIndex = idx;
      if (idx >= 0) artObjects[idx].picMat.emissiveIntensity = 0.32;
      canvas.style.cursor = idx >= 0 ? 'pointer' : '';
      invalidate();
    }
    onHover?.(idx, ev);
  }
  let moveRaf = 0;
  const onMove = (ev) => {
    if (hallWalk.active) {
      if (hallPointerY !== null && ev.pointerType === 'touch') {
        const deltaY = hallPointerY - ev.clientY;
        hallPointerY = ev.clientY;
        walkScroll(deltaY);
      }
      return;
    }
    if (ev.pointerType === 'touch') return;
    pointer.tx = (ev.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = -(ev.clientY / window.innerHeight - 0.5) * 2;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => { moveRaf = 0; setHover(pick(ev), ev); });
  };
  let down = null;
  const onDown = (ev) => {
    if (hallWalk.active) {
      hallPointerY = ev.clientY;
      canvas.setPointerCapture?.(ev.pointerId);
      down = null;
      return;
    }
    down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  };
  const onUp = (ev) => {
    if (hallPointerY !== null) {
      hallPointerY = null;
      if (canvas.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      return;
    }
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    const dur = performance.now() - down.t;
    down = null;
    if (moved < 9 && dur < 700) { // ketukan, bukan gerakan scroll
      const idx = pick(ev);
      if (idx >= 0) onSelect?.(idx, layout.placements[idx].art);
    }
  };
  const onLeave = () => { if (!hallWalk.active) setHover(-1); };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  // konteks WebGL hilang (driver reset, memori GPU habis): tunggu pemulihan, jika tidak -> fallback HTML
  let lostTimer;
  const onLost = (e) => { e.preventDefault(); stop(); lostTimer = setTimeout(() => api.onFatal?.(new Error('Konteks WebGL hilang')), 2500); };
  const onRestored = () => { clearTimeout(lostTimer); invalidate(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
  document.addEventListener('visibilitychange', onVis);

  start();
  render(0);
  needsRender = false;

  const api = {
    quality,
    onFatal: null,
    stops: () => stops,
    layout: () => layout,
    currentStop: () => lastStop,
    /** posisi scroll (px) untuk stop ke-i */
    scrollYForStop(i) {
      const top = trigger.getBoundingClientRect().top + window.scrollY;
      const range = trigger.offsetHeight - window.innerHeight;
      return top + (i / (stops.length - 1)) * range + 1;
    },
    goToStop(i, smoothScroll = true) {
      window.scrollTo({ top: this.scrollYForStop(clamp(i, 0, stops.length - 1)), behavior: smoothScroll && !reduced ? 'smooth' : 'auto' });
    },
    enterHall() {
      setHallView(true);
    },
    exitHall() {
      setHallView(false);
    },
    walkScroll,
    render: invalidate,
    /** selesai saat patung siap (model asli atau cadangan) */
    statuesReady,
    /** kredit model 3D yang benar-benar dimuat (lisensi CC BY wajib mencantumkan) */
    credits: () => (statues ? statues.credits() : []),
    /** posisi kamera pada progres scroll p (0..1) tanpa sway — untuk pengujian */
    cameraAt(p) {
      const pos = new THREE.Vector3(); const look = new THREE.Vector3();
      cameraAtProgress(p, pos, look);
      return { pos: pos.toArray(), look: look.toArray() };
    },
    /** koordinat klien (px) pusat karya ke-i, atau null bila di luar layar / di belakang kamera */
    screenPointOfPlacement(i) {
      const o = artObjects[i];
      if (!o) return null;
      camera.updateMatrixWorld();
      const v = o.center.clone().project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    /** diagnostik untuk pengujian otomatis */
    debug: () => {
      return {
        quality, p: state.p, stop: lastStop, dpr, fov: camera.fov, hallProgress: hallView.progress, hallWalking: hallWalk.active, hallTourProgress: hallWalk.progress, hallBoards: boards.length, camera: camera.position.toArray(),
        ring: layout.ring, radius: Math.hypot(camera.position.x, camera.position.z),
        statues: statues ? statues.group.children.map((c) => c.userData.statueId) : [], statueModels: statues ? [...statues.loaded] : [],
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures,
        artworks: artObjects.map((o) => ({ id: o.placement.art.id, title: o.placement.art.title, src: o.currentSrc, hi: !!o.hiTex })),
      };
    },
    destroy() {
      destroyed = true; stop();
      clearTimeout(lostTimer);
      tween.scrollTrigger?.kill(); tween.kill();
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const m = obj.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
      });
      artObjects.forEach((o) => { o?.baseTex?.dispose(); o?.hiTex?.dispose(); });
      renderer.dispose();
    },
  };
  return api;
}
