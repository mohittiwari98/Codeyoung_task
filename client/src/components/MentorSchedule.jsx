import { useEffect, useState } from 'react';
import { api, initials, longDate } from '../lib.js';
import { Icon, icons, Logo, Spinner } from './ui.jsx';

const card = 'rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,38,42,0.06)] sm:p-5';

// Shows "2 of 2" as filled pips so the daily cap is visible at a glance.
function Load({ count, max }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${count} of ${max} classes`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={'h-2.5 w-2.5 rounded-full ' + (i < count ? 'bg-brand-400' : 'bg-ink-200')} />
      ))}
      <span className="ml-1 text-sm font-semibold text-ink-700">{count} of {max}</span>
    </span>
  );
}

function dayLabel(date, today) {
  if (date === today) return 'Today';
  const d = new Date(date + 'T00:00:00Z'), t = new Date(today + 'T00:00:00Z');
  return Math.round((d - t) / 864e5) === 1 ? 'Tomorrow' : null;
}

function Row({ b }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <p className="w-[5.5rem] shrink-0 text-xl font-bold tabular-nums text-ink-900">{b.time}</p>
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{b.childName} <span className="font-normal text-ink-500">· age {b.childAge}</span></p>
          <p className="text-sm text-ink-600">Parent: {b.parentName}</p>
          <p className="mt-0.5 text-xs text-ink-500">Parent's time: {b.parentTime}</p>
        </div>
      </div>
      <a href={b.link} target="_blank" rel="noreferrer" className="btn-brand px-4 py-2.5 text-sm sm:shrink-0">Join class</a>
    </li>
  );
}

export default function MentorSchedule({ token, onExit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setError(null);
    return api(`/mentor/${token}/schedule`).then(setData).catch((e) => setError(e)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [token]);

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-ink-800">Mentor schedule</span>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-10">
        {loading && !data && (
          <div className="grid place-items-center gap-3 py-24 text-ink-500" role="status"><Spinner className="h-8 w-8" /><p>Loading your classes…</p></div>
        )}

        {error && (
          <div role="alert" className={card + ' flex items-start gap-3 border-rose-300 bg-rose-50 text-rose-900'}>
            <Icon d={icons.alert} className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{error.code === 'NOT_FOUND' ? 'Schedule not found' : "Couldn't load your schedule"}</p>
              <p className="mt-1 text-sm">{error.message}</p>
              {error.code !== 'NOT_FOUND' && <button type="button" onClick={load} className="mt-3 text-sm font-semibold underline">Try again</button>}
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-orange-logo text-lg font-bold text-ink-900">{initials(data.mentor.name)}</span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink-900">Hi {data.mentor.name.split(' ')[0]}</h1>
                <p className="flex items-center gap-1.5 text-sm text-ink-500"><Icon d={icons.globe} className="h-4 w-4" />Times shown in <b>{data.mentor.tzAbbr}</b></p>
              </div>
              <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 disabled:opacity-60">
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div className={card + ' mt-6 flex items-center justify-between'}>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Today's load</p><p className="mt-0.5 text-sm text-ink-600">Up to {data.max} trial classes a day</p></div>
              <Load count={data.today.count} max={data.max} />
            </div>

            {data.days.length === 0 ? (
              <div className={card + ' mt-6 py-12 text-center'}>
                <p className="text-lg font-semibold text-ink-800">No upcoming classes</p>
                <p className="mt-1 text-sm text-ink-500">When a parent books you, the class will show up here and in your email.</p>
              </div>
            ) : data.days.map((d) => (
              <section key={d.date} className="mt-8" aria-labelledby={`d-${d.date}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 id={`d-${d.date}`} className="text-lg font-semibold text-ink-800">
                    {dayLabel(d.date, data.today.date) && <span className="mr-2 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-800">{dayLabel(d.date, data.today.date)}</span>}
                    {longDate(d.date)}
                  </h2>
                  <Load count={d.count} max={data.max} />
                </div>
                <ul className={card + ' divide-y divide-ink-100'}>{d.bookings.map((b) => <Row key={b.id} b={b} />)}</ul>
              </section>
            ))}
          </>
        )}

        <p className="mt-10 text-center text-xs text-ink-500">This private link shows your classes only. Keep it to yourself. <button type="button" onClick={onExit} className="font-semibold text-brand-700 hover:underline">Parent booking page</button></p>
      </main>
    </div>
  );
                    }
