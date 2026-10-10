import { randomUUID } from 'node:crypto';
import { Booking, Mentor, MentorDay } from './models.js';
import { at, dayRangeMs } from './tz.js';
import { classUrl } from './links.js';

export const SLOT_MS = 30 * 60 * 1000;
export const LEAD_MS = 60 * 60 * 1000; // can't book within the next hour
export const MAX_PER_DAY = 2; // per mentor, per mentor-local calendar day
export const OPS_TZ = 'Asia/Kolkata'; // the day boundary the dashboard reports in (mentors are seeded in IST)

export class BookingError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const childKeyOf = (email, childName) =>
  `${String(email).trim().toLowerCase()}|${String(childName).trim().toLowerCase().replace(/\s+/g, ' ')}`;
const localDate = (m, ms) => at(ms, m.tz).toISODate();
const worksAt = (m, ms) => {
  const dt = at(ms, m.tz), x = dt.hour * 60 + dt.minute;
  return x >= m.workStart * 60 && x + SLOT_MS / 60000 <= m.workEnd * 60;
};

// Read-only view of bookings/day counters for [from, to), used to compute availability.
async function snapshot(mentors, from, to) {
  const bookings = await Booking.find({ startMs: { $gte: from, $lt: to } }, 'mentorId startMs').lean();
  const taken = new Set(bookings.map((b) => `${b.mentorId}:${b.startMs}`));
  const dates = new Set();
  for (const m of mentors) {
    for (let t = from; t < to; t += 6 * 3600 * 1000) dates.add(localDate(m, t));
    dates.add(localDate(m, to - 1));
  }
  const days = await MentorDay.find({ date: { $in: [...dates] } }).lean();
  const counts = new Map(days.map((d) => [`${d.mentorId}:${d.date}`, d.count]));
  return { taken, counts };
}

const dayCount = (snap, m, ms) => snap.counts.get(`${m._id}:${localDate(m, ms)}`) || 0;
const eligible = (mentors, snap, ms) =>
  mentors.filter((m) => worksAt(m, ms) && !snap.taken.has(`${m._id}:${ms}`) && dayCount(snap, m, ms) < MAX_PER_DAY);

// Atomically take one of a mentor's 2 daily seats. If the counter is already at the cap, the
// conditional upsert collides with the unique (mentorId, date) index (E11000) => no seat.
async function reserveSeat(mentorId, date) {
  try {
    await MentorDay.findOneAndUpdate(
      { mentorId, date, count: { $lt: MAX_PER_DAY } }, { $inc: { count: 1 } }, { upsert: true });
    return true;
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
}

export function createBookingService({ now = () => Date.now() } = {}) {
  async function listSlots(date, tz) {
    const [from, to] = dayRangeMs(date, tz);
    const mentors = await Mentor.find().lean();
    const snap = await snapshot(mentors, from, to);
    const out = [];
    for (let t = Math.ceil(from / SLOT_MS) * SLOT_MS; t < to; t += SLOT_MS) {
      if (t >= now() + LEAD_MS && eligible(mentors, snap, t).length) out.push(t);
    }
    return out;
  }

  async function book({ name, email, childName, childAge, tz, startMs }) {
    if (startMs % SLOT_MS !== 0) throw new BookingError('INVALID_SLOT', 'Please choose one of the listed time slots.', 400);
    if (startMs < now() + LEAD_MS)
      throw new BookingError('SLOT_IN_PAST', 'That time is no longer bookable. Please pick a later slot.', 400);

    const childKey = childKeyOf(email, childName);
    const dupMsg = 'This child already has a trial class booked at that time. Check your confirmation email or pick a different slot.';
    if (await Booking.exists({ childKey, startMs })) throw new BookingError('DUPLICATE_BOOKING', dupMsg, 409);

    const mentors = await Mentor.find().lean();
    const snap = await snapshot(mentors, startMs, startMs + SLOT_MS);
    // Fairness: least-loaded mentor that day first, random among ties.
    const pool = eligible(mentors, snap, startMs)
      .map((m) => ({ m, load: dayCount(snap, m, startMs), r: Math.random() }))
      .sort((a, b) => a.load - b.load || a.r - b.r)
      .map((x) => x.m);

    for (const mentor of pool) {
      const date = localDate(mentor, startMs);
      if (!(await reserveSeat(mentor._id, date))) continue; // someone else took the last seat
      try {
        const id = randomUUID();
        const booking = await Booking.create({
          mentorId: mentor._id, parentName: name, parentEmail: email, childKey, parentTz: tz, childName, childAge, mentorTz: mentor.tz,
          startMs, endMs: startMs + SLOT_MS, mentorLocalDate: date,
          meetingLink: classUrl(id, `mentor=${encodeURIComponent(mentor.name)}&start=${startMs}`),
        });
        return { booking: booking.toObject(), mentor };
      } catch (e) {
        await MentorDay.updateOne({ mentorId: mentor._id, date }, { $inc: { count: -1 } }); // release seat
        if (e.code !== 11000) throw e;
        // A concurrent identical request for the same child won the race: stop, don't try other mentors.
        if (e.keyPattern?.childKey || String(e.message).includes('childKey')) throw new BookingError('DUPLICATE_BOOKING', dupMsg, 409);
        // otherwise: mentor+slot taken by a concurrent request, try next mentor
      }
    }
    throw new BookingError('NO_MENTOR_AVAILABLE', 'No mentor is available at that time.', 409);
  }

  // Read-only schedule for one mentor, looked up by their private token. Includes a class that
  // started up to 30 min ago so a mentor can still find the class they are in.
  async function getMentorSchedule(token) {
    const mentor = await Mentor.findOne({ accessToken: token }).lean();
    if (!mentor) throw new BookingError('NOT_FOUND', "We couldn't find that schedule. Please use the link from your latest class email.", 404);
    const nowMs = now();
    const bookings = await Booking.find({ mentorId: mentor._id, startMs: { $gte: nowMs - SLOT_MS } }).sort({ startMs: 1 }).limit(200).lean();
    const todayDate = at(nowMs, mentor.tz).toISODate();
    const dates = [...new Set([todayDate, ...bookings.map((b) => b.mentorLocalDate)])];
    const days = await MentorDay.find({ mentorId: mentor._id, date: { $in: dates } }).lean();
    return { mentor, nowMs, todayDate, bookings, dayCounts: Object.fromEntries(days.map((d) => [d.date, d.count])) };
  }

  // Counts only (no parent or child data): classes per mentor for the next 7 IST days, plus upcoming and all-time totals.
  // Per-day numbers come from the same MentorDay counters that enforce the 2-a-day cap.
  async function getMentorStats() {
    const mentors = await Mentor.find().sort({ name: 1 }).lean();
    const nowMs = now();
    const start = at(nowMs, OPS_TZ).startOf('day');
    const dates = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }).toISODate());
    const [days, totals] = await Promise.all([
      MentorDay.find({ date: { $in: dates } }).lean(),
      Booking.aggregate([{ $group: { _id: '$mentorId', total: { $sum: 1 }, upcoming: { $sum: { $cond: [{ $gte: ['$startMs', nowMs] }, 1, 0] } } } }]),
    ]);
    const perDay = new Map(days.map((d) => [`${d.mentorId}:${d.date}`, d.count]));
    const sums = new Map(totals.map((t) => [String(t._id), t]));
    return {
      dates,
      rows: mentors.map((m) => ({
        id: String(m._id), name: m.name,
        days: dates.map((d) => perDay.get(`${m._id}:${d}`) || 0),
        upcoming: sums.get(String(m._id))?.upcoming || 0,
        total: sums.get(String(m._id))?.total || 0,
      })),
    };
  }

  return { listSlots, book, getMentorSchedule, getMentorStats };
}
