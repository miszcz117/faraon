/* Faraon: the simulation. Pure logic, no DOM and no canvas, so it also runs in Node for balance tests.
   Chain: quarry -> pile A ----------------------------> sledges -> pile B -> masons -> pile C -> placing crews -> tomb wall
          east quarry -> pile E -> barges -> pile W ----^            pile B -> ramp builders (the ramp eats raw stone)
                                                                                         pile C -> Great Pyramid crews   */
(function (root) {
'use strict';
const BH = 0.635;                 // block height in block widths
const TEAM = 4;                   // people per sledge
const STATIONS = ['quarry', 'equarry', 'boat', 'haul', 'mason', 'ramp', 'place', 'great'];
const UNIT = { quarry: 1, equarry: 1, boat: TEAM, haul: TEAM, mason: 1, ramp: 1, place: TEAM, great: TEAM };

/* World layout the simulation needs (the scene draws from the same numbers). */
const L = {
  pileA: [32, -39.6], pileB: [34, -12], pileC: [34, -3.6],
  roadAB: [[33.6, -35.2], [32.6, -26], [35, -18], [35.6, -13.4]],
  eastX: 12, rampSlope: 6, rampHalf: 1.4,
  greatRoad: [[28, -5.6], [14, -7.5], [-30, -5], [-56, 12], [-62, 24.4]],
  greatN: 600, greatStrip: 40, greatFront: [-68, 22],
  quarryTotal: 1000, eastAt: 0.5,                 // the local quarry holds this many blocks; scouts find stone across the river at this fraction
  pileE: [133.5, -16.6], pileW: [86.5, -17.4], harborRoad: [[86.5, -12.6], [60, -12.6], [41, -12.4], [38.8, -11.4]],
  dockW: [103.8, -12.6], dockE: [121.6, -12.6]
};
const PROJECTS = [
  { id: 'mastaba', name: 'Mastaba', a: 12, b: 8, n: 4, need: 0 },
  { id: 'mastaba2', name: 'Wielka mastaba', a: 18, b: 12, n: 6, need: 1 },
  // the first true pyramid: white casing, a granite chamber inside, a golden capstone; a steeper ramp or it would not fit
  { id: 'pyramid', name: 'Mała piramida', a: 14, b: 14, n: 14, need: 2, kind: 'pyr', slope: 3, kaMult: 2.5, river: true }
];
/* Expeditions: a crew leaves for a while and comes back with something the valley does not have. */
const EXPEDITIONS = { aswan: { crew: 8, cost: 60, time: 480, res: 'granite', n: 8 }, nubia: { crew: 12, cost: 200, time: 900, res: 'gold', n: 1 } };
const PAY = { w: 2, g: 5, gold: 60 };
const OVERSEERS = { quarry: { need: 30, cost: 60 }, haul: { need: 60, cost: 120 }, mason: { need: 96, cost: 200 }, ramp: { need: 200, cost: 260 }, place: { need: 150, cost: 320 }, great: { need: 278, cost: 500 }, equarry: { need: 900, cost: 450 }, boat: { need: 1000, cost: 600 } };
const KA = { speed: { base: 5, grow: 3 }, crew: { base: 3, grow: 2 }, racje: { base: 4, grow: 3 } };
const BASE = { quarry: 1 / 40, equarry: 1 / 40, mason: 1 / 30, ramp: 1 / 18, boatV: 1.3, boatCap: 6, boatLoad: 0.7, boatWait: 14, haulV: 0.95, haulBack: 1.7, placeV: 0.85, placeBack: 1.6, placeTime: 3, unload: 0.7, laneGap: 2.6, handSec: 1.5, overseerRate: 1, boostAdd: 0.7, boostMax: 6, bankCap: 12 * 3600 };

function mkStruct(ox, oy, a, b, n, strip, kind) {
  const courses = []; let cum = 0;
  for (let k = 0; k < n; k++) {
    const c = { k, a: a - k, b: b - k, x0: ox + k / 2, y0: oy + k / 2, z: k * BH, start: cum };
    c.cap = c.a * c.b; cum += c.cap; courses.push(c);
  }
  return { ox, oy, a, b, n, courses, total: cum, strip: strip || 0, kind: kind || null };
}
/* Which stone a block must be: null = any. A pyramid wants white casing outside, granite around the chamber, gold on top. */
function matAt(st, k, i, j) {
  if (st.kind !== 'pyr') return null;
  if (k === st.n - 1) return 'gold';
  const c = st.courses[k], h = Math.floor(c.a / 2);
  if (i === 0 || j === 0 || i === c.a - 1 || j === c.b - 1) return 'w';
  if ((k === 2 || k === 3) && (i === h - 1 || i === h) && (j === h - 1 || j === h)) return 'g';
  return 'l';
}
function courseOf(st, m) { for (const c of st.courses) if (m < c.start + c.cap) return c.k; return st.n; }
/* Where block number m sits. Tombs fill far-to-near (crews retreat towards the ramp);
   the Great Pyramid fills in strips starting at its front corner, nearest the site. */
function locate(st, m) {
  const c = st.courses[Math.min(courseOf(st, m), st.n - 1)], r = m - c.start;
  let i, j;
  if (!st.strip) { i = Math.floor(r / c.b); j = r % c.b; }
  else {
    const full = c.a * st.strip, sN = Math.min(Math.floor(r / full), Math.ceil(c.b / st.strip) - 1);
    const rows = Math.min(st.strip, c.b - sN * st.strip), r2 = r - sN * full;
    i = c.a - 1 - Math.floor(r2 / rows); j = c.b - 1 - sN * st.strip - (r2 % rows);
  }
  return { k: c.k, i, j, x: c.x0 + i + 0.5, y: c.y0 + j + 0.5, z: c.z };
}

/* Raw blocks of fill it takes to raise the ramp from course k-1 to course k: the wedge grows with the square of its height. */
const rampNeed = (k, slope) => Math.round(0.888 * (slope || 6) * (2 * k - 1));

function fresh() {
  return {
    v: 4, t: 0, played: 0, greatSeen: false, savedAt: 0, reign: 1, project: 'mastaba', siteY: 0, placed: 0, great: 0, racje: 8, workers: 10, hints: {},
    assign: { quarry: 1, equarry: 0, boat: 0, haul: 4, mason: 1, ramp: 0, place: 4, great: 0 }, piles: { A: 3, B: 2, C: 3, E: 0, W: 0, Bw: 0, Cw: 0 },
    lvl: { quarry: 0, equarry: 0, boat: 0, haul: 0, mason: 0, ramp: 0, place: 0, great: 0, pile: 0, hand: 0 }, over: {}, wq: 0, wm: 0, we: 0, wr: 0,
    quarryLeft: L.quarryTotal, east: false, rampK: 0, rampFill: 0, granite: 0, gold: 0, away: 0, exp: { aswan: 0, nubia: 0 },
    ka: 0, kaLvl: { speed: 0, crew: 0, racje: 0 }, tombs: [], blocks: 0, clicks: 0, bank: 0
  };
}
function migrate(saved) {
  const s = fresh(); if (!saved || typeof saved !== 'object') return s;
  for (const k in s) {
    if (saved[k] === undefined) continue;
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) Object.assign(s[k], saved[k]); else s[k] = saved[k];
  }
  if ((saved.v || 1) < 2) {                           // saves from before the quarry could run out and ramps cost stone
    s.quarryLeft = Math.max(250, L.quarryTotal - (saved.blocks || 0) - (saved.great || 0));
    s.rampK = -1;                                     // "as high as the wall already is", resolved once the site is known
  }
  if ((saved.v || 1) < 4) {                           // the Great Pyramid is no longer shown from the first minute
    s.greatSeen = (saved.tombs || []).some(t => t.id === 'pyramid');
    if (!s.greatSeen) s.assign.great = 0;
  }
  s.v = 4;
  return s;
}

function create(saved) {
  const s = migrate(saved), before3 = !!saved && typeof saved === 'object' && (saved.v || 1) < 3;
  const g = {
    s, BH, great: mkStruct(L.greatFront[0] - L.greatN, L.greatFront[1] - L.greatN, L.greatN, L.greatN, L.greatN, L.greatStrip),
    site: null, teams: { haul: [], place: [], great: [], boat: [] }, inFlight: { place: 0, great: 0 }, boost: { haul: 0, place: 0, great: 0, boat: 0 },
    rampZ: 0, rampDown: 0, incoming: { B: 0, Bw: 0 }, events: [], lane: {}, flash: { place: { idx: -1, t: 0 }, great: { idx: -1, t: 0 } }, stamps: [], rate: 0, handPulse: {}
  };
  const project = () => PROJECTS.find(p => p.id === s.project) || PROJECTS[0];
  const slope = () => project().slope || L.rampSlope;
  const need = k => rampNeed(k, slope());
  function setSite() { const p = project(); g.site = mkStruct(L.eastX - p.a, s.siteY, p.a, p.b, p.n, 0, p.kind); if (s.rampK < 0) { s.rampK = workCourse(); s.rampFill = 0; } rampSync(); }
  function rampSync() { g.rampZ = (s.rampK + (s.rampK < g.site.n - 1 ? s.rampFill / need(s.rampK + 1) : 0)) * BH * (1 - g.rampDown); }
  const done = () => s.placed >= g.site.total;
  const workCourse = () => Math.min(courseOf(g.site, s.placed), g.site.n - 1);
  const rampMid = () => g.site.oy + g.site.b / 2;
  const rampEdge = () => L.eastX - Math.max(0, Math.max(s.rampK, 1) - 1) / 2;
  const cap = () => 8 + 4 * s.lvl.pile;
  const free = () => s.workers - s.away - STATIONS.reduce((n, k) => n + s.assign[k], 0);
  const startWorkers = () => 10 + 5 * s.kaLvl.crew + (s.east ? 4 : 0);   // the river chain needs more hands, and the jetty brings settlers
  const globalMult = () => Math.pow(1.5, s.kaLvl.speed) * (1 + 0.02 * Math.sqrt(s.great));
  const mult = st => Math.pow(1.25, s.lvl[st]) * globalMult();
  const localStone = () => s.quarryLeft > 0;
  const handMult = () => Math.pow(1.5, s.lvl.hand);
  const teamsWanted = k => Math.floor(s.assign[k] / TEAM);

  /* Height of whatever a crew is standing on: the ramp, the course being laid, or the ground. */
  function surfaceZ(x, y) {
    const zt = g.rampZ, kc = workCourse(), mid = rampMid();
    if (zt > 0.001) {
      const len = zt * slope();
      if (Math.abs(y - mid) <= L.rampHalf + 0.01 && x >= rampEdge() - 0.05 && x <= L.eastX + len) return x <= L.eastX ? zt : zt * (1 - (x - L.eastX) / len);
    }
    if (kc >= 1) {
      const c = g.site.courses[kc - 1];
      if (x >= c.x0 && x <= c.x0 + c.a && y >= c.y0 && y <= c.y0 + c.b) return kc * BH;
    }
    return 0;
  }

  /* Take one dressed block of the wanted stone off the yard. Core blocks take local stone, or white once the local stone is gone for good. */
  function canTake(req) {
    if (req === 'g') return s.granite > 0 ? 'g' : null;
    if (req === 'gold') return s.gold > 0 ? 'gold' : null;
    if (req === 'w') return s.piles.Cw > 0 ? 'w' : null;
    if (s.piles.C > 0) return 'l';
    return s.piles.Cw > 0 && (req === null || s.piles.B === 0) ? 'w' : null;   // core takes white too when the yard has no yellow left
  }
  function takeDressed(req) {
    const m = canTake(req);
    if (m === 'g') s.granite--; else if (m === 'gold') s.gold--; else if (m === 'w') s.piles.Cw--; else if (m === 'l') s.piles.C--;
    return m;
  }
  /* What the wall asks for next, and how soon it will ask for something an expedition has to fetch. */
  function nextNeed() {
    const idx = s.placed + g.inFlight.place; if (idx >= g.site.total) return null;
    const at = m => { const t = locate(g.site, m); return matAt(g.site, t.k, t.i, t.j); };
    const out = { now: at(idx), special: null, inBlocks: 0 };
    if (g.site.kind) { let g2 = s.granite, au = s.gold;
      for (let m = idx; m < Math.min(g.site.total, idx + 400); m++) { const r = at(m); if (r === 'g' && --g2 < 0) { out.special = 'g'; out.inBlocks = m - idx; break; } if (r === 'gold' && --au < 0) { out.special = 'gold'; out.inBlocks = m - idx; break; } } }
    return out;
  }

  /* ---------- crews with sledges ---------- */
  const LANES = [0, -1, 1, -2, 2];
  function home(kind, i, base) {
    const ln = LANES[i % 5], row = Math.floor(i / 5);
    if (kind === 'haul') return base === 'W' ? [L.harborRoad[0][0] + row * 1.7, L.harborRoad[0][1] + ln * 0.9] : [L.roadAB[0][0] + ln * 1.5, L.roadAB[0][1] - row * 1.6];
    if (kind === 'place') return [33.4 + ln * 1.7, 2.6 + row * 1.5];
    if (kind === 'boat') return [L.dockE[0] - row * 9, L.dockE[1] + ln * 2.6];
    return [25.6 + ln * 1.5, -1.6 + row * 1.5];
  }
  function mkTeam(kind, i) {
    const base = kind === 'haul' ? (localStone() || s.piles.A > 0 ? 'A' : 'W') : null, h = home(kind, i, base);
    return { kind, i, base, lane: LANES[i % 5], state: kind === 'boat' ? 'load' : 'wait', path: null, seg: 0, x: h[0], y: h[1], hx: h[0], hy: h[1], dir: kind === 'boat' ? [-1, 0] : [0, -1], loaded: false, cargo: 0, t: 0, target: null, ph: i * 1.7, retire: false };
  }
  function syncTeams() {
    for (const kind of ['haul', 'place', 'great', 'boat']) {
      const list = g.teams[kind], want = teamsWanted(kind);
      while (list.length < want) { const used = new Set(list.map(t => t.i)); let i = 0; while (used.has(i)) i++; list.push(mkTeam(kind, i)); }
      let extra = list.length - want;
      for (const tm of list) tm.retire = false;
      for (let n = list.length - 1; n >= 0 && extra > 0; n--) { list[n].retire = true; extra--; }
      g.teams[kind] = list.filter(tm => !(tm.retire && (tm.state === 'wait' || (tm.state === 'load' && tm.cargo === 0))));
    }
  }
  function follow(tm, dist) {
    while (dist > 0 && tm.seg < tm.path.length - 1) {
      const b = tm.path[tm.seg + 1], dx = b[0] - tm.x, dy = b[1] - tm.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) tm.dir = [dx / d, dy / d];
      if (d <= dist) { tm.x = b[0]; tm.y = b[1]; tm.seg++; dist -= d; } else { tm.x += dx / d * dist; tm.y += dy / d * dist; dist = 0; }
    }
    return tm.seg >= tm.path.length - 1;
  }
  const go = (tm, pts, state) => { tm.path = [[tm.x, tm.y], ...pts]; tm.seg = 0; tm.state = state; };
  const laneFree = tm => s.t - (g.lane[tm.kind + tm.lane] || -99) > BASE.laneGap / mult(tm.kind);
  const depart = tm => { g.lane[tm.kind + tm.lane] = s.t; };
  const speed = (tm, v) => v * mult(tm.kind) * (g.boost[tm.kind] > 0 ? 2 : 1);

  const routeToB = tm => tm.base === 'W' ? L.harborRoad.slice(1).map(p => [p[0], p[1] + tm.lane * 0.5]) : L.roadAB.slice(1).map(p => [p[0] + tm.lane * 1.4, p[1]]);
  const routeFromB = tm => { const r = (tm.base === 'W' ? L.harborRoad.slice(0, -1).reverse().map(p => [p[0], p[1] + tm.lane * 0.5]) : L.roadAB.slice(0, -1).reverse().map(p => [p[0] + tm.lane * 1.4, p[1]])); r.push([tm.hx, tm.hy]); return r; };
  /* Sledge crews serve whichever source the yard has room for: yellow stone from the local quarry, white from the west jetty.
     A crew only sets off when its block will have somewhere to go, so nobody stands at a full pile holding stone the wall cannot use. */
  const destOf = src => src === 'W' ? 'Bw' : 'B';
  const roomFor = src => cap() - s.piles[destOf(src)] - g.incoming[destOf(src)];
  const wanted = src => s.piles[src] > 0 && roomFor(src) > 0;
  function pickBase(tm) {
    const own = tm.base, other = own === 'A' ? 'W' : 'A', wo = wanted(own), wt = wanted(other);
    if (wo && wt) return roomFor(other) > roomFor(own) + 2 ? other : own;      // both useful: go where the yard is emptier
    return wo ? own : wt ? other : own;
  }
  function setBase(tm, base) { tm.base = base; const h = home('haul', tm.i, base); tm.hx = h[0]; tm.hy = h[1]; }
  function stepHaul(tm, dt) {
    if (tm.state === 'wait') {
      if (tm.retire) return;
      tm.idle = (tm.idle || 0) + dt;
      const b = pickBase(tm);
      if (b !== tm.base) {
        if (tm.idle > 3) { const via = routeToB(tm); setBase(tm, b); tm.idle = 0; go(tm, via.concat(routeFromB(tm)), 'back'); }   // walk over to the other source, by way of the yard
      } else if (wanted(b) && laneFree(tm)) {
        depart(tm); s.piles[b]--; g.incoming[destOf(b)]++; tm.loaded = true; tm.from = b; tm.idle = 0; go(tm, routeToB(tm), 'go');
      }
    } else if (tm.state === 'go') {
      if (follow(tm, dt * speed(tm, BASE.haulV))) { tm.state = 'unload'; tm.t = 0; }
    } else if (tm.state === 'unload') {
      tm.t += dt; const dest = destOf(tm.from);
      if (tm.t > BASE.unload && s.piles[dest] < cap()) {
        s.piles[dest]++; g.incoming[dest]--; tm.loaded = false;
        const nb = pickBase(tm); if (nb !== tm.base) setBase(tm, nb);  // from the yard both roads are open: head for the source that is needed
        go(tm, routeFromB(tm), 'back');
      } else if (tm.t > 8) { g.incoming[dest]--; go(tm, routeFromB(tm), 'back'); }   // no room after all: take the block back
    } else if (follow(tm, dt * speed(tm, BASE.haulBack))) { if (tm.loaded) { s.piles[tm.from]++; tm.loaded = false; } tm.state = 'wait'; }
  }
  /* Barges carry stone in batches: they fill up at the east jetty, cross, and empty onto the west one. */
  function stepBoat(tm, dt) {
    const m = mult('boat'), fast = g.boost.boat > 0 ? 2 : 1;
    if (tm.state === 'load') {
      tm.t += dt;
      if (tm.cargo < BASE.boatCap && s.piles.E > 0) { tm.w = (tm.w || 0) + dt * m * fast; if (tm.w >= BASE.boatLoad) { tm.w = 0; s.piles.E--; tm.cargo++; tm.t = 0; } }
      if (!tm.retire && (tm.cargo >= BASE.boatCap || (tm.cargo > 0 && s.piles.E === 0 && tm.t > BASE.boatWait))) { tm.state = 'go'; tm.dir = [-1, 0]; }
    } else if (tm.state === 'go') {
      tm.x -= dt * BASE.boatV * m * fast; if (tm.x <= L.dockW[0]) { tm.x = L.dockW[0]; tm.state = 'unload'; tm.w = 0; }
    } else if (tm.state === 'unload') {
      if (tm.cargo > 0 && s.piles.W < cap()) { tm.w = (tm.w || 0) + dt * m * fast; if (tm.w >= BASE.boatLoad) { tm.w = 0; s.piles.W++; tm.cargo--; } }
      if (tm.cargo === 0) { tm.state = 'back'; tm.dir = [1, 0]; }
    } else { tm.x += dt * BASE.boatV * 1.5 * m * fast; if (tm.x >= tm.hx) { tm.x = tm.hx; tm.state = 'load'; tm.t = 0; tm.w = 0; } }
    tm.loaded = tm.cargo > 0;
  }
  function placed(kind, tm) {
    if (kind === 'place') {
      const k = tm.target.k; s.placed++; s.blocks++;
      const pay = 2 * (1 + 0.5 * k) * (PAY[tm.req] || 1) * Math.pow(1.5, s.kaLvl.racje); s.racje += pay;
      g.flash.place = { idx: tm.idx, t: 1 };
      g.stamps.push(s.t); if (g.stamps.length > 16) g.stamps.shift();
      g.events.push({ type: 'placed', x: tm.target.x, y: tm.target.y, z: tm.target.z + BH, pay });
      if (courseOf(g.site, s.placed) > k && !done()) g.events.push({ type: 'course', k: k + 1 });
      if (done()) g.events.push({ type: 'done' });
    } else {
      s.great++; g.flash.great = { idx: tm.idx, t: 1 };
      g.events.push({ type: 'great', x: tm.target.x, y: tm.target.y, z: BH });
    }
    g.inFlight[kind]--;
  }
  function stepPlace(tm, dt) {
    if (tm.state === 'wait') {
      const idx = s.placed + g.inFlight.place;
      if (tm.retire || idx >= g.site.total || !laneFree(tm)) return;
      const tg = locate(g.site, idx), kc = workCourse();
      if (tg.k !== kc || s.rampK < kc) return;
      const req = matAt(g.site, tg.k, tg.i, tg.j), mat = takeDressed(req); if (!mat) return;
      depart(tm); g.inFlight.place++; tm.loaded = true; tm.target = tg; tm.idx = idx; tm.req = req; tm.mat = mat;
      const ym = rampMid() + Math.max(-1, Math.min(1, tm.lane)) * 0.3, len = g.rampZ * slope(), edge = rampEdge();
      // stop beside the block; on the narrow top courses there is no room, so the sledge stays on the ramp's landing
      const sx = Math.min(tg.x + 3.3, L.eastX + 0.4), sy = sx >= edge - 0.2 ? ym : tg.y + (ym - tg.y) * 0.25;
      tm.ramp = [[Math.max(L.eastX + len + 5, 22), ym + tm.lane * 0.5], [L.eastX + len + 1.4, ym], [L.eastX + 0.4, ym]];
      const pts = tm.ramp.slice(); if (sx < L.eastX + 0.3) pts.push([sx, sy]);
      go(tm, pts, 'go');
    } else if (tm.state === 'go') {
      if (follow(tm, dt * speed(tm, BASE.placeV))) { tm.state = 'place'; tm.t = 0; tm.from = [tm.x, tm.y]; }
    } else if (tm.state === 'place') {
      tm.t += dt * mult('place') * (g.boost.place > 0 ? 2 : 1);
      if (tm.t >= BASE.placeTime) { placed('place', tm); tm.loaded = false; const back = tm.ramp.slice().reverse(); back.push([tm.hx, tm.hy]); go(tm, back, 'back'); }
    } else if (follow(tm, dt * speed(tm, BASE.placeBack))) tm.state = 'wait';
  }
  function stepGreat(tm, dt) {
    if (tm.state === 'wait') {
      const idx = s.great + g.inFlight.great;
      if (tm.retire || idx >= g.great.total || !laneFree(tm)) return;
      const mat = takeDressed(null); if (!mat) return;
      depart(tm); g.inFlight.great++; tm.loaded = true; tm.idx = idx; tm.mat = mat;
      const tg = tm.target = locate(g.great, idx);
      tm.ramp = L.greatRoad.map(p => [p[0], p[1] + tm.lane * 0.9]);
      tm.ramp.push([tg.x - 1.5, L.greatFront[1] + 2.3], [tg.x - 1.5, tg.y]);
      go(tm, tm.ramp, 'go');
    } else if (tm.state === 'go') {
      if (follow(tm, dt * speed(tm, BASE.placeV))) { tm.state = 'place'; tm.t = 0; tm.from = [tm.x, tm.y]; }
    } else if (tm.state === 'place') {
      tm.t += dt * mult('great') * (g.boost.great > 0 ? 2 : 1);
      if (tm.t >= BASE.placeTime) { placed('great', tm); tm.loaded = false; const back = tm.ramp.slice(0, -1).reverse(); back.push([tm.hx, tm.hy]); go(tm, back, 'back'); }
    } else if (follow(tm, dt * speed(tm, BASE.placeBack))) tm.state = 'wait';
  }

  /* ---------- the player's hand and the overseers who copy it ---------- */
  function hand(st, n) {
    if (st === 'quarry') { if (localStone()) s.wq += n * BASE.handSec * BASE.quarry * mult('quarry') * handMult(); }
    else if (st === 'equarry') { if (s.east) s.we += n * BASE.handSec * BASE.equarry * mult('equarry') * handMult(); }
    else if (st === 'mason') s.wm += n * BASE.handSec * BASE.mason * mult('mason') * handMult();
    else if (st === 'ramp') { if (rampWanted()) s.wr += n * BASE.handSec * BASE.ramp * mult('ramp') * handMult(); }
    else g.boost[st] = Math.min(BASE.boostMax, g.boost[st] + n * BASE.boostAdd * handMult());
    g.handPulse[st] = s.t;
  }
  const rampWanted = () => s.rampK < workCourse() && !done();
  function click(st) { if (!STATIONS.includes(st)) return; s.clicks++; hand(st, 1); }

  function step(dt) {
    s.t += dt; s.played += dt;
    const c = cap();
    for (const st of STATIONS) if (s.over[st] && s.assign[st] > 0) hand(st, dt * BASE.overseerRate);
    if (localStone()) {
      if (s.piles.A < c) s.wq += dt * s.assign.quarry * BASE.quarry * mult('quarry');
      while (s.wq >= 1 && s.piles.A < c && s.quarryLeft > 0) {
        s.piles.A++; s.wq -= 1; s.quarryLeft--;
        if (!s.east && s.quarryLeft <= L.quarryTotal * L.eastAt) { s.east = true; g.events.push({ type: 'east' }); }
        if (s.quarryLeft === 0) { s.assign.quarry = 0; s.wq = 0; g.events.push({ type: 'quarryOut' }); }
      }
    }
    if (s.wq > 1) s.wq = 1;
    if (s.east) {
      if (s.piles.E < c) s.we += dt * s.assign.equarry * BASE.equarry * mult('equarry');
      while (s.we >= 1 && s.piles.E < c) { s.piles.E++; s.we -= 1; }
    }
    if (s.we > 1) s.we = 1;
    // masons dress whichever stone has room on the dressed side; with both waiting, the one the yard is shorter of
    const pick = () => { const l = s.piles.B > 0 && s.piles.C < c, w = s.piles.Bw > 0 && s.piles.Cw < c; return l && w ? (s.piles.Cw < s.piles.C ? 'w' : 'l') : l ? 'l' : w ? 'w' : null; };
    if (pick()) s.wm += dt * s.assign.mason * BASE.mason * mult('mason');
    for (let m = pick(); s.wm >= 1 && m; m = pick()) { if (m === 'l') { s.piles.B--; s.piles.C++; } else { s.piles.Bw--; s.piles.Cw++; } s.wm -= 1; }
    if (s.wm > 1) s.wm = 1;
    if (rampWanted()) {                                              // the ramp is piled up from raw stone, a course at a time
      if (s.piles.B + s.piles.Bw > 0) s.wr += dt * s.assign.ramp * BASE.ramp * mult('ramp');
      while (s.wr >= 1 && s.piles.B + s.piles.Bw > 0 && rampWanted()) {
        if (s.piles.B > 0) s.piles.B--; else s.piles.Bw--;
        s.wr -= 1; s.rampFill++;
        if (s.rampFill >= need(s.rampK + 1)) { s.rampK++; s.rampFill = 0; g.events.push({ type: 'ramp', k: s.rampK }); }
      }
    }
    for (const id in EXPEDITIONS) if (s.exp[id] > 0) {               // expeditions come home
      s.exp[id] -= dt;
      if (s.exp[id] <= 0) { const e = EXPEDITIONS[id]; s.exp[id] = 0; s.away -= e.crew; s[e.res] += e.n; g.events.push({ type: 'exp', id }); }
    }
    if (s.wr > 1) s.wr = 1;
    // once the last block is in and the crews are off it, the ramp is taken down so the tomb stands clear
    if (done() && g.teams.place.every(t => t.state === 'wait')) g.rampDown = Math.min(1, g.rampDown + dt / 14);
    rampSync();
    syncTeams();
    for (const tm of g.teams.haul) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepHaul(tm, dt); }
    for (const tm of g.teams.place) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepPlace(tm, dt); }
    for (const tm of g.teams.great) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepGreat(tm, dt); }
    for (const tm of g.teams.boat) stepBoat(tm, dt);
    for (const k in g.boost) g.boost[k] = Math.max(0, g.boost[k] - dt);
    for (const k in g.flash) g.flash[k].t = Math.max(0, g.flash[k].t - dt * 1.4);
    if (g.stamps.length >= 3) g.rate = (g.stamps.length - 1) / Math.max(1, s.t - g.stamps[0]);
  }

  /* ---------- decisions ---------- */
  function setAssign(st, dir) {
    const u = UNIT[st];
    if (dir > 0 && ((st === 'quarry' && !localStone()) || ((st === 'equarry' || st === 'boat') && !s.east) || (st === 'great' && !s.greatSeen))) return false;
    if (dir > 0) { if (free() < u) return false; s.assign[st] += u; } else { if (s.assign[st] < u) return false; s.assign[st] -= u; }
    syncTeams(); return true;
  }
  const costs = {
    worker: () => Math.floor(4 * Math.pow(1.13, s.workers - startWorkers())),
    tool: st => Math.floor(10 * Math.pow(1.7, s.lvl[st])),
    pile: () => Math.floor(8 * Math.pow(1.6, s.lvl.pile)),
    hand: () => Math.floor(6 * Math.pow(1.8, s.lvl.hand)),
    overseer: st => OVERSEERS[st].cost,
    ka: id => Math.floor(KA[id].base * Math.pow(KA[id].grow, s.kaLvl[id]))
  };
  const pay = n => { if (s.racje < n) return false; s.racje -= n; return true; };
  function buy(what, arg) {
    if (what === 'worker') { if (!pay(costs.worker())) return false; s.workers++; g.events.push({ type: 'hire' }); return true; }
    if (what === 'tool') { if (!STATIONS.includes(arg) || !pay(costs.tool(arg))) return false; s.lvl[arg]++; return true; }
    if (what === 'pile') { if (!pay(costs.pile())) return false; s.lvl.pile++; return true; }
    if (what === 'hand') { if (!pay(costs.hand())) return false; s.lvl.hand++; return true; }
    if (what === 'overseer') { const o = OVERSEERS[arg]; if (!o || s.over[arg] || s.blocks < o.need || !pay(o.cost)) return false; s.over[arg] = true; return true; }
    if (what === 'ka') { if (!KA[arg] || s.ka < costs.ka(arg)) return false; s.ka -= costs.ka(arg); s.kaLvl[arg]++; return true; }
    return false;
  }
  function startExp(id) {
    const e = EXPEDITIONS[id]; if (!e || !s.east || s.exp[id] > 0 || free() < e.crew || s.racje < e.cost) return false;
    s.racje -= e.cost; s.away += e.crew; s.exp[id] = e.time; g.events.push({ type: 'expGo', id }); return true;
  }
  const kaGain = () => Math.round(Math.pow(g.site.total, 0.6) / 3 * (project().kaMult || 1));
  /* The pharaoh is buried: the tomb stays in the valley for good, the building site starts over. */
  function bury(nextId) {
    if (!done()) return false;
    const next = PROJECTS.find(p => p.id === nextId && s.tombs.length + 1 >= p.need && (!p.river || s.east)); if (!next) return false;
    const p = project();
    s.ka += kaGain();
    // the first true pyramid is what makes the next pharaoh dream of the Great one
    if (p.kind === 'pyr' && !s.greatSeen) { s.greatSeen = true; g.events.push({ type: 'reveal' }); }
    s.tombs.push({ id: p.id, a: p.a, b: p.b, n: p.n, ox: g.site.ox, oy: g.site.oy, reign: s.reign });
    s.siteY = g.site.oy + p.b + 10; s.reign++; s.project = next.id; s.placed = 0; s.racje = 0;
    s.workers = startWorkers();
    const loc = localStone();
    s.assign = { quarry: loc ? 1 : 0, equarry: loc ? 0 : 1, boat: 0, haul: 4, mason: 1, ramp: 0, place: 4, great: 0 };
    s.piles = { A: loc ? 3 : 0, B: loc ? 2 : 0, C: loc ? 3 : 0, E: 0, W: loc ? 0 : 6, Bw: loc ? 0 : 2, Cw: loc ? 0 : 3 };
    if (next.river) { s.piles.Cw = 6; s.piles.Bw = 4; s.piles.W = 6; }   // a pyramid opens with white casing: the first blocks are waiting
    s.away = 0; s.exp = { aswan: 0, nubia: 0 };                     // crews still away are called back empty-handed
    s.lvl = { quarry: 0, equarry: 0, boat: 0, haul: 0, mason: 0, ramp: 0, place: 0, great: 0, pile: 0, hand: 0 };
    s.wq = 0; s.wm = 0; s.we = 0; s.wr = 0; s.rampK = 0; s.rampFill = 0;
    g.teams = { haul: [], place: [], great: [], boat: [] }; g.inFlight = { place: 0, great: 0 }; g.boost = { haul: 0, place: 0, great: 0, boat: 0 }; g.stamps = []; g.rate = 0; g.lane = {};
    g.rampDown = 0; g.incoming = { B: 0, Bw: 0 }; setSite(); syncTeams();
    g.events.push({ type: 'reign' });
    return true;
  }

  /* Blocks per minute each station could push through if it never waited: the lowest one is the bottleneck. */
  function capacity(st) {
    const m = mult(st), hands = s.over[st] && s.assign[st] > 0 ? BASE.handSec * BASE.overseerRate * handMult() : 0;
    if (st === 'quarry') return localStone() ? 60 * BASE.quarry * m * (s.assign.quarry + hands) : 0;
    if (st === 'equarry') return s.east ? 60 * BASE.equarry * m * (s.assign.equarry + hands) : 0;
    if (st === 'mason') return 60 * BASE.mason * m * (s.assign.mason + hands);
    if (st === 'ramp') return 60 * BASE.ramp * m * (s.assign.ramp + hands);
    const n = teamsWanted(st); if (!n) return 0;
    const up = s.over[st] ? 1.7 : 1;                               // an overseer keeps a crew hurried most of the time
    if (st === 'boat') { const d = L.dockE[0] - L.dockW[0]; return up * 60 * n * BASE.boatCap / (d / (BASE.boatV * m) + d / (BASE.boatV * 1.5 * m) + 2 * BASE.boatCap * BASE.boatLoad / m); }
    if (st === 'haul') {
      let sum = 0;
      for (const tm of g.teams.haul) { const d = tm.base === 'W' ? 48.4 : 22.4; sum += 60 / (d / (BASE.haulV * m) + d / (BASE.haulBack * m) + BASE.unload); }
      return up * sum;
    }
    let d;
    if (st === 'place') { const len = g.rampZ * slope(); d = Math.hypot(33.4 - (L.eastX + len), 2.4 - rampMid()) + len + 5; }
    else { const tg = locate(g.great, Math.min(s.great, g.great.total - 1)); d = 108 + Math.abs(tg.x - L.greatFront[0]) + Math.abs(tg.y - L.greatFront[1]); }
    return up * Math.min(60 * n / (d / (BASE.placeV * m) + d / (BASE.placeBack * m) + BASE.placeTime / m), 5 * 60 * m / BASE.laneGap);
  }
  /* Why a station is idle right now, if it is. */
  function status(st) {
    const c = cap();
    if (st === 'quarry' && !localStone()) return 'out';
    if (st === 'ramp' && !rampWanted()) return 'ready';
    if (s.assign[st] < UNIT[st]) return 'empty';
    if (st === 'quarry') return s.piles.A >= c ? 'blocked' : 'ok';
    if (st === 'equarry') return s.piles.E >= c ? 'blocked' : 'ok';
    if (st === 'boat') return s.piles.E <= 0 && g.teams.boat.every(t => t.state === 'load' && t.cargo === 0) ? 'starved' : s.piles.W >= c && g.teams.boat.some(t => t.state === 'unload') ? 'blocked' : 'ok';
    if (st === 'haul') { const idle = g.teams.haul.every(t => t.state === 'wait'); return idle && s.piles.A + s.piles.W <= 0 ? 'starved' : idle && !wanted('A') && !wanted('W') ? 'blocked' : 'ok'; }
    if (st === 'mason') return s.piles.B + s.piles.Bw <= 0 ? 'starved' : (s.piles.B === 0 || s.piles.C >= c) && (s.piles.Bw === 0 || s.piles.Cw >= c) ? 'blocked' : 'ok';
    if (st === 'ramp') return s.piles.B + s.piles.Bw <= 0 ? 'starved' : 'ok';
    const idle = k => g.teams[k].every(t => t.state === 'wait');
    if (st === 'place') {
      if (done()) return 'done'; if (s.rampK < workCourse()) return 'ramp';
      const nn = nextNeed(); if (nn && idle('place') && !canTake(nn.now)) return nn.now && (nn.now !== 'l' || s.piles.Cw > 0) ? 'need-' + nn.now : 'starved';
      return 'ok';
    }
    return s.piles.C + s.piles.Cw <= 0 && idle('great') ? 'starved' : 'ok';
  }
  /* A copy of the state safe to store: blocks riding on sledges go back to the pile they came from. */
  function snapshot() {
    const o = JSON.parse(JSON.stringify(s));
    for (const t of g.teams.haul) if (t.loaded) o.piles[t.from || 'A']++;
    for (const t of g.teams.boat) o.piles.E += t.cargo;
    for (const t of g.teams.place.concat(g.teams.great)) if (t.loaded && t.state !== 'back') { if (t.mat === 'g') o.granite++; else if (t.mat === 'gold') o.gold++; else o.piles[t.mat === 'w' ? 'Cw' : 'C']++; }
    o.savedAt = Date.now();
    return o;
  }
  if (before3) {                                     // saves from before the fix: give what a fresh start gives now
    if (s.workers < startWorkers()) s.workers = startWorkers();
    if (project().river && s.placed === 0 && s.piles.Cw + s.piles.Bw === 0) { s.piles.Cw = 6; s.piles.Bw = 4; }
  }
  setSite(); syncTeams();
  return Object.assign(g, { step, click, buy, bury, setAssign, costs, capacity, status, snapshot, surfaceZ, done, workCourse, rampMid, rampEdge, cap, free, mult, globalMult, handMult, kaGain, project, teamsWanted, startWorkers, localStone, rampWanted, rampNeed: need, slope, nextNeed, startExp, canTake });
}

const Sim = { BH, TEAM, STATIONS, UNIT, L, PROJECTS, OVERSEERS, KA, BASE, EXPEDITIONS, mkStruct, courseOf, locate, matAt, create, fresh, rampNeed };
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
