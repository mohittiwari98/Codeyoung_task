import { useEffect, useState } from 'react';
import { api, dayParts } from '../lib.js';
import { Icon, icons, Logo, Spinner } from './ui.jsx';

const card = 'rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,38,42,0.06)] sm:p-5';

function Stat({ label, value, hint }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

// One cell per day: 0 = empty, 1 = half full, max = full. Never colour alone: the number is always shown.
function DayCell({ date, count, max, today }) {
  const p = dayParts(date);
  const tone = count >= max ? 'bg-ink-800 text-white' : count > 0 ? 'bg-brand-300 text-ink-900' : 'bg-ink-50 text-ink-500';
  return (
    <div className="flex flex-col items-center gap-1" title={`${p.weekday} ${p.day} ${p.month}: ${count} of ${max}`}>
      <span className={'text-[10px] font-semibold uppercase ' + (today ? 'text-ink-900' : 'text-ink-500')}>{today ? 'Today' : p.weekday}</span>
      <span className={'grid h-9 w-9 place-items-center rounded-lg text-sm font-bold tabular-nums ' + tone}>{count}</span>
    </div>
  );
}

export default function Dashboard({ onExit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);

  const load = () => {
    setLoading(true);
    return api('/dashboard')
      .then((d) => { setData(d); setError(null); setUpdated(new Date()); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // keep the numbers fresh while the page is open
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-ink-800">Mentor load</span>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Classes per mentor</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500"><Icon d={icons.globe} className="h-4 w-4" />Days are in IST. Each mentor takes at most {data?.max ?? 2} a day.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 disabled:opacity-60">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading && !data && <div className="grid place-items-center gap-3 py-24 text-ink-500" role="status"><Spinner className="h-8 w-8" /><p>Loading…</p></div>}

        {error && (
          <div role="alert" className={card + ' mt-6 flex items-start gap-3 border-rose-300 bg-rose-50 text-rose-900'}>
            <Icon d={icons.alert} className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1"><p className="font-semibold">Couldn't load the dashboard</p><p className="mt-1 text-sm">{error.message}</p></div>
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Today" value={`${data.totals.today} / ${data.totals.capacityPerDay}`} hint="classes booked vs daily capacity" />
              <Stat label="Upcoming" value={data.totals.upcoming} hint="classes still to happen" />
              <Stat label="All time" value={data.totals.all} hint="bookings made" />
              <Stat label="Mentors" value={data.mentors.length} hint={`up to ${data.max} classes each per day`} />
            </div>

            <ul className="mt-6 space-y-3">
              {data.mentors.map((m) => (
                <li key={m.id} className={card + ' flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'}>
                  <div className="min-w-0 lg:w-52">
                    <p className="truncate font-semibold text-ink-900">{m.name}</p>
                    <p className="text-sm text-ink-500">{m.upcoming} upcoming · {m.total} total</p>
                  </div>
                  <div className="flex items-end justify-between gap-1 sm:justify-start sm:gap-3">
                    {data.dates.map((d, i) => <DayCell key={d} date={d} count={m.days[i]} max={data.max} today={i === 0} />)}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
              <span><b className="inline-block h-2.5 w-2.5 rounded bg-ink-50 ring-1 ring-ink-200" /> none</span>
              <span><b className="inline-block h-2.5 w-2.5 rounded bg-brand-300" /> some</span>
              <span><b className="inline-block h-2.5 w-2.5 rounded bg-ink-800" /> full for the day</span>
              {updated && <span className="ml-auto">Updated {updated.toLocaleTimeString()}</span>}
            </p>
          </>
        )}

        <p className="mt-10 text-center text-xs text-ink-500">Counts only, no parent or child details. <button type="button" onClick={onExit} className="font-semibold text-brand-700 hover:underline">Parent booking page</button></p>
      </main>
    </div>
  );
                                                                 }
