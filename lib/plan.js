// The heart of the app: given resolved trip legs (distances + traffic-aware
// times from Google), decide cab vs full-auto vs metro(+auto), rank by money
// and time, and judge whether metro is actually worth it.
//
// Fares use real published Bangalore rates (see DEFAULT_RATES). Street-auto and
// metro fares are close to exact; the cab fare is an estimate calibrated to
// typical Uber/Ola pricing, since their live surge isn't public.
//
// Time-of-day matters: autos charge 1.5x at night (a fixed rule), and cabs
// surge at rush hour — so the cheapest option genuinely flips through the day.

export const DEFAULT_RATES = {
  autoBase: 36,      // ₹ for the first 2 km (Bangalore official, Aug 2025)
  autoPerKm: 18,     // ₹ per km after that
  cabBase: 120,      // ₹ fixed start (estimate; cabs charge a high base + low per-km)
  cabPerKm: 9,       // ₹ per km (calibrated to Uber Go across short + long Bengaluru trips)
  cabSurgeMult: 1.4, // high end of the cab range — apps run ~40% up when demand is high
  autoSurgeMult: 1.25, // high end of the auto range — app autos ride demand too
  cabMinFare: 90,
  cabBookingMin: 4,
  autoSpeed: 17,
  metroOverheadMin: 10,
  walkableKm: 0.8,
  walkSpeed: 4.8,
};

// Day/time context. Autos have a fixed night surcharge (a real rule). Cabs
// don't get a silent multiplier — instead we flag windows where SURGE is
// likely (weekend evenings/nights, weekday rush) and show a range, since the
// actual surge is live demand we can't see.
export function timeFactors(hour, day) {
  const night = hour != null && (hour >= 22 || hour < 5); // 10pm–5am
  // day: 0=Sun … 5=Fri, 6=Sat
  const weekendNight = [5, 6, 0].includes(day) && hour != null && (hour >= 18 || hour < 5);
  const rush = [1, 2, 3, 4, 5].includes(day) && hour != null && ((hour >= 8 && hour < 11) || (hour >= 17 && hour < 21));
  const lateNight = hour != null && (hour >= 23 || hour < 5); // thin supply, cabs run high
  return {
    autoMult: night ? 1.5 : 1,
    night,
    surgeLikely: weekendNight || rush || lateNight,
    surgeReason: weekendNight ? 'weekend night' : rush ? 'rush hour' : lateNight ? 'late night' : null,
  };
}

export function metroFare(km) {
  if (km <= 2) return 10;
  if (km <= 4) return 20;
  if (km <= 6) return 30;
  if (km <= 8) return 40;
  if (km <= 12) return 50;
  if (km <= 18) return 60;
  if (km <= 22) return 70;
  return 80;
}

// Base street-auto fare for `km` (before any night surcharge).
export function autoFare(km, r = DEFAULT_RATES) {
  return Math.round(r.autoBase + r.autoPerKm * Math.max(0, km - 2));
}

function minutesForKm(km, speed) {
  return Math.round((km / speed) * 60);
}

// Short, readable station name — the common name, not Google's long official one.
// "Nadaprabhu Kempegowda Metro Station, Majestic" -> "Majestic"; "Vajarahalli" stays.
function cleanStation(name = '') {
  const s = name.includes(',') ? name.split(',').pop().trim() : name.replace(/\s*metro station\s*/i, '').trim();
  return s || name;
}
// For a leg reached by auto/walk — spell out that the destination is a metro station.
function stationLabel(name) {
  const c = cleanStation(name);
  return /station/i.test(c) ? c : `${c} metro station`;
}

function accessLeg(km, driveMin, r, autoMult) {
  if (km <= r.walkableKm) {
    return { mode: 'walk', km, min: Math.max(1, minutesForKm(km, r.walkSpeed)), cost: 0 };
  }
  const min = driveMin != null ? driveMin : minutesForKm(km, r.autoSpeed);
  return { mode: 'auto', km, min, cost: Math.round(autoFare(km, r) * autoMult) };
}

/**
 * @param {object} trip   { driving:{km,min}, transit:null|{...} }
 * @param {object} rates  overrides for DEFAULT_RATES
 * @param {number} atHour local hour of travel (0-23) for surge logic; null = no surge
 */
export function buildPlans(trip, rates = {}, atHour = null, atDay = null) {
  const r = { ...DEFAULT_RATES, ...rates };
  const { autoMult, night } = timeFactors(atHour, atDay);
  const options = [];

  // 1. Cab, door to door. Always a range: the low end is the calm-conditions
  // price, the high end a busy-time estimate. Live surge isn't public, so rather
  // than guess surge windows (which miss odd spikes) we just bracket the fare.
  const cabLow = Math.max(r.cabMinFare, Math.round(r.cabBase + r.cabPerKm * trip.driving.km));
  options.push({
    key: 'cab',
    mode: 'Cab, door to door',
    cost: cabLow,
    costHigh: Math.round(cabLow * r.cabSurgeMult),
    min: trip.driving.min + r.cabBookingMin,
    costExact: false,
    note: null,
    steps: [{ mode: 'cab', text: `Cab · ${trip.driving.km.toFixed(1)} km` }],
  });

  // 2. Auto, door to door. Metered fare is the low end; app autos ride demand
  // too (seen live), so we add a lighter range on top. Night surcharge still
  // applies to the base before the range.
  const autoLow = Math.round(autoFare(trip.driving.km, r) * autoMult);
  options.push({
    key: 'auto',
    mode: 'Auto, door to door',
    cost: autoLow,
    costHigh: Math.round(autoLow * r.autoSurgeMult),
    min: trip.driving.min,
    costExact: false, // metered base is close, but apps add demand pricing
    note: night ? 'Night surcharge applied (1.5×)' : null,
    steps: [{ mode: 'auto', text: `Auto · ${trip.driving.km.toFixed(1)} km` }],
  });

  // 3. Metro (+ auto/walk access)
  if (trip.transit) {
    const t = trip.transit;
    const inLeg = accessLeg(t.originAccessKm, t.originAccessMin, r, autoMult);
    const outLeg = accessLeg(t.destAccessKm, t.destAccessMin, r, autoMult);
    const usesAuto = inLeg.mode === 'auto' || outLeg.mode === 'auto';
    const cost = inLeg.cost + metroFare(t.metroKm) + outLeg.cost;
    const min = inLeg.min + r.metroOverheadMin + t.metroMin + outLeg.min;

    const steps = [];
    steps.push(inLeg.mode === 'auto'
      ? { mode: 'auto', text: `Auto to ${stationLabel(t.boardStation)} · ${inLeg.km.toFixed(1)} km` }
      : { mode: 'walk', text: `Walk to ${stationLabel(t.boardStation)} · ${Math.round(inLeg.km * 1000)} m` });
    const legs = t.legs || [{ line: t.line, board: t.boardStation, alight: t.alightStation, km: t.metroKm }];
    legs.forEach((lg, idx) => {
      if (idx > 0) steps.push({ mode: 'change', text: `Change at ${cleanStation(lg.board)}` });
      steps.push({ mode: 'metro', line: lg.line, board: cleanStation(lg.board), alight: cleanStation(lg.alight), km: lg.km });
    });
    steps.push(outLeg.mode === 'auto'
      ? { mode: 'auto', text: `Auto to destination · ${outLeg.km.toFixed(1)} km` }
      : { mode: 'walk', text: `Walk to destination · ${Math.round(outLeg.km * 1000)} m` });

    options.push({
      key: 'metro',
      mode: usesAuto ? 'Metro + auto' : 'Just metro',
      cost,
      min,
      costExact: true,
      note: night && usesAuto ? 'Night surcharge on the auto legs' : null,
      fareBreakdown: { metro: metroFare(t.metroKm), autos: inLeg.cost + outLeg.cost },
      steps,
      access: { in: inLeg, out: outLeg },
    });
  }

  const cheapest = options.reduce((a, b) => (b.cost < a.cost ? b : a));
  const fastest = options.reduce((a, b) => (b.min < a.min ? b : a));
  options.forEach((o) => { o.isCheapest = o === cheapest; o.isFastest = o === fastest; });

  return {
    options: options.sort((a, b) => a.min - b.min),
    cheapest, fastest,
    timeOfDay: { night },
    verdict: verdictFor(options, cheapest, fastest, atHour != null && (atHour >= 23 || atHour < 5)),
  };
}

function verdictFor(options, cheapest, fastest, metroClosed) {
  const metro = options.find((o) => o.key === 'metro');
  const cab = options.find((o) => o.key === 'cab');
  const auto = options.find((o) => o.key === 'auto');

  if (!metro) {
    const road = cab.cost <= auto.cost ? 'cab' : 'auto';
    if (metroClosed) return { tone: 'skip-metro', line: `Metro's shut at this hour — ${road} is your cheapest bet.` };
    return { tone: 'skip-metro', line: `Road trip — ${road} is your cheapest bet.` };
  }

  const saving = cab.cost - metro.cost;
  const timeCost = metro.min - fastest.min;
  const fastName = fastest.key === 'cab' ? 'a cab' : fastest.key === 'auto' ? 'an auto' : 'the fastest';

  const bothAuto = metro.access && metro.access.in.mode === 'auto' && metro.access.out.mode === 'auto';
  if (bothAuto && metro.access.in.km > 3 && metro.access.out.km > 3) {
    return { tone: 'skip-metro', line: `Stations too far at both ends — just cab it.` };
  }

  if (cheapest === fastest) {
    return { tone: 'clear', line: `${cheapest.mode}: cheapest and fastest.` };
  }
  if (metro.isCheapest && timeCost <= 10) {
    return { tone: 'take-metro', line: `Take the metro — ₹${saving} cheaper, just ${timeCost} min slower than ${fastName}.` };
  }
  if (metro.isCheapest && saving < 60) {
    return { tone: 'skip-metro', line: `Skip metro — only ₹${saving} off for ${timeCost} min more than ${fastName}. Cab it.` };
  }
  if (metro.isCheapest) {
    return { tone: 'tradeoff', line: `Metro: ₹${saving} cheaper, ${timeCost} min slower than ${fastName} — worth it if you're not rushing.` };
  }
  return { tone: 'clear', line: `${cheapest.mode} cheapest, ${fastest.mode} fastest.` };
}
