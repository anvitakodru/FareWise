import { NextResponse } from 'next/server';
import { resolveTrip } from '../../../lib/google.js';
import { buildPlans } from '../../../lib/plan.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { origin, destination, arriveBy: "HH:MM", rates? } -> ranked plans
export async function POST(req) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'Server is missing GOOGLE_MAPS_API_KEY. Add it to .env.local (see README).' },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { origin, originPlaceId, destination, destPlaceId, arriveBy, rates } = body || {};
  if (!origin || !destination) {
    return NextResponse.json({ error: 'Enter both a start and a destination.' }, { status: 400 });
  }

  // Next occurrence of HH:MM in IST (the app is Bangalore-only).
  const { unix: arriveByUnix, hour, day, passed, tomorrow } = nextTimeIST(arriveBy || '09:00');
  if (passed) {
    return NextResponse.json({ error: "That time's already gone. Pick a time later than now." }, { status: 400 });
  }

  try {
    const trip = await resolveTrip({ origin, originPlaceId, destination, destPlaceId }, arriveByUnix, key);
    // Live rain and live traffic only mean something for a trip starting soon.
    // Arriving more than 3h from now = planning ahead: drop today's rain, flag it.
    const ahead = arriveByUnix - Math.floor(Date.now() / 1000) > 3 * 3600;
    if (ahead) trip.rain = null;
    const result = buildPlans(trip, rates || {}, hour, day);
    return NextResponse.json({
      origin: trip.originText,
      destination: trip.destText,
      roadKm: trip.driving.km,
      arriveBy: arriveByUnix,
      rain: trip.rain || null,
      ahead: ahead ? (tomorrow ? 'tomorrow' : 'later') : null,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not plan that trip.' }, { status: 502 });
  }
}

// Next occurrence of HH:MM in IST, returned as an absolute unix time + the IST hour.
// (The server may run in UTC, so we do the wall-clock math in IST explicitly.)
function nextTimeIST(hhmm) {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const IST = 5.5 * 3600 * 1000;
  const istNow = new Date(Date.now() + IST);     // a Date whose UTC fields read as IST
  const target = new Date(istNow);
  target.setUTCHours(h, m, 0, 0);
  // More than 2h in the past means the next day (at 11pm, "9:00 AM" = tomorrow).
  // Anything that passed within the last 2h is a time that's already gone: flag it.
  const tomorrow = target.getTime() <= istNow.getTime() - 2 * 3600 * 1000;
  if (tomorrow) target.setUTCDate(target.getUTCDate() + 1);
  const passed = target.getTime() < istNow.getTime();
  // getUTCDay on this IST-shifted date gives the IST weekday (0=Sun … 6=Sat).
  return { unix: Math.floor((target.getTime() - IST) / 1000), hour: h, day: target.getUTCDay(), passed, tomorrow };
}
