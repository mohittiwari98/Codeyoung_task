import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createBookingService } from '../src/bookingService.js';
import { Booking, MentorDay } from '../src/models.js';
import { ensureMentors } from '../src/seed.js';
import { at } from '../src/tz.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const first = Date.parse('2026-10-10T03:30:00Z'); // 09:00 IST
const svc = createBookingService({ now: () => NOW });
let n = 0;
const req = (startMs) => ({ name: 'P', email: `p${++n}@x.com`, childName: `Kid${n}`, childAge: 9, tz: 'America/New_York', startMs });
const slot = (i) => first + i * 30 * 60000;
let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Booking.init(), MentorDay.init()]);
});
beforeEach(async () => {
  await Promise.all([Booking.deleteMany({}), MentorDay.deleteMany({})]);
  await ensureMentors();
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('21st booking of a day fails; no mentor gets a 3rd class', async () => {
  for (let i = 0; i < 20; i++) await svc.book(req(slot(i)));
  await assert.rejects(svc.book(req(slot(20))), { code: 'NO_MENTOR_AVAILABLE', status: 409 });
  const per = await Booking.aggregate([{ $group: { _id: '$mentorId', n: { $sum: 1 } } }]);
  assert.equal(per.length, 10);
  assert.ok(per.every((p) => p.n === 2));
});

test('concurrent: 11 parents, same slot => exactly 10 succeed', async () => {
  const r = await Promise.allSettled(Array.from({ length: 11 }, () => svc.book(req(first))));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 10);
  assert.equal(r.find((x) => x.status === 'rejected').reason.code, 'NO_MENTOR_AVAILABLE');
});

test('concurrent: 30 requests across one IST day => exactly 20 succeed, max 2 per mentor', async () => {
  const r = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => svc.book(req(slot(i % 24)))));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 20);
  const per = await Booking.aggregate([{ $group: { _id: '$mentorId', n: { $sum: 1 } } }]);
  assert.ok(per.every((p) => p.n <= 2));
});

test('past slots are rejected; listed slots shrink as they fill', async () => {
  await assert.rejects(svc.book(req(NOW)), { code: 'SLOT_IN_PAST' });
  assert.equal((await svc.listSlots('2026-10-10', 'Asia/Kolkata')).length, 48); // every half hour of the IST day
  for (let i = 0; i < 10; i++) await svc.book(req(first));
  assert.equal((await svc.listSlots('2026-10-10', 'Asia/Kolkata')).length, 47);
});

test('windows are staggered: 21:30 IST has only the 5 late mentors, 01:30 IST only the 5 early ones', async () => {
  const late = Date.parse('2026-10-10T16:00:00Z'); // 21:30 IST
  for (let i = 0; i < 5; i++) await svc.book(req(late));
  await assert.rejects(svc.book(req(late)), { code: 'NO_MENTOR_AVAILABLE' });
  const early = Date.parse('2026-10-09T20:00:00Z'); // 01:30 IST on 10 Oct
  for (let i = 0; i < 5; i++) await svc.book(req(early));
  await assert.rejects(svc.book(req(early)), { code: 'NO_MENTOR_AVAILABLE' });
});

test('US and UK parents are offered after-school / evening slots in their own time', async () => {
  const hours = async (date, tz) => (await svc.listSlots(date, tz)).map((ms) => at(ms, tz).hour);
  for (const tz of ['America/New_York', 'America/Los_Angeles']) {
    const h = await hours('2026-10-12', tz);
    assert.ok(h.some((x) => x >= 15 && x < 20), `${tz} should have 3-8 pm slots`);
  }
  assert.ok((await hours('2026-10-12', 'Europe/London')).some((x) => x >= 16 && x < 20));
  assert.ok((await hours('2026-11-09', 'America/New_York')).some((x) => x >= 15 && x < 20)); // after US DST ends
});

test('same parent+child cannot book the same slot twice (sequential, case/space-insensitive)', async () => {
  const a = { name: 'P', email: 'Dup@x.com', childName: 'Asha  Rao', childAge: 9, tz: 'Asia/Kolkata', startMs: first };
  await svc.book(a);
  await assert.rejects(svc.book({ ...a, email: ' dup@x.com ', childName: 'asha rao' }), { code: 'DUPLICATE_BOOKING', status: 409 });
  assert.equal(await Booking.countDocuments({}), 1);
});

test('same child submitted 5x at once => exactly one booking, seats released', async () => {
  const a = { name: 'P', email: 'race@x.com', childName: 'Kid', childAge: 9, tz: 'Asia/Kolkata', startMs: first };
  const r = await Promise.allSettled(Array.from({ length: 5 }, () => svc.book(a)));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  assert.ok(r.filter((x) => x.status === 'rejected').every((x) => x.reason.code === 'DUPLICATE_BOOKING'));
  const total = (await MentorDay.aggregate([{ $group: { _id: null, n: { $sum: '$count' } } }]))[0].n;
  assert.equal(total, 1);
});
