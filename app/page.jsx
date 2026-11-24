'use client';
import { useState, useRef, useEffect } from 'react';

const ICON = { walk: '🚶', auto: '🛺', metro: '🚇', cab: '🚕' };

function clock(unixSec) {
  const d = new Date(unixSec * 1000);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

// Address box with a Places Autocomplete dropdown.
function AddressInput({ id, label, value, onChange, placeholder }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    function away(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  function type(text) {
    onChange({ text, placeId: null }); // typing clears any pinned place
    clearTimeout(timer.current);
    if (text.trim().length < 3) { setList([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(text)}`);
        const data = await res.json();
        setList(data.suggestions || []);
        setOpen((data.suggestions || []).length > 0);
        setActive(-1);
      } catch { setList([]); }
    }, 220);
  }

  function pick(s) {
    onChange({ text: s.main + (s.sec ? `, ${s.sec}` : ''), placeId: s.placeId });
    setOpen(false); setList([]);
  }

  function keydown(e) {
    if (!open || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="field full">
      <label htmlFor={id}>{label}</label>
      <div className="ac" ref={boxRef}>
        <input
          id={id} value={value.text} placeholder={placeholder} autoComplete="off"
          onChange={(e) => type(e.target.value)} onKeyDown={keydown}
          onFocus={() => list.length && setOpen(true)}
        />
        {open && (
          <div className="ac-list" role="listbox">
            {list.map((s, i) => (
              <div key={s.placeId} className="ac-item" role="option" aria-selected={i === active}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
                <div className="main">{s.main}</div>
                {s.sec && <div className="sec">{s.sec}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [from, setFrom] = useState({ text: 'Koramangala 5th Block', placeId: null });
  const [to, setTo] = useState({ text: 'Whitefield, ITPL', placeId: null });
  const [arriveBy, setArriveBy] = useState('09:00');
  const [rates, setRates] = useState({ autoBase: 36, autoPerKm: 18, cabBase: 40, cabPerKm: 13, cabMinFare: 60 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function plan(e) {
    e?.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: from.text, originPlaceId: from.placeId,
          destination: to.text, destPlaceId: to.placeId,
          arriveBy, rates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not plan that trip.');
      setResult(data);
    } catch (err) { setError(err.message); setResult(null); }
    finally { setLoading(false); }
  }

  const setRate = (k) => (e) => setRates((r) => ({ ...r, [k]: parseFloat(e.target.value) || 0 }));

  return (
    <main className="wrap">
      <h1>Should I metro it or just book a cab?</h1>
      <p className="sub">
        Where you're going and by when. It works out <b>cab</b> vs <b>metro + auto</b> vs{' '}
        <b>full auto</b> — the fare, the time with live traffic, and when to leave. Bangalore only.
      </p>

      <form className="panel" onSubmit={plan}>
        <div className="grid">
          <AddressInput id="from" label="From" value={from} onChange={setFrom} placeholder="Start typing an area or landmark" />
          <AddressInput id="to" label="To" value={to} onChange={setTo} placeholder="Start typing an area or landmark" />
          <div className="field full">
            <label htmlFor="by">Need to be there by</label>
            <input id="by" type="time" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} />
          </div>
          <button className="go" type="submit" disabled={loading}>
            {loading ? 'Working it out…' : 'Find my best way'}
          </button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (() => {
        const nowSec = Date.now() / 1000;
        const target = clock(result.arriveBy);
        const fastArr = nowSec + result.fastest.min * 60;
        const willMiss = fastArr > result.arriveBy + 60;
        const missLate = Math.round((fastArr - result.arriveBy) / 60);

        function leaveInfo(min) {
          const leaveBy = result.arriveBy - min * 60;
          if (leaveBy >= nowSec) return { onTime: true, t: clock(leaveBy) };
          const arrival = nowSec + min * 60;
          return { onTime: false, t: clock(arrival), late: Math.max(0, Math.round((arrival - result.arriveBy) / 60)) };
        }

        return (
          <>
            <div className={`verdict ${result.verdict.tone}`}>{result.verdict.line}</div>
            {willMiss && (
              <div className="heads">
                Too late to arrive by {target}. Leave now and the fastest option gets you there ~{clock(fastArr)}
                {missLate > 0 ? `, about ${missLate} min late` : ''}.
              </div>
            )}
            <p className="route-line">{result.origin} &nbsp;→&nbsp; {result.destination} · ~{result.roadKm.toFixed(1)} km by road</p>
            <div className="cards">
              {result.options.map((o) => {
                const li = leaveInfo(o.min);
                return (
                  <div key={o.key} className={`card${o.isCheapest ? ' cheapest' : ''}${o.isFastest ? ' fastest' : ''}`}>
                    <div className="card-top">
                      <div className="mode">{o.mode}</div>
                      <div className="flags">
                        {o.isCheapest && <span className="flag cheap">cheapest</span>}
                        {o.isFastest && <span className="flag fast">fastest</span>}
                      </div>
                    </div>
                    <div className="metrics">
                      <div className="metric"><div className="n">₹{o.cost}</div><div className="k">{o.costExact ? 'fare' : 'fare (est.)'}</div></div>
                      <div className="metric"><div className="n">{o.min}<small> min</small></div><div className="k">door to door</div></div>
                      {li.onTime
                        ? <div className="metric"><div className="n leave">{li.t}</div><div className="k">leave by</div></div>
                        : <div className="metric"><div className="n late">leave now</div><div className="k">reach ~{li.t}{li.late > 0 ? ` · ${li.late}m late` : ''}</div></div>}
                    </div>
                    <div className="steps">
                      {o.steps.map((s, i) => (
                        <div key={i} className={`step ${s.mode}`}><span className="ic">{ICON[s.mode]}</span><span>{s.text}</span></div>
                      ))}
                    </div>
                    {o.note && <div className="est">{o.note}.</div>}
                    {o.key === 'cab' && <div className="est">Cab fare is an estimate — live Uber/Ola surge can push it higher.</div>}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <details>
        <summary>Fares used (tweak if yours differ)</summary>
        <div className="assume">
          <div className="arow"><span>Auto base<small>first 2 km · official ₹36</small></span><input type="number" value={rates.autoBase} onChange={setRate('autoBase')} /></div>
          <div className="arow"><span>Auto per km<small>after 2 km · official ₹18</small></span><input type="number" value={rates.autoPerKm} onChange={setRate('autoPerKm')} /></div>
          <div className="arow"><span>Cab base<small>booking + first km</small></span><input type="number" value={rates.cabBase} onChange={setRate('cabBase')} /></div>
          <div className="arow"><span>Cab per km</span><input type="number" value={rates.cabPerKm} onChange={setRate('cabPerKm')} /></div>
          <div className="arow"><span>Cab minimum fare</span><input type="number" value={rates.cabMinFare} onChange={setRate('cabMinFare')} /></div>
        </div>
      </details>

      <p className="foot">
        <b>Times use live Google traffic.</b> Auto and metro fares use official Bangalore rates (autos add a 1.5× night
        surcharge, 10pm–5am); the cab fare is an estimate with a rough rush-hour bump, since live Uber/Ola surge isn't
        public. This decides and plans — for turn-by-turn, open the leg in Google Maps.
        <span style={{ opacity: 0.45 }}> · build: shortest-route-fix</span>
      </p>
    </main>
  );
}
