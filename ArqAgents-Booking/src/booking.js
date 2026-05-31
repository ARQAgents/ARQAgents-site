// ─────────────────────────────────────────────────────────────────────────────
// booking.js — Availability calculation + booking CRUD
// ─────────────────────────────────────────────────────────────────────────────
import {
  nowManila, toManilaDateStr, toManilaTimeStr, manilaWallToUtc,
  manilaDayOfWeek, addDaysToManila, friendlyDateTime,
} from './timezone.js';

/** Generate a random booking ID like "bk_aB3xY9". */
export function newBookingId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = 'bk_';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Parse HH:MM → minutes-of-day. */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Build the theoretical list of slot HH:MM strings for a given config. */
function buildDaySlots(env) {
  const start = toMinutes(env.BUSINESS_HOURS_START || '09:00');
  const end   = toMinutes(env.BUSINESS_HOURS_END   || '17:00');
  const step  = parseInt(env.SLOT_MINUTES || '30', 10);
  const slots = [];
  for (let m = start; m + step <= end; m += step) slots.push(fromMinutes(m));
  return slots;
}

/** Is the given Manila YYYY-MM-DD a business day according to BUSINESS_DAYS? */
function isBusinessDay(dateStr, env) {
  const allowed = (env.BUSINESS_DAYS || '1,2,3,4,5').split(',').map(s => parseInt(s, 10));
  return allowed.includes(manilaDayOfWeek(dateStr));
}

/** Check if dateStr falls inside any time_off row. */
async function isTimeOff(db, dateStr) {
  const r = await db.prepare(
    `SELECT 1 FROM time_off WHERE start_date <= ? AND end_date >= ? LIMIT 1`
  ).bind(dateStr, dateStr).first();
  return !!r;
}

/**
 * Get available HH:MM slots for a date.
 * Filters out:
 *   - non-business days
 *   - time-off
 *   - already-booked slots (status='confirmed')
 *   - slots earlier than BOOKING_LEAD_HOURS from now
 *   - slots beyond BOOKING_HORIZON_DAYS
 */
export async function getAvailability(env, dateStr) {
  // Reject out-of-window dates
  const todayMnl = toManilaDateStr(nowManila());
  const horizon  = addDaysToManila(parseInt(env.BOOKING_HORIZON_DAYS || '30', 10));
  if (dateStr < todayMnl) return { date: dateStr, slots: [], reason: 'past_date' };
  if (dateStr > horizon)  return { date: dateStr, slots: [], reason: 'beyond_horizon' };
  if (!isBusinessDay(dateStr, env)) return { date: dateStr, slots: [], reason: 'closed_day' };
  if (await isTimeOff(env.DB, dateStr)) return { date: dateStr, slots: [], reason: 'time_off' };

  const all = buildDaySlots(env);

  // Filter out booked slots
  const booked = await env.DB.prepare(
    `SELECT appointment_time FROM bookings
       WHERE appointment_date = ? AND status = 'confirmed'`
  ).bind(dateStr).all();
  const bookedSet = new Set((booked.results || []).map(r => r.appointment_time));

  // Filter by lead time
  const leadHours = parseInt(env.BOOKING_LEAD_HOURS || '2', 10);
  const earliestUtc = new Date(Date.now() + leadHours * 60 * 60 * 1000);

  const free = all.filter(t => {
    if (bookedSet.has(t)) return false;
    const slotUtc = manilaWallToUtc(dateStr, t);
    return slotUtc >= earliestUtc;
  });

  return { date: dateStr, slots: free };
}

/** Returns the next N upcoming dates that have at least one open slot. */
export async function getNextOpenDates(env, count = 5) {
  const horizon = parseInt(env.BOOKING_HORIZON_DAYS || '30', 10);
  const out = [];
  for (let i = 0; i < horizon && out.length < count; i++) {
    const d = addDaysToManila(i);
    const av = await getAvailability(env, d);
    if (av.slots.length > 0) out.push({ date: d, slotsPreview: av.slots.slice(0, 4), total: av.slots.length });
  }
  return out;
}

/**
 * Create a booking. Validates conflict atomically.
 * Returns { ok: true, booking } or { ok: false, error }.
 */
export async function createBooking(env, input) {
  const { name, email, phone, service, date, time, notes } = input;

  // Basic validation
  if (!name || !email || !date || !time) {
    return { ok: false, error: 'Missing required fields (name, email, date, time).' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Bad date format. Use YYYY-MM-DD.' };
  if (!/^\d{2}:\d{2}$/.test(time))      return { ok: false, error: 'Bad time format. Use HH:MM.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Invalid email address.' };

  // Re-verify availability right before insert
  const av = await getAvailability(env, date);
  if (!av.slots.includes(time)) {
    return { ok: false, error: `Sorry — ${time} on ${date} is no longer available. Please pick another slot.` };
  }

  const id = newBookingId();
  const slotMin = parseInt(env.SLOT_MINUTES || '30', 10);
  const phoneNormalized = normalizePhone(phone);

  await env.DB.prepare(
    `INSERT INTO bookings
      (id, name, email, phone, service, appointment_date, appointment_time,
       duration_minutes, notes, status, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'website-chat')`
  ).bind(
    id, name.trim(), email.trim().toLowerCase(),
    phoneNormalized, service || null, date, time, slotMin, notes || null,
  ).run();

  const booking = await getBooking(env, id);
  return { ok: true, booking };
}

export async function getBooking(env, id) {
  return await env.DB.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(id).first();
}

export async function cancelBooking(env, id) {
  await env.DB.prepare(
    `UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id = ?`
  ).bind(id).run();
}

/** Convert PH phone to 639XXXXXXXXX (Semaphore expects this or 09XXXXXXXXX). */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return '63' + digits;       // 9171234567
  if (digits.length === 11 && digits.startsWith('09')) return '63' + digits.slice(1); // 09171234567
  if (digits.length === 12 && digits.startsWith('639')) return digits;            // 639171234567
  if (digits.length === 13 && digits.startsWith('63'))  return digits.slice(0);   // edge: extra digit
  return digits || null;
}

/** Pretty-format booking for messages. */
export function formatBooking(b) {
  return {
    when: friendlyDateTime(b.appointment_date, b.appointment_time),
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    service: b.service,
    date: b.appointment_date,
    time: b.appointment_time,
    durationMin: b.duration_minutes,
  };
}
