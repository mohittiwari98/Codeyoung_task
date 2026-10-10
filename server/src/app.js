import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { DateTime } from 'luxon';
import { BookingError } from './bookingService.js';
import { buildEmails, sendAll } from './emails.js';
import { abbr, at, fmt, isValidZone, timeLabel } from './tz.js';
import { MAX_PER_DAY, OPS_TZ } from './bookingService.js';

const tzSchema = z.string().refine(isValidZone, 'Unknown time zone');
const slotsQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tz: tzSchema });
const bookingBody = z.object({
  name: z.string().trim().min(1, 'Please enter the parent\'s name').max(100),
  email: z.string().trim().email('Please enter a valid email'),
  childName: z.string().trim().min(1, 'Please enter the child\'s name').max(100),
  childAge: z.coerce.number().int().min(1, 'Child age must be between 1 and 18').max(18, 'Child age must be between 1 and 18'),
  tz: tzSchema,
  startUtc: z.string().datetime(),
});

// Per-IP limits held in memory (see README "Not production-ready"). Overridable so tests can use tiny limits.
export const DEFAULT_LIMITS = {
  read: { windowMs: 60_000, limit: 120 },        // browsing slots
  write: { windowMs: 15 * 60_000, limit: 10 },   // creating bookings
};
const limiter = ({ windowMs, limit }) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes and try again.' },
});

export function createApp(service, { limits = {} } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const app = express();
  // Behind a proxy / load balancer set TRUST_PROXY (e.g. 1) so limits see the real client IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  const allowed = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(s => s.trim()).filter(Boolean) : true;
  app.use(cors({ origin: allowed }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/slots', limiter(L.read), async (req, res, next) => {
    try {
      const { date, tz } = slotsQuery.parse(req.query);
      if (!DateTime.fromISO(date, { zone: tz }).isValid) throw new BookingError('INVALID_DATE', 'Invalid date.', 400);
      const slots = (await service.listSlots(date, tz)).map((ms) => ({
        startUtc: new Date(ms).toISOString(),
        label: timeLabel(ms, tz),
      }));
      let nextAvailableDate = null;
      if (!slots.length) {
        for (let i = 1; i <= 14 && !nextAvailableDate; i++) {
          const d = DateTime.fromISO(date, { zone: tz }).plus({ days: i }).toISODate();
          if ((await service.listSlots(d, tz)).length) nextAvailableDate = d;
        }
      }
      const sampleMs = slots[0] ? Date.parse(slots[0].startUtc) : DateTime.fromISO(date, { zone: tz }).startOf('day').toMillis();
      res.json({ date, tz, tzAbbr: abbr(DateTime.fromMillis(sampleMs).setZone(tz)), slots, nextAvailableDate });
    } catch (e) { next(e); }
  });

  app.post('/api/bookings', limiter(L.write), async (req, res, next) => {
    try {
      const body = bookingBody.parse(req.body);
      const result = await service.book({
        name: body.name, email: body.email, childName: body.childName, childAge: body.childAge,
        tz: body.tz, startMs: Date.parse(body.startUtc),
      });
      sendAll(buildEmails(result));
      const { booking: b, mentor: m } = result;
      res.status(201).json({
        id: String(b._id), startUtc: new Date(b.startMs).toISOString(), mentorName: m.name, link: b.meetingLink,
        childName: b.childName, childAge: b.childAge,
        parentTime: fmt(b.startMs, b.parentTz), mentorTime: fmt(b.startMs, m.tz),
      });
    } catch (e) { next(e); }
  });

  // Read-only mentor schedule. The 128-bit token in the URL is the only credential (no login by design).
  app.get('/api/mentor/:token/schedule', limiter(L.read), async (req, res, next) => {
    try {
      const token = /^[a-f0-9]{32}$/.test(req.params.token) ? req.params.token : null;
      if (!token) throw new BookingError('NOT_FOUND', "We couldn't find that schedule. Please use the link from your latest class email.", 404);
      const { mentor, nowMs, todayDate, bookings, dayCounts } = await service.getMentorSchedule(token);
      const byDate = new Map();
      for (const b of bookings) {
        if (!byDate.has(b.mentorLocalDate)) byDate.set(b.mentorLocalDate, []);
        byDate.get(b.mentorLocalDate).push({
          id: String(b._id), startUtc: new Date(b.startMs).toISOString(), time: timeLabel(b.startMs, mentor.tz),
          parentTime: fmt(b.startMs, b.parentTz), parentName: b.parentName, childName: b.childName, childAge: b.childAge,
          link: b.meetingLink,
        });
      }
      res.set('Cache-Control', 'no-store');
      res.json({
        mentor: { name: mentor.name, tz: mentor.tz, tzAbbr: abbr(at(nowMs, mentor.tz)) },
        max: MAX_PER_DAY, today: { date: todayDate, count: dayCounts[todayDate] || 0 },
        days: [...byDate].map(([date, items]) => ({ date, count: dayCounts[date] || items.length, bookings: items })),
      });
    } catch (e) { next(e); }
  });

  // Operations view: classes per mentor. Counts only, no personal data, so no login (see README).
  app.get('/api/dashboard', limiter(L.read), async (_req, res, next) => {
    try {
      const { dates, rows } = await service.getMentorStats();
      res.set('Cache-Control', 'no-store');
      res.json({
        tz: OPS_TZ, max: MAX_PER_DAY, dates, mentors: rows,
        totals: {
          today: rows.reduce((n, r) => n + r.days[0], 0), capacityPerDay: rows.length * MAX_PER_DAY,
          upcoming: rows.reduce((n, r) => n + r.upcoming, 0), all: rows.reduce((n, r) => n + r.total, 0),
        },
      });
    } catch (e) { next(e); }
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError) return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.issues[0].message });
    if (err instanceof BookingError) return res.status(err.status).json({ code: err.code, message: err.message });
    console.error(err);
    res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
  });
  return app;
    }
