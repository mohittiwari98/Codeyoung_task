import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { Mentor } from './models.js';
import { MENTORS } from './mentors.js';
import { mentorScheduleUrl } from './links.js';

export async function ensureMentors() {
  for (const { id, ...m } of MENTORS) {
    await Mentor.updateOne({ email: m.email }, { $set: m }, { upsert: true });
    // Give every mentor a private schedule token once; never rotate an existing one.
    await Mentor.updateOne({ email: m.email, accessToken: { $exists: false } }, { $set: { accessToken: randomBytes(16).toString('hex') } });
  }
}

if (process.argv[1].endsWith('seed.js')) {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeyoung_trials');
  await ensureMentors();
  console.log(`Seeded ${MENTORS.length} mentors. Private schedule links:`);
  for (const m of await Mentor.find().sort({ name: 1 }).lean()) console.log(`  ${m.name}: ${mentorScheduleUrl(m.accessToken)}`);
  await mongoose.disconnect();
    }
