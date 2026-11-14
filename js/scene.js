/* Faraon: the diorama. Lays out the valley, draws it back to front, and answers "what did the player click". */
(function () {
'use strict';
const { BH, ZK, cam, V, ctx, P, visBox, clamp, lerp, hsh, C, INK, SPR, box, texPoly, fillPoly, path, line, inkW, matGround, matFaceY, texLevel, SH_R, spriteAt, worker, drawGhost, drawStruct, groundShadow } = G;
const L = Sim.L, GN = L.greatN;
let g = null, statics = [], booted = false;
const world = [], add = o => { world.push(o); return o; };
const nileL = y => 96 + 5 * Math.sin(y / 37) + 2.5 * Math.sin(y / 11 + 1);
const nileR = y => nileL(y) + 38 + 3 * Math.sin(y / 23);

/* ---------- props ---------- */
function pileBlocks(px, py, n, col, tex) {
  for (let m = 0; m < n; m++) {
    const Lr = Math.floor(m / 9), r = m % 9, i = Math.floor(r / 3), j = r % 3;
    box(px + i * 1.1, py + j * 1.1, Lr * BH, 1, 1, BH, col, cam.T >= 9 ? 2 : cam.T >= 5 ? 1 : 0, tex);
  }
}
function house(o, now) {
  const m = SPR[o.kind];
  let a = 1;
  if (o.need !== undefined) {                                      // the village grows with the crew
    if (g.s.workers < o.need) { o.seen = false; return; }
    if (!o.seen) { o.seen = true; o.born = booted ? now : -1e9; }
    a = clamp((now - o.born) / 1400, 0, 1);
  }
  if (m && m.ok) { const f = P(o.x + o.w, o.y + o.d); spriteAt(m, f[0], f[1] + (1 - a) * cam.T * 0.6, (o.w + o.d) / 2 * cam.T / m.w, a); return; }
  box(o.x, o.y, 0, o.w, o.d, o.h * a, C.mud, cam.T >= 9 ? 2 : cam.T >= 4 ? 1 : 0);
}
function palm(o) {
  const m = SPR[o.kind];
  if (m && m.ok) { const f = P(o.x, o.y), s = o.h * ZK * cam.T / m.h; if (m.h * s >= 3) spriteAt(m, f[0], f[1], s); return; }
  const [sx, sy] = P(o.x, o.y), hp = o.h * ZK * cam.T;
  if (sx < -60 || sx > V.W + 60 || sy < -10 || sy - hp > V.H + 40 || cam.T < 3) return;
  ctx.lineCap = 'round'; ctx.strokeStyle = C.trunk; ctx.lineWidth = clamp(cam.T * 0.2, 0.8, 9); line([sx, sy], [sx, sy - hp]);
  ctx.fillStyle = C.palm; ctx.beginPath(); ctx.arc(sx, sy - hp, cam.T * 1.6, 0, 7); ctx.fill();
}
function rockBench(o) {
  const painted = !!texLevel('strata');
  box(o.x, o.y, 0, o.w, o.d, o.h, C.rock, cam.T >= 4 ? 2 : 0, 'strata', 'sand');
  if (painted) fillPoly([P(o.x, o.y, o.h), P(o.x + o.w, o.y, o.h), P(o.x + o.w, o.y + o.d, o.h), P(o.x, o.y + o.d, o.h)], 'rgba(150,108,46,0.13)');
  if (cam.T < 8) return;
  if (!o.cuts) for (let i = 0; i < o.w * o.d / 9; i++) {
    const x = o.x + 0.6 + hsh(i, o.w, 71) * (o.w - 1.2), y = o.y + 0.6 + hsh(i, o.d, 72) * (o.d - 1.2), [sx, sy] = P(x, y, o.h), u = cam.T;
    ctx.fillStyle = hsh(i, 5, 73) > 0.5 ? 'rgba(247,232,188,0.8)' : 'rgba(190,156,96,0.7)';
    ctx.beginPath(); ctx.ellipse(sx, sy, u * (0.25 + hsh(i, 6, 74) * 0.5), u * 0.11, 0, 0, 7); ctx.fill();
  }
  if (o.cuts && cam.T >= 12) {                                      // trenches cut around the next blocks
    ctx.strokeStyle = 'rgba(122,96,54,0.55)'; ctx.lineWidth = clamp(cam.T / 36, 0.5, 1);
    for (let x = o.x + 1; x < o.x + o.w; x += 1.1) line(P(x, o.y + o.d - 2.2, o.h), P(x, o.y + o.d, o.h));
    for (let y = o.y + o.d - 2.2; y < o.y + o.d; y += 1.1) line(P(o.x, y, o.h), P(o.x + o.w, y, o.h));
  }
}
function drawRamp() {
  const zt = g.rampZ; if (zt < 0.01) return;
  const e = g.rampEdge(), len = zt * L.rampSlope, X = L.eastX, x2 = X + len, mid = g.rampMid(), y0 = mid - L.rampHalf, y1 = mid + L.rampHalf;
  const fL = [P(e, y1, zt), P(X, y1, zt), P(x2, y1, 0), P(e, y1, 0)], fT = [P(e, y0, zt), P(X, y0, zt), P(X, y1, zt), P(e, y1, zt)], fS = [P(X, y0, zt), P(x2, y0, 0), P(x2, y1, 0), P(X, y1, zt)];
  if (texLevel('earth')) {
    texPoly(fL, 'earth', matFaceY(y1)); fillPoly(fL, SH_R);
    texPoly(fT, 'earth', matGround(zt)); texPoly(fS, 'earth', matGround(zt / 2)); fillPoly(fS, 'rgba(100,66,20,0.10)');
  } else { fillPoly(fL, C.ramp.l); fillPoly(fT, C.ramp.t); fillPoly(fS, C.ramp.t); }
  if (cam.T >= 10) {                                                // timber sleepers across the track
    ctx.strokeStyle = C.wood.l; ctx.lineWidth = clamp(cam.T * 0.07, 0.8, 3);
    for (let x = X + 0.6; x < x2 - 0.3; x += 1.2) { const z = zt * (1 - (x - X) / len); line(P(x, y0 + 0.25, z), P(x, y1 - 0.25, z)); }
  }
  ctx.strokeStyle = INK; ctx.globalAlpha = 0.6; ctx.lineWidth = inkW(); ctx.lineJoin = 'round';
  const pts = [P(e, y1, zt), P(e, y0, zt), P(X, y0, zt), P(x2, y0, 0), P(x2, y1, 0), P(e, y1, 0)], a = P(X, y1, zt);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(pts[4][0], pts[4][1]); ctx.stroke(); ctx.globalAlpha = 1;
}

/* ---------- the fixed world ---------- */
const benches = [
  { x: 12, y: -62, w: 32, d: 8, h: 7 }, { x: 12, y: -54, w: 7, d: 9, h: 5.2 }, { x: 19, y: -54, w: 25, d: 5, h: 3.9 },
  { x: 19, y: -49, w: 20, d: 4, h: 2.6 }, { x: 19, y: -45, w: 17, d: 3.4, h: 1.3, cuts: true }, { x: 39, y: -49, w: 5, d: 3, h: 1.9 }
];
const EAST = [{ x: 134, y: -41, w: 27, d: 9, h: 7.5 }, { x: 134, y: -32, w: 23, d: 6, h: 4.6 }, { x: 136, y: -26, w: 17, d: 4.6, h: 2.2, cuts: true }];
const JETTY_W = { x: 91.4, y: -14.2, w: 6.6, d: 3.2 }, JETTY_E = { x: 127.4, y: -14.2, w: 6, d: 3.2 };
/* The local quarry is eaten away bench by bench, front to back, as its blocks are taken. */
const EAT_ORDER = [4, 5, 3, 2, 1, 0], benchVol = benches.map(b => b.w * b.d * b.h), volTotal = benchVol.reduce((a, b) => a + b, 0);
let qCache = { left: -1 };
function quarryNow() {
  if (qCache.left === g.s.quarryLeft) return qCache;
  let eaten = (1 - g.s.quarryLeft / L.quarryTotal) * volTotal, active = null;
  const out = benches.map(b => ({ ...b }));
  for (const i of EAT_ORDER) {
    if (eaten >= benchVol[i] - 1e-6) { out[i].gone = true; eaten -= benchVol[i]; }
    else { if (eaten > 0) out[i].w = benches[i].w * (1 - eaten / benchVol[i]); eaten = 0; if (!active) active = out[i]; }
  }
  // where the quarrymen stand: along the open faces of the bench being cut
  const spots = [];
  if (active) {
    for (let x = active.x + 0.9; x < active.x + active.w - 0.4; x += 1.6) spots.push([x, active.y + active.d + 0.7, 1]);
    for (let y = active.y + active.d - 0.8; y > active.y + 0.3; y -= 1.5) spots.push([active.x + active.w + 0.7, y, -1]);
  }
  return (qCache = { left: g.s.quarryLeft, out, active, spots });
}
const HOUSE_KINDS = { hut: { w: 3.4, d: 6.2, h: 2.4 }, house_a: { w: 5, d: 5, h: 3 }, house_b: { w: 7.2, d: 7, h: 3.6 }, granary: { w: 6.6, d: 6.45, h: 3.6 }, workshop: { w: 5.4, d: 5.4, h: 2.6 } };
function addHouse(kind, x, y, need) {
  const k = HOUSE_KINDS[kind], o = { kind, x, y, w: k.w, d: k.d, h: k.h, need };
  add({ x0: x, y0: y, x1: x + k.w, y1: y + k.d, h: k.h, shadow: true, visible: () => need === undefined || g.s.workers >= need, draw(now) { house(o, now); } });
}
function buildWorld() {
  add({ x0: L.greatFront[0] - GN, y0: L.greatFront[1] - GN, x1: L.greatFront[0], y1: L.greatFront[1], draw() { drawGhost(g.great, true); drawStruct(g.great, g.s.great, g.flash.great); } });
  benches.forEach((b, i) => add({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, shadow: true,
    box() { const q = quarryNow().out[i]; return q.gone ? null : [q.x, q.y, q.x + q.w, q.y + q.d, q.h]; }, draw() { const q = quarryNow().out[i]; if (!q.gone) rockBench(q); } }));
  for (const b of EAST) add({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, h: b.h, shadow: true, draw() { rockBench(b); } });
  for (const j of [JETTY_W, JETTY_E]) add({ x0: j.x, y0: j.y, x1: j.x + j.w, y1: j.y + j.d, draw() { if (g.s.east) box(j.x, j.y, 0, j.w, j.d, 0.5, C.wood, cam.T >= 6 ? 2 : 0); } });
  const epile = (p, key) => add({ x0: p[0], y0: p[1], x1: p[0] + 3.3, y1: p[1] + 3.3, draw() { if (g.s.east) pileBlocks(p[0], p[1], g.s.piles[key], C.stone, 'stone'); } });
  epile(L.pileE, 'E'); epile(L.pileW, 'W');
  const pile = (p, key, col, tex) => add({ x0: p[0], y0: p[1], x1: p[0] + 3.3, y1: p[1] + 3.3, draw() { pileBlocks(p[0], p[1], g.s.piles[key], col, tex); } });
  pile(L.pileA, 'A', C.raw, 'strata'); pile(L.pileB, 'B', C.raw, 'strata'); pile(L.pileC, 'C', C.stone, 'stone');
  addHouse('workshop', 41.5, -9.6);
  addHouse('granary', 40.5, 8.5, 16);
  const slots = [];
  for (let r = 0; r < 11; r++) for (let c = 0; c < 3; c++) {
    const k = hsh(r, c, 11); if (k < 0.16) continue;
    const kind = k < 0.55 ? 'hut' : (k < 0.88 || c === 2) ? 'house_a' : 'house_b';
    slots.push({ kind, x: [47.6, 56.3, 64.4][c] + hsh(r, c, 15) * 0.6, y: -43 + r * 8.8 + (r >= 3 ? 6.6 : 0) + hsh(r, c, 16) * 1.4 });   // the gap is the street to the jetty
  }
  slots.sort((a, b) => Math.hypot(a.x - 50, a.y - 2) - Math.hypot(b.x - 50, b.y - 2));
  slots.forEach((s, i) => addHouse(s.kind, s.x, s.y, i * 2.5));          // one more home for every few workers hired
  for (let i = -128; i < 128; i++) {                                  // palms along the fields and both banks
    const y = i * 5.5;
    [[69.5 + hsh(i, 1, 21) * 1.5, 0.75], [79.6, 0.45], [nileL(y) - 2.2 - hsh(i, 3, 21) * 4, 0.8], [nileR(y) + 2 + hsh(i, 4, 21) * 14, 0.7]].forEach(([x, p], n) => {
      if (hsh(i, n, 22) > p) return;
      const py = y + hsh(i, n, 23) * 4;
      if ((Math.abs(py + 12.6) < 3 && x > 66 && x < 100) || (x > 124 && x < 163 && py > -43 && py < -9)) return;   // keep the road, the jetties and the east quarry clear
      const v = hsh(i, n, 26), kind = v < 0.5 ? 'palm_a' : v < 0.82 ? 'palm_b' : 'palm_c';
      const o = { kind, x, y: py, h: (kind === 'palm_b' ? 6.4 : 8) + hsh(i, n, 24) * 2.6 };
      add({ x0: o.x - 0.3, y0: o.y - 0.3, x1: o.x + 0.3, y1: o.y + 0.3, palm: o, draw() { palm(o); } });
    });
  }
  for (let i = -80; i < 80; i++) {                                    // reeds at the water's edge
    const y = i * 3.3;
    [[nileL(y) + 0.2 - hsh(i, 1, 81) * 1.3, 0.55], [nileR(y) - 0.2 + hsh(i, 2, 81) * 1.3, 0.5]].forEach(([x, p], n) => {
      if (hsh(i, n, 82) > p || Math.abs(y + 12.6) < 5) return;
      const o = { kind: 'reeds', x, y: y + hsh(i, n, 83) * 2.5, h: 2.6 + hsh(i, n, 84) * 1.3 };
      add({ x0: o.x - 0.2, y0: o.y - 0.2, x1: o.x + 0.2, y1: o.y + 0.2, draw() { if (cam.T >= 5) palm(o); } });
    });
  }
}
/* Order: B before A whenever A stands in front of B. */
function sortStatics(list) {
  const n = list.length, front = (A, B) => A.x0 >= B.x1 - 1e-6 || A.y0 >= B.y1 - 1e-6;
  const out = list.map(() => []), deg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const A = list[i], B = list[j];
    if ((A.after && A.after.includes(B)) || (front(A, B) && !front(B, A) && !(B.after && B.after.includes(A)))) { out[j].push(i); deg[i]++; }
  }
  const key = o => o.x0 + o.x1 + o.y0 + o.y1, ready = [], order = [];
  for (let i = 0; i < n; i++) if (!deg[i]) ready.push(i);
  ready.sort((a, b) => key(list[b]) - key(list[a]));
  while (ready.length) {
    const i = ready.pop(); order.push(list[i]);
    let grew = false;
    for (const j of out[i]) if (--deg[j] === 0) { ready.push(j); grew = true; }
    if (grew) ready.sort((a, b) => key(list[b]) - key(list[a]));
  }
  return order.length === n ? order : list;
}
/* Finished tombs, the tomb in progress and its ramp change from reign to reign. */
function rebuild() {
  const dyn = [];
  for (const t of g.s.tombs) {
    const st = Sim.mkStruct(t.ox, t.oy, t.a, t.b, t.n), top = st.courses[st.n - 1];
    dyn.push({ x0: t.ox, y0: t.oy, x1: t.ox + t.a, y1: t.oy + t.b, h: t.n * BH, shadow: true, top: [top.x0, top.y0, top.x0 + top.a, top.y0 + top.b], draw() { drawStruct(st, st.total); } });
  }
  const st = g.site, mid = g.rampMid();
  const sSite = { x0: st.ox, y0: st.oy, x1: st.ox + st.a, y1: st.oy + st.b, draw() { if (!g.done()) drawGhost(st, false); drawStruct(st, g.s.placed, g.flash.place); } };
  const sRamp = { x0: L.eastX - st.n / 2 - 0.5, y0: mid - L.rampHalf, x1: L.eastX + (st.n - 1) * BH * L.rampSlope, y1: mid + L.rampHalf, after: [sSite], draw: drawRamp };
  statics = sortStatics(world.concat(dyn, [sSite, sRamp]));
}

/* ---------- ground ---------- */
function strip(pts, half) {
  const A = [], B = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    A.push(P(pts[i][0] - dy / d * half, pts[i][1] + dx / d * half)); B.push(P(pts[i][0] + dy / d * half, pts[i][1] - dx / d * half));
  }
  return A.concat(B.reverse());
}
function roads() {
  const mid = g.rampMid();
  return [
    { pts: [[33.6, -35.8], [32.6, -26], [35, -18], [35.6, -13.4], [35.6, -2]], half: 2.3, ruts: true },
    { pts: [[35.6, -1], [34.4, 2.6], [31, mid], [L.eastX + 0.5, mid]], half: 1.9, ruts: true },
    { pts: [[33, -4.6]].concat(L.greatRoad, [[-90, 24.4]]), half: 1.6 },
    { pts: [[38, 3], [46, 4], [52, 6]], half: 1.5 }
  ].concat(g.s.east ? [{ pts: [[91.6, -12.6]].concat(L.harborRoad.slice(1)), half: 1.9, ruts: true }] : []);
}
function drawGround(now) {
  const mg = matGround(0), scr = [[0, 0], [V.W, 0], [V.W, V.H], [0, V.H]];
  if (texPoly(scr, 'sand', mg)) { texPoly(scr, 'sand', mg, 0.4, 4.7, 9, 5); ctx.fillStyle = 'rgba(233,205,140,0.3)'; ctx.fillRect(0, 0, V.W, V.H); }
  else { ctx.fillStyle = C.sand; ctx.fillRect(0, 0, V.W, V.H); }
  const vb = visBox(0, 30);
  const dc = cam.T >= 5 ? 46 : cam.T >= 2 ? 138 : 414, dk = dc / 46;   // fewer, broader dunes when far away
  for (let i = Math.floor(vb.x0 / dc); i <= Math.ceil(vb.x1 / dc); i++) for (let j = Math.floor(vb.y0 / dc); j <= Math.ceil(vb.y1 / dc); j++) {
    const x = i * dc + hsh(i, j, 31 + dk) * dc * 0.65, y = j * dc + hsh(i, j, 32) * dc * 0.65; if (x > 60) continue;
    const r = (16 + hsh(i, j, 33) * 18) * dk * cam.T * 0.7, [sx, sy] = P(x, y);
    if (sx + r < 0 || sx - r > V.W || sy + r * 0.5 < 0 || sy - r * 0.5 > V.H) continue;
    const lt = hsh(i, j, 34) > 0.5;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, lt ? 'rgba(246,228,176,0.5)' : 'rgba(206,170,98,0.34)'); gr.addColorStop(1, lt ? 'rgba(246,228,176,0)' : 'rgba(206,170,98,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
  }
  // levelled bedrock where the Great Pyramid will stand
  const G0 = g.great, gp = [P(G0.ox - 6, G0.oy - 6), P(G0.ox + GN + 6, G0.oy - 6), P(G0.ox + GN + 6, G0.oy + GN + 6), P(G0.ox - 6, G0.oy + GN + 6)];
  fillPoly(gp, 'rgba(250,236,196,0.55)'); ctx.strokeStyle = 'rgba(74,46,22,0.35)'; ctx.lineWidth = 1; path(gp); ctx.stroke();
  if (vb.x1 > 62) {                                                   // the river plain
    const ys = []; for (let y = Math.floor(vb.y0 / 6) * 6; y <= vb.y1 + 6; y += 6) ys.push(y);
    const band = (fa, fb, fill, tex, a, mul, oy) => {
      const p = ys.map(y => P(fa(y), y)).concat(ys.slice().reverse().map(y => P(fb(y), y)));
      if (!tex || !texPoly(p, tex, mg, a, mul, 0, oy)) { if (fill) fillPoly(p, fill); return false; }
      return true;
    };
    const gl = y => nileL(y) - 27 + 1.5 * Math.sin(y / 9);
    band(y => gl(y) - 1.6, nileL, C.damp);
    band(gl, nileL, C.green, 'grass');
    band(nileR, y => nileR(y) + 25 + 2 * Math.sin(y / 13), C.green, 'grass');
    for (let j = Math.floor(vb.y0 / 9); j <= Math.ceil(vb.y1 / 9); j++) for (let c = 0; c < 2; c++) {     // field plots
      if (j === -2) continue;                                       // the street to the jetty runs here
      const x0 = c ? 80.4 : 71.4, x1 = c ? 87.4 : 78.9, y0 = j * 9, y1 = y0 + 8.1, k = hsh(j, c, 41);
      const p = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
      if (p[1][0] < 0 || p[3][0] > V.W || p[2][1] < 0 || p[0][1] > V.H) continue;
      const kind = k < 0.34 ? 'wheat' : k < 0.82 ? 'crops' : 'earth';
      if (!texPoly(p, kind, mg)) fillPoly(p, k < 0.34 ? C.wheat : k < 0.7 ? C.greenD : '#9CCB5E');
      else if (kind === 'earth') fillPoly(p, 'rgba(70,40,14,0.25)');
      if (cam.T >= 7) { ctx.strokeStyle = 'rgba(74,46,22,0.4)'; ctx.lineWidth = inkW() * 0.8; path(p); ctx.stroke(); }
    }
    const painted = band(nileL, nileR, C.water, 'water', 1, 1, -((now * 0.0011) % 22));
    if (painted) { band(nileL, nileR, null, 'water', 0.3, 2.6, (now * 0.0006) % 57.2); band(y => nileL(y) + 9, y => nileR(y) - 9, 'rgba(16,80,108,0.2)'); }
    else band(y => nileL(y) + 9, y => nileR(y) - 9, C.waterD);
    ctx.strokeStyle = 'rgba(74,46,22,0.4)'; ctx.lineWidth = inkW();
    for (const f of [nileL, nileR]) { ctx.beginPath(); ys.forEach((y, i) => { const p = P(f(y), y); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }
    for (let b = 0; b < 3; b++) {                                     // river boats, drifting downstream
      const y = ((now * 0.0016 * (1 + b * 0.35) + b * 170) % 520 + 520) % 520 - 260, [sx, sy] = P(nileL(y) + 11 + b * 8, y);
      if (cam.T >= 1.5 && SPR.boat.ok && sx > -200 && sx < V.W + 200 && sy > -200 && sy < V.H + 200) spriteAt(SPR.boat, sx, sy, 8.5 * cam.T / SPR.boat.w);
    }
  }
  if (g.s.quarryLeft < L.quarryTotal) {                              // the bare floor the quarry leaves behind
    const fl = [P(12, -62), P(44, -62), P(44, -46), P(36, -41.6), P(19, -41.6), P(12, -45)];
    fillPoly(fl, 'rgba(246,236,210,0.5)'); ctx.strokeStyle = 'rgba(122,96,54,0.3)'; ctx.lineWidth = 1; path(fl); ctx.stroke();
  }
  const rs = roads();
  for (const r of rs) { const p = strip(r.pts, r.half); if (!texPoly(p, 'earth', mg, 0.3)) fillPoly(p, 'rgba(203,170,102,0.5)'); }
  if (cam.T >= 9) {
    ctx.strokeStyle = C.rut; ctx.lineWidth = clamp(cam.T * 0.06, 0.8, 2.4); ctx.lineCap = 'round';
    for (const r of rs) if (r.ruts) for (const off of [-0.9, 0.9]) {
      ctx.beginPath(); r.pts.forEach((p, i) => { const q = P(p[0] + off, p[1] + off * 0.3); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    }
  }
  if (cam.T >= 11) {                                                  // sand ripples and stones, only when close enough to matter
    const v = visBox(0, 4), st = g.site; ctx.lineCap = 'round';
    for (let i = Math.floor(v.x0 / 4); i <= Math.ceil(Math.min(v.x1, 66) / 4); i++) for (let j = Math.floor(v.y0 / 4); j <= Math.ceil(v.y1 / 4); j++) {
      const k = hsh(i, j, 61), x = i * 4 + hsh(i, j, 62) * 3, y = j * 4 + hsh(i, j, 63) * 3;
      if (x > st.ox - 3 && x < 32 && y > st.oy - 3 && y < st.oy + st.b + 3) continue;
      const [sx, sy] = P(x, y), u = cam.T;
      if (k < 0.22) {
        ctx.strokeStyle = k < 0.11 ? 'rgba(196,160,92,0.6)' : 'rgba(247,230,180,0.7)'; ctx.lineWidth = clamp(u * 0.05, 0.8, 2);
        ctx.beginPath(); ctx.moveTo(sx - u * 0.7, sy); ctx.quadraticCurveTo(sx, sy - u * 0.16, sx + u * 0.7, sy); ctx.stroke();
      } else if (k > 0.94) {
        ctx.fillStyle = C.rock.r; ctx.beginPath(); ctx.ellipse(sx, sy, u * 0.22, u * 0.12, 0, 0, 7); ctx.fill();
        ctx.fillStyle = C.rock.l; ctx.beginPath(); ctx.ellipse(sx - u * 0.04, sy - u * 0.05, u * 0.16, u * 0.08, 0, 0, 7); ctx.fill();
      }
    }
  }
  for (const s of statics) {                                          // shadows on the ground
    if (s.shadow) { if (!s.visible || s.visible()) { if (s.top) groundShadow(s.x0, s.y0, s.x1, s.y1, s.h, s.top[0], s.top[1], s.top[2], s.top[3]); else if (s.box) { const b = s.box(); if (b) groundShadow(b[0], b[1], b[2], b[3], b[4]); } else groundShadow(s.x0, s.y0, s.x1, s.y1, s.h); } }
    else if (s.palm && cam.T >= 5) {
      const p = s.palm, [sx, sy] = P(p.x + 0.8 * p.h * 0.45, p.y - 0.35 * p.h * 0.45);
      ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(sx, sy, cam.T * 1.7, cam.T * 0.6, 0, 0, 7); ctx.fill();
    }
  }
  if (g.s.placed > 0) {
    const st = g.site, cur = Sim.courseOf(st, g.s.placed), c = st.courses[Math.max(0, Math.min(cur, st.n) - 1)];
    groundShadow(st.ox, st.oy, st.ox + st.a, st.oy + st.b, (c.k + 1) * BH, c.x0, c.y0, c.x0 + c.a, c.y0 + c.b);
  }
}

/* ---------- people and sledges: collected every frame, slotted between the statics ---------- */
const EAST_SPOTS = []; for (let x = 137; x < 152.5; x += 1.6) EAST_SPOTS.push([x, -20.7, 0]); for (let x = 135.5; x < 156; x += 1.7) EAST_SPOTS.push([x, -27.1, 2.2 * 0]);
const MASON_SPOTS = [[33.4, -6.2], [36, -6.2], [38.6, -6.2], [30.8, -6.2], [28.2, -6.4], [30.8, -9.4], [28.2, -9.6], [25.6, -6.3], [25.6, -9.5], [23, -6.4], [23, -9.6], [28.2, -12.6], [25.6, -12.7], [30.8, -12.5]];
const IDLE_SPOTS = [[42.5, 4.6], [43.9, 5.6], [45.2, 4.4], [44.3, 3.2], [46.4, 5.8], [42.9, 6.8], [47.2, 3.6], [45.6, 7], [48.3, 5.1], [41.4, 5.8], [44, 8], [46.8, 8.2]];
const faceOf = d => (d[0] - d[1]) >= 0 ? 1 : -1;
function collectMovers() {
  const items = [], s = g.s, t = s.t, capP = g.cap();
  const pulse = st => (s.t - (g.handPulse[st] ?? -9)) < 0.5 ? 2 : 1;
  const qBusy = s.piles.A < capP;
  quarryNow().spots.slice(0, s.assign.quarry).forEach(([x, y, face], i) =>
    items.push({ x, y, draw() { worker(x, y, 0, { face, anim: qBusy ? 'chip' : 'idle', ph: t * 6 * pulse('quarry') + i * 1.3 }); } }));
  if (s.east) {
    const eBusy = s.piles.E < capP;
    EAST_SPOTS.slice(0, Math.min(s.assign.equarry, 10)).forEach(([x, y], i) =>
      items.push({ x, y, draw() { worker(x, y, 0, { face: 1, anim: eBusy ? 'chip' : 'idle', ph: t * 6 * pulse('equarry') + i * 1.3 }); } }));
    for (const tm of g.teams.boat) {                                 // barges: the sprite, then whatever stone rides on deck
      const m = SPR[tm.dir[0] < 0 ? 'barge_w' : 'barge_e'], bob = Math.sin(t * 1.3 + tm.i) * 0.04;
      items.push({ x: tm.x, y: tm.y, draw() {
        const f = P(tm.x, tm.y, bob);
        if (m.ok) spriteAt(m, f[0], f[1], 7.25 * cam.T / 445); else box(tm.x - 5, tm.y - 1.4, 0, 10, 2.8, 0.5, C.wood, 2);
        for (let c = 0; c < tm.cargo; c++) box(tm.x + ((c % 3) - 1) * 1.3 - 0.5, tm.y + (c < 3 ? -0.62 : 0.62) - 0.5, 0.5 + bob, 1, 1, BH, C.stone, cam.T >= 9 ? 2 : 1, 'stone');
      } });
    }
  }
  const rBusy = g.rampWanted() && s.piles.B > 0, rMid = g.rampMid();
  for (let i = 0; i < Math.min(s.assign.ramp, 10); i++) {            // ramp builders along the foot of the ramp
    const x = L.eastX + 1.2 + i * 1.5, y = rMid + L.rampHalf + 0.8;
    items.push({ x, y, draw() { worker(x, y, 0, { face: -1, anim: rBusy ? 'carve' : 'idle', ph: t * 6 * pulse('ramp') + i * 1.7 }); } });
  }
  const mBusy = s.piles.B > 0 && s.piles.C < capP;
  MASON_SPOTS.slice(0, s.assign.mason).forEach(([x, y], i) => {
    if (mBusy || (i === 0 && s.wm > 0.02)) items.push({ x, y, draw() { box(x - 0.5, y - 0.5, 0, 1, 1, BH, C.raw, cam.T >= 9 ? 2 : 1, i === 0 && s.wm > 0.6 ? 'stone' : 'strata'); } });
    items.push({ x: x + 0.2, y: y + 1, draw() { worker(x - 0.1, y + 0.95, 0, { face: 1, anim: mBusy ? 'carve' : 'idle', ph: t * 6 * pulse('mason') + i * 2.1 }); } });
  });
  IDLE_SPOTS.slice(0, g.free()).forEach(([x, y], i) => items.push({ x, y, draw() { worker(x, y, 0, { face: i % 2 ? 1 : -1, anim: 'idle', ph: 0 }); } }));
  for (const kind of ['haul', 'place', 'great']) for (const tm of g.teams[kind]) {
    const moving = tm.state === 'go' || tm.state === 'back', d = tm.dir, z = g.surfaceZ(tm.x, tm.y), face = faceOf(d);
    const placing = tm.state === 'place', raw = kind === 'haul' && tm.from !== 'W';
    const pull = [];
    for (let r = 0; r < 2; r++) for (const sd of [-0.42, 0.42]) {
      let px, py;
      if (!moving) { px = tm.x + sd * 2.2; py = tm.y + (r ? 1.1 : -1.1); }
      else { const ahead = 1.5 + r * 0.95; px = tm.x + d[0] * ahead - d[1] * sd; py = tm.y + d[1] * ahead + d[0] * sd; }
      pull.push([px, py, g.surfaceZ(px, py)]);
    }
    items.push({ x: tm.x, y: tm.y, draw() {
      box(tm.x - 0.8, tm.y - 0.5, z, 1.6, 1.0, 0.14, C.wood, cam.T >= 9 ? 2 : 0);
      if (tm.loaded && !placing) box(tm.x - 0.5, tm.y - 0.5, z + 0.14, 1, 1, BH, raw ? C.raw : C.stone, cam.T >= 9 ? 2 : 1, raw ? 'strata' : 'stone');
      if (moving && cam.T >= 7) {
        ctx.strokeStyle = '#7A5A32'; ctx.lineWidth = clamp(cam.T * 0.03, 0.6, 1.4);
        const f = P(tm.x + d[0] * 0.8, tm.y + d[1] * 0.8, z + 0.2); for (const p of pull) line(f, P(p[0], p[1], p[2] + 0.75));
      }
    } });
    const fast = g.boost[kind] > 0 ? 1.6 : 1;
    pull.forEach((p, i) => items.push({ x: p[0], y: p[1], draw() {
      worker(p[0], p[1], p[2], { face: placing ? (p[0] > tm.x ? -1 : 1) : face, anim: placing ? 'carve' : moving ? (tm.loaded ? 'pull' : 'walk') : 'idle', ph: tm.ph * fast + i * 1.9 });
    } }));
    if (placing) {                                                    // the block slides off the sledge into its place
      const k = clamp(tm.t / Sim.BASE.placeTime, 0, 1), e = k * k * (3 - 2 * k), tg = tm.target;
      const bx = lerp(tm.from[0], tg.x, e), by = lerp(tm.from[1], tg.y, e), bz = lerp(g.surfaceZ(tm.from[0], tm.from[1]) + 0.14, tg.z, e);
      items.push({ x: bx, y: by, draw() { box(bx - 0.5, by - 0.5, bz, 1, 1, BH, C.stone, 2, 'stone'); } });
    }
  }
  for (const it of items) {                    // draw just before the first static this mover stands behind
    it.slot = statics.length; const sxw = it.x - it.y;
    for (let i = 0; i < statics.length; i++) {
      const b = statics[i];
      if (sxw < b.x0 - b.y1 - 3 || sxw > b.x1 - b.y0 + 3) continue;
      if (!(it.x >= b.x1 || it.y >= b.y1 || (it.x >= b.x0 && it.y >= b.y0))) { it.slot = i; break; }
    }
  }
  items.sort((a, b) => a.slot - b.slot || (a.x + a.y) - (b.x + b.y));
  return items;
}

/* ---------- small moving marks: rations earned, chips from a click ---------- */
const fx = [];
function pop(x, y, z, text, color) { fx.push({ x, y, z, text, color: color || '#FFF4C2', t: 0, life: 1.5 }); }
function chips(sx, sy) { for (let i = 0; i < 6; i++) fx.push({ sx, sy, vx: (Math.random() - 0.5) * 150, vy: -70 - Math.random() * 130, t: 0, life: 0.5 }); }
function drawFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; if (f.t >= f.life) { fx.splice(i, 1); continue; }
    const k = f.t / f.life;
    if (f.text) {
      const [sx, sy] = P(f.x, f.y, f.z), size = clamp(cam.T * 0.5, 11, 18); if (cam.T < 6) continue;
      ctx.globalAlpha = 1 - k * k; ctx.font = `600 ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(21,40,59,0.85)'; ctx.fillStyle = f.color; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, sx, sy - 14 - k * 26); ctx.fillText(f.text, sx, sy - 14 - k * 26); ctx.globalAlpha = 1;
    } else {
      f.sx += f.vx * dt; f.sy += f.vy * dt; f.vy += 520 * dt;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#F6EBCB'; ctx.fillRect(f.sx - 2, f.sy - 2, 4, 4); ctx.globalAlpha = 1;
    }
  }
}

function label(txt, sub, x, y, z, size) {
  const [sx, sy] = P(x, y, z);
  if (sx < -200 || sx > V.W + 200 || sy < -50 || sy > V.H + 50) return;
  ctx.textAlign = 'center'; ctx.font = `${size}px Marcellus, Georgia, serif`;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(247,236,203,0.85)'; ctx.fillStyle = INK; ctx.lineJoin = 'round';
  ctx.strokeText(txt, sx, sy); ctx.fillText(txt, sx, sy);
  if (sub) { ctx.font = `500 ${Math.round(size * 0.62)}px Inter, system-ui, sans-serif`; ctx.strokeText(sub, sx, sy + size * 0.95); ctx.fillText(sub, sx, sy + size * 0.95); }
}
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
let lastNow = 0;
function render(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000 || 0); lastNow = now;
  ctx.setTransform(V.DPR, 0, 0, V.DPR, 0, 0);
  drawGround(now);
  const items = collectMovers(); let m = 0;
  for (let i = 0; i < statics.length; i++) {
    while (m < items.length && items[m].slot === i) items[m++].draw();
    const s = statics[i];
    const sl = V.W / 2 + ((s.x0 - cam.x) - (s.y1 - cam.y)) * cam.T * 0.5, sr = V.W / 2 + ((s.x1 - cam.x) - (s.y0 - cam.y)) * cam.T * 0.5;
    if (sr < -90 || sl > V.W + 90) continue;
    s.draw(now);
  }
  while (m < items.length) items[m++].draw();
  const st = g.site;
  if (cam.T < 9) {
    label('Wielka Piramida', `${fmt(g.s.great)} / ${fmt(g.great.total)} bloków`, g.great.ox + GN / 2, g.great.oy + GN / 2, GN * BH * 1.05, clamp(cam.T * 4.2, 15, 26));
    if (cam.T < 6.5) label(g.project().name, `${g.s.placed} / ${st.total}`, st.ox + st.a / 2, st.oy + st.b / 2, st.n * BH + 7, clamp(cam.T * 3, 12, 17));
  } else if (cam.T < 26) {
    const sz = clamp(cam.T * 1.1, 12, 17);
    if (g.s.quarryLeft > 0) label('Kamieniołom', null, 28, -58, 10.5, sz);
    label('Plac kamieniarzy', null, 33, -9, 6.5, sz);
    if (g.s.east) { label('Kamieniołom za rzeką', null, 147, -37, 10.5, sz); label('Przystań', null, 93, -15.5, 3.5, sz); }
  }
  drawFx(dt);
  booted = true;
}

/* ---------- what is under the pointer ---------- */
function zoneBox(x0, y0, x1, y1, h) {
  const p = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)];
  return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function hit(sx, sy) {
  for (const kind of ['place', 'great', 'haul']) for (const tm of g.teams[kind]) {
    const p = P(tm.x, tm.y, g.surfaceZ(tm.x, tm.y) + 0.6); if (Math.hypot(p[0] - sx, p[1] - sy) < Math.max(26, cam.T * 1.6)) return kind;
  }
  if (g.s.east) {
    for (const tm of g.teams.boat) { const p = P(tm.x, tm.y, 0.5); if (Math.hypot(p[0] - sx, (p[1] - sy) * 1.6) < Math.max(30, cam.T * 3.4)) return 'boat'; }
    if (inBox(zoneBox(134, -41, 161, -19.5, 7.5), sx, sy)) return 'equarry';
  }
  const st = g.site;
  if (g.rampWanted() && inBox(zoneBox(L.eastX, g.rampMid() - L.rampHalf - 1.6, L.eastX + Math.max(6, g.rampZ * L.rampSlope) + 1, g.rampMid() + L.rampHalf + 1.6, g.rampZ + 1), sx, sy)) return 'ramp';
  if (inBox(zoneBox(st.ox - 1, st.oy - 1, L.eastX + g.rampZ * L.rampSlope + 1, st.oy + st.b + 1, st.n * BH + 1), sx, sy)) return 'place';
  if (inBox(zoneBox(21.5, -14, 40.5, -4.6, 1.6), sx, sy)) return 'mason';
  if (g.s.quarryLeft > 0 && inBox(zoneBox(12, -62, 44, -39.8, 7), sx, sy)) return 'quarry';
  if (inBox(zoneBox(29.5, -35, 39, -13, 0.5), sx, sy) || (g.s.east && inBox(zoneBox(40, -14.6, 90, -10.6, 0.5), sx, sy))) return 'haul';
  if (g.s.assign.great > 0 && inBox(zoneBox(g.great.ox, g.great.oy, g.great.ox + GN, g.great.oy + GN, 2), sx, sy)) return 'great';
  return null;
}
/* Views leave room for the panel on the right: the focus lands in the middle of the free part of the screen. */
const freeW = () => V.W - (V.padR || 0);
function framed(c) { const a = (V.padR || 0) / c.T; return { x: c.x + a / 2, y: c.y - a / 2, T: c.T }; }
const views = {
  site: () => {                                                       // the tomb in progress together with the masons' yard
    const st = g.site, sx = 40 - st.ox, sy = st.oy + st.b + 12;
    return framed({ x: (st.ox + 40) / 2, y: (st.oy + st.b - 12) / 2, T: clamp(Math.min(freeW() / ((sx + sy) / 2 + 6), V.H / ((sx + sy) / 4 + 9)), 8, 46) });
  },
  valley: () => framed({ x: 40, y: -12, T: clamp(Math.min(freeW() / 125, V.H / 66), 4, 16) }),
  great: () => {                                                      // the whole pyramid with the building site at its foot
    const cx = g.great.ox + GN / 2, cy = g.great.oy + GN / 2, mid = (cx + cy) / 4, top = mid - GN * BH * ZK, bot = 62;
    const X = (cx - cy) / 2, Y = (top + bot) / 2;
    return framed({ x: X + 2 * Y, y: 2 * Y - X, T: clamp(Math.min(freeW() / (GN * 1.12), V.H / ((bot - top) * 1.22)), 0.3, 9) });
  },
  river: () => framed({ x: 104, y: -22, T: clamp(Math.min(freeW() / 80, V.H / 44), 6, 26) }),
  greatFoot: () => framed({ x: L.greatFront[0] - 6, y: L.greatFront[1] - 6, T: clamp(Math.min(freeW() / 60, V.H / 34), 10, 30) })
};
function init(game) { g = game; if (!world.length) buildWorld(); rebuild(); }
window.Scene = { init, rebuild, render, hit, pop, chips, views };
})();
