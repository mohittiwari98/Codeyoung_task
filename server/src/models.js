import mongoose from 'mongoose';
const { Schema, model } = mongoose;

export const Mentor = model('Mentor', new Schema({
  name: String,
  email: { type: String, unique: true },
  accessToken: { type: String, unique: true, sparse: true }, // secret in the mentor's read-only schedule link
  tz: String,
  workStart: Number,
  workEnd: Number,
}));

const bookingSchema = new Schema({
  mentorId: { type: Schema.Types.ObjectId, ref: 'Mentor', required: true },
  parentName: String,
  parentEmail: String,
  parentTz: String,
  childName: String,
  childAge: Number,
  childKey: String, // normalized parentEmail|childName, used to stop the same child booking the same slot twice
  mentorTz: String,
  startMs: { type: Number, required: true },
  endMs: Number,
  mentorLocalDate: String,
  meetingLink: String,
  status: { type: String, default: 'CONFIRMED' },
}, { timestamps: true });
bookingSchema.index({ mentorId: 1, startMs: 1 }, { unique: true });
bookingSchema.index({ childKey: 1, startMs: 1 }, { unique: true, partialFilterExpression: { childKey: { $type: 'string' } } });
export const Booking = model('Booking', bookingSchema);

const daySchema = new Schema({ mentorId: Schema.Types.ObjectId, date: String, count: { type: Number, default: 0 } });
daySchema.index({ mentorId: 1, date: 1 }, { unique: true });
export const MentorDay = model('MentorDay', daySchema);
