// Turns two addresses + an arrive-by time into the numbers lib/plan.js needs.
// Uses Google Geocoding (to pin the exact place, biased to Bengaluru) + the
// Routes API (traffic-aware driving + metro routing). The key lives here, on
// the server, never in the browser.

const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';

// Bengaluru bounding box (SW | NE) so "Zudio HSR" resolves here, not elsewhere.
const BLR_BOUNDS = '12.80,77.45|13.16,77.78';

function biasCity(q) {
  return /beng|bangalore|bengaluru/i.test(q) ? q : `${q}, Bengaluru`;
}

function durMin(s) {
  if (!s) return 0;
  return Math.round(parseInt(String(s).replace('s', ''), 10) / 60);
}

async function geocode(address, key) {
  const url = `${GEOCODE}?${new URLSearchParams({
    address: biasCity(address),
    region: 'in',
    bounds: BLR_BOUNDS,
    key,
  })}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`Couldn't find "${address}". Try adding an area or landmark.`);
  }
  const top = data.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted: top.formatted_address,
  };
}

// Resolve a Places Autocomplete placeId to an exact point (Place Details, New).
async function placeDetails(placeId, key) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location,formattedAddress' },
  });
  const data = await res.json();
  if (!res.ok || !data.location) throw new Error('Could not resolve the selected place.');
  return { lat: data.location.latitude, lng: data.location.longitude, formatted: data.formattedAddress };
}

async function computeRoutes(body, fieldMask, key) {
  const res = await fetch(ROUTES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Routes request failed (${res.status})`);
    err.status = data?.error?.status;
    throw err;
  }
  return data.routes || [];
}

const durSec = (s) => parseInt(String(s || '0s').replace('s', ''), 10) || 0;

const point = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

// Point the driving lookup at the arrive-by time, clamped to the future. Google
// returns predicted/typical traffic for a future departure and live traffic when
// it's near-now, so this keeps the drive time consistent with the fares and the
// metro, which already use the arrive-by time (instead of always asking for "now").
function driveDepartureISO(arriveByUnix) {
  const soonest = Date.now() + 60 * 1000;
  const target = arriveByUnix ? arriveByUnix * 1000 : soonest;
  return new Date(Math.max(soonest, target)).toISOString();
}

function isRail(step) {
  const v = step.transitDetails?.transitLine?.vehicle?.type;
  return ['SUBWAY', 'HEAVY_RAIL', 'METRO_RAIL', 'RAIL', 'MONORAIL', 'TRAM', 'LIGHT_RAIL'].includes(v);
}

function parseTransit(route) {
  const leg = route?.legs?.[0];
  if (!leg) return null;
  const steps = leg.steps || [];
  const km = (m) => (m || 0) / 1000;

  // Each separate rail ride is its own leg; a line change shows up as its own entry.
  const railIdxs = steps.map((s, i) => (s.travelMode === 'TRANSIT' && isRail(s) ? i : -1)).filter((i) => i >= 0);
  if (!railIdxs.length) return null;

  const firstT = railIdxs[0];
  const lastT = railIdxs[railIdxs.length - 1];

  let originAccessKm = 0, destAccessKm = 0;
  steps.forEach((s, i) => {
    if (i < firstT) originAccessKm += s.distanceMeters || 0;
    else if (i > lastT) destAccessKm += s.distanceMeters || 0;
  });

  // Walk between firstT and lastT (platform transfers) counts toward time, not metro distance.
  const legs = [];
  let railMeters = 0, totalSec = 0;
  for (let i = firstT; i <= lastT; i++) {
    const s = steps[i];
    totalSec += durSec(s.staticDuration);
    if (s.travelMode === 'TRANSIT' && isRail(s)) {
      const td = s.transitDetails;
      legs.push({
        line: td?.transitLine?.name || td?.transitLine?.nameShort || 'Metro',
        board: td?.stopDetails?.departureStop?.name || 'station',
        alight: td?.stopDetails?.arrivalStop?.name || 'station',
        km: km(s.distanceMeters),
      });
      railMeters += s.distanceMeters || 0;
    }
  }

  return {
    legs,
    boardStation: legs[0].board,
    alightStation: legs[legs.length - 1].alight,
    line: legs[0].line,
    metroKm: km(railMeters),
    metroMin: Math.round(totalSec / 60),
    originAccessKm: km(originAccessKm),
    originAccessMin: null,
    destAccessKm: km(destAccessKm),
    destAccessMin: null,
  };
}

// sel: { origin, originPlaceId, destination, destPlaceId }
// A placeId (from the autocomplete dropdown) pins the exact spot; plain text
// falls back to a Bengaluru-biased geocode.
export async function resolveTrip(sel, arriveByUnix, key) {
  const [o, d] = await Promise.all([
    sel.originPlaceId ? placeDetails(sel.originPlaceId, key) : geocode(sel.origin, key),
    sel.destPlaceId ? placeDetails(sel.destPlaceId, key) : geocode(sel.destination, key),
  ]);

  const driveRoutes = await computeRoutes(
    {
      origin: point(o),
      destination: point(d),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      departureTime: driveDepartureISO(arriveByUnix),
      languageCode: 'en',
      computeAlternativeRoutes: true,
    },
    'routes.duration,routes.distanceMeters',
    key,
  );
  if (!driveRoutes.length) throw new Error('No driving route found between those two places.');
  // Mirror Google Maps' "Best": among the routes within ~2 min of the fastest,
  // take the shortest distance — so a 7 km detour that's only a minute quicker loses.
  const fastestSec = driveRoutes.reduce((m, r) => Math.min(m, durSec(r.duration)), Infinity);
  const best = driveRoutes
    .filter((r) => durSec(r.duration) <= fastestSec + 120)
    .reduce((a, b) => ((b.distanceMeters || Infinity) < (a.distanceMeters || Infinity) ? b : a));
  const driving = { km: (best.distanceMeters || 0) / 1000, min: durMin(best.duration) };

  // Transit, timed to arrive by the deadline, forced to prefer rail over buses.
  let transit = null;
  try {
    const transitRoutes = await computeRoutes(
      {
        origin: point(o),
        destination: point(d),
        travelMode: 'TRANSIT',
        arrivalTime: new Date(arriveByUnix * 1000).toISOString(),
        languageCode: 'en',
        transitPreferences: { allowedTravelModes: ['SUBWAY', 'TRAIN', 'LIGHT_RAIL', 'RAIL'] },
      },
      'routes.legs.steps.travelMode,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails',
      key,
    );
    transit = parseTransit(transitRoutes[0]);
  } catch (e) {
    console.warn('transit lookup:', e.message);
    transit = null;
  }

  return { driving, transit, originText: o.formatted, destText: d.formatted };
}
