import { fmt } from './tz.js';

// Builds the two messages for a booking: one for the parent, one for the mentor.
export function buildEmails({ booking: b, mentor: m }) {
  const link = b.meetingLink;
  return [
    {
      to: b.parentEmail,
      toName: b.parentName,
      subject: `Your Codeyoung trial class: ${fmt(b.startMs, b.parentTz)}`,
      text: `Hi ${b.parentName},\n\nYour trial class for ${b.childName} (age ${b.childAge}) with ${m.name} is confirmed.\nWhen: ${fmt(b.startMs, b.parentTz)} (your local time)\nJoin: ${link}\n`,
      link,
    },
    {
      to: m.email,
      toName: m.name,
      subject: `New trial class: ${fmt(b.startMs, m.tz)}`,
      text: `Hi ${m.name},\n\nYou have a trial class with ${b.parentName} for ${b.childName} (age ${b.childAge}).\nWhen: ${fmt(b.startMs, m.tz)} (your local time)\nParent's local time: ${fmt(b.startMs, b.parentTz)}\nJoin: ${link}\n`,
      link,
    },
  ];
}

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function config() {
  const {
    EMAILJS_SERVICE_ID: serviceId,
    EMAILJS_TEMPLATE_ID: templateId = 'zfojus9',
    EMAILJS_PUBLIC_KEY: publicKey,
    EMAILJS_PRIVATE_KEY: privateKey,
  } = process.env;
  return serviceId && publicKey ? { serviceId, templateId, publicKey, privateKey } : null;
}

// Sends one message through EmailJS. Failures are logged, never thrown, so a mail problem
// can't undo a booking that has already been saved.
export async function send(mail) {
  const cfg = config();
  if (!cfg) {
    console.log(`[email not configured] To ${mail.to}\nSubject: ${mail.subject}\n${mail.text}`);
    return false;
  }
  try {
    const res = await fetch(EMAILJS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.publicKey,
        accessToken: cfg.privateKey, // required when "non-browser applications" are allowed
        template_params: {
          to_email: mail.to,
          to_name: mail.toName,
          subject: mail.subject,
          message: mail.text,
          meeting_link: mail.link,
        },
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    console.log(`Email to ${mail.to}: sent`);
    return true;
  } catch (e) {
    console.error(`Email to ${mail.to} failed:`, e.message);
    return false;
  }
}

// EmailJS rate-limits to about 1 request per second, so the parent and mentor emails go one at a time.
export async function sendAll(mails) {
  for (let i = 0; i < mails.length; i++) {
    if (i && config()) await sleep(1100);
    await send(mails[i]);
  }
}
