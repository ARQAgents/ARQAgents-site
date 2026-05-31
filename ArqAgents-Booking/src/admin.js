// ─────────────────────────────────────────────────────────────────────────────
// admin.js — token-protected read endpoints + a tiny HTML dashboard
// ─────────────────────────────────────────────────────────────────────────────
import { nowManila, toManilaDateStr, friendlyDateTime } from './timezone.js';

function auth(request, env) {
  const url = new URL(request.url);
  const t = request.headers.get('x-admin-token') || url.searchParams.get('token');
  return env.ADMIN_TOKEN && t === env.ADMIN_TOKEN;
}

export async function handleAdminBookings(request, env, corsHeaders) {
  if (!auth(request, env)) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'upcoming';
  const today = toManilaDateStr(nowManila());

  let rows;
  if (filter === 'all') {
    rows = await env.DB.prepare(
      `SELECT * FROM bookings ORDER BY appointment_date DESC, appointment_time DESC LIMIT 200`
    ).all();
  } else if (filter === 'today') {
    rows = await env.DB.prepare(
      `SELECT * FROM bookings WHERE appointment_date = ? ORDER BY appointment_time ASC`
    ).bind(today).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT * FROM bookings WHERE appointment_date >= ? AND status='confirmed'
       ORDER BY appointment_date ASC, appointment_time ASC LIMIT 100`
    ).bind(today).all();
  }

  return new Response(JSON.stringify({ count: (rows.results || []).length, bookings: rows.results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export async function handleAdminCancel(request, env, corsHeaders) {
  if (!auth(request, env)) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('id required', { status: 400, headers: corsHeaders });
  await env.DB.prepare(
    `UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`
  ).bind(id).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export async function handleAdminDashboard(request, env, corsHeaders) {
  // Renders a minimal HTML dashboard. Token must be passed as ?token=...
  if (!auth(request, env)) {
    return new Response(
      `<!doctype html><meta charset=utf-8>
       <body style="font-family:system-ui;background:#0c0c0f;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;">
         <div>
           <h2>ARQAgents Admin</h2>
           <p>Append <code>?token=YOUR_ADMIN_TOKEN</code> to this URL.</p>
         </div>
       </body>`,
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  const today = toManilaDateStr(nowManila());
  const rows = await env.DB.prepare(
    `SELECT * FROM bookings WHERE appointment_date >= ? AND status='confirmed'
       ORDER BY appointment_date ASC, appointment_time ASC LIMIT 100`
  ).bind(today).all();

  const items = (rows.results || []).map(b => `
    <tr>
      <td>${friendlyDateTime(b.appointment_date, b.appointment_time)}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.email)}<br><span style="color:#909098;font-size:.85em;">${escapeHtml(b.phone || '')}</span></td>
      <td>${escapeHtml(b.service || '—')}</td>
      <td>${escapeHtml(b.notes || '')}</td>
      <td style="font-family:monospace;font-size:.85em;color:#909098;">${b.id}</td>
    </tr>`).join('');

  const url = new URL(request.url);
  const tok = url.searchParams.get('token') || '';
  const html = `<!doctype html><meta charset=utf-8>
<title>ARQAgents Admin · Upcoming Bookings</title>
<style>
  :root { --bg:#0c0c0f; --card:#18181e; --gold:#FCD116; --muted:#909098; }
  body { font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:#f5f5f7; margin:0; padding:32px; }
  h1 { font-family:Georgia,serif; font-weight:400; margin:0 0 4px 0; }
  .sub { color:var(--muted); font-size:.9rem; margin-bottom:24px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border-radius:8px; overflow:hidden; }
  th, td { padding:12px 14px; text-align:left; border-bottom:1px solid rgba(255,255,255,.06); font-size:.92rem; }
  th { background:#22222a; color:var(--gold); font-weight:600; text-transform:uppercase; letter-spacing:.08em; font-size:.72rem; }
  tr:last-child td { border-bottom:none; }
  .empty { padding:48px; text-align:center; color:var(--muted); }
</style>
<body>
  <h1>Upcoming Bookings</h1>
  <div class="sub">${rows.results?.length || 0} confirmed appointments · token: <code>${escapeHtml(tok.slice(0,4))}…</code></div>
  ${rows.results?.length ? `
    <table>
      <thead><tr>
        <th>When</th><th>Name</th><th>Contact</th><th>Service</th><th>Notes</th><th>ID</th>
      </tr></thead>
      <tbody>${items}</tbody>
    </table>` : `<div class="empty">No upcoming bookings yet.</div>`}
</body>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
