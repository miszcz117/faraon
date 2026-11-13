/* Faraon: the simulation. Pure logic, no DOM and no canvas, so it also runs in Node for balance tests.
   Chain: quarry -> pile A -> sledges -> pile B -> masons -> pile C -> placing crews -> tomb wall
                                                              pile C -> Great Pyramid crews -> Great Pyramid   */
(function (root) {
'use strict';
const BH = 0.635;                 // block height in block widths
const TEAM = 4;                   // people per sledge
const STATIONS = ['quarry', 'haul', 'mason', 'place', 'great'];
const UNIT = { quarry: 1, haul: TEAM, mason: 1, place: TEAM, great: TEAM };

/* World layout the simulation needs (the scene draws from the same numbers). */
const L = {
  pileA: [32, -39.6], pileB: [34, -12], pileC: [34, -3.6],
  roadAB: [[33.6, -35.2], [32.6, -26], [35, -18], [35.6, -13.4]],
  eastX: 12, rampSlope: 6, rampHalf: 1.4,
  greatRoad: [[28, -5.6], [14, -7.5], [-30, -5], [-56, 12], [-62, 24.4]],
  greatN: 600, greatStrip: 40, greatFront: [-68, 22]
};
const PROJECTS = [
  { id: 'mastaba', name: 'Mastaba', a: 12, b: 8, n: 4, need: 0 },
  { id: 'mastaba2', name: 'Wielka mastaba', a: 18, b: 12, n: 6, need: 1 }
];
const OVERSEERS = { quarry: { need: 30, cost: 60 }, haul: { need: 60, cost: 120 }, mason: { need: 96, cost: 200 }, place: { need: 150, cost: 320 }, great: { need: 278, cost: 500 } };
const KA = { speed: { base: 5, grow: 3 }, crew: { base: 3, grow: 2 }, racje: { base: 4, grow: 3 } };
const BASE = { quarry: 1 / 40, mason: 1 / 30, haulV: 0.95, haulBack: 1.7, placeV: 0.85, placeBack: 1.6, placeTime: 3, unload: 0.7, laneGap: 2.6, handSec: 1.5, overseerRate: 1, boostAdd: 0.7, boostMax: 6, bankCap: 12 * 3600 };

function mkStruct(ox, oy, a, b, n, strip) {
  const courses = []; let cum = 0;
  for (let k = 0; k < n; k++) {
    const c = { k, a: a - k, b: b - k, x0: ox + k / 2, y0: oy + k / 2, z: k * BH, start: cum };
    c.cap = c.a * c.b; cum += c.cap; courses.push(c);
  }
  return { ox, oy, a, b, n, courses, total: cum, strip: strip || 0 };
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

function fresh() {
  return {
    v: 1, t: 0, played: 0, savedAt: 0, reign: 1, project: 'mastaba', siteY: 0, placed: 0, great: 0, racje: 8, workers: 10, hints: {},
    assign: { quarry: 1, haul: 4, mason: 1, place: 4, great: 0 }, piles: { A: 3, B: 2, C: 3 },
    lvl: { quarry: 0, haul: 0, mason: 0, place: 0, great: 0, pile: 0, hand: 0 }, over: {}, wq: 0, wm: 0,
    ka: 0, kaLvl: { speed: 0, crew: 0, racje: 0 }, tombs: [], blocks: 0, clicks: 0, bank: 0
  };
}
function migrate(saved) {
  const s = fresh(); if (!saved || typeof saved !== 'object') return s;
  for (const k in s) {
    if (saved[k] === undefined) continue;
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) Object.assign(s[k], saved[k]); else s[k] = saved[k];
  }
  return s;
}

function create(saved) {
  const s = migrate(saved);
  const g = {
    s, BH, great: mkStruct(L.greatFront[0] - L.greatN, L.greatFront[1] - L.greatN, L.greatN, L.greatN, L.greatN, L.greatStrip),
    site: null, teams: { haul: [], place: [], great: [] }, inFlight: { place: 0, great: 0 }, boost: { haul: 0, place: 0, great: 0 },
    rampZ: 0, events: [], lane: {}, flash: { place: { idx: -1, t: 0 }, great: { idx: -1, t: 0 } }, stamps: [], rate: 0, handPulse: {}
  };
  const project = () => PROJECTS.find(p => p.id === s.project) || PROJECTS[0];
  function setSite() { const p = project(); g.site = mkStruct(L.eastX - p.a, s.siteY, p.a, p.b, p.n); g.rampZ = workCourse() * BH; }
  const done = () => s.placed >= g.site.total;
  const workCourse = () => Math.min(courseOf(g.site, s.placed), g.site.n - 1);
  const rampMid = () => g.site.oy + g.site.b / 2;
  const rampEdge = () => L.eastX - Math.max(0, workCourse() - 1) / 2;
  const cap = () => 8 + 4 * s.lvl.pile;
  const free = () => s.workers - STATIONS.reduce((n, k) => n + s.assign[k], 0);
  const startWorkers = () => 10 + 5 * s.kaLvl.crew;
  const globalMult = () => Math.pow(1.5, s.kaLvl.speed) * (1 + 0.02 * Math.sqrt(s.great));
  const mult = st => Math.pow(1.25, s.lvl[st]) * globalMult();
  const handMult = () => Math.pow(1.5, s.lvl.hand);
  const teamsWanted = k => Math.floor(s.assign[k] / TEAM);

  /* Height of whatever a crew is standing on: the ramp, the course being laid, or the ground. */
  function surfaceZ(x, y) {
    const zt = g.rampZ, kc = workCourse(), mid = rampMid();
    if (zt > 0.001) {
      const len = zt * L.rampSlope;
      if (Math.abs(y - mid) <= L.rampHalf + 0.01 && x >= rampEdge() - 0.05 && x <= L.eastX + len) return x <= L.eastX ? zt : zt * (1 - (x - L.eastX) / len);
    }
    if (kc >= 1) {
      const c = g.site.courses[kc - 1];
      if (x >= c.x0 && x <= c.x0 + c.a && y >= c.y0 && y <= c.y0 + c.b) return kc * BH;
    }
    return 0;
  }

  /* ---------- crews with sledges ---------- */
  const LANES = [0, -1, 1, -2, 2];
  function home(kind, i) {
    const ln = LANES[i % 5], row = Math.floor(i / 5);
    if (kind === 'haul') return [L.roadAB[0][0] + ln * 1.5, L.roadAB[0][1] - row * 1.6];
    if (kind === 'place') return [33.4 + ln * 1.7, 2.4 + row * 1.5];
    return [29.6 + ln * 1.5, -1.6 + row * 1.5];
  }
  function mkTeam(kind, i) {
    const h = home(kind, i);
    return { kind, i, lane: LANES[i % 5], state: 'wait', path: null, seg: 0, x: h[0], y: h[1], hx: h[0], hy: h[1], dir: [0, -1], loaded: false, t: 0, target: null, ph: i * 1.7, retire: false };
  }
  function syncTeams() {
    for (const kind of ['haul', 'place', 'great']) {
      const list = g.teams[kind], want = teamsWanted(kind);
      while (list.length < want) { const used = new Set(list.map(t => t.i)); let i = 0; while (used.has(i)) i++; list.push(mkTeam(kind, i)); }
      let extra = list.length - want;
      for (const tm of list) tm.retire = false;
      for (let n = list.length - 1; n >= 0 && extra > 0; n--) { list[n].retire = true; extra--; }
      g.teams[kind] = list.filter(tm => !(tm.retire && tm.state === 'wait'));
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

  function stepHaul(tm, dt) {
    if (tm.state === 'wait') {
      if (!tm.retire && s.piles.A > 0 && laneFree(tm)) { depart(tm); s.piles.A--; tm.loaded = true; go(tm, L.roadAB.slice(1).map(p => [p[0] + tm.lane * 1.4, p[1]]), 'go'); }
    } else if (tm.state === 'go') {
      if (follow(tm, dt * speed(tm, BASE.haulV))) { tm.state = 'unload'; tm.t = 0; }
    } else if (tm.state === 'unload') {
      tm.t += dt;
      if (tm.t > BASE.unload && s.piles.B < cap()) { s.piles.B++; tm.loaded = false; const back = L.roadAB.slice(0, -1).reverse().map(p => [p[0] + tm.lane * 1.4, p[1]]); back.push([tm.hx, tm.hy]); go(tm, back, 'back'); }
    } else if (follow(tm, dt * speed(tm, BASE.haulBack))) tm.state = 'wait';
  }
  function placed(kind, tm) {
    if (kind === 'place') {
      const k = tm.target.k; s.placed++; s.blocks++;
      const pay = 2 * (1 + 0.5 * k) * Math.pow(1.5, s.kaLvl.racje); s.racje += pay;
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
      if (tm.retire || s.piles.C <= 0 || idx >= g.site.total || !laneFree(tm)) return;
      const tg = locate(g.site, idx), kc = workCourse();
      if (tg.k !== kc || Math.abs(g.rampZ - kc * BH) > 0.02) return;
      depart(tm); s.piles.C--; g.inFlight.place++; tm.loaded = true; tm.target = tg; tm.idx = idx;
      const ym = rampMid() + Math.max(-1, Math.min(1, tm.lane)) * 0.3, len = g.rampZ * L.rampSlope;
      const sx = Math.min(tg.x + 3.3, L.eastX + 0.4), sy = sx >= L.eastX + 0.3 ? ym : tg.y + (ym - tg.y) * 0.25;
      tm.ramp = [[Math.min(31, Math.max(L.eastX + len + 5, 22)), ym + tm.lane * 0.5], [L.eastX + len + 1.4, ym], [L.eastX + 0.4, ym]];
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
      if (tm.retire || s.piles.C <= 0 || idx >= g.great.total || !laneFree(tm)) return;
      depart(tm); s.piles.C--; g.inFlight.great++; tm.loaded = true; tm.idx = idx;
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
    if (st === 'quarry') s.wq += n * BASE.handSec * BASE.quarry * mult('quarry') * handMult();
    else if (st === 'mason') s.wm += n * BASE.handSec * BASE.mason * mult('mason') * handMult();
    else g.boost[st] = Math.min(BASE.boostMax, g.boost[st] + n * BASE.boostAdd * handMult());
    g.handPulse[st] = s.t;
  }
  function click(st) { if (!STATIONS.includes(st)) return; s.clicks++; hand(st, 1); }

  function step(dt) {
    s.t += dt; s.played += dt;
    const c = cap();
    for (const st of STATIONS) if (s.over[st] && s.assign[st] > 0) hand(st, dt * BASE.overseerRate);
    if (s.piles.A < c) s.wq += dt * s.assign.quarry * BASE.quarry * mult('quarry');
    while (s.wq >= 1 && s.piles.A < c) { s.piles.A++; s.wq -= 1; }
    if (s.wq > 1) s.wq = 1;
    if (s.piles.B > 0 && s.piles.C < c) s.wm += dt * s.assign.mason * BASE.mason * mult('mason');
    while (s.wm >= 1 && s.piles.B > 0 && s.piles.C < c) { s.piles.B--; s.piles.C++; s.wm -= 1; }
    if (s.wm > 1) s.wm = 1;
    const target = workCourse() * BH;
    if (g.rampZ < target) g.rampZ = Math.min(target, g.rampZ + dt * 0.2 * mult('place'));
    syncTeams();
    for (const tm of g.teams.haul) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepHaul(tm, dt); }
    for (const tm of g.teams.place) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepPlace(tm, dt); }
    for (const tm of g.teams.great) { tm.ph += dt * (tm.state === 'go' ? 7 : tm.state === 'back' ? 9 : 0); stepGreat(tm, dt); }
    for (const k in g.boost) g.boost[k] = Math.max(0, g.boost[k] - dt);
    for (const k in g.flash) g.flash[k].t = Math.max(0, g.flash[k].t - dt * 1.4);
    if (g.stamps.length >= 3) g.rate = (g.stamps.length - 1) / Math.max(1, s.t - g.stamps[0]);
  }

  /* ---------- decisions ---------- */
  function setAssign(st, dir) {
    const u = UNIT[st];
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
  const kaGain = () => Math.round(Math.pow(g.site.total, 0.6) / 3);
  /* The pharaoh is buried: the tomb stays in the valley for good, the building site starts over. */
  function bury(nextId) {
    if (!done()) return false;
    const next = PROJECTS.find(p => p.id === nextId && s.tombs.length + 1 >= p.need); if (!next) return false;
    const p = project();
    s.ka += kaGain();
    s.tombs.push({ id: p.id, a: p.a, b: p.b, n: p.n, ox: g.site.ox, oy: g.site.oy, reign: s.reign });
    s.siteY = g.site.oy + p.b + 10; s.reign++; s.project = next.id; s.placed = 0; s.racje = 0;
    s.workers = startWorkers();
    s.assign = { quarry: 1, haul: 4, mason: 1, place: 4, great: 0 };
    s.piles = { A: 3, B: 2, C: 3 };
    s.lvl = { quarry: 0, haul: 0, mason: 0, place: 0, great: 0, pile: 0, hand: 0 };
    s.wq = 0; s.wm = 0;
    g.teams = { haul: [], place: [], great: [] }; g.inFlight = { place: 0, great: 0 }; g.boost = { haul: 0, place: 0, great: 0 }; g.stamps = []; g.rate = 0; g.lane = {};
    setSite(); syncTeams();
    g.events.push({ type: 'reign' });
    return true;
  }

  /* Blocks per minute each station could push through if it never waited: the lowest one is the bottleneck. */
  function capacity(st) {
    const m = mult(st);
    const over = s.over[st] && s.assign[st] > 0;
    if (st === 'quarry') return 60 * BASE.quarry * m * (s.assign.quarry + (over ? BASE.handSec * BASE.overseerRate * handMult() : 0));
    if (st === 'mason') return 60 * BASE.mason * m * (s.assign.mason + (over ? BASE.handSec * BASE.overseerRate * handMult() : 0));
    const n = teamsWanted(st); if (!n) return 0;
    let d, trip;
    if (st === 'haul') { d = 22.4; trip = d / (BASE.haulV * m) + d / (BASE.haulBack * m) + BASE.unload; }
    else {
      if (st === 'place') { const len = g.rampZ * L.rampSlope; d = Math.hypot(33.4 - (L.eastX + len), 2.4 - rampMid()) + len + 5; }
      else { const tg = locate(g.great, Math.min(s.great, g.great.total - 1)); d = 108 + Math.abs(tg.x - L.greatFront[0]) + Math.abs(tg.y - L.greatFront[1]); }
      trip = d / (BASE.placeV * m) + d / (BASE.placeBack * m) + BASE.placeTime / m;
    }
    return Math.min(60 * n / trip, 5 * 60 * m / BASE.laneGap);
  }
  /* Why a station is idle right now, if it is. */
  function status(st) {
    const c = cap();
    if (s.assign[st] < UNIT[st]) return 'empty';
    if (st === 'quarry') return s.piles.A >= c ? 'blocked' : 'ok';
    if (st === 'haul') return s.piles.A <= 0 && g.teams.haul.every(t => t.state === 'wait') ? 'starved' : s.piles.B >= c && g.teams.haul.some(t => t.state === 'unload' && t.t > 1) ? 'blocked' : 'ok';
    if (st === 'mason') return s.piles.B <= 0 ? 'starved' : s.piles.C >= c ? 'blocked' : 'ok';
    if (st === 'place') return done() ? 'done' : s.piles.C <= 0 && g.teams.place.every(t => t.state === 'wait') ? 'starved' : 'ok';
    return s.piles.C <= 0 && g.teams.great.every(t => t.state === 'wait') ? 'starved' : 'ok';
  }
  /* A copy of the state safe to store: blocks riding on sledges go back to the pile they came from. */
  function snapshot() {
    const o = JSON.parse(JSON.stringify(s));
    o.piles.A += g.teams.haul.filter(t => t.loaded).length;
    o.piles.C += g.inFlight.place + g.inFlight.great;
    o.savedAt = Date.now();
    return o;
  }
  setSite(); syncTeams();
  return Object.assign(g, { step, click, buy, bury, setAssign, costs, capacity, status, snapshot, surfaceZ, done, workCourse, rampMid, rampEdge, cap, free, mult, globalMult, handMult, kaGain, project, teamsWanted, startWorkers });
}

const Sim = { BH, TEAM, STATIONS, UNIT, L, PROJECTS, OVERSEERS, KA, BASE, mkStruct, courseOf, locate, create, fresh };
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
