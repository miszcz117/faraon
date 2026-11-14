/* Plays reigns with a simple bot and prints how long things take.
   Usage: node tools/balance.js [clicksPerSecond] [reigns] */
const Sim = require('../js/sim.js');
const cps = Number(process.argv[2] ?? 2), reigns = Number(process.argv[3] ?? 1);
const g = Sim.create();
const s = g.s, dt = 0.1;
const fmt = t => `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;
// once stone is found across the river and the local quarry runs low, the bot treats the river as its source
function chain() { return (s.east && s.quarryLeft < 250 ? ['equarry', 'boat'] : ['quarry']).concat(['haul', 'mason', 'place']); }
function bottleneck() { let best = null, v = Infinity; for (const st of chain()) { const c = g.capacity(st); if (c < v) { v = c; best = st; } } return best; }
function think() {
  for (const st of Sim.STATIONS) if (st !== 'great' && !s.over[st] && s.blocks >= Sim.OVERSEERS[st].need && s.racje >= Sim.OVERSEERS[st].cost * 1.5) g.buy('overseer', st);
  // the ramp gets two pairs of hands while it is behind, and gives them back afterwards
  if (g.rampWanted()) {
    while (s.assign.ramp < 2 && g.free() >= 1) g.setAssign('ramp', 1);
    if (s.assign.ramp < 2) { if (s.racje >= g.costs.worker()) g.buy('worker'); else for (const st of ['mason', 'quarry', 'equarry']) if (s.assign[st] > 1 && g.setAssign(st, -1)) { g.setAssign('ramp', 1); break; } }
  }
  else while (s.assign.ramp > 0) g.setAssign('ramp', -1);
  // expeditions: when the wall will soon ask for granite or gold, free a crew and send it
  const nn = g.nextNeed();
  if (nn && nn.special && nn.inBlocks < 150) {
    const id = nn.special === 'g' ? 'aswan' : 'nubia', e = Sim.EXPEDITIONS[id];
    if (s.exp[id] === 0 && s.racje >= e.cost) { for (let k = 0; k < 6 && g.free() < e.crew; k++) for (const st of ['place', 'haul', 'equarry', 'mason']) if (g.free() < e.crew && s.assign[st] > Sim.UNIT[st]) g.setAssign(st, -1); g.startExp(id); }
    if (s.exp[id] === 0 && s.racje < e.cost) return;                 // save up for it
  }
  for (let n = 0; n < 20; n++) {
    const bn = bottleneck(), unit = Sim.UNIT[bn];
    if (g.free() >= unit) { g.setAssign(bn, 1); continue; }
    const cw = g.costs.worker() * (unit - g.free()), ct = g.costs.tool(bn);
    if (ct < cw * 0.9 && s.racje >= ct) { g.buy('tool', bn); continue; }
    if (s.racje >= g.costs.worker()) { g.buy('worker'); continue; }
    // nothing to spend: move people from the strongest station, as a player would
    let rich = null, top = 0; for (const st of chain()) { const c = g.capacity(st); if (st !== bn && c > top && s.assign[st] > Sim.UNIT[st]) { top = c; rich = st; } }
    if (rich && top > g.capacity(bn) * 2.5 && g.setAssign(rich, -1)) continue;
    if (!g.localStone() && s.assign.quarry === 0 && g.capacity(bn) === 0 && rich && g.setAssign(rich, -1)) continue;
    break;
  }
}
for (let r = 0; r < reigns; r++) {
  const t0 = s.t; let clickAcc = 0, next = 0;
  let lastP = -1, lastT = s.t;
  while (!g.done() && s.t - t0 < 60 * 3600) {
    g.step(dt);
    if (s.placed !== lastP) { lastP = s.placed; lastT = s.t; }
    if (s.t - lastT > 3600) { console.log('  STALL placed', s.placed, 'need', JSON.stringify(g.nextNeed()), 'granite', s.granite, 'gold', s.gold, 'exp', JSON.stringify(s.exp), 'rampK', s.rampK, 'fill', s.rampFill, 'kc', g.workCourse(), 'piles', JSON.stringify(s.piles), 'racje', Math.round(s.racje), 'free', g.free(), Sim.STATIONS.map(st => st + ':' + g.status(st)).join(' '), 'haul', g.teams.haul.map(t => t.base + '/' + t.state).join(','), 'boat', g.teams.boat.map(t => t.state + t.cargo).join(',')); break; }
    clickAcc += cps * dt; while (clickAcc >= 1) { clickAcc--; g.click(bottleneck()); }
    if (Math.floor(s.t * 10) % 20 === 0) think();
    g.events.length = 0;
    if (process.argv[4] && s.placed >= next) { console.log(' ', fmt(s.t - t0), 'placed', s.placed, 'workers', s.workers, JSON.stringify(s.assign), 'rate/min', (g.rate * 60).toFixed(2)); next += Math.ceil(g.site.total / 8); }
  }
  console.log(`reign ${s.reign} (${g.project().name}, ${g.site.total} blocks): ${fmt(s.t - t0)}, workers ${s.workers}, +${g.kaGain()} Ka, quarry left ${s.quarryLeft}, assign ${JSON.stringify(s.assign)}, overseers: ${Object.keys(s.over).join(',') || 'none'}`);
  const nextId = Sim.PROJECTS.filter(p => s.tombs.length + 1 >= p.need).pop().id;
  g.bury(nextId);
  for (const id of ['speed', 'crew', 'racje', 'speed', 'crew', 'racje']) g.buy('ka', id);
}
console.log('total', fmt(s.t), 'ka left', s.ka, 'kaLvl', JSON.stringify(s.kaLvl));
