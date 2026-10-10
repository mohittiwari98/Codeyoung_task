// Availability windows in IST local hours (not shifts: a mentor still takes at most 2 trial classes a day).
// Group A starts at midnight, which is the US evening (3-9 pm EDT = 00:30-06:30 IST). Group B runs to midnight,
// which is the UK evening. Both overlap 09:00-21:00 IST. Windows must not wrap past midnight (see worksAt).
const WINDOWS = [[0, 21], [9, 24]];
const names = ['Aarav', 'Diya', 'Rohan', 'Ananya', 'Kabir', 'Isha', 'Vihaan', 'Meera', 'Arjun', 'Sanya'];
export const MENTORS = names.map((n, i) => ({
  id: i + 1,
  name: `${n} Sharma`,
  email: `${n.toLowerCase()}@mentors.example.com`,
  tz: 'Asia/Kolkata',
  workStart: WINDOWS[i < 5 ? 0 : 1][0], // local hour
  workEnd: WINDOWS[i < 5 ? 0 : 1][1],
}));
