/* Plays one reign with a simple bot and prints how long things take. Usage: node tools/balance.js [clicksPerSecond] */
const Sim = require('../js/sim.js');
const cps = Number(process.argv[2] ?? 2);
const g = Sim.create();
const s = g.s, dt = 0.1;
const fmt = t => `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;
let nextLog = 0, clickAcc = 0;
function bottleneck() { let best = null, v = Infinity; for (const st of ['quarry', 'haul', 'mason', 'place']) { const c = g.capacity(st); if (c < v) { v = c; best = st; } } return best; }
function think() {
  // overseers first, then whatever is cheapest among: a worker for the bottleneck, its tool, bigger piles
  for (const st of Sim.STATIONS) if (!s.over[st] && s.blocks >= Sim.OVERSEERS[st].need && st !== 'great') g.buy('overseer', st);
  const b = bottleneck();
  for (let n = 0; n < 20; n++) {
    const bn = bottleneck(), unit = Sim.UNIT[bn];
    if (g.free() >= unit) { g.setAssign(bn, 1); continue; }
    const cw = g.costs.worker() * (unit - g.free()), ct = g.costs.tool(bn);
    if (ct < cw * 0.9 && s.racje >= ct) { g.buy('tool', bn); continue; }
    if (s.racje >= g.costs.worker()) { g.buy('worker'); continue; }
    if (s.lvl.hand < 3 && s.racje >= g.costs.hand() * 3) { g.buy('hand'); continue; }
    break;
  }
}
while (!g.done() && s.t < 40 * 3600) {
  g.step(dt);
  clickAcc += cps * dt; while (clickAcc >= 1) { clickAcc--; g.click(bottleneck()); }
  if (Math.floor(s.t) % 2 === 0) think();
  g.events.length = 0;
  if (s.placed >= nextLog) { console.log(fmt(s.t), 'placed', s.placed, 'workers', s.workers, JSON.stringify(s.assign), 'lvl', JSON.stringify(s.lvl), 'racje', Math.round(s.racje), 'rate/min', (g.rate * 60).toFixed(2)); nextLog += 40; }
}
console.log('DONE in', fmt(s.t), 'workers', s.workers, 'clicks', s.clicks, 'ka', g.kaGain(), 'overseers', Object.keys(s.over).join(','));
