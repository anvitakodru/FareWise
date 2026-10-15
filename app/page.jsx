'use client';
import { useState, useRef, useEffect } from 'react';

const ICON = { walk: '🚶', auto: '🛺', metro: '🚇', cab: '🚕', change: '🔁' };

// Bangalore metro line colours, the way the metro map shows them.
const LINE_COLORS = {
  green: ['#12883f', '#fff'], purple: ['#7b2fbe', '#fff'], yellow: ['#f4c20d', '#1a1a1a'],
  blue: ['#1a73e8', '#fff'], pink: ['#d81b60', '#fff'], red: ['#d93025', '#fff'], orange: ['#e8710a', '#fff'],
};
function lineStyle(name = '') {
  const k = Object.keys(LINE_COLORS).find((c) => name.toLowerCase().includes(c));
  const [bg, fg] = LINE_COLORS[k] || ['#5a6a63', '#fff'];
  return { background: bg, color: fg };
}

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

const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
function TimePicker({ value, onChange }) {
  const [h24, m] = value.split(':').map(Number);
  const ap = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 || 12;
  const mm = MINUTES.includes(m) ? m : 0;
  function set(nh12, nm, nap) {
    let H = nh12 % 12;
    if (nap === 'PM') H += 12;
    onChange(`${String(H).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
  }
  return (
    <div className="timepick">
      <select aria-label="Hour" value={h12} onChange={(e) => set(+e.target.value, mm, ap)}>
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span>:</span>
      <select aria-label="Minute" value={mm} onChange={(e) => set(h12, +e.target.value, ap)}>
        {MINUTES.map((x) => <option key={x} value={x}>{String(x).padStart(2, '0')}</option>)}
      </select>
      <select aria-label="AM or PM" value={ap} onChange={(e) => set(h12, mm, e.target.value)}>
        <option>AM</option><option>PM</option>
      </select>
    </div>
  );
}

function ThemeToggle() {
  const [mode, setMode] = useState('light');
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('fw-theme'); } catch {}
    const sys = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const m = saved === 'light' || saved === 'dark' ? saved : sys;
    setMode(m);
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  }, []);
  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setMode(next);
    try { localStorage.setItem('fw-theme', next); } catch {}
  }
  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label="Switch between light and dark">
      {mode === 'dark' ? '☀ Light' : '☾ Dark'}
    </button>
  );
}

export default function Home() {
  const [from, setFrom] = useState({ text: 'Koramangala 5th Block', placeId: null });
  const [to, setTo] = useState({ text: 'Whitefield, ITPL', placeId: null });
  const [arriveBy, setArriveBy] = useState('09:00');
  const [rates, setRates] = useState({ autoBase: 36, autoPerKm: 18, cabBase: 120, cabPerKm: 9, cabMinFare: 90 });
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
      <div className="topbar"><ThemeToggle /></div>
      <h1>Should I metro it or just book a cab?</h1>
      <p className="sub">
        Stop juggling four apps to decide. FareWise works out <b>cab</b> vs <b>metro + auto</b> vs <b>full auto</b> and
        helps you pick your best option. Bangalore only.
      </p>

      <form className="panel" onSubmit={plan}>
        <div className="grid">
          <AddressInput id="from" label="From" value={from} onChange={setFrom} placeholder="Start typing an area or landmark" />
          <AddressInput id="to" label="To" value={to} onChange={setTo} placeholder="Start typing an area or landmark" />
          <div className="field full">
            <label>Need to be there by</label>
            <TimePicker value={arriveBy} onChange={setArriveBy} />
          </div>
          <button className="go" type="submit" disabled={loading}>
            {loading ? 'Working it out…' : 'Find my best option'}
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
            <p className="route-line">~{result.roadKm.toFixed(1)} km by road</p>
            {!result.options.some((o) => o.key === 'metro') && (
              <div className="nometro">🚇 No metro for this trip — there's no line that connects these two ends, so it's auto vs cab.</div>
            )}
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
                      <div className="metric"><div className="n">₹{o.cost}{o.costHigh ? `–${o.costHigh}` : ''}</div><div className="k">{o.costExact ? 'fare' : 'fare (est.)'}</div></div>
                      <div className="metric"><div className="n">{o.min}<small> min</small></div><div className="k">door to door</div></div>
                      {li.onTime
                        ? <div className="metric"><div className="n leave">{li.t}</div><div className="k">leave by</div></div>
                        : <div className="metric"><div className="n late">leave now</div><div className="k">reach ~{li.t}{li.late > 0 ? ` · ${li.late}m late` : ''}</div></div>}
                    </div>
                    {o.fareBreakdown && <div className="breakdown"><b>₹{o.fareBreakdown.metro}</b> metro + <b>₹{o.fareBreakdown.autos}{o.fareBreakdown.autosHigh ? `–${o.fareBreakdown.autosHigh}` : ''}</b> autos <span className="km">(est.)</span></div>}
                    <div className="steps">
                      {o.steps.map((s, i) => (
                        <div key={i} className={`step ${s.mode}`}>
                          <span className="ic">{ICON[s.mode]}</span>
                          {s.mode === 'metro'
                            ? <span><span className="line-pill" style={lineStyle(s.line)}>{s.line}</span> {s.board} → {s.alight} <span className="km">· {s.km.toFixed(1)} km</span></span>
                            : <span>{s.text}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <a className="maps-cta" target="_blank" rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(result.origin)}&destination=${encodeURIComponent(result.destination)}`}>
              Picked one? Get directions in Google Maps ↗
            </a>
          </>
        );
      })()}

      <details>
        <summary>Fares used (tweak if yours differ)</summary>
        <div className="assume">
          <div className="arow"><span>Auto base<small>first 2 km · official ₹36</small></span><input type="number" value={rates.autoBase} onChange={setRate('autoBase')} /></div>
          <div className="arow"><span>Auto per km<small>after 2 km · official ₹18</small></span><input type="number" value={rates.autoPerKm} onChange={setRate('autoPerKm')} /></div>
          <div className="arow"><span>Cab base<small>fixed start — cabs charge high base, low per-km</small></span><input type="number" value={rates.cabBase} onChange={setRate('cabBase')} /></div>
          <div className="arow"><span>Cab per km</span><input type="number" value={rates.cabPerKm} onChange={setRate('cabPerKm')} /></div>
          <div className="arow"><span>Cab minimum fare</span><input type="number" value={rates.cabMinFare} onChange={setRate('cabMinFare')} /></div>
        </div>
      </details>

      <p className="foot">
        <b>Times use live Google traffic.</b> Metro fare is exact; autos add a 1.5× night surcharge (10pm–5am). Cab and
        auto are shown as a range. Apps charge more when demand is high, and live surge isn't public, so the higher
        number is a busy-time estimate, not a promise.
      </p>

      <p className="spite">
        Not affiliated with anyone; numbers are best educated guesses. A spite-fueled weekend build by Anvita ·{' '}
        <a href="https://www.linkedin.com/in/anvitakodru/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        {' · '}
        <a href="https://x.com/vitamaybe" target="_blank" rel="noopener noreferrer">X</a>
      </p>
    </main>
  );
}
