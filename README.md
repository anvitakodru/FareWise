# FareWise

Tells you the **cheapest vs fastest** way across Bangalore — cab, auto, or metro + auto — with the fare, the live-traffic time, and when to leave. It makes the call Google Maps won't: *is the metro actually worth it, or just cab it?*

## How it works

- **Decision + fares** (`lib/plan.js`) — pure logic, unit-tested. Auto and metro fares are computed from standard Bangalore rates; the cab fare is an estimate.
- **Live data** (`lib/google.js`) — Google Routes API gives real road distance, traffic-aware drive time, and the metro route (which station to board, where to get down). The key stays server-side.
- **UI** (`app/page.jsx`) — type two places + an arrive-by time, get ranked options with a plan summary.

Google gives the *minutes*; this app gives the *money and the judgement*.

## Run it locally

1. **Install**
   ```bash
   npm install
   ```
2. **Add your Google key** — copy `.env.example` to `.env.local` and paste your key:
   ```bash
   cp .env.example .env.local
   # then edit .env.local
   ```
3. **Start**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

Run the logic tests any time with `npm test`.

## Getting a Google Maps key (~5 min)

1. Go to https://console.cloud.google.com and sign in.
2. Create a project (top bar → **New Project**).
3. **Enable billing** (Billing → link a card). Google gives a monthly free credit that covers all your dev use — you won't be charged for testing, but a card is required.
4. Enable three APIs: APIs & Services → Library → search and **Enable** each of:
   - **Routes API** (traffic-aware routing)
   - **Geocoding API** (fallback location lookup)
   - **Places API (New)** (the type-ahead address suggestions)
5. Create the key: APIs & Services → **Credentials** → Create credentials → **API key** → copy it.
6. (Recommended) Restrict the key to the Directions API.
7. Paste it into `.env.local` as `GOOGLE_MAPS_API_KEY`.

## Deploy (Vercel, free)

1. Push this repo to GitHub.
2. Go to https://vercel.com, **Import** the repo.
3. Add an environment variable `GOOGLE_MAPS_API_KEY` with your key.
4. Deploy. You get a live URL.

## Known limits (v1)

- **Cab fare is an estimate** — real Uber/Ola surge isn't public, so it can run higher.
- **Metro parsing** follows Google's transit route; odd multi-transfer trips may label the line loosely.
- Distances/fares are "close enough to decide," not billing-accurate.
