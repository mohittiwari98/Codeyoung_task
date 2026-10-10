import { useEffect, useRef, useState } from 'react';
import { api, detectTz, longDate, parseMentorRoute, parseRoute, prettyZone, todayIn, ZONES } from './lib.js';
import { BlockMark, Icon, icons, Logo, Stepper } from './components/ui.jsx';
import DateStrip from './components/DateStrip.jsx';
import Slots, { EmptyDay, SlotsSkeleton } from './components/Slots.jsx';
import DetailsForm from './components/DetailsForm.jsx';
import Success from './components/Success.jsx';
import Classroom from './components/Classroom.jsx';
import MentorSchedule from './components/MentorSchedule.jsx';

const PERKS = [
  [icons.clock, '30 minutes, one to one', 'A short live session just for your child'],
  [icons.user, 'A mentor matched for you', 'No forms to fill in beyond your details'],
  [icons.globe, 'Times in your time zone', 'Mentors are in India; we do the conversion'],
  [icons.mail, 'Confirmation by email', 'The class link goes to you and the mentor'],
];

export default function App() {
  const detected = detectTz();
  const [tz, setTz] = useState(detected);
  const [date, setDate] = useState(todayIn(detected));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', childName: '', childAge: '' });
  const [notice, setNotice] = useState(null); // { kind: 'warn' | 'error', text }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const formRef = useRef(null);
  const reqId = useRef(0);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // Load slots; ignore out-of-date responses if the person clicks around quickly.
  const load = () => {
    const id = ++reqId.current;
    setLoading(true);
    return api(`/slots?date=${date}&tz=${encodeURIComponent(tz)}`)
      .then((d) => { if (id === reqId.current) setData(d); })
      .catch((e) => { if (id === reqId.current) { setData(null); setNotice({ kind: 'error', text: e.message }); } })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  };

  useEffect(() => {
    setSel(null);
    load();
  }, [date, tz]);

  // If the time zone change makes the chosen date "yesterday", move to today.
  useEffect(() => { const t = todayIn(tz); if (date < t) setDate(t); }, [tz]);

  function pick(s) {
    setSel(s);
    setNotice(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  async function submit() {
    setBusy(true); setNotice(null);
    try {
      const res = await api('/bookings', { method: 'POST', body: JSON.stringify({ ...form, tz, startUtc: sel.startUtc }) });
      setDone(res); // backend returns the canonical classroom link used by confirmation emails
    } catch (err) {
      setSel(null);
      setNotice(err.code === 'NO_MENTOR_AVAILABLE'
        ? { kind: 'warn', text: 'That time was just taken by another family. Here are the times still open.' }
        : { kind: 'error', text: err.message });
      load();
    } finally { setBusy(false); }
  }

  const mentorToken = parseMentorRoute(hash);
  if (mentorToken) return <MentorSchedule token={mentorToken} onExit={() => { window.location.hash = ''; }} />;
  const route = parseRoute(hash);
  if (route) return <Classroom route={route} onExit={() => { window.location.hash = ''; }} />;


  const reset = () => { setDone(null); setSel(null); setNotice(null); load(); window.scrollTo({ top: 0 }); };
  const step = done ? 3 : sel ? 2 : 1;
  const card = 'rounded-3xl border border-ink-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,38,42,0.06),0_16px_40px_-20px_rgba(20,38,42,0.25)] sm:p-7';
  const selectCls = 'mt-1.5 w-full appearance-none rounded-xl border border-ink-200 bg-white px-3.5 py-3 pr-9 text-sm font-medium text-ink-800 hover:border-ink-300 focus-visible:border-ink-500';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(360px,5fr)_7fr]">
      {/* Brand panel: the column is yellow end to end; the content stays pinned while the form scrolls */}
      <div className="bg-brand-400">
      <aside className="relative overflow-hidden px-5 pb-8 pt-6 sm:px-10 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-10">
        <BlockMark className="pointer-events-none absolute -bottom-8 -right-8 hidden h-[300px] w-[300px] lg:block xl:-bottom-10 xl:-right-10 xl:h-[360px] xl:w-[360px]" />
        <Logo onBrand />
        <div className="relative mt-8 lg:mt-0">
          <h1 className="max-w-md text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl xl:text-6xl">
            Try a live class with a Codeyoung mentor. Free.
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-800 sm:text-lg">
            Pick a time that suits your family. We match your child with a mentor and email you both the class link.
          </p>
          <ul className="mt-8 hidden max-w-sm sm:block">
            {PERKS.map(([ic, t, s]) => (
              <li key={t} className="flex items-start gap-3 border-t border-ink-900/15 py-3.5 first:border-t-0 first:pt-0">
                <Icon d={ic} className="mt-0.5 h-5 w-5 shrink-0 text-ink-900" />
                <span><b className="block text-[15px] font-semibold text-ink-900">{t}</b><span className="text-sm leading-snug text-ink-800">{s}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-8 hidden text-sm text-ink-800 lg:block">No payment or account needed.</p>
      </aside>
      </div>

      {/* Booking flow */}
      <main className="bg-ink-50 px-4 py-6 sm:px-8 lg:min-h-screen lg:py-12">
        <div className="mx-auto max-w-[640px]">
          <div className={card}>
            {!done && <div className="mb-6"><Stepper step={step} /></div>}

            {done ? <Success done={done} email={form.email} onAgain={reset} /> : (
              <>
                {notice && (
                  <div role="alert" className={'mb-5 flex animate-fade-up items-start gap-3 rounded-xl border p-3.5 text-sm ' +
                    (notice.kind === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-rose-300 bg-rose-50 text-rose-900')}>
                    <Icon d={icons.alert} className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="flex-1">{notice.text}</p>
                    <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-black/5"><Icon d={icons.close} className="h-4 w-4" /></button>
                  </div>
                )}

                <div className="mb-5">
                  <label htmlFor="tz" className="text-sm font-semibold text-ink-700">Your time zone</label>
                  <div className="relative">
                    <select id="tz" className={selectCls} value={tz} onChange={(e) => setTz(e.target.value)}>
                      {ZONES.map((z) => <option key={z} value={z}>{prettyZone(z)}</option>)}
                    </select>
                    <Icon d="M6 9l6 6 6-6" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                    <Icon d={icons.globe} className="h-3.5 w-3.5" />
                    {data ? <>Times shown in <b>{data.tzAbbr}</b></> : 'Detecting your time zone…'}
                    {tz !== detected && <button type="button" onClick={() => setTz(detected)} className="font-semibold text-brand-700 hover:underline">Use my local zone</button>}
                  </p>
                </div>

                <DateStrip date={date} setDate={setDate} tz={tz} />

                <div className="mt-6" aria-live="polite">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold text-ink-800">{longDate(date)}</h2>
                    {!loading && data?.slots.length > 0 && <span className="text-xs text-ink-500">{data.slots.length} times available</span>}
                  </div>
                  {loading && <SlotsSkeleton />}
                  {!loading && data && data.slots.length === 0 && (
                    <EmptyDay nextDate={data.nextAvailableDate} label={data.nextAvailableDate && longDate(data.nextAvailableDate)}
                      onJump={() => setDate(data.nextAvailableDate)} />
                  )}
                  {!loading && data && data.slots.length > 0 && <Slots slots={data.slots} tz={tz} selected={sel} onSelect={pick} />}
                </div>

                {sel && (
                  <div ref={formRef} className="mt-6">
                    <DetailsForm form={form} setForm={setForm} slot={sel} date={date} tzAbbr={data?.tzAbbr}
                      busy={busy} onSubmit={submit} onChange={() => setSel(null)} />
                  </div>
                )}
              </>
            )}
          </div>
          <footer className="mt-6 text-center text-xs text-ink-500">© Codeyoung. Trial classes are 30 minutes and times are shown in your selected time zone.</footer>
        </div>
      </main>
    </div>
  );
    }
