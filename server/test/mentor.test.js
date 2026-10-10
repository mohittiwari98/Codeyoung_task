import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createBookingService } from '../src/bookingService.js';
import { createApp } from '../src/app.js';
import { buildEmails } from '../src/emails.js';
import { Booking, Mentor, MentorDay } from '../src/models.js';
import { ensureMentors } from '../src/seed.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const first = Date.parse('2026-10-10T03:30:00Z'); // 09:00 IST
const svc = createBookingService({ now: () => NOW });
let mongod, server, base, n = 0;
const req = (startMs, tz = 'America/New_York') => ({ name: 'Pat', email: `p${++n}@x.com`, childName: `Kid${n}`, childAge: 9, tz, startMs });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Booking.init(), MentorDay.init(), Mentor.init()]);
  server = createApp(svc).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Promise.all([Booking.deleteMany({}), MentorDay.deleteMany({})]);
  await ensureMentors();
});
after(async () => { server.close(); await mongoose.disconnect(); await mongod.stop(); });

test('every mentor gets a stable private token', async () => {
  const before = (await Mentor.find().lean()).map((m) => m.accessToken);
  assert.equal(new Set(before).size, 10);
  assert.ok(before.every((t) => /^[a-f0-9]{32}$/.test(t)));
  await ensureMentors(); // re-seeding must not rotate tokens
  assert.deepEqual((await Mentor.find().lean()).map((m) => m.accessToken), before);
});

test('schedule lists only that mentor\'s upcoming classes, in IST, with the parent\'s local time', async () => {
  const { mentor } = await svc.book(req(first, 'America/New_York'));
  await svc.book(req(first + 30 * 60000, 'Europe/London'));
  const m = await Mentor.findById(mentor._id).lean();
  const r = await fetch(`${base}/api/mentor/${m.accessToken}/schedule`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.mentor.tzAbbr, 'IST');
  assert.equal(body.max, 2);
  const rows = body.days.flatMap((d) => d.bookings);
  assert.ok(rows.length >= 1 && rows.length <= 2);
  const mine = rows.find((x) => x.startUtc === new Date(first).toISOString());
  assert.equal(mine.time, '9:00 AM');
  assert.match(mine.parentTime, /EDT$/);
  assert.equal(body.days[0].date, '2026-10-10');
  assert.ok(!JSON.stringify(body).includes('@x.com'), 'parent email must not be exposed');
});

test('a mentor does not see other mentors\' bookings, and the day count reflects the cap', async () => {
  for (let i = 0; i < 20; i++) await svc.book(req(first + i * 30 * 60000));
  const m = await Mentor.findOne().lean();
  const body = await (await fetch(`${base}/api/mentor/${m.accessToken}/schedule`)).json();
  assert.equal(body.days.flatMap((d) => d.bookings).length, 2);
  assert.equal(body.days[0].count, 2);
});

test('unknown or malformed tokens get a 404 with a friendly code', async () => {
  for (const t of ['0'.repeat(32), 'not-a-token', 'A'.repeat(32)]) {
    const r = await fetch(`${base}/api/mentor/${t}/schedule`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).code, 'NOT_FOUND');
  }
});

test('mentor email links to the schedule; parent email does not', async () => {
  const result = await svc.book(req(first));
  const mentor = await Mentor.findById(result.mentor._id).lean();
  const [parent, mentorMail] = buildEmails({ booking: result.booking, mentor });
  assert.ok(mentorMail.text.includes(`/#/mentor/${mentor.accessToken}`));
  assert.ok(!parent.text.includes('/#/mentor/'));
});
