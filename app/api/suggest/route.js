import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?q=... -> address suggestions (Places Autocomplete, New), biased to Bangalore.
// Proxied through the server so the key is never exposed in the browser.
export async function GET(req) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ suggestions: [] });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ['in'],
        locationBias: {
          circle: { center: { latitude: 12.9716, longitude: 77.5946 }, radius: 50000 },
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ suggestions: [], error: data?.error?.message || 'suggest failed' });

    const suggestions = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        sec: p.structuredFormat?.secondaryText?.text || '',
      }))
      .filter((s) => s.placeId);

    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ suggestions: [], error: e.message });
  }
}
