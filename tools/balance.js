/* Plays reigns with a simple bot and prints how long things take.
   Usage: node tools/balance.js [clicksPerSecond] [reigns] */
const Sim = require('../js/sim.js');
const cps = Number(process.argv[2] ?? 2), reigns = Number(process.argv[3] ?? 1);
const g = Sim.create();
const s = g.s, dt = 0.1;
const fmt = t => `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;
function bottleneck() { let best = null, v = Infinity; for (const st of ['quarry', 'haul', 'mason', 'place']) { const c = g.capacity(st); if (c < v) { v = c; best = st; } } return best; }
function think() {
  // overseers when affordable, then whatever is cheapest for the bottleneck: workers or its tool
  for (const st of Sim.STATIONS) if (st !== 'great' && !s.over[st] && s.blocks >= Sim.OVERSEERS[st].need && s.racje >= Sim.OVERSEERS[st].cost * 1.5) g.buy('overseer', st);
  for (let n = 0; n < 20; n++) {
    const bn = bottleneck(), unit = Sim.UNIT[bn];
    if (g.free() >= unit) { g.setAssign(bn, 1); continue; }
    const cw = g.costs.worker() * (unit - g.free()), ct = g.costs.tool(bn);
    if (ct < cw * 0.9 && s.racje >= ct) { g.buy('tool', bn); continue; }
    if (s.racje >= g.costs.worker()) { g.buy('worker'); continue; }
    break;
  }
}
for (let r = 0; r < reigns; r++) {
  const t0 = s.t; let clickAcc = 0, next = 0;
  while (!g.done() && s.t - t0 < 60 * 3600) {
    g.step(dt);
    clickAcc += cps * dt; while (clickAcc >= 1) { clickAcc--; g.click(bottleneck()); }
    if (Math.floor(s.t * 10) % 20 === 0) think();
    g.events.length = 0;
    if (process.argv[4] && s.placed >= next) { console.log(' ', fmt(s.t - t0), 'placed', s.placed, 'workers', s.workers, JSON.stringify(s.assign), 'rate/min', (g.rate * 60).toFixed(2)); next += Math.ceil(g.site.total / 8); }
  }
  console.log(`reign ${s.reign} (${g.project().name}, ${g.site.total} blocks): ${fmt(s.t - t0)}, workers ${s.workers}, +${g.kaGain()} Ka, overseers: ${Object.keys(s.over).join(',') || 'none'}`);
  const nextId = Sim.PROJECTS.filter(p => s.tombs.length + 1 >= p.need).pop().id;
  g.bury(nextId);
  for (const id of ['speed', 'crew', 'racje', 'speed', 'crew', 'racje']) g.buy('ka', id);
}
console.log('total', fmt(s.t), 'ka left', s.ka, 'kaLvl', JSON.stringify(s.kaLvl));
