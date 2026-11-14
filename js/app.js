/* Faraon: the panel, the input, saving and the main loop. */
(function () {
'use strict';
const { cv, cam, V, clamp, lerp } = G;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'faraon.save.v1';
let g = null;

const NAMES = { quarry: 'Kamieniołom', equarry: 'Kamieniołom za rzeką', boat: 'Barki', haul: 'Sanie', mason: 'Kamieniarze', ramp: 'Rampa', place: 'Układanie', great: 'Wielka Piramida' };
const UNITS = { quarry: 'robotników', equarry: 'robotników', boat: 'załóg', haul: 'ekip', mason: 'robotników', ramp: 'robotników', place: 'ekip', great: 'ekip' };
const TIPS = {
  quarry: 'Wykuwają surowe bloki. Kamienia jest tu skończona ilość.', equarry: 'Wykuwają biały kamień na wschodnim brzegu. Trzeba go przewieźć barkami.',
  boat: 'Barka bierze do 6 bloków naraz i wozi je przez rzekę. Załoga to 4 ludzi.', haul: 'Ciągną surowe bloki na plac kamieniarzy, z kamieniołomu albo z przystani. Ekipa to 4 ludzi i sanie.',
  mason: 'Obrabiają surowe bloki na gładkie.', ramp: 'Sypią rampę z surowych bloków. Każda wyższa warstwa kosztuje więcej. Bez rampy ekipy nie wejdą wyżej.',
  place: 'Wciągają gładkie bloki po rampie i układają grobowiec. Za każdy blok dostajesz racje.',
  great: 'Ciągną gładkie bloki pod Wielką Piramidę. Nie dają racji, ale zostają na zawsze i przyspieszają wszystko.'
};
const PILES = { A: 'surowe przy kamieniołomie', E: 'surowe za rzeką', W: 'surowe na przystani', B: 'surowe na placu', Bw: 'surowe białe na placu', C: 'obrobione', Cw: 'obrobione białe' };
const EXP_TEXT = { aswan: ['Wyprawa do Asuanu', 'granit'], nubia: ['Wyprawa do Nubii', 'złoty czubek'] };
const MAT_NAME = { w: 'białego kamienia', g: 'granitu', gold: 'złotego czubka', l: 'żółtego kamienia' };
const KA_TEXT = { speed: ['Pamięć budowniczych', 'wszystko 1,5× szybciej'], crew: ['Liczniejsza załoga', '+5 robotników na start panowania'], racje: ['Hojniejszy skarbiec', 'racje za blok ×1,5'] };
const ROMAN = n => { const r = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let o = ''; for (const [v, s] of r) while (n >= v) { o += s; n -= v; } return o; };
const fmt = n => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmt1 = n => (n >= 100 ? fmt(n) : n.toFixed(1).replace('.', ','));
function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h} h ${m} min` : m ? `${m} min` : `${sec} s`; }
function fmtSpan(minutes) {
  if (!isFinite(minutes)) return 'nigdy';
  if (minutes < 90) return `${Math.round(minutes)} min`; if (minutes < 72 * 60) return `${Math.round(minutes / 60)} godz.`;
  const days = minutes / 1440; if (days < 730) return `${fmt(days)} dni`; return `${fmt(days / 365)} lat`;
}

/* ---------- build the panel once ---------- */
function buildPanel() {
  const chain = $('chain'); chain.textContent = '';
  const station = st => {
    const el = document.createElement('div'); el.className = 'st'; el.dataset.st = st; el.title = TIPS[st];
    el.innerHTML = `<div class="st-head"><b>${NAMES[st]}</b><span class="tag" data-f="over" hidden>nadzorca</span><span class="chip" data-f="chip"></span></div>
      <div class="st-body"><button type="button" class="hand" data-act="click">Popędź</button>
      <span class="cnt"><button type="button" data-act="minus" aria-label="Zabierz ludzi: ${NAMES[st]}">−</button><output data-f="n">0</output><button type="button" data-act="plus" aria-label="Dodaj ludzi: ${NAMES[st]}">+</button></span>
      <span class="unit">${UNITS[st]}</span><span class="capv" data-f="cap"></span></div><div class="meter"><i data-f="meter"></i></div><small data-f="note" hidden></small>`;
    return el;
  };
  const pile = k => { const el = document.createElement('div'); el.className = 'pile'; el.dataset.pile = k; el.innerHTML = `<span>${PILES[k]}</span><div class="bar"><i></i></div><output></output>`; return el; };
  chain.append(station('quarry'), pile('A'), station('equarry'), pile('E'), station('boat'), pile('W'), station('haul'), pile('B'), pile('Bw'), station('ramp'), station('mason'), pile('C'), pile('Cw'), station('place'), station('great'));
  const ex = $('expShop'); ex.textContent = '';
  for (const id in Sim.EXPEDITIONS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'buy'; b.dataset.exp = id; b.innerHTML = `<span class="lab">${EXP_TEXT[id][0]}</span><span class="sub"></span><span class="cost"></span>`; ex.append(b); }
  const shop = $('shop'); shop.textContent = '';
  const item = (buy, arg, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'buy'; b.dataset.buy = buy; if (arg) b.dataset.arg = arg; b.innerHTML = `<span class="lab">${label}</span><span class="sub"></span><span class="cost"></span>`; return b; };
  shop.append(item('worker', '', 'Najmij robotnika'));
  for (const st of Sim.STATIONS) shop.append(item('tool', st, `Narzędzia: ${NAMES[st].toLowerCase()}`));
  shop.append(item('pile', '', 'Większe stosy'), item('hand', '', 'Wprawna ręka'));
  const ov = $('overseers'); ov.textContent = '';
  for (const st of Sim.STATIONS) ov.append(item('overseer', st, `Nadzorca: ${NAMES[st].toLowerCase()}`));
  const ka = $('kaShop'); ka.textContent = '';
  for (const id in Sim.KA) ka.append(item('ka', id, KA_TEXT[id][0]));
}
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
const CHIPS = { starved: 'czeka na bloki', blocked: 'stos pełny', empty: 'brak ludzi', done: 'gotowe', out: 'wyczerpany', ready: 'sięga', ramp: 'czeka na rampę' };
/* Which stations and piles exist right now: the river chain appears when stone is found there, the local one goes when it is spent. */
function shown(key) {
  const s = g.s;
  if (key === 'equarry' || key === 'boat' || key === 'E' || key === 'W' || key === 'Bw' || key === 'Cw') return s.east;
  if (key === 'quarry' || key === 'A') return s.quarryLeft > 0 || s.piles.A > 0;
  if (key === 'great') return s.greatSeen;
  if (key === 'B' || key === 'C') return !s.east || s.quarryLeft > 0 || s.piles.A + s.piles.B + s.piles.C > 0;
  return true;
}

function updateUi() {
  const s = g.s, st0 = g.site, cap = g.cap();
  setText($('reignLine'), `Panowanie ${ROMAN(s.reign)} · ${g.project().name}`);
  setText($('rRacje'), fmt(s.racje)); setText($('rFree'), `${g.free()} / ${s.workers}`);
  $('rKaBox').hidden = !(s.ka > 0 || s.reign > 1); setText($('rKa'), fmt(s.ka));
  setText($('tombName'), g.project().name); setText($('tombVal'), `${fmt(s.placed)} / ${fmt(st0.total)}`);
  $('tombBar').style.width = (100 * s.placed / st0.total).toFixed(1) + '%';
  setText($('tombRate'), g.done() ? 'Grobowiec gotowy. Czas pochować faraona.' : g.rate > 0 ? `${fmt1(g.rate * 60)} bloku na minutę` : 'pierwsze bloki w drodze');
  $('buryBtn').hidden = !g.done();
  // which station limits the chain
  const local = g.localStone() ? g.capacity('quarry') : 0, cands = [];
  if (local > 0 && !(s.east && s.assign.equarry > 0 && s.assign.boat > 0)) cands.push(['quarry', local]);
  if (s.east && (local === 0 || s.assign.equarry > 0 || s.assign.boat > 0)) cands.push(['equarry', local + g.capacity('equarry')], ['boat', local + g.capacity('boat')]);
  cands.push(['haul', g.capacity('haul')], ['mason', g.capacity('mason')], ['place', g.capacity('place')]);
  // a station that is itself waiting on something is a victim, not the cause
  let bn = null, low = Infinity; for (const [st, c] of cands) { const u = g.status(st); if ((u === 'ok' || u === 'blocked' || u === 'empty') && c < low) { low = c; bn = st; } }
  const nn = g.nextNeed();
  for (const el of document.querySelectorAll('.st')) {
    const st = el.dataset.st, u = Sim.UNIT[st], status = g.status(st);
    el.hidden = !shown(st); if (el.hidden) continue;
    setText(el.querySelector('[data-f=n]'), String(s.assign[st] / u));
    setText(el.querySelector('[data-f=cap]'), s.assign[st] >= u && status !== 'out' && status !== 'ready' ? `${fmt1(g.capacity(st))}/min` : '');
    const lack = status.startsWith('need-') ? 'brak ' + MAT_NAME[status.slice(5)] : '';
    const chip = el.querySelector('[data-f=chip]'), txt = lack || CHIPS[status] || (st === bn && !g.done() ? 'wąskie gardło' : '');
    setText(chip, txt); chip.className = 'chip' + (lack || status === 'blocked' || status === 'ramp' || status === 'out' ? ' warn' : status === 'starved' || status === 'empty' || status === 'ready' ? ' dim' : txt ? ' hot' : '');
    el.querySelector('[data-f=over]').hidden = !s.over[st];
    el.querySelector('[data-act=plus]').disabled = g.free() < u || status === 'out';
    el.querySelector('[data-act=minus]').disabled = s.assign[st] < u;
    const team = st === 'haul' || st === 'place' || st === 'great' || st === 'boat';
    el.classList.toggle('boost', team && g.boost[st] > 0);
    const m = st === 'quarry' ? s.wq : st === 'equarry' ? s.we : st === 'mason' ? s.wm : st === 'ramp' ? s.wr : g.boost[st] / Sim.BASE.boostMax;
    el.querySelector('[data-f=meter]').style.width = (100 * clamp(m, 0, 1)).toFixed(0) + '%';
    const note = el.querySelector('[data-f=note]');
    const text = st === 'quarry' ? (s.quarryLeft > 0 ? `w skale zostało ${fmt(s.quarryLeft)} bloków` : 'skała wybrana do końca')
      : st === 'ramp' && g.rampWanted() ? `do warstwy ${s.rampK + 2}: ${s.rampFill} / ${g.rampNeed(s.rampK + 1)} surowych bloków`
      : st === 'place' && nn && nn.special ? (nn.inBlocks === 0 ? `teraz potrzeba: ${nn.special === 'g' ? 'granit' : 'złoty czubek'}` : `za ${nn.inBlocks} bloków potrzeba: ${nn.special === 'g' ? 'granit' : 'złoty czubek'}`) : '';
    note.hidden = !text; setText(note, text);
  }
  for (const el of document.querySelectorAll('.pile')) {
    el.hidden = !shown(el.dataset.pile); if (el.hidden) continue;
    const key = el.dataset.pile, n = s.piles[key];
    setText(el.querySelector('span'), s.east && key === 'B' ? 'surowe żółte na placu' : s.east && key === 'C' ? 'obrobione żółte' : PILES[key]);
    el.querySelector('i').style.width = (100 * n / cap) + '%'; setText(el.querySelector('output'), `${n}/${cap}`);
    el.classList.toggle('full', n >= cap); el.classList.toggle('empty', n === 0);
  }
  for (const b of document.querySelectorAll('.buy[data-buy]')) {
    const kind = b.dataset.buy, arg = b.dataset.arg; let cost = 0, sub = '', cur = s.racje, off = false, hide = false, unit = '';
    if (kind === 'worker') { cost = g.costs.worker(); sub = `masz ${s.workers}`; }
    else if (kind === 'tool') { cost = g.costs.tool(arg); sub = `poziom ${s.lvl[arg]} → ${s.lvl[arg] + 1}, +25%`; hide = !shown(arg); }
    else if (kind === 'pile') { cost = g.costs.pile(); sub = `${cap} → ${cap + 4} bloków`; }
    else if (kind === 'hand') { cost = g.costs.hand(); sub = `popędzanie ×1,5 (poziom ${s.lvl.hand})`; }
    else if (kind === 'overseer') {
      const o = Sim.OVERSEERS[arg]; cost = o.cost; hide = !shown(arg) && !s.over[arg];
      if (s.over[arg]) { sub = 'pracuje, popędza za Ciebie'; off = true; cost = -1; }
      else if (s.blocks < o.need) { sub = `po ${o.need} ułożonych blokach (masz ${fmt(s.blocks)})`; off = true; }
      else sub = 'popędza stację sam, zostaje na zawsze';
    } else if (kind === 'ka') { cost = g.costs.ka(arg); cur = s.ka; sub = `${KA_TEXT[arg][1]} (poziom ${s.kaLvl[arg]})`; unit = ' Ka'; }
    setText(b.querySelector('.sub'), sub); setText(b.querySelector('.cost'), cost < 0 ? '✓' : fmt(cost) + unit);
    b.disabled = off || cur < cost; b.classList.toggle('owned', cost < 0); b.hidden = hide;
  }
  $('kaSec').hidden = !(s.ka > 0 || s.reign > 1);
  $('expSec').hidden = !s.east;
  setText($('expStock'), `Na placu: granit ${s.granite}, złoty czubek ${s.gold}.`);
  for (const b of document.querySelectorAll('[data-exp]')) {
    const id = b.dataset.exp, e = Sim.EXPEDITIONS[id], left = s.exp[id];
    setText(b.querySelector('.sub'), left > 0 ? `w drodze, wraca za ${fmtTime(left)}` : `${e.crew} wolnych ludzi na ${fmtTime(e.time)}, przywozi: ${EXP_TEXT[id][1]}${e.n > 1 ? ' ×' + e.n : ''}`);
    setText(b.querySelector('.cost'), left > 0 ? '…' : fmt(e.cost));
    b.disabled = left > 0 || g.free() < e.crew || s.racje < e.cost;
  }
  // the Great Pyramid, once the player has been shown it
  $('greatSec').hidden = !s.greatSeen; $('viewGreat').hidden = !s.greatSeen;
  setText($('greatVal'), `${fmt(s.great)} / ${fmt(g.great.total)}`);
  const gc = g.capacity('great');
  setText($('greatEta'), s.great >= g.great.total ? 'ukończona' : gc > 0 ? `przy tych ekipach: ${fmtSpan((g.great.total - s.great) / gc)}` : 'nikt jeszcze nie ciągnie pod nią bloków');
  setText($('greatBonus'), `+${Math.round((2 * Math.sqrt(s.great)))}% do tempa wszystkiego`);
  // time bank
  setText($('bankVal'), fmtTime(s.bank));
  $('viewRiver').hidden = !s.east;
  for (const b of document.querySelectorAll('[data-warp]')) { const w = Number(b.dataset.warp); b.setAttribute('aria-pressed', String(w === warp)); b.disabled = w > 1 && s.bank < 2; }
}

/* ---------- messages ---------- */
/* First-steps hints: each shows once, when the moment it explains actually happens. */
const HINTS = [
  ['start', () => true, 'Masz 8 racji. Najmij robotnika (Zakupy) i przydziel go przyciskiem +. Klikaj stacje na mapie, żeby popędzić ludzi.', 16],
  ['first', s => s.placed >= 1, 'Pierwszy blok leży. Każdy ułożony blok to racje, wyższe warstwy płacą lepiej.', 8],
  ['full', s => s.placed >= 3 && Object.values(s.piles).some(n => n >= g.cap()), 'Stos pełny: stacja przed nim stoi i marnuje ludzi. Wzmocnij stację za nim albo przesuń tam robotników.', 12],
  ['team', s => s.racje >= 18 && s.placed >= 6, 'Sanie i układanie biorą ludzi czwórkami. Cztery wolne ręce to nowa ekipa.', 10],
  ['ramp', s => g.rampWanted() && s.assign.ramp === 0, 'Wyżej bez rampy nie wejdą. Przydziel ludzi do rampy: sypią ją z surowych bloków, a każda warstwa kosztuje więcej.', 14],
  ['low', s => s.east && s.quarryLeft < 160 && s.quarryLeft > 0 && (s.assign.equarry === 0 || s.assign.boat === 0), 'Miejscowa skała zaraz się skończy. Obsadź kamieniołom za rzeką i barki, zanim stanie cała budowa.', 14],
  ['pyr', s => s.project === 'pyramid', 'Piramida zaczyna od białej okładziny, więc pierwsze bloki muszą przypłynąć zza rzeki. W środku idzie żółty kamień, wokół komory granit, na szczyt złoty czubek. Granit i złoto przywożą wyprawy.', 18],
  ['over', s => s.blocks >= 30 && !s.over.quarry, 'Odblokowany pierwszy nadzorca. Popędza stację za Ciebie i zostaje na zawsze, także po pochówku.', 12],
  ['great', s => s.greatSeen && s.workers >= 18 && s.great === 0, 'Masz już sporą załogę. Ekipa wysłana pod Wielką Piramidę nie zarabia racji, ale jej bloki zostają na zawsze i przyspieszają wszystko.', 14],
  ['bank', s => s.bank >= 600, 'Uzbierał się zapas czasu. Przyciski ×3 i ×10 na dole przyspieszają budowę, dopóki go starczy.', 12]
];
function hints() {
  if (toastT > 0) return;
  for (const [id, cond, text, secs] of HINTS) if (!g.s.hints[id] && cond(g.s)) { g.s.hints[id] = 1; toast(text, secs); return; }
}
let toastT = 0;
function toast(msg, secs = 5) { const t = $('toast'); t.textContent = msg; t.hidden = false; toastT = secs; }
function openBurial() {
  const s = g.s, gain = g.kaGain();
  setText($('burialTitle'), `${g.project().name} ukończona`);
  setText($('burialGain'), `+${gain} Ka`);
  // a line about the levelled rock, until the day it is explained
  const n = s.tombs.length, lore = $('burialLore');
  lore.hidden = s.greatSeen && g.project().kind !== 'pyr';
  setText(lore, s.greatSeen ? '' : g.project().kind === 'pyr' ? 'Następca długo patrzył na piramidę ojca. Potem kazał się zaprowadzić na wyrównaną skałę na płaskowyżu.'
    : n === 0 ? 'Przed śmiercią faraon kazał wyrównać na płaskowyżu wielki kwadrat skały. Kapłani nie mówią po co.'
    : n === 1 ? 'Na wyrównanej skale mierniczowie wbili paliki i rozciągnęli sznury. Kwadrat jest większy niż całe miasto.'
    : 'Sznury na płaskowyżu wciąż czekają. Nikt nie śmie na nich budować.');
  const box = $('burialNext'); box.textContent = '';
  for (const p of Sim.PROJECTS) {
    const st = Sim.mkStruct(0, 0, p.a, p.b, p.n), ok = s.tombs.length + 1 >= p.need && (!p.river || s.east);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'buy'; b.disabled = !ok;
    const why = ok ? (p.kind ? 'biała okładzina, granitowa komora, złoty czubek; ' : '') : s.tombs.length + 1 < p.need ? `po ${p.need} grobowcach; ` : 'potrzebny kamień zza rzeki; ';
    b.innerHTML = `<span class="lab">${p.name}</span><span class="sub">${why}${fmt(st.total)} bloków, około ${Math.round(Math.pow(st.total, 0.6) / 3 * (p.kaMult || 1))} Ka</span><span class="cost">${ok ? 'Buduj' : '—'}</span>`;
    b.onclick = () => { const shown = g.s.greatSeen; if (g.bury(p.id)) { $('burial').hidden = true; save(true); if (g.s.greatSeen === shown) toast(`Panowanie ${ROMAN(g.s.reign)}. Stary grobowiec zostaje w dolinie.`, 7); } };
    box.append(b);
  }
  const tease = document.createElement('p'); tease.className = 'note'; tease.textContent = 'Większe piramidy: budowniczowie jeszcze nie znają tej techniki.'; box.append(tease);
  $('burial').hidden = false;
}

/* ---------- saving: this browser every few seconds, the account store every two minutes ---------- */
let cloudDoc = null, cloudBusy = false, lastLocal = 0, lastCloud = 0;
function readLocal() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
function save(force) {
  const snap = g.snapshot(), now = performance.now();
  if (force || now - lastLocal > 8000) { lastLocal = now; try { localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); } catch (e) { /* storage may be unavailable */ } }
  if (cloudDoc && !cloudBusy && (force || now - lastCloud > 120000)) {
    lastCloud = now; cloudBusy = true;
    cloudDoc.set({ state: snap, at: Date.now() }).catch(() => {}).then(() => { cloudBusy = false; });
  }
}
async function cloudInit() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const uid = await user.id(); if (!uid) return;
    const doc = db.doc(`data/users/${uid}/save`), snap = await doc.get();
    cloudDoc = doc; $('saveWhere').textContent = 'Zapis: w tej przeglądarce i na Twoim koncie.';
    const st = snap.exists && snap.data() && snap.data().state;
    if (st && (st.played || 0) > g.s.played + 60) { boot(st); toast('Wczytano nowszy zapis z konta.'); }
  } catch (e) { /* the page works without the account store */ }
}
function exportText() { return JSON.stringify(g.snapshot()); }
async function exportFile() {
  const text = exportText();
  try {
    const d = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (d) { await d.save({ filename: 'faraon-zapis.json', data: text }); toast('Zapis wyeksportowany.'); return; }
  } catch (e) { if (e && e.code === 'declined') return; }
  $('saveText').value = text; $('saveText').select(); toast('Zapis jest w polu tekstowym. Skopiuj go i schowaj.');
}
function importText(text) {
  try { const o = JSON.parse(text); if (!o || typeof o !== 'object' || typeof o.placed !== 'number') throw 0; boot(o); save(true); $('menu').hidden = true; toast('Zapis wczytany.'); }
  catch (e) { toast('To nie wygląda na zapis Faraona.'); }
}

/* ---------- camera ---------- */
let camAnim = null;
function flyTo(to, dur) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(cam, to); camAnim = null; return; }
  camAnim = { from: { ...cam }, to, t: 0, dur };
}
function zoomAt(cx, cy, f) {
  const r = cv.getBoundingClientRect(), sx = cx - r.left, sy = cy - r.top, before = G.unproj(sx, sy);
  cam.T = clamp(cam.T * f, 0.5, 72);
  const after = G.unproj(sx, sy); cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
}
const ptrs = new Map(); let pinch = 0, downAt = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); camAnim = null; downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { const r = cv.getBoundingClientRect(); cv.style.cursor = Scene.hit(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : 'grab'; return; }
  const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
  if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1) { if (!downAt || downAt.moved > 6) { const a = dx / (cam.T * 0.5), b = dy / (cam.T * 0.25); cam.x -= (a + b) / 2; cam.y -= (b - a) / 2; cv.classList.add('drag'); } }
  else if (ptrs.size === 2) { const [q, r] = [...ptrs.values()], d = Math.hypot(q[0] - r[0], q[1] - r[1]); if (pinch) zoomAt((q[0] + r[0]) / 2, (q[1] + r[1]) / 2, d / pinch); pinch = d; }
});
function pointerUp(e) {
  if (downAt && ptrs.size === 1 && downAt.moved <= 6 && performance.now() - downAt.t < 500) {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, st = Scene.hit(sx, sy);
    if (st) { g.click(st); Scene.chips(sx, sy); updateUi(); }
  }
  ptrs.delete(e.pointerId); pinch = 0; downAt = null; if (!ptrs.size) cv.classList.remove('drag');
}
cv.addEventListener('pointerup', pointerUp); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); downAt = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); camAnim = null; zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0014)); }, { passive: false });

/* ---------- panel input ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !g) return;
  const stEl = b.closest('.st');
  if (stEl && b.dataset.act) {
    const st = stEl.dataset.st;
    if (b.dataset.act === 'click') g.click(st); else g.setAssign(st, b.dataset.act === 'plus' ? 1 : -1);
    updateUi(); return;
  }
  if (b.dataset.buy && !b.closest('#burialNext')) { if (g.buy(b.dataset.buy, b.dataset.arg)) updateUi(); return; }
  if (b.dataset.exp) { if (g.startExp(b.dataset.exp)) { toast(`${EXP_TEXT[b.dataset.exp][0]} wyruszyła. Ludzie wrócą za ${fmtTime(Sim.EXPEDITIONS[b.dataset.exp].time)}.`, 7); updateUi(); } return; }
  if (b.dataset.view) { flyTo(Scene.views[b.dataset.view](), b.dataset.view === 'great' ? 2.2 : 1.5); return; }
  if (b.dataset.warp) { warp = Number(b.dataset.warp); if (warp > 1 && g.s.bank < 2) warp = 1; updateUi(); return; }
  if (b.id === 'buryBtn') openBurial();
  else if (b.id === 'burialLater') $('burial').hidden = true;
  else if (b.id === 'menuBtn') { $('saveText').value = ''; $('resetAsk').hidden = true; $('menu').hidden = false; }
  else if (b.id === 'menuClose') $('menu').hidden = true;
  else if (b.id === 'exportBtn') exportFile();
  else if (b.id === 'importBtn') importText($('saveText').value.trim());
  else if (b.id === 'resetBtn') $('resetAsk').hidden = false;
  else if (b.id === 'resetYes') { boot(null); save(true); $('menu').hidden = true; toast('Nowa gra.'); }
  else if (b.id === 'resetNo') $('resetAsk').hidden = true;
  else if (b.id === 'panelToggle') { const p = $('panel'); p.classList.toggle('shut'); b.setAttribute('aria-expanded', String(!p.classList.contains('shut'))); b.textContent = p.classList.contains('shut') ? 'Rozwiń' : 'Zwiń'; fit(); }
});
$('importFile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => importText(String(rd.result)); rd.readAsText(f); e.target.value = ''; });
document.addEventListener('visibilitychange', () => { if (document.hidden && g) save(true); });

/* ---------- main loop ---------- */
let warp = 1, last = 0, uiT = 0, started = false, reveal = false;
function bankAdd(sec) { g.s.bank = Math.min(Sim.BASE.bankCap, g.s.bank + sec); }
function frame(now) {
  let real = (now - last) / 1000 || 0; last = now;
  if (real > 1.5) { bankAdd(real); real = 0.016; }                   // the tab slept: that time goes to the bank
  if (camAnim) {
    camAnim.t += real / camAnim.dur;
    const k = clamp(camAnim.t, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    cam.x = lerp(camAnim.from.x, camAnim.to.x, e); cam.y = lerp(camAnim.from.y, camAnim.to.y, e);
    cam.T = Math.exp(lerp(Math.log(camAnim.from.T), Math.log(camAnim.to.T), e));
    if (k >= 1) camAnim = null;
  }
  if (warp > 1) { g.s.bank -= real * (warp - 1); if (g.s.bank <= 0) { g.s.bank = 0; warp = 1; } }
  const simDt = real * warp, n = Math.max(1, Math.ceil(simDt / 0.1));
  for (let i = 0; i < n; i++) g.step(simDt / n);
  for (const ev of g.events) {
    if (ev.type === 'placed') Scene.pop(ev.x, ev.y, ev.z, `+${fmt1(ev.pay).replace(',0', '')}`);
    else if (ev.type === 'great') { Scene.pop(ev.x, ev.y, ev.z, 'Wielka +1', '#EDBE45'); if (g.s.great === 1) toast('Pierwszy blok Wielkiej Piramidy leży. Zostało 72 180 099.', 8); }
    else if (ev.type === 'course') toast(g.rampWanted() ? `Warstwa ${ev.k} gotowa. Teraz rampa musi sięgnąć wyżej.` : `Warstwa ${ev.k} gotowa.`);
    else if (ev.type === 'ramp') toast(`Rampa sięga warstwy ${ev.k + 1}.`);
    else if (ev.type === 'east') { toast('Zwiadowcy znaleźli biały kamień za rzeką. Miejscowej skały ubyła połowa: obsadź kamieniołom za rzeką i barki. Widok „Rzeka” pokaże przystań.', 16); save(true); }
    else if (ev.type === 'exp') toast(ev.id === 'aswan' ? 'Wyprawa wróciła z Asuanu z granitem.' : 'Wyprawa wróciła z Nubii. Złoty czubek czeka na placu.', 8);
    else if (ev.type === 'quarryOut') toast('Miejscowy kamieniołom jest wybrany do końca. Od teraz cały kamień płynie zza rzeki.', 12);
    else if (ev.type === 'done') { toast('Grobowiec gotowy.'); save(true); openBurial(); }
    else if (ev.type === 'reveal') reveal = true;
    else if (ev.type === 'reign') {
      Scene.rebuild();
      if (reveal) { reveal = false; flyTo(Scene.views.great(), 5); toast(`Nowy faraon rysuje na wyrównanej skale grobowiec, jakiego nie było: ${fmt(g.great.total)} bloków. Ekipy mogą już ciągnąć pod niego kamień.`, 20); }
      else flyTo(Scene.views.site(), 2);
    }
  }
  g.events.length = 0;
  Scene.render(now);
  uiT += real; if (uiT > 0.2) { uiT = 0; updateUi(); hints(); save(false); }
  if (toastT > 0) { toastT -= real; if (toastT <= 0) $('toast').hidden = true; }
  requestAnimationFrame(frame);
}
function boot(saved) {
  g = Sim.create(saved);
  if (saved && saved.savedAt) { const gap = (Date.now() - saved.savedAt) / 1000; if (gap > 5) bankAdd(gap); }
  warp = 1; Scene.init(g); window.__faraon = { g, cam, Scene, flyTo };
  if (g.done()) openBurial(); else $('burial').hidden = true;
  updateUi();
}
function fit() { G.resize(); const p = $('panel'); V.padR = innerWidth > 760 && !p.classList.contains('shut') ? p.offsetWidth + 16 : 0; }
function start(hot) {
  buildPanel(); fit();
  const saved = (hot && hot.state) || readLocal();
  boot(saved);
  if (hot && hot.cam) Object.assign(cam, hot.cam);
  else if (!saved) {                                                  // a new game opens on the valley, then comes down to the site
    Object.assign(cam, Scene.views.valley());
    setTimeout(() => { if (!ptrs.size && !camAnim) flyTo(Scene.views.site(), 3.2); }, 1800);
  } else Object.assign(cam, Scene.views.site());
  if (!started) { started = true; addEventListener('resize', fit); requestAnimationFrame(t => { last = t; frame(t); }); cloudInit(); }
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ state: g.snapshot(), cam: { ...cam } }));
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
