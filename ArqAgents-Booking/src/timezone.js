// ─────────────────────────────────────────────────────────────────────────────
// timezone.js — Manila (UTC+8, no DST) date/time helpers
// ─────────────────────────────────────────────────────────────────────────────
// Philippines doesn't observe DST so we can use a fixed +8 offset safely.

const MANILA_OFFSET_MIN = 8 * 60;

/** Current Manila Date object (a UTC Date shifted +8h so its UTC fields read as Manila local). */
export function nowManila() {
  return new Date(Date.now() + MANILA_OFFSET_MIN * 60 * 1000);
}

/** Format a Manila Date as YYYY-MM-DD (uses UTC getters because we already shifted). */
export function toManilaDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Format a Manila Date as HH:MM. */
export function toManilaTimeStr(d) {
  return d.toISOString().slice(11, 16);
}

/** "2025-12-31" + "14:30" → real UTC Date for that Manila wall-clock moment. */
export function manilaWallToUtc(dateStr, timeStr) {
  // dateStr=YYYY-MM-DD, timeStr=HH:MM (Manila local)
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  // Construct as if these are UTC, then subtract Manila offset to get true UTC.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  return new Date(asUtc - MANILA_OFFSET_MIN * 60 * 1000);
}

/** Day-of-week 1=Mon..7=Sun for a YYYY-MM-DD Manila date. */
export function manilaDayOfWeek(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  // Construct at noon Manila to avoid edge rollovers
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const js = date.getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

/** Human-friendly Manila datetime string, e.g. "Tue, Dec 31 at 2:30 PM". */
export function friendlyDateTime(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dow = days[date.getUTCDay()];
  const mon = months[date.getUTCMonth()];
  const day = date.getUTCDate();

  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  const minStr = mi.toString().padStart(2, '0');
  return `${dow}, ${mon} ${day} at ${hour12}:${minStr} ${ampm}`;
}

/** "+N days from Manila today" → YYYY-MM-DD */
export function addDaysToManila(daysAhead) {
  const d = nowManila();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return toManilaDateStr(d);
}
