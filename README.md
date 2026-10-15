# FareWise

> Cab, auto, or metro? FareWise weighs cost and time, and makes the call so you don't open four apps to decide.

**[Live demo](https://tryfarewise.vercel.app)**  ·  **[Architecture](architecture.md)**  ·  Bangalore only

---

## What is it

FareWise answers one everyday Bangalore question: what is the cheapest and fastest way to get from A to B right now, by cab, by auto, or by metro plus a short auto or walk.

The catch is always the last mile: the metro is cheap, but there's a walk or an auto from the station at each end, and no app adds that up. Each app shows only its own option and leaves the cost-versus-time math to you. FareWise does that math across all three with live Google data, and tells you which is cheapest, which is fastest, and when to leave. Google Maps still handles the navigation; FareWise makes the call.

## How it works

1. **Enter your trip.** A start, a destination, and when you need to be there.
2. **FareWise resolves it.** Google returns the road distance, live-traffic drive time, and the metro route (which station to board, where to change, where to get down).
3. **It works out the money.** Auto and metro fares use official Bangalore rates, including the autos to and from the station. Cab and auto are shown as a range, since live app surge is not public.
4. **You get a ranked answer.** Cab vs auto vs metro-plus-auto, each with its fare, door-to-door time, and a leave-by time. Cheapest and fastest are flagged. Tap through to Google Maps for directions.

## Why I built this

No app compares across cab, auto, and metro, or prices in the last-mile autos that make or break the metro option. FareWise is the small tool that does, so the decision fits on one screen instead of four.

It is also a portfolio piece: a real, shipped product built on live data, tested against actual Uber and auto fares, with honest handling of the one thing it cannot know, surge.

## Tech stack

- **Frontend:** Next.js 14 (App Router) and React 18
- **Backend:** Node serverless API routes on Vercel, keeping the Google key off the browser
- **Data & APIs:** Google Maps Platform (Routes API for traffic-aware driving and metro transit, Geocoding, and Places API New), plus computed Bangalore auto and metro fares
- **Core logic:** a pure, unit-tested decision engine (`lib/plan.js`), separate from UI and network code

See **[architecture.md](architecture.md)** for the request flow, the fare engine, and a component map.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your GOOGLE_MAPS_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # run the engine's unit tests
```

You need a Google Maps Platform key with **Routes**, **Geocoding**, and **Places (New)** enabled (billing on, which the free monthly credit covers). Deployed free on Vercel: add `GOOGLE_MAPS_API_KEY` as an environment variable, and every push auto-deploys.

## Known limits

- **Cab fare is an estimate.** Real Uber and Ola surge is not public, so the high end of the range is a best guess, not a promise.
- **Metro parsing follows Google's transit route.** Unusual multi-transfer trips may label a line loosely.
- Distances and fares are close enough to decide on, not billing-accurate.

---

Built by **Anvita**, as a weekend side-project because deciding cab vs metro in Bangalore shouldn't take four apps and mental math. [LinkedIn](https://www.linkedin.com/in/anvitakodru/) · [X](https://x.com/vitamaybe)
