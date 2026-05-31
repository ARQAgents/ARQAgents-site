# ARQAgents Booking Worker

A Cloudflare Worker that turns your existing chat agent into a full appointment-booking system, with automatic email + SMS reminders.

```
Visitor chats → AI checks availability → AI books → Confirmation email/SMS
                                                       ↓
                            -1 day  →  Reminder (email + SMS)
                            Day-of  →  Morning reminder
                            Evening →  Thank-you + survey
```

---

## What you'll set up (one-time, ~45 min total)

1. Cloudflare Workers + D1 database (10 min)
2. Resend account for email (5 min)
3. Semaphore account for SMS (10 min)
4. Anthropic API key (you already have this)
5. Deploy + wire into your site (15 min)

Everything below is copy-paste. You said "basic" with terminal — that's all you need.

---

## STEP 1 — Tools on your computer

Open a terminal (Command Prompt on Windows, Terminal on Mac).

```bash
# 1.1 — Check Node is installed (you said you have it)
node --version       # should print something like v20.x

# 1.2 — Install wrangler (Cloudflare's CLI)
npm install -g wrangler

# 1.3 — Verify
wrangler --version
```

Then `cd` into this project folder:

```bash
cd path/to/arqagents-booking
npm install           # installs wrangler locally too
```

---

## STEP 2 — Cloudflare D1 database

```bash
# 2.1 — Log in (opens browser, authorize your CF account)
wrangler login

# 2.2 — Create the database
wrangler d1 create arqagents-bookings
```

You'll see output like this:

```
✅ Successfully created DB 'arqagents-bookings'
[[d1_databases]]
binding = "DB"
database_name = "arqagents-bookings"
database_id = "abc12345-6789-..."     ← COPY THIS
```

Open `wrangler.toml` in any text editor and paste the `database_id` value into the line that says `PASTE_YOUR_D1_DATABASE_ID_HERE`.

```bash
# 2.3 — Create the tables
wrangler d1 execute arqagents-bookings --remote --file=./schema.sql
```

Done. Bookings DB lives in Cloudflare now.

---

## STEP 3 — Resend (Email)

1. Go to **https://resend.com** → Sign up (free tier: 100 emails/day, 3,000/month)
2. Verify your email
3. Dashboard → **API Keys** → **Create API Key** → name it `arqagents-booking` → **Full access** → copy the key (starts with `re_...`)
4. **(Optional but recommended)**: Dashboard → **Domains** → Add `arqagents.com` and follow the DNS instructions. Until you do this, emails go from `onboarding@resend.dev` (still works, just less branded).

Save the API key — you'll paste it in Step 6.

---

## STEP 4 — Semaphore (SMS, Philippines)

1. Go to **https://semaphore.co** → Sign up
2. Top up at least ₱50 (GCash accepted) — each SMS is ~₱0.50
3. Dashboard → **API** → copy your **API Key**
4. **Sender Names** → Add a sender name (e.g. `ARQAGENTS`, max 11 chars, all caps). It needs Semaphore approval (~1 business day).

Save the API key. While the sender name is pending, SMS will still go out using Semaphore's default sender.

---

## STEP 5 — Anthropic API key

You already have one from your existing chat setup. Find it at https://console.anthropic.com/settings/keys.

---

## STEP 6 — Wire up your secrets

Back in the terminal, paste each of these one at a time. Wrangler will prompt you for the value and store it encrypted:

```bash
wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-... key, press Enter

wrangler secret put RESEND_API_KEY
# paste your re_... key

wrangler secret put SEMAPHORE_API_KEY
# paste your Semaphore key

wrangler secret put ADMIN_TOKEN
# pick a long random string — this protects /admin
# (open https://www.uuidgenerator.net and paste a UUID)

wrangler secret put OWNER_EMAIL
# your email — you'll get a copy of every booking

wrangler secret put OWNER_PHONE
# optional — your PH mobile (e.g. 09171234567) to receive booking SMS
# press Enter to skip
```

---

## STEP 7 — Customize the basics (optional)

Open `wrangler.toml` and tweak the `[vars]` section:

```toml
BUSINESS_NAME = "ARQAgents"
BUSINESS_HOURS_START = "09:00"     # adjust to your hours
BUSINESS_HOURS_END = "17:00"
BUSINESS_DAYS = "1,2,3,4,5"        # 1=Mon, 7=Sun. Add 6 for Sat, 7 for Sun.
SLOT_MINUTES = "30"                # 15, 30, 45, 60 — appointment length
BOOKING_LEAD_HOURS = "2"           # earliest booking from now
BOOKING_HORIZON_DAYS = "30"        # how far ahead can be booked
SURVEY_URL = "https://arqagents.com/survey"
REPLY_TO_EMAIL = "hello@arqagents.com"
FROM_EMAIL = "ARQAgents <onboarding@resend.dev>"
SMS_SENDER_NAME = "ARQAGENTS"
```

After you verify your domain in Resend, change `FROM_EMAIL` to e.g. `"ARQAgents <hello@arqagents.com>"`.

---

## STEP 8 — Deploy

```bash
wrangler deploy
```

You'll see:

```
Uploaded arqagents-booking (...)
Deployed arqagents-booking triggers (...)
  https://arqagents-booking.YOUR-USERNAME.workers.dev
```

**Copy that URL.** That's your new chat + booking endpoint.

---

## STEP 9 — Point your website at the new worker

Open `index.html` and find this line (around line 2718):

```js
const PROXY_URL = 'https://arqagents-chat.arqagents.workers.dev/api/chat';
```

Change it to:

```js
const PROXY_URL = 'https://arqagents-booking.YOUR-USERNAME.workers.dev/api/chat';
```

Then update the chat's system prompt so it knows it can book. Find `DEMO_SYSTEM` (around line 3200-ish — search for `const DEMO_SYSTEM`). At the END of that prompt string, **before the closing backtick**, add:

```
You can also BOOK APPOINTMENTS for visitors. If someone asks to book a call, demo, consultation, or meeting — guide them through it. You have tools to check availability and create the booking. Always confirm date + time + email before creating the booking. Tell them they'll get an email confirmation (and SMS if they gave a phone).
```

Do the same for `MINI_SYSTEM`.

Save the file, redeploy your site to Cloudflare Pages (or however you publish), and you're live.

---

## STEP 10 — Test it

### Test the chat:
Open your site → click the chat → say "I want to book a free consultation". Walk through the flow. You should get an email at the address you give.

### Test the admin dashboard:
Visit `https://arqagents-booking.YOUR-USERNAME.workers.dev/admin?token=YOUR_ADMIN_TOKEN`
You should see your test booking.

### Test the reminder cron without waiting:
```bash
curl -X POST -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  https://arqagents-booking.YOUR-USERNAME.workers.dev/api/_run-cron
```

### View live logs:
```bash
wrangler tail
```

---

## How the reminders work

- The cron runs every 30 minutes (24/7, free tier)
- At **6:00 PM Manila** each evening: sends "tomorrow" reminders for all tomorrow's confirmed bookings
- At **8:00 AM Manila** each morning: sends "today" reminders for all today's bookings
- At **8:00 PM Manila** each evening: sends thank-you + survey to anyone whose appointment was today

Reminders go via both email AND SMS (if the visitor provided a phone). Each notification is logged in the `notifications_log` table.

You can change these times by editing `DAY_BEFORE_SEND_AT`, `DAY_OF_SEND_AT`, and `THANKYOU_SEND_AT` constants in `src/scheduler.js`.

---

## API endpoints (for reference)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/chat` | Used by your site. Same shape as before. |
| GET  | `/api/availability?date=YYYY-MM-DD` | Public — open slots for a date |
| GET  | `/api/open-dates?count=5` | Public — next N open dates |
| POST | `/api/bookings` | Create a booking without using AI (JSON body) |
| GET  | `/api/bookings?token=...` | Admin — list bookings |
| POST | `/api/admin/cancel?id=...&token=...` | Admin — cancel a booking |
| GET  | `/admin?token=...` | Admin — HTML dashboard |
| POST | `/api/_run-cron` | Admin — manually fire reminders for testing |
| GET  | `/healthz` | Liveness check |

---

## Adding FB Messenger later (Phase 2)

When your Meta Developer App is approved:

1. In `src/notifications.js`, add a `sendMessenger(env, { recipientPsid, message })` function that POSTs to `https://graph.facebook.com/v18.0/me/messages` with `messaging_type: MESSAGE_TAG`, `tag: CONFIRMED_EVENT_UPDATE`.
2. In the booking flow, capture the visitor's Page-Scoped ID (PSID) via "Send to Messenger" button OR via Messenger Webhook handshake.
3. Add `fb_psid` column to the bookings table.
4. Call `sendMessenger` from each of the four send functions in `notifications.js`.

I can write that piece when you reach that stage.

---

## Costs at a glance

| Service | Free tier | Beyond free |
|---|---|---|
| Cloudflare Workers | 100k requests/day | $5/mo for 10M |
| Cloudflare D1 | 5M reads/day, 100k writes/day | Way more than you need |
| Cloudflare Cron Triggers | Unlimited | — |
| Resend | 100 emails/day, 3k/month | $20/mo for 50k |
| Semaphore SMS | — | ~₱0.50 per SMS |
| Anthropic API (Haiku 4.5) | pay-as-you-go | ~$0.001 per booking convo |

For a small business doing <20 bookings/day, this all runs essentially free except for SMS costs.

---

## Troubleshooting

**"D1_ERROR: no such table: bookings"** — You forgot Step 2.3. Run it.

**Emails not arriving** — Check Resend dashboard → Logs. If you see "domain not verified", emails are going from `onboarding@resend.dev` which sometimes lands in spam. Verify your domain.

**SMS not arriving** — Check Semaphore dashboard → Messages. Sender name might still be pending approval; messages will queue.

**Chat says "I got stuck while booking"** — Check `wrangler tail` for errors. Usually a missing secret.

**Cron not firing** — Workers free tier cron has a few minutes of jitter. Use `/api/_run-cron` to test on demand.

---

Questions? The whole codebase is ~700 lines across 8 files. Open them up, read the comments, tweak whatever you want.
