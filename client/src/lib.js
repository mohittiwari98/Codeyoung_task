export const detectTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const ZONES = (() => {
  const list = Intl.supportedValuesOf ? [...Intl.supportedValuesOf('timeZone')] : [];
  if (!list.includes(detectTz())) list.unshift(detectTz());
  return list;
})();

export const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

// Pure calendar maths on YYYY-MM-DD strings (no time zone involved, so no DST surprises).
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const utcFmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
export const dayParts = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return {
    weekday: utcFmt({ weekday: 'short' }).format(d),
    day: utcFmt({ day: 'numeric' }).format(d),
    month: utcFmt({ month: 'short' }).format(d),
  };
};
export const longDate = (iso) => utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T00:00:00Z'));
export const monthYear = (iso) => utcFmt({ month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00Z'));

export const prettyZone = (tz) => tz.replace(/_/g, ' ').replace(/\//g, ' / ');

// ---- Slot grouping (by the parent's local hour) ----
const hourIn = (iso, tz) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));

export const PERIODS = [
  { key: 'morning', label: 'Morning', hint: 'Before 12 pm', test: (h) => h >= 5 && h < 12 },
  { key: 'afternoon', label: 'Afternoon', hint: '12 – 5 pm', test: (h) => h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', hint: '5 – 9 pm', test: (h) => h >= 17 && h < 21 },
  { key: 'night', label: 'Late night', hint: 'After 9 pm', test: (h) => h >= 21 || h < 5 },
];

export function groupSlots(slots, tz) {
  const groups = PERIODS.map((p) => ({ ...p, slots: [] }));
  for (const s of slots) {
    const h = hourIn(s.startUtc, tz);
    (groups.find((g) => g.test(h)) || groups[3]).slots.push(s);
  }
  return groups.filter((g) => g.slots.length);
}

// ---- API ----
export async function api(path, opts) {
  let r;
  try {
    r = await fetch((import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  } catch {
    throw Object.assign(new Error("Can't reach the server. Check your connection and try again."), { code: 'NETWORK' });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || 'Something went wrong. Please try again.'), { code: d.code });
  return d;
}

// ---- Calendar helpers (class length is 30 min) ----
const CLASS_MS = 30 * 60 * 1000;
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalUrl({ startUtc, link, mentorName }) {
  const s = Date.parse(startUtc);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Codeyoung trial class',
    dates: `${icsDate(s)}/${icsDate(s + CLASS_MS)}`,
    details: `Trial class with ${mentorName}.\nJoin: ${link}`,
    location: link,
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

export function downloadIcs({ id, startUtc, link, mentorName }) {
  const s = Date.parse(startUtc);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Codeyoung//Trial Class//EN', 'BEGIN:VEVENT',
    `UID:${id}@codeyoung`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(s)}`, `DTEND:${icsDate(s + CLASS_MS)}`,
    'SUMMARY:Codeyoung trial class', `DESCRIPTION:Trial class with ${mentorName}. Join: ${link}`, `URL:${link}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'codeyoung-trial-class.ics' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Demo classroom link (served by this app, so it always works) ----
export function roomUrl({ id, mentorName, startUtc }) {
  const q = new URLSearchParams({ mentor: mentorName, start: startUtc });
  return `${window.location.origin}/#/class/${id}?${q.toString()}`;
}
export function parseRoute(hash) {
  const m = /^#\/class\/([^?]+)\??(.*)$/.exec(hash || '');
  if (!m) return null;
  const q = new URLSearchParams(m[2]);
  return { id: m[1], mentor: q.get('mentor') || 'Your mentor', start: q.get('start') };
}
