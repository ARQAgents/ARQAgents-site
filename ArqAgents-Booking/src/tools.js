// ─────────────────────────────────────────────────────────────────────────────
// tools.js — Claude tool definitions + executor
// ─────────────────────────────────────────────────────────────────────────────
import {
  getAvailability, getNextOpenDates, createBooking, formatBooking,
} from './booking.js';
import { sendConfirmation } from './notifications.js';
import { nowManila, toManilaDateStr, friendlyDateTime } from './timezone.js';

export const BOOKING_TOOLS = [
  {
    name: 'get_business_info',
    description:
      "Get the business's operating hours, timezone, and today's date in Manila. " +
      "Call this once at the start of any booking conversation so you know what to offer.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_open_dates',
    description:
      "Return the next few upcoming dates that have open appointment slots. " +
      "Use this to suggest options when the visitor hasn't picked a specific date yet.",
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: 'How many open dates to return (default 5).' },
      },
      required: [],
    },
  },
  {
    name: 'check_availability',
    description:
      "Get all available appointment times for a specific date. " +
      "Use this once the visitor names a date (today, tomorrow, 'next Friday', etc.). " +
      "You must convert relative dates like 'tomorrow' to YYYY-MM-DD using the timezone info from get_business_info.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (Manila local).' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_booking',
    description:
      "Create a confirmed appointment. ONLY call this after: " +
      "(1) the visitor has chosen a specific date and time that was returned by check_availability, " +
      "(2) you have collected their full name and email, and " +
      "(3) you have read the chosen slot back to them and they have explicitly confirmed. " +
      "Phone number is optional but strongly encouraged (used for SMS reminders). " +
      "This is a final action — do not call it speculatively.",
    input_schema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Full name of the visitor.' },
        email:   { type: 'string', description: 'Email address. Required for confirmation + reminders.' },
        phone:   { type: 'string', description: "Philippine mobile, e.g. '09171234567' or '+639171234567'. Optional." },
        service: { type: 'string', description: 'What the appointment is for (e.g. "Free consultation", "Website demo").' },
        date:    { type: 'string', description: 'YYYY-MM-DD (Manila local).' },
        time:    { type: 'string', description: 'HH:MM (24h, Manila local).' },
        notes:   { type: 'string', description: 'Any extra context the visitor mentioned.' },
      },
      required: ['name', 'email', 'date', 'time'],
    },
  },
];

/** Execute a tool_use block. Returns the tool_result content string. */
export async function executeTool(env, toolName, toolInput) {
  try {
    if (toolName === 'get_business_info') {
      const now = nowManila();
      return JSON.stringify({
        business_name: env.BUSINESS_NAME || 'ARQAgents',
        timezone: env.BUSINESS_TIMEZONE || 'Asia/Manila',
        today_manila: toManilaDateStr(now),
        now_manila_iso: now.toISOString(),
        business_hours: {
          open: env.BUSINESS_HOURS_START || '09:00',
          close: env.BUSINESS_HOURS_END || '17:00',
        },
        business_days_iso: (env.BUSINESS_DAYS || '1,2,3,4,5').split(',').map(Number),
        days_legend: '1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday',
        slot_minutes: parseInt(env.SLOT_MINUTES || '30', 10),
        earliest_booking_in_hours: parseInt(env.BOOKING_LEAD_HOURS || '2', 10),
        booking_horizon_days: parseInt(env.BOOKING_HORIZON_DAYS || '30', 10),
      });
    }

    if (toolName === 'list_open_dates') {
      const count = Math.min(Math.max(parseInt(toolInput.count || 5, 10), 1), 10);
      const dates = await getNextOpenDates(env, count);
      return JSON.stringify({ open_dates: dates });
    }

    if (toolName === 'check_availability') {
      const av = await getAvailability(env, toolInput.date);
      return JSON.stringify(av);
    }

    if (toolName === 'create_booking') {
      const result = await createBooking(env, toolInput);
      if (!result.ok) return JSON.stringify({ ok: false, error: result.error });
      // Fire-and-forget notifications; if they fail we still confirm the booking.
      // We await so logs are written before the worker shuts down.
      try {
        await sendConfirmation(env, result.booking);
        await env.DB.prepare(
          `UPDATE bookings SET confirmation_sent=1 WHERE id=?`
        ).bind(result.booking.id).run();
      } catch (err) {
        console.log('notify failed but booking saved:', err);
      }
      return JSON.stringify({
        ok: true,
        booking_id: result.booking.id,
        confirmed_for: friendlyDateTime(result.booking.appointment_date, result.booking.appointment_time),
        confirmation_email_to: result.booking.email,
        sms_sent_to: result.booking.phone || null,
        summary: formatBooking(result.booking),
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
  }
}
