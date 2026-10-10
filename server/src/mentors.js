// Availability windows in IST local hours (not shifts: a mentor still takes at most 2 trial classes a day).
// Group A starts at midnight, which is the US evening (3-9 pm EDT = 00:30-06:30 IST). Group B runs to midnight,
// which is the UK evening. Both overlap 09:00-21:00 IST. Windows must not wrap past midnight (see worksAt).
const WINDOWS = [[0, 21], [9, 24]];
const names = ['Aarav', 'Diya', 'Rohan', 'Ananya', 'Kabir', 'Isha', 'Vihaan', 'Meera', 'Arjun', 'Sanya'];

// Optional: set MENTOR_EMAIL_BASE=yourname@gmail.com to deliver every mentor's email to one inbox.
// Mentor 1 gets yourname+mentor1@gmail.com, mentor 2 gets yourname+mentor2@gmail.com, and so on.
// If it is not set (or is not a valid address), the placeholder @mentors.example.com addresses are used.
const EMAIL_BASE = (process.env.MENTOR_EMAIL_BASE || '').trim();
const [baseUser, baseDomain] = EMAIL_BASE.split('@');
const useBase = Boolean(baseUser && baseDomain && EMAIL_BASE.split('@').length === 2);

function mentorEmail(name, index) {
  return useBase
    ? `${baseUser}+mentor${index + 1}@${baseDomain}`
    : `${name.toLowerCase()}@mentors.example.com`;
}

export const MENTORS = names.map((n, i) => ({
  id: i + 1,
  name: `${n} Sharma`,
  email: mentorEmail(n, i),
  tz: 'Asia/Kolkata',
  workStart: WINDOWS[i < 5 ? 0 : 1][0], // local hour
  workEnd: WINDOWS[i < 5 ? 0 : 1][1],
}));
