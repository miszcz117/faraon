/* Faraon: drawing basics. ONE WORLD, ONE SCALE.
   Unit = one block width (~1.2 m). Everything is defined in these units and goes through the single
   projection P(). True 2:1 dimetric: a ground diamond is T wide and T/2 tall, one unit of height is ZK*T px. */
(function () {
'use strict';
const BH = Sim.BH, ZK = 0.6124, HUMAN = 1.45;
const cv = document.getElementById('scene'), ctx = cv.getContext('2d');
const cam = { x: 19, y: -2, T: 34 };
const V = { W: 800, H: 600, DPR: 1 };
const P = (x, y, z = 0) => [V.W / 2 + ((x - cam.x) - (y - cam.y)) * cam.T * 0.5, V.H / 2 + ((x - cam.x) + (y - cam.y)) * cam.T * 0.25 - z * cam.T * ZK];
function unproj(sx, sy, z = 0) {
  const a = (sx - V.W / 2) / (cam.T * 0.5), b = (sy - V.H / 2 + z * cam.T * ZK) / (cam.T * 0.25);
  return [cam.x + (a + b) / 2, cam.y + (b - a) / 2];
}
function visBox(z = 0, pad = 2) {
  const c = [unproj(0, 0, z), unproj(V.W, 0, z), unproj(0, V.H, z), unproj(V.W, V.H, z)];
  return { x0: Math.min(c[0][0], c[1][0], c[2][0], c[3][0]) - pad, x1: Math.max(c[0][0], c[1][0], c[2][0], c[3][0]) + pad,
           y0: Math.min(c[0][1], c[1][1], c[2][1], c[3][1]) - pad, y1: Math.max(c[0][1], c[1][1], c[2][1], c[3][1]) + pad };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function hsh(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const shadeCache = new Map();
function shade(hex, amt) {
  const q = Math.round(amt * 40), key = hex + q; let v = shadeCache.get(key); if (v) return v;
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const a = q / 40;
  if (a >= 0) { r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a; } else { r *= 1 + a; g *= 1 + a; b *= 1 + a; }
  v = `rgb(${r | 0},${g | 0},${b | 0})`; shadeCache.set(key, v); return v;
}
const INK = '#4A2E16';
const C = {
  sand: '#E9CD8C', rut: '#C3A261',
  stone: { t: '#FBF2D8', l: '#EBDCB2', r: '#C8B283' }, raw: { t: '#E6DABD', l: '#D2C29D', r: '#AF9D76' },
  rock: { t: '#E2C78F', l: '#F1E6CB', r: '#C9B88F' }, mud: { t: '#DDB77E', l: '#C99C60', r: '#A47A44' },
  granite: { t: '#B5746A', l: '#9C5C54', r: '#7A433D' }, ramp: { t: '#CFA36B', l: '#B98A53', r: '#98703F' }, wood: { t: '#B98450', l: '#9C6A3A', r: '#7C5229' },
  water: '#3FA9B6', waterD: '#2C8FA3', waterL: '#9ADADB', green: '#86B84F', greenD: '#6CA23E', wheat: '#DCC555', damp: '#C7AE66',
  palm: '#3E8E3B', palmD: '#2E7533', trunk: '#8A5A2B', skin: '#A9683A', skinD: '#8A522B', kilt: '#FFF8E6', hair: '#2A1B12',
  shadow: 'rgba(96,60,20,0.22)'
};

/* ---------- painted assets (art/*.webp). Until a file loads, that thing is drawn flat. ---------- */
const SPR = {
  palm_a: { w: 280, h: 420, ax: 126.9, ay: 418 }, palm_b: { w: 261, h: 380, ax: 91.3, ay: 378 },
  palm_c: { w: 418, h: 420, ax: 200, ay: 418 }, reeds: { w: 222, h: 220, ax: 110, ay: 218 },
  house_a: { w: 420, h: 430, ax: 209.6, ay: 421.2 }, house_b: { w: 520, h: 510, ax: 263.8, ay: 507.3 },
  hut: { w: 440, h: 545, ax: 170.8, ay: 495.4 }, granary: { w: 520, h: 464, ax: 262.5, ay: 419.5 },
  workshop: { w: 460, h: 509, ax: 232.7, ay: 489.6 }, boat: { w: 420, h: 416, ax: 210, ay: 324.5 },
  barge_e: { w: 460, h: 460, ax: 226, ay: 222 }, barge_w: { w: 460, h: 456, ax: 232, ay: 230, vs: 0.76 }, barge_n: { w: 460, h: 467, ax: 228, ay: 236, vs: 0.76 }   // vs: squash to the game's 2:1 projection
};
// units = how many world units one repeat of the texture covers
const TEX = { sand: { units: 26 }, water: { units: 22 }, grass: { units: 14 }, crops: { units: 6 }, wheat: { units: 6 }, stone: { units: 5 }, strata: { units: 9 }, earth: { units: 8 } };
for (const k in SPR) { const m = SPR[k], im = new Image(); im.onload = () => { m.ok = true; }; im.src = `art/${k}.webp`; m.img = im; }
for (const k in TEX) for (const lv of ['hi', 'lo']) {
  const im = new Image();
  im.onload = () => { TEX[k][lv] = { pat: ctx.createPattern(im, 'repeat'), px: im.naturalWidth }; };
  im.src = `art/${k}${lv === 'lo' ? '_lo' : ''}.webp`;
}
function texLevel(name) {
  const t = TEX[name]; if (!t) return null;
  if (t.lo && (!t.hi || cam.T * t.units * 0.56 / t.hi.px < 0.45)) return t.lo;
  return t.hi || null;
}
// The three planes a texture can lie on, as canvas matrices: the ground at height z, a wall facing +y, a wall facing +x.
const matGround = (z = 0) => { const T = cam.T; return [T / 2, T / 4, -T / 2, T / 4, V.W / 2 - (cam.x - cam.y) * T / 2, V.H / 2 - (cam.x + cam.y) * T / 4 - z * T * ZK]; };
const matFaceY = Y => { const T = cam.T; return [T / 2, T / 4, 0, -T * ZK, V.W / 2 - (cam.x + Y - cam.y) * T / 2, V.H / 2 + (Y - cam.x - cam.y) * T / 4]; };
const matFaceX = X => { const T = cam.T; return [-T / 2, T / 4, 0, -T * ZK, V.W / 2 + (X - cam.x + cam.y) * T / 2, V.H / 2 + (X - cam.x - cam.y) * T / 4]; };
const SH_L = 'rgba(126,88,30,0.13)', SH_R = 'rgba(100,66,20,0.36)';

function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function fillPoly(pts, fill) { path(pts); ctx.fillStyle = fill; ctx.fill(); }
/* Fill a screen-space polygon with a texture lying on plane m. Returns false while the texture is not loaded. */
function texPoly(pts, name, m, alpha = 1, mul = 1, ox = 0, oy = 0) {
  const lv = texLevel(name); if (!lv) return false;
  const s = TEX[name].units * mul / lv.px;
  lv.pat.setTransform(new DOMMatrix([m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] + ox * m[0] + oy * m[2], m[5] + ox * m[1] + oy * m[3]]));
  path(pts); ctx.globalAlpha = alpha; ctx.fillStyle = lv.pat; ctx.fill(); ctx.globalAlpha = 1;
  return true;
}
function line(a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
const inkW = () => clamp(cam.T / 26, 0.6, 1.5);

/* A box in world units. stroke: 0 none, 1 thin, 2 full ink. tex / texTop: painted texture for the walls / the top. */
function box(x, y, z, w, d, h, col, stroke = 2, tex, texTop) {
  const A = P(x, y, z + h), B = P(x + w, y, z + h), Cc = P(x + w, y + d, z + h), D = P(x, y + d, z + h);
  const B0 = P(x + w, y, z), C0 = P(x + w, y + d, z), D0 = P(x, y + d, z);
  if (B[0] < -4 || D[0] > V.W + 4 || C0[1] < -4 || A[1] > V.H + 4) return;
  const top = [A, B, Cc, D], left = [D, Cc, C0, D0], right = [B, Cc, C0, B0];
  if (tex && texLevel(tex) && texLevel(texTop || tex)) {
    texPoly(top, texTop || tex, matGround(z + h));
    texPoly(left, tex, matFaceY(y + d)); fillPoly(left, SH_L);
    texPoly(right, tex, matFaceX(x + w)); fillPoly(right, SH_R);
  } else { fillPoly(top, col.t); fillPoly(left, col.l); fillPoly(right, col.r); }
  if (!stroke) return;
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.globalAlpha = stroke === 2 ? 0.6 : 0.3; ctx.lineWidth = stroke === 2 ? inkW() : inkW() * 0.7;
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B0[0], B0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(D0[0], D0[1]); ctx.lineTo(D[0], D[1]); ctx.closePath();
  ctx.moveTo(D[0], D[1]); ctx.lineTo(Cc[0], Cc[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(Cc[0], Cc[1]); ctx.lineTo(C0[0], C0[1]);
  ctx.stroke(); ctx.globalAlpha = 1;
}

/* ---------- block structures: the dashed promise, and the blocks actually laid ---------- */
function drawGhost(st, strong) {
  const n = st.n, top = st.courses[n - 1], zt = n * BH;
  const x0 = st.ox, y0 = st.oy, x1 = x0 + st.a, y1 = y0 + st.b, tx0 = top.x0, ty0 = top.y0, tx1 = tx0 + top.a, ty1 = ty0 + top.b;
  const b00 = P(x0, y0), b10 = P(x1, y0), b11 = P(x1, y1), b01 = P(x0, y1);
  const t00 = P(tx0, ty0, zt), t10 = P(tx1, ty0, zt), t11 = P(tx1, ty1, zt), t01 = P(tx0, ty1, zt);
  if (b10[0] < 0 || b01[0] > V.W || b11[1] < 0 || Math.min(t00[1], b00[1]) > V.H) return;
  if (strong) { fillPoly([b01, b11, t11, t01], 'rgba(255,247,222,0.30)'); fillPoly([b10, b11, t11, t10], 'rgba(150,108,52,0.16)'); fillPoly([t00, t10, t11, t01], 'rgba(255,250,232,0.30)'); }
  else fillPoly([b00, b10, b11, b01], 'rgba(255,247,222,0.28)');          // a tomb only marks its footprint
  ctx.strokeStyle = INK; ctx.lineWidth = strong ? clamp(cam.T / 5, 1, 2) : inkW(); ctx.setLineDash(strong ? [10, 7] : [5, 4]); ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(b01[0], b01[1]); ctx.lineTo(b11[0], b11[1]); ctx.lineTo(b10[0], b10[1]); ctx.lineTo(t10[0], t10[1]); ctx.lineTo(t00[0], t00[1]); ctx.lineTo(t01[0], t01[1]); ctx.closePath();
  ctx.moveTo(b11[0], b11[1]); ctx.lineTo(t11[0], t11[1]); ctx.moveTo(t01[0], t01[1]); ctx.lineTo(t11[0], t11[1]); ctx.lineTo(t10[0], t10[1]);
  ctx.stroke(); ctx.setLineDash([]);
  if (strong) {
    ctx.globalAlpha = 0.16; ctx.lineWidth = 1;
    for (let k = Math.round(n / 20); k < n; k += Math.round(n / 20)) { const c = st.courses[k]; line(P(c.x0, c.y0 + c.b, c.z), P(c.x0 + c.a, c.y0 + c.b, c.z)); line(P(c.x0 + c.a, c.y0, c.z), P(c.x0 + c.a, c.y0 + c.b, c.z)); }
  }
  ctx.globalAlpha = 1;
}
const TONES = []; for (let i = -8; i <= 8; i++) TONES.push(i === 0 ? null : i > 0 ? `rgba(255,255,255,${(i * 0.035).toFixed(3)})` : `rgba(120,84,30,${(-i * 0.03).toFixed(3)})`);
const MAT_TINT = { l: 'rgba(204,156,74,0.5)', g: 'rgba(140,54,48,0.66)' };      // local stone is yellower, granite is red; white casing stays as painted
/* One rectangle of laid blocks inside a course: columns [i0, i0+w), rows [j0, j0+d). */
function slab(st, c, i0, w, j0, d, lod, topOpen, fl) {
  const x = c.x0 + i0, y = c.y0 + j0, z = c.z, h = BH, col = C.stone;
  if (lod < 2) { box(x, y, z, w, d, h, col, lod === 1 ? 1 : 0, 'stone'); return; }
  const A = P(x, y, z + h), B = P(x + w, y, z + h), Cc = P(x + w, y + d, z + h), D = P(x, y + d, z + h);
  const B0 = P(x + w, y, z), C0 = P(x + w, y + d, z), D0 = P(x, y + d, z);
  if (B[0] < -4 || D[0] > V.W + 4 || C0[1] < -4 || A[1] > V.H + 4) return;
  const top = [A, B, Cc, D], left = [D, Cc, C0, D0], right = [B, Cc, C0, B0];
  if (texLevel('stone')) {
    texPoly(top, 'stone', matGround(z + h));
    texPoly(left, 'stone', matFaceY(y + d)); fillPoly(left, SH_L);
    texPoly(right, 'stone', matFaceX(x + w)); fillPoly(right, SH_R);
  } else { fillPoly(top, col.t); fillPoly(left, col.l); fillPoly(right, col.r); }
  const vt = visBox(z + h), vb = visBox(z);
  ctx.lineWidth = clamp(cam.T / 40, 0.5, 1); ctx.strokeStyle = 'rgba(74,46,22,0.3)'; ctx.lineJoin = 'round';
  const cell = (pts, i, j, extra) => {              // every block gets its own slight tone and its joints
    path(pts);
    const mt = st.kind ? MAT_TINT[Sim.matAt(st, c.k, i, j)] : null;
    if (mt) { ctx.fillStyle = mt; ctx.fill(); }
    const f = extra || TONES[Math.round((hsh(c.k * 7919 + i, j, 3) - 0.5) * 16) + 8];
    if (f) { ctx.fillStyle = f; ctx.fill(); }
    ctx.stroke();
  };
  if (topOpen) {
    const ia = Math.max(0, Math.floor(vt.x0 - x)), ib = Math.min(w, Math.ceil(vt.x1 - x)), ja = Math.max(0, Math.floor(vt.y0 - y)), jb = Math.min(d, Math.ceil(vt.y1 - y));
    for (let i = ia; i < ib; i++) for (let j = ja; j < jb; j++)
      cell([P(x + i, y + j, z + h), P(x + i + 1, y + j, z + h), P(x + i + 1, y + j + 1, z + h), P(x + i, y + j + 1, z + h)], i0 + i, j0 + j,
        fl && fl.k === c.k && fl.i === i0 + i && fl.j === j0 + j && fl.t > 0.02 ? `rgba(255,255,255,${(0.75 * fl.t).toFixed(2)})` : null);
  }
  { const ia = Math.max(0, Math.floor(vb.x0 - x)), ib = Math.min(w, Math.ceil(vt.x1 - x));
    for (let i = ia; i < ib; i++) cell([P(x + i, y + d, z + h), P(x + i + 1, y + d, z + h), P(x + i + 1, y + d, z), P(x + i, y + d, z)], i0 + i, j0 + d - 1); }
  { const ja = Math.max(0, Math.floor(vb.y0 - y)), jb = Math.min(d, Math.ceil(vt.y1 - y));
    for (let j = ja; j < jb; j++) cell([P(x + w, y + j, z + h), P(x + w, y + j + 1, z + h), P(x + w, y + j + 1, z), P(x + w, y + j, z)], i0 + w - 1, j0 + j); }
  ctx.strokeStyle = INK; ctx.globalAlpha = 0.6; ctx.lineWidth = inkW();
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B0[0], B0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(D0[0], D0[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawStruct(st, placed, flash) {
  if (placed <= 0) return;
  const cur = Sim.courseOf(st, placed), pxH = BH * ZK * cam.T, lod = cam.T >= 13 ? 2 : pxH >= 3 ? 1 : 0;
  const fl = flash && flash.t > 0.02 && flash.idx >= 0 ? Object.assign(Sim.locate(st, flash.idx), { t: flash.t }) : null;
  for (const c of st.courses) {
    if (placed <= c.start) break;
    if (st.kind === 'pyr' && c.k === st.n - 1) { capstone(c.x0, c.y0, c.z, 1); break; }    // the top block is the golden capstone
    const pk = Math.min(c.cap, placed - c.start), open = c.k >= cur - 1;
    if (pk >= c.cap) { slab(st, c, 0, c.a, 0, c.b, lod, open, fl); continue; }
    if (!st.strip) {
      const I = Math.floor(pk / c.b), J = pk % c.b;
      if (I > 0) slab(st, c, 0, I, 0, c.b, lod, open, fl);
      if (J > 0) slab(st, c, I, 1, 0, J, lod, open, fl);
    } else {                                           // strips grow from the front corner: far pieces first
      const full = c.a * st.strip, sN = Math.min(Math.floor(pk / full), Math.ceil(c.b / st.strip) - 1);
      const rows = Math.min(st.strip, c.b - sN * st.strip), r2 = pk - sN * full, I = Math.floor(r2 / rows), J = r2 % rows, jTop = c.b - sN * st.strip;
      if (J > 0) slab(st, c, c.a - I - 1, 1, jTop - J, J, lod, open, fl);
      if (I > 0) slab(st, c, c.a - I, I, jTop - rows, rows, lod, open, fl);
      if (sN > 0) slab(st, c, 0, c.a, jTop, sN * st.strip, lod, open, fl);
    }
  }
}

/* A golden pyramidion standing on a square of side w at (x, y, z). */
function capstone(x, y, z, w) {
  const h = w * 1.25, ap = P(x + w / 2, y + w / 2, z + h), a = P(x, y + w, z), b = P(x + w, y + w, z), c2 = P(x + w, y, z);
  if (ap[0] < -40 || ap[0] > V.W + 40 || b[1] < -40 || ap[1] > V.H + 40) return;
  fillPoly([a, b, ap], '#F6D66A'); fillPoly([b, c2, ap], '#C6952A');
  ctx.strokeStyle = '#7A5412'; ctx.lineWidth = inkW(); ctx.lineJoin = 'round'; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(ap[0], ap[1]); ctx.closePath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(ap[0], ap[1]); ctx.stroke(); ctx.globalAlpha = 1;
  if (cam.T >= 5) {                                                // a glint on the lit face
    const gx = lerp(a[0], ap[0], 0.55) + (b[0] - a[0]) * 0.18, gy = lerp(a[1], ap[1], 0.55), r = clamp(cam.T * 0.12, 1, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, r * 0.35);
    line([gx - r, gy], [gx + r, gy]); line([gx, gy - r], [gx, gy + r]);
  }
}

/* ---------- figures and props (all sized from world units through cam.T) ---------- */
function worker(x, y, z, o) {
  const [sx, sy] = P(x, y, z), Hh = HUMAN * ZK * cam.T;
  if (cam.T < 2.2 || sx < -30 || sx > V.W + 30 || sy < -10 || sy > V.H + Hh + 10) return;
  if (cam.T < 7) {
    ctx.fillStyle = C.skin; ctx.fillRect(sx - Hh * 0.13, sy - Hh, Hh * 0.26, Hh * 0.5);
    ctx.fillStyle = C.kilt; ctx.fillRect(sx - Hh * 0.16, sy - Hh * 0.55, Hh * 0.32, Hh * 0.32); return;
  }
  const a = o.anim, ph = o.ph || 0;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(o.face || 1, 1);
  ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(Hh * 0.16, 0, Hh * 0.3, Hh * 0.085, 0, 0, 7); ctx.fill();
  const moving = a === 'walk' || a === 'pull', sw = moving ? Math.sin(ph) * 0.15 * Hh : 0;
  const lean = a === 'pull' ? 0.5 : a === 'chip' ? 0.16 : a === 'carve' ? 0.42 : 0;
  const hip = -0.3 * Hh, ol = clamp(Hh * 0.035, 0.6, 1.3);
  ctx.lineCap = 'round'; ctx.strokeStyle = C.skinD; ctx.lineWidth = Hh * 0.11;
  ctx.beginPath(); ctx.moveTo(-0.06 * Hh, hip); ctx.lineTo(-0.07 * Hh - sw - (a === 'pull' ? 0.12 * Hh : 0), -0.02 * Hh);
  ctx.moveTo(0.06 * Hh, hip); ctx.lineTo(0.07 * Hh + sw, -0.02 * Hh); ctx.stroke();
  ctx.translate(0, hip); ctx.rotate(lean);
  ctx.fillStyle = C.skin; ctx.strokeStyle = INK; ctx.lineWidth = ol;
  ctx.beginPath(); ctx.roundRect(-0.13 * Hh, -0.46 * Hh, 0.26 * Hh, 0.36 * Hh, 0.07 * Hh); ctx.fill(); ctx.stroke();
  path([[-0.14 * Hh, -0.17 * Hh], [0.14 * Hh, -0.17 * Hh], [0.18 * Hh, 0.07 * Hh], [-0.18 * Hh, 0.07 * Hh]]); ctx.fillStyle = C.kilt; ctx.fill(); ctx.stroke();
  let ax, ay;
  if (a === 'pull') { ax = 0.3 * Hh; ay = -0.2 * Hh; }
  else if (a === 'chip') { const sn = Math.sin(ph); ax = (0.27 + 0.06 * sn) * Hh; ay = (-0.5 + 0.22 * sn) * Hh; }
  else if (a === 'carve') { const sn = Math.sin(ph * 1.6); ax = 0.28 * Hh; ay = (-0.1 + 0.05 * sn) * Hh; }
  else if (a === 'walk') { ax = Math.sin(ph + Math.PI) * 0.13 * Hh + 0.04 * Hh; ay = -0.12 * Hh; }
  else { ax = 0.13 * Hh; ay = -0.12 * Hh; }
  ctx.strokeStyle = C.skinD; ctx.lineWidth = Hh * 0.09; ctx.beginPath(); ctx.moveTo(0.05 * Hh, -0.38 * Hh); ctx.lineTo(ax, ay); ctx.stroke();
  if (a === 'chip' || a === 'carve') { ctx.strokeStyle = C.wood.r; ctx.lineWidth = Hh * 0.06; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 0.2 * Hh, ay + (a === 'chip' ? -0.12 : 0.1) * Hh); ctx.stroke(); }
  ctx.fillStyle = C.skin; ctx.strokeStyle = INK; ctx.lineWidth = ol;
  ctx.beginPath(); ctx.arc(0.03 * Hh, -0.58 * Hh, 0.13 * Hh, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0.03 * Hh, -0.58 * Hh, 0.135 * Hh, Math.PI * 0.92, Math.PI * 2.02); ctx.lineTo(-0.09 * Hh, -0.5 * Hh); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function spriteAt(m, sx, sy, s, alpha) {
  const v = s * (m.vs || 1), x = sx - m.ax * s, y = sy - m.ay * v;
  if (x > V.W || y > V.H || x + m.w * s < 0 || y + m.h * v < 0) return;
  if (alpha !== undefined && alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(m.img, x, y, m.w * s, m.h * v); ctx.globalAlpha = 1; }
  else ctx.drawImage(m.img, x, y, m.w * s, m.h * v);
}
function groundShadow(x0, y0, x1, y1, h, tx0, ty0, tx1, ty1) {   // light travels toward (+0.8,-0.35) per unit height
  const ox = 0.8 * h, oy = -0.35 * h;
  fillPoly([P(x0, y1), P(x1, y1), P((tx1 ?? x1) + ox, (ty1 ?? y1) + oy), P((tx1 ?? x1) + ox, (ty0 ?? y0) + oy), P((tx0 ?? x0) + ox, (ty0 ?? y0) + oy), P(x0, y0)], C.shadow);
}
function resize() {
  const r = cv.getBoundingClientRect();
  V.W = Math.max(50, r.width); V.H = Math.max(50, r.height); V.DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(V.W * V.DPR); cv.height = Math.round(V.H * V.DPR);
}
window.G = { BH, ZK, HUMAN, cv, ctx, cam, V, P, unproj, visBox, clamp, lerp, hsh, shade, INK, C, SPR, TEX, texLevel, matGround, matFaceY, matFaceX, SH_L, SH_R,
  path, fillPoly, texPoly, line, inkW, box, drawGhost, drawStruct, capstone, worker, spriteAt, groundShadow, resize };
})();
