// ─────────────────────────────────────────────────────────────────────────────
// index.js — Worker entry point
// Routes:
//   POST  /api/chat                   → AI chat + booking (existing site uses this)
//   GET   /api/availability?date=...  → check open slots for a date
//   GET   /api/open-dates             → next few open dates
//   POST  /api/bookings               → create booking directly (bypasses AI)
//   GET   /api/bookings               → list (admin token)
//   POST  /api/admin/cancel?id=...    → cancel a booking (admin token)
//   GET   /admin                      → minimal HTML dashboard (token in query)
//   GET   /healthz                    → liveness
//   POST  /api/_run-cron              → manual cron trigger for testing (admin token)
//
// Cron: see scheduler.js
// ─────────────────────────────────────────────────────────────────────────────
import { handleChat } from './chat.js';
import { getAvailability, getNextOpenDates, createBooking, formatBooking } from './booking.js';
import { sendConfirmation } from './notifications.js';
import { handleAdminBookings, handleAdminCancel, handleAdminDashboard } from './admin.js';
import { handleScheduled } from './scheduler.js';

export default {
  // HTTP handler
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = buildCors(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ── Chat (the existing site already POSTs here) ───────────────────────
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env, corsHeaders);
      }

      // ── Public read-only availability endpoints ───────────────────────────
      if (url.pathname === '/api/availability' && request.method === 'GET') {
        const date = url.searchParams.get('date');
        if (!date) return jsonError(400, 'date query param required', corsHeaders);
        const av = await getAvailability(env, date);
        return json(av, corsHeaders);
      }
      if (url.pathname === '/api/open-dates' && request.method === 'GET') {
        const count = parseInt(url.searchParams.get('count') || '5', 10);
        const dates = await getNextOpenDates(env, count);
        return json({ open_dates: dates }, corsHeaders);
      }

      // ── Direct booking (no AI involved) ───────────────────────────────────
      if (url.pathname === '/api/bookings' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const result = await createBooking(env, body);
        if (!result.ok) return jsonError(400, result.error, corsHeaders);
        ctx.waitUntil(sendConfirmation(env, result.booking)
          .then(() => env.DB.prepare(`UPDATE bookings SET confirmation_sent=1 WHERE id=?`)
            .bind(result.booking.id).run())
          .catch(err => console.log('notify failed', err)));
        return json({ ok: true, booking: formatBooking(result.booking) }, corsHeaders);
      }

      // ── Admin (token required) ────────────────────────────────────────────
      if (url.pathname === '/api/bookings' && request.method === 'GET') {
        return await handleAdminBookings(request, env, corsHeaders);
      }
      if (url.pathname === '/api/admin/cancel' && request.method === 'POST') {
        return await handleAdminCancel(request, env, corsHeaders);
      }
      if (url.pathname === '/admin') {
        return await handleAdminDashboard(request, env, corsHeaders);
      }
      if (url.pathname === '/api/_run-cron' && request.method === 'POST') {
        // For testing the scheduler logic manually.
        const t = request.headers.get('x-admin-token') || url.searchParams.get('token');
        if (!env.ADMIN_TOKEN || t !== env.ADMIN_TOKEN) return new Response('Unauthorized', { status: 401 });
        const report = await handleScheduled({}, env, ctx);
        return json(report, corsHeaders);
      }

      // ── Health check ──────────────────────────────────────────────────────
      if (url.pathname === '/healthz') {
        return json({ ok: true, service: 'arqagents-booking', time: new Date().toISOString() }, corsHeaders);
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.log('Unhandled error:', err, err.stack);
      return jsonError(500, 'Internal error', corsHeaders);
    }
  },

  // Cron handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },
};

// ── helpers ─────────────────────────────────────────────────────────────────
function buildCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Max-Age': '86400',
  };
}
function json(obj, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
function jsonError(status, message, corsHeaders) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
