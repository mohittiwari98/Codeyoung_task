# Codeyoung Trial Class Booking

A production-minded take-home implementation for the Codeyoung trial-class booking assignment. 

**Live demo**
- Frontend (Vercel): https://codeyoung-task.vercel.app
- Mentor load dashboard: https://codeyoung-task.vercel.app/#/dashboard
- API (Render): https://codeyoung-task.onrender.com (`/api/health` for a health check)

The API runs on Render's free plan, so the first request after a quiet period can take up to a minute while it wakes up.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Time zones: Luxon + IANA zones
- Email: EmailJS (REST API, one template for both parent and mentor)
- Hosting: Vercel (frontend), Render (backend), MongoDB Atlas (database)

## Product flow
1. Parent chooses their time zone (auto-detected) and a date.
2. Available 30-minute slots are shown in the parent's local time, grouped by morning/afternoon/evening.
3. Parent enters parent name/email and child name/age.
4. The backend assigns an eligible mentor fairly, with a hard maximum of 2 demo classes per mentor per mentor-local calendar day. The same parent and child cannot book the same slot twice.
5. Parent and mentor each receive a confirmation email with the time in **their own** time zone and the same demo classroom link.
6. The confirmation page offers Google Calendar, .ics, copy-link, and the demo classroom.

If no mentor is free (the slot was just taken, or the day is full) the parent sees a friendly message, the slot list refreshes, and the next date with availability is suggested.

## Mentor load dashboard

[`/#/dashboard`](https://codeyoung-task.vercel.app/#/dashboard) shows how many classes each mentor has: today versus total daily capacity, the next 7 IST days per mentor (0, 1 or 2), and upcoming and all-time totals. It refreshes every 30 seconds. API: `GET /api/dashboard`.

It returns counts only: no parent, child or email data. For that reason it has no login, which keeps the demo simple. Anyone with the URL can see how busy the mentors are, so a real deployment would put it behind admin authentication.

## Scheduling decisions
- Bookings are stored as UTC epoch milliseconds.
- User-facing times are rendered using IANA time zones such as `America/New_York` and `Europe/London`.
- DST is therefore handled by the timezone library rather than hard-coded offsets.
- Mentors are seeded in India time (`Asia/Kolkata`) and work 09:00–21:00 local time.
- Slots are 30 minutes and must be at least 1 hour in the future.
- A mentor can host at most 2 classes per mentor-local calendar day.
- The same child (same parent email and child name, ignoring capitalisation and extra spaces) cannot book the same time slot twice. A repeat attempt gets `409 DUPLICATE_BOOKING` and the parent sees a clear message.
- The least-loaded eligible mentor is preferred, with a random tie-break.

## Concurrency / race safety
The backend uses three MongoDB constraints: a unique `(mentorId, startMs)` booking index prevents double-booking, and a unique `(mentorId, date)` `MentorDay` document is incremented conditionally while the count is below 2. A third unique index on `(childKey, startMs)` stops the same child being booked twice for one slot, even when several identical requests arrive at once. If a race for a mentor is lost, the service tries another mentor or returns `NO_MENTOR_AVAILABLE`; if the child already holds the slot, it returns `DUPLICATE_BOOKING` and gives the mentor's seat back.

## Email and classroom link
Set `APP_URL` to the URL where the React app is served. The backend generates the demo classroom URL (`<APP_URL>/#/class/<id>`), stores it on the booking, and returns it, so the confirmation page and both emails always show the same link. The classroom is a demo page served by the React app, as the brief allows.

Emails are sent through the [EmailJS](https://www.emailjs.com) REST API from `server/src/emails.js`. The parent and the mentor each get one email from the **same EmailJS template**, sent one after the other (EmailJS allows about one request per second). If `EMAILJS_SERVICE_ID` or `EMAILJS_PUBLIC_KEY` is not set, nothing is sent and the email text is printed to the server console instead, so local development works without any email account.

### EmailJS setup
1. Create an email service (for example Gmail) under **Email Services** and note its **Service ID**.
2. Create a template under **Email Templates** and note its **Template ID** (it looks like `template_xxxxxxx`).
3. Under **Account → General**, copy the **Public Key** and the **Private Key**.
4. Under **Account → Security**, turn on **Allow EmailJS API for non-browser applications**. Without it the server's calls are rejected with a 403.
5. Service, template and keys must all belong to the same EmailJS account.

### Template fields
Set **To Email** to `{{email}}` and the **Subject** to `Trial Class Confirmed – {{student_name}} with {{mentor_name}}`. The body can use any of these variables (the values are different for the parent's and the mentor's copy where noted):

| Variable | Value |
|---|---|
| `{{email}}` / `{{to_email}}` | Recipient address |
| `{{to_name}}` | Recipient name (parent for the parent's copy, mentor for the mentor's copy) |
| `{{student_name}}` / `{{child_name}}` | Child's name |
| `{{child_age}}` | Child's age |
| `{{parent_name}}` | Parent's name |
| `{{mentor_name}}` | Assigned mentor |
| `{{class_time}}` | Class time in the **recipient's own** time zone |
| `{{parent_time}}` / `{{mentor_time}}` | Class time in the parent's / mentor's time zone |
| `{{meeting_link}}` | Demo classroom link |
| `{{subject}}` / `{{message}}` | Ready-made subject and plain-text body |

Example body (use the template's **Code Editor** so the HTML is rendered):

```html
<p>Hi {{to_name}},</p>
<p>Your trial class for <b>{{student_name}}</b> (age {{child_age}}) with <b>{{mentor_name}}</b> is confirmed.</p>
<p><b>When:</b> {{class_time}} (your local time)</p>
<p><a href="{{meeting_link}}">Join the demo class</a></p>
<p>Please join a few minutes before your scheduled time.</p>
<p>Best regards,<br>Team Codeyoung</p>
```

Mentor addresses are seeded as `<name>@mentors.example.com` in `server/src/mentors.js`, which are not real mailboxes. Change them to real addresses to see the mentor's copy arrive.

## Environment
Create `server/.env` from `server/.env.example`. Do not commit `.env`. Example:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/codeyoung_trials
PORT=4000
CLIENT_URL=http://localhost:5173
APP_URL=http://localhost:5173

# Optional. Leave these out and emails are only printed in the server console.
# EMAILJS_SERVICE_ID=service_xxxxxxx
# EMAILJS_TEMPLATE_ID=template_xxxxxxx
# EMAILJS_PUBLIC_KEY=your-public-key
# EMAILJS_PRIVATE_KEY=your-private-key
```

The client reads one optional variable at build time:

```env
# client/.env (only needed when the API is on a different domain than the frontend)
VITE_API_URL=https://codeyoung-task.onrender.com
```

Locally, leave `VITE_API_URL` unset: the Vite dev server proxies `/api` to `http://localhost:4000`.

## Run locally
You need Node.js 18 or newer (20+ recommended) and a MongoDB database, either local (`mongod` or Docker) or a free MongoDB Atlas cluster. For Atlas, allow your IP under Network Access and put the connection string in `MONGODB_URI`. The 10 mentors are created automatically on first start.

Backend:
```bash
cd server
npm install
npm start
```
Frontend in another terminal:
```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`.

Tests (they use an in-memory MongoDB, so the first run downloads a temporary MongoDB binary and needs internet):
```bash
cd server
npm test
```
If `npm test` fails on an older Node version, run `node --test --test-concurrency=1 test/*.test.js` instead.

## Deployment (Render + Vercel + Atlas)

**1. MongoDB Atlas.** Create a free cluster and a database user. Under Network Access, allow `0.0.0.0/0`, because Render's outgoing IP address changes. Copy the connection string.

**2. Backend on Render** (New → Web Service, connect this repo):
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment variables:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `MONGODB_URI` | Atlas connection string |
| `CLIENT_URL` | The Vercel URL, e.g. `https://codeyoung-task.vercel.app` (no trailing slash) |
| `APP_URL` | The same Vercel URL (used for the classroom link in emails) |
| `TRUST_PROXY` | `1` (so rate limits see the real client IP behind Render's proxy) |
| `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` | From the EmailJS dashboard |

Do not set `PORT`; Render provides it. Check the deploy by opening `/api/health`, which should return `{"ok":true}`.

**3. Frontend on Vercel** (Add New → Project, connect this repo):
- Root Directory: `client`
- Framework: Vite (build `npm run build`, output `dist`)
- Environment variable: `VITE_API_URL` = the Render URL (no trailing slash)

Vite reads `VITE_API_URL` when it builds, so after changing it, redeploy the project.

**Order matters:** deploy Render first, then Vercel (it needs the Render URL), then go back to Render and set `CLIENT_URL` and `APP_URL` to the Vercel URL. If `CLIENT_URL` is wrong the browser blocks the requests and the booking page shows "Can't reach the server".

**Troubleshooting emails.** The server logs one line per email in Render's logs: `Email to <address>: sent` or `Email to <address> failed: <reason>`.
- `400 The template ID not found`: `EMAILJS_TEMPLATE_ID` is wrong, or the template is in a different EmailJS account from the service and keys.
- `403`: **Allow EmailJS API for non-browser applications** is off.
- `[email not configured]`: `EMAILJS_SERVICE_ID` or `EMAILJS_PUBLIC_KEY` is missing.

## How the capacity cap and double-booking protection work

10 mentors x 2 classes per day = at most 20 bookings per mentor-day cycle, and a mentor can never be in two classes at once. Both rules are enforced **by the database**, not by "check then insert" in application code, so they hold with many simultaneous requests or several server instances.

```mermaid
flowchart TD
    A[POST /api/bookings] --> B[Validate input; slot on the 30-min grid and 1h+ away]
    B --> B2{Same parent and child already booked this slot?}
    B2 -- yes --> Y[409 DUPLICATE_BOOKING]
    B2 -- no --> C[Read snapshot: mentors working then, not booked, under 2 classes that day]
    C --> D[Sort: fewest classes that day first, random tie-break]
    D --> E{Next candidate mentor?}
    E -- none left --> X[409 NO_MENTOR_AVAILABLE]
    E -- mentor M --> F["Reserve a seat: conditional upsert MentorDay(M, date) count+1 only if count < 2"]
    F -- "duplicate-key: already at 2" --> E
    F -- seat taken --> G["Insert Booking(M, startMs): unique index (mentorId, startMs)"]
    G -- "duplicate-key: another request took this mentor+slot" --> H[Release the seat, count-1] --> E
    G -- "duplicate-key: same child, identical request at the same moment" --> H2[Release the seat, count-1] --> Y
    G -- ok --> Z[201 Created, emails sent]
```

| Rule | Mechanism | What it stops |
|---|---|---|
| A mentor never has 2 classes at the same time | Unique index on `Booking(mentorId, startMs)` | Two parents grabbing the same mentor and slot at once: one insert wins, the other gets a duplicate-key error and moves on to the next mentor |
| A mentor never exceeds 2 classes a day | `MentorDay(mentorId, date)` counter, unique index, incremented by a conditional upsert (`count < 2`) | The check-then-book race. At the cap the filter no longer matches, so the upsert tries to insert a second row for the same key and collides with the unique index, which is a refusal rather than a silent overbook |
| The same child cannot hold one slot twice | `Booking.childKey` (parent email + child name, normalised) with a unique index on `(childKey, startMs)`, checked first and enforced again by the database | A parent or a double-click booking the same child at the same time more than once; each repeat would otherwise have gone to a different mentor |
| "Day" means the mentor's day | `date` is the mentor's local (IST) calendar date | Parents in different zones booking the same IST day |

The availability read in step C is only a hint to avoid pointless attempts; the two atomic writes in F and G are what guarantee correctness. That is why the tests fire 30 simultaneous requests at one IST day and assert exactly 20 succeed with no mentor above 2, and fire 5 identical requests for one child and assert exactly 1 succeeds.

## API
- `GET /api/health` — health check
- `GET /api/slots?date=YYYY-MM-DD&tz=IANA_ZONE` — availability
- `POST /api/bookings` — create a trial booking
- `GET /api/dashboard` — per-mentor class counts (no personal data)

Error responses have the shape `{ "code": "...", "message": "..." }`. Booking codes: `INVALID_SLOT` (400), `SLOT_IN_PAST` (400), `VALIDATION_ERROR` (400), `NO_MENTOR_AVAILABLE` (409), `DUPLICATE_BOOKING` (409), `RATE_LIMITED` (429).

Booking payload:
```json
{
  "name": "Parent Name",
  "email": "parent@example.com",
  "childName": "Child Name",
  "childAge": 10,
  "tz": "Europe/London",
  "startUtc": "2026-10-12T10:00:00.000Z"
}
```

## Front-end design
The interface follows the Codeyoung brand: a yellow panel with the logo block shape, teal ink for text, and the Outfit typeface. Chosen dates and times are shown in dark ink, and only the main action buttons are yellow, so the next step is always obvious. The layout is responsive: the brand panel stays in place beside the booking card on desktop and becomes a header on phones. Times always show their zone (for example EDT or IST), and the confirmation screen shows both the parent's time and the mentor's time.

## Deliberately out of scope
Real Zoom/Google Meet integration, payments, accounts/login, parent cancellation and rescheduling, a "find my booking" lookup, an admin panel and mentor-facing accounts were left out on purpose: the brief is about scheduling correctness (time zones, DST, capacity, races), and each of these adds surface area without strengthening that core. The dummy classroom satisfies requirement 3.

## Not production-ready
The assignment did not ask for any of the items below, so they were left out on purpose to keep the work focused on scheduling correctness (time zones, DST, capacity and races). This is an honest list of what the project does **not** do:
- **Rate limits are per process and per IP** (`express-rate-limit`, in memory: 10 bookings / 15 min and 120 slot reads / min per IP, returning `429 RATE_LIMITED`). With several instances each keeps its own counters (use a shared store such as Redis), they reset on restart, and behind a proxy you must set `TRUST_PROXY`. They do not stop someone using many IPs to book all the seats; that needs CAPTCHA or email verification.
- **Bookings are not email-verified**, so anyone can book with someone else's address.
- **The duplicate check compares text**: the same child with a different email address or a different spelling of the name is treated as a different booking. Email verification would close this.
- **No cancel/reschedule**: a parent who needs to change a time has to contact support. A booking can't be released from the UI.
- **Email is fire-and-forget**: a failed send is logged, not retried, and the booking stays valid. A queue with retries would make delivery reliable. EmailJS's free plan also has a small monthly quota and a roughly one-request-per-second limit; a transactional provider (SES, Postmark) is the better choice at real volume.
- **The classroom is a demo page**, not a real video room.
- **The mentor load dashboard is public** (it shows counts only, no personal data); a real deployment would put it behind admin authentication.
- **No authentication, request logging, monitoring, or data-retention policy** for parent and child details.
- **Mentor hours and mentor emails are fixed** (09:00-21:00 IST, placeholder `@mentors.example.com` addresses, seeded in `mentors.js`); there is no leave/availability management.
- **The free Render plan sleeps when idle**, so the first request after a quiet period is slow.
- There are server tests (time zones/DST, capacity, concurrency, rate limiting) but no browser UI tests.

## Security / submission notes
- Never commit `server/.env` or credentials.
- Keep the EmailJS private key and the MongoDB URI private. Put them in Render's environment settings, never in the repo or in chat.
- If a secret is ever pasted somewhere public, revoke it and create a new one.
- The included `.env.example` contains placeholders only.

## AI usage
`TRANSCRIPT.md` contains the AI sessions used during development, including the later session that added the duplicate-booking protection and the front-end redesign.
