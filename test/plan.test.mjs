// Quick sanity tests for the decision logic — run: node test/plan.test.mjs
import { buildPlans, metroFare, autoFare } from '../lib/plan.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}

console.log('\nfares (official Bangalore rates)');
ok('metro 10km = ₹50', metroFare(10) === 50);
ok('auto 2km = floor ₹55 (short-hop minimum)', autoFare(2) === 55);
ok('auto 10km = 36 + 8*18 = ₹180', autoFare(10) === 180);

console.log('\nKoramangala → Whitefield, daytime 9am (peak)');
// ~19 km road, bad traffic (~70 min drive); metro covers most of it with short autos
let r = buildPlans({
  driving: { km: 19.5, min: 70 },
  transit: {
    boardStation: 'Indiranagar', alightStation: 'Whitefield (Kadugodi)', line: 'Purple Line',
    metroKm: 16, metroMin: 34,
    originAccessKm: 2.0, originAccessMin: 9,
    destAccessKm: 1.5, destAccessMin: 7,
  },
}, {}, 9);
console.log('   verdict:', r.verdict.line);
r.options.forEach(o => console.log(`   - ${o.mode}: ₹${o.cost}, ${o.min} min${o.isCheapest ? ' [cheapest]' : ''}${o.isFastest ? ' [fastest]' : ''}`));
ok('metro option exists', r.options.some(o => o.key === 'metro'));
ok('metro is cheapest here', r.cheapest.key === 'metro');
ok('metro beats 70-min cab on time', r.options.find(o => o.key === 'metro').min < 74);

console.log('\nNight: calm (low) price holds, only the high end widens');
let day = buildPlans({ driving: { km: 12, min: 30 }, transit: null }, {}, 14);
let night = buildPlans({ driving: { km: 12, min: 30 }, transit: null }, {}, 23);
const dayAuto = day.options.find(o => o.key === 'auto');
const nightAuto = night.options.find(o => o.key === 'auto');
console.log(`   auto day ₹${dayAuto.cost}–${dayAuto.costHigh} → night ₹${nightAuto.cost}–${nightAuto.costHigh}`);
ok('night auto low == day low (calm price holds)', nightAuto.cost === dayAuto.cost);
ok('night auto high > day high (nights can run higher)', nightAuto.costHigh > dayAuto.costHigh);
ok('night is flagged', night.timeOfDay.night === true);

console.log('\nShort hop ~3km, no metro route passed (both near nothing)');
let s = buildPlans({ driving: { km: 3.0, min: 14 }, transit: null }, {}, 14);
console.log('   verdict:', s.verdict.line);
s.options.forEach(o => console.log(`   - ${o.mode}: ₹${o.cost}, ${o.min} min`));
ok('no metro option when transit null', !s.options.some(o => o.key === 'metro'));
ok('auto cheaper than cab on short hop', s.cheapest.key === 'auto');

console.log('\nBoth ends stranded from stations (long autos each side)');
let b = buildPlans({
  driving: { km: 14, min: 45 },
  transit: {
    boardStation: 'Station A', alightStation: 'Station B', line: 'Green Line',
    metroKm: 6, metroMin: 14,
    originAccessKm: 4.5, originAccessMin: 18,
    destAccessKm: 4.0, destAccessMin: 16,
  },
}, {}, 14);
console.log('   verdict:', b.verdict.line);
ok('flags skip-metro when both ends far', b.verdict.tone === 'skip-metro');

console.log('\nRanges: cab + auto always bracket a busy-time high end');
let rg = buildPlans({ driving: { km: 21.8, min: 62 }, transit: null }, {}, 11, 0);
const cabR = rg.options.find(o => o.key === 'cab');
const autoR = rg.options.find(o => o.key === 'auto');
ok('cab high end sits above the low', cabR.costHigh > cabR.cost);
ok('auto high end sits above the low', autoR.costHigh > autoR.cost);
ok('cab high ≈ 1.4x low', Math.abs(cabR.costHigh - cabR.cost * 1.4) <= 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
