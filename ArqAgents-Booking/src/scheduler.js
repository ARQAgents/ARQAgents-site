// ─────────────────────────────────────────────────────────────────────────────
// scheduler.js — Cron handler
// Runs every 30 minutes (see wrangler.toml). Each tick decides whether to
// send -1 day reminders, day-of reminders, or end-of-day thank yous.
// All time-of-day windows are in Manila local time.
// ─────────────────────────────────────────────────────────────────────────────
import { nowManila, toManilaDateStr, toManilaTimeStr, addDaysToManila } from './timezone.js';
import { send1DayReminder, sendDayOfReminder, sendThankYou } from './notifications.js';

// When (in Manila local HH:MM) we want each notification batch to fire.
// We use ranges because the cron runs every 30 min and we want to catch the tick.
const DAY_BEFORE_SEND_AT  = '18:00'; // 6:00 PM the day before
const DAY_OF_SEND_AT      = '08:00'; // 8:00 AM the day of
const THANKYOU_SEND_AT    = '20:00'; // 8:00 PM end of day

export async function handleScheduled(event, env, ctx) {
  const mnlNow = nowManila();
  const today = toManilaDateStr(mnlNow);
  const tomorrow = addDaysToManila(1);
  const nowHHMM = toManilaTimeStr(mnlNow);

  // 30-min window check: did the target time fall within the last 30 min?
  const inWindow = (target) => withinLast30Min(nowHHMM, target);

  const report = { ran_at_manila: `${today} ${nowHHMM}`, batches: [] };

  // ─── 1) Day-before reminders @ 6PM Manila for tomorrow's appointments ────
  if (inWindow(DAY_BEFORE_SEND_AT)) {
    const rows = await env.DB.prepare(
      `SELECT * FROM bookings
        WHERE appointment_date = ? AND status='confirmed' AND reminder_1day_sent=0`
    ).bind(tomorrow).all();
    const sent = [];
    for (const b of (rows.results || [])) {
      try {
        await send1DayReminder(env, b);
        await env.DB.prepare(
          `UPDATE bookings SET reminder_1day_sent=1, updated_at=datetime('now') WHERE id=?`
        ).bind(b.id).run();
        sent.push(b.id);
      } catch (err) {
        console.log('1day reminder failed', b.id, err);
      }
    }
    report.batches.push({ kind: 'reminder_1day', count: sent.length, ids: sent });
  }

  // ─── 2) Day-of reminders @ 8AM Manila for today's appointments ───────────
  if (inWindow(DAY_OF_SEND_AT)) {
    const rows = await env.DB.prepare(
      `SELECT * FROM bookings
        WHERE appointment_date = ? AND status='confirmed' AND reminder_dayof_sent=0`
    ).bind(today).all();
    const sent = [];
    for (const b of (rows.results || [])) {
      try {
        await sendDayOfReminder(env, b);
        await env.DB.prepare(
          `UPDATE bookings SET reminder_dayof_sent=1, updated_at=datetime('now') WHERE id=?`
        ).bind(b.id).run();
        sent.push(b.id);
      } catch (err) {
        console.log('dayof reminder failed', b.id, err);
      }
    }
    report.batches.push({ kind: 'reminder_dayof', count: sent.length, ids: sent });
  }

  // ─── 3) Thank-you @ 8PM Manila for today's appointments that have passed ─
  if (inWindow(THANKYOU_SEND_AT)) {
    const rows = await env.DB.prepare(
      `SELECT * FROM bookings
        WHERE appointment_date = ? AND status='confirmed' AND thankyou_sent=0`
    ).bind(today).all();
    const sent = [];
    for (const b of (rows.results || [])) {
      try {
        await sendThankYou(env, b);
        await env.DB.prepare(
          `UPDATE bookings SET thankyou_sent=1, status='completed', updated_at=datetime('now') WHERE id=?`
        ).bind(b.id).run();
        sent.push(b.id);
      } catch (err) {
        console.log('thankyou failed', b.id, err);
      }
    }
    report.batches.push({ kind: 'thankyou', count: sent.length, ids: sent });
  }

  // Safety net: also auto-complete any past-date bookings still 'confirmed'
  // so they don't keep coming up in admin views.
  await env.DB.prepare(
    `UPDATE bookings SET status='completed', updated_at=datetime('now')
       WHERE status='confirmed' AND appointment_date < ?`
  ).bind(today).run();

  console.log('cron report:', JSON.stringify(report));
  return report;
}

/** Did `target` fall within the last 30 minutes relative to `now`? Both HH:MM. */
function withinLast30Min(nowHHMM, targetHHMM) {
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const n = toMin(nowHHMM);
  const t = toMin(targetHHMM);
  const diff = n - t;
  return diff >= 0 && diff < 30;
}
