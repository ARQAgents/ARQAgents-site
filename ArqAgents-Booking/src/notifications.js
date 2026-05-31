// ─────────────────────────────────────────────────────────────────────────────
// notifications.js — Email (Resend) + SMS (Semaphore PH)
// ─────────────────────────────────────────────────────────────────────────────
import { friendlyDateTime } from './timezone.js';

// ─── Email via Resend ────────────────────────────────────────────────────────
async function sendEmail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, detail: 'RESEND_API_KEY not configured' };
  }
  if (!to) return { ok: false, detail: 'no email address' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'ARQAgents <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
        text,
        reply_to: env.REPLY_TO_EMAIL || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `Resend ${res.status}: ${JSON.stringify(body)}` };
    return { ok: true, detail: body.id || 'sent' };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

// ─── SMS via Semaphore (PH) ──────────────────────────────────────────────────
async function sendSms(env, { to, message }) {
  if (!env.SEMAPHORE_API_KEY) return { ok: false, detail: 'SEMAPHORE_API_KEY not configured' };
  if (!to) return { ok: false, detail: 'no phone number' };

  try {
    const params = new URLSearchParams();
    params.set('apikey', env.SEMAPHORE_API_KEY);
    params.set('number', to);
    params.set('message', message.slice(0, 459)); // 3 SMS max per send
    if (env.SMS_SENDER_NAME) params.set('sendername', env.SMS_SENDER_NAME);

    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `Semaphore ${res.status}: ${JSON.stringify(body)}` };
    return { ok: true, detail: Array.isArray(body) && body[0]?.message_id ? `msg ${body[0].message_id}` : 'sent' };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

// ─── Audit log helper ────────────────────────────────────────────────────────
async function logNotif(env, bookingId, kind, channel, result) {
  try {
    await env.DB.prepare(
      `INSERT INTO notifications_log (booking_id, kind, channel, ok, detail)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(bookingId, kind, channel, result.ok ? 1 : 0, result.detail || '').run();
  } catch (_) { /* never fail a send because logging failed */ }
}

// ─── Message templates ───────────────────────────────────────────────────────
function tplConfirmationHtml(b, env) {
  const when = friendlyDateTime(b.appointment_date, b.appointment_time);
  const svc = b.service ? `<p><strong>Service:</strong> ${escapeHtml(b.service)}</p>` : '';
  const notes = b.notes ? `<p><strong>Notes:</strong> ${escapeHtml(b.notes)}</p>` : '';
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0c0c0f;color:#f5f5f7;border-radius:12px;">
    <div style="font-size:14px;letter-spacing:.18em;color:#FCD116;text-transform:uppercase;">${escapeHtml(env.BUSINESS_NAME || 'ARQAgents')}</div>
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:8px 0 16px 0;">You're booked! 🎉</h1>
    <p>Hi ${escapeHtml(b.name)}, your appointment is confirmed.</p>
    <div style="background:#18181e;border-left:3px solid #FCD116;padding:16px;border-radius:6px;margin:20px 0;">
      <p style="margin:0 0 6px 0;"><strong>${when}</strong></p>
      <p style="margin:0;color:#909098;font-size:13px;">Booking ID: ${b.id}</p>
    </div>
    ${svc}${notes}
    <p style="margin-top:24px;font-size:13px;color:#909098;">
      Need to reschedule or cancel? Just reply to this email and we'll sort it out.
    </p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:24px 0;"/>
    <p style="font-size:12px;color:#606070;">${escapeHtml(env.BUSINESS_NAME || 'ARQAgents')} · Reply for support</p>
  </div>`;
}

function tplConfirmationText(b) {
  const when = friendlyDateTime(b.appointment_date, b.appointment_time);
  return `Hi ${b.name}, your appointment is confirmed for ${when}.
Booking ID: ${b.id}
${b.service ? 'Service: ' + b.service + '\n' : ''}Reply to this email if you need to reschedule.`;
}

function tplConfirmationSms(b, env) {
  const when = friendlyDateTime(b.appointment_date, b.appointment_time);
  return `${env.BUSINESS_NAME || 'ARQAgents'}: Hi ${b.name.split(' ')[0]}, your appointment is confirmed for ${when}. Ref: ${b.id}`;
}

function tpl1DayHtml(b, env) {
  const when = friendlyDateTime(b.appointment_date, b.appointment_time);
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0c0c0f;color:#f5f5f7;border-radius:12px;">
    <div style="font-size:14px;letter-spacing:.18em;color:#FCD116;text-transform:uppercase;">Reminder</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;margin:8px 0 16px 0;">See you tomorrow, ${escapeHtml(b.name.split(' ')[0])}!</h1>
    <p>Just a friendly reminder: you have an appointment with ${escapeHtml(env.BUSINESS_NAME || 'ARQAgents')} tomorrow.</p>
    <div style="background:#18181e;border-left:3px solid #FCD116;padding:16px;border-radius:6px;margin:20px 0;">
      <p style="margin:0;"><strong>${when}</strong></p>
    </div>
    <p style="font-size:13px;color:#909098;">Can't make it? Reply to this email and we'll reschedule.</p>
  </div>`;
}
function tpl1DayText(b) {
  return `Reminder: you have an appointment with us tomorrow — ${friendlyDateTime(b.appointment_date, b.appointment_time)}. Reply to reschedule.`;
}
function tpl1DaySms(b, env) {
  return `${env.BUSINESS_NAME || 'ARQAgents'}: Hi ${b.name.split(' ')[0]}, reminder — your appointment is tomorrow at ${formatTime12(b.appointment_time)}. See you then!`;
}

function tplDayOfHtml(b, env) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0c0c0f;color:#f5f5f7;border-radius:12px;">
    <div style="font-size:14px;letter-spacing:.18em;color:#FCD116;text-transform:uppercase;">Today</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;margin:8px 0 16px 0;">Good morning, ${escapeHtml(b.name.split(' ')[0])} ☀️</h1>
    <p>Your appointment with ${escapeHtml(env.BUSINESS_NAME || 'ARQAgents')} is today at <strong>${formatTime12(b.appointment_time)}</strong>.</p>
    <p style="font-size:13px;color:#909098;">Looking forward to seeing you!</p>
  </div>`;
}
function tplDayOfText(b, env) {
  return `Good morning! Your appointment with ${env.BUSINESS_NAME || 'ARQAgents'} is today at ${formatTime12(b.appointment_time)}. See you soon!`;
}
function tplDayOfSms(b, env) {
  return `${env.BUSINESS_NAME || 'ARQAgents'}: Good morning ${b.name.split(' ')[0]}! Your appointment is today at ${formatTime12(b.appointment_time)}. See you soon!`;
}

function tplThankYouHtml(b, env) {
  const survey = env.SURVEY_URL || '';
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0c0c0f;color:#f5f5f7;border-radius:12px;">
    <div style="font-size:14px;letter-spacing:.18em;color:#FCD116;text-transform:uppercase;">Thank you</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;margin:8px 0 16px 0;">Thanks for stopping by, ${escapeHtml(b.name.split(' ')[0])} 🙏</h1>
    <p>It was great having you today. We'd love to hear how it went — just 1 minute.</p>
    ${survey ? `<p style="margin:24px 0;"><a href="${survey}" style="display:inline-block;background:#FCD116;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Leave Feedback →</a></p>` : ''}
    <p style="font-size:13px;color:#909098;">Hope to see you again soon!</p>
  </div>`;
}
function tplThankYouText(b, env) {
  return `Thanks for visiting ${env.BUSINESS_NAME || 'ARQAgents'} today! Mind sharing quick feedback? ${env.SURVEY_URL || ''}`;
}
function tplThankYouSms(b, env) {
  const url = env.SURVEY_URL ? ` ${env.SURVEY_URL}` : '';
  return `${env.BUSINESS_NAME || 'ARQAgents'}: Thanks for visiting today, ${b.name.split(' ')[0]}! We'd love your feedback:${url}`;
}

// ─── Public send functions ───────────────────────────────────────────────────
export async function sendConfirmation(env, booking) {
  const results = [];
  const e = await sendEmail(env, {
    to: booking.email,
    subject: `Booking confirmed — ${friendlyDateTime(booking.appointment_date, booking.appointment_time)}`,
    html: tplConfirmationHtml(booking, env),
    text: tplConfirmationText(booking),
  });
  await logNotif(env, booking.id, 'confirmation', 'email', e);
  results.push({ channel: 'email', ...e });

  if (booking.phone) {
    const s = await sendSms(env, { to: booking.phone, message: tplConfirmationSms(booking, env) });
    await logNotif(env, booking.id, 'confirmation', 'sms', s);
    results.push({ channel: 'sms', ...s });
  }

  // Owner copy (optional)
  if (env.OWNER_EMAIL) {
    const o = await sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `📅 New booking — ${booking.name} (${friendlyDateTime(booking.appointment_date, booking.appointment_time)})`,
      html: `<pre style="font-family:monospace;">${escapeHtml(JSON.stringify(booking, null, 2))}</pre>`,
      text: JSON.stringify(booking, null, 2),
    });
    await logNotif(env, booking.id, 'owner_alert', 'email', o);
  }
  if (env.OWNER_PHONE) {
    const o = await sendSms(env, {
      to: env.OWNER_PHONE,
      message: `New booking: ${booking.name} — ${friendlyDateTime(booking.appointment_date, booking.appointment_time)}`,
    });
    await logNotif(env, booking.id, 'owner_alert', 'sms', o);
  }

  return results;
}

export async function send1DayReminder(env, booking) {
  const e = await sendEmail(env, {
    to: booking.email,
    subject: `Reminder: appointment tomorrow at ${formatTime12(booking.appointment_time)}`,
    html: tpl1DayHtml(booking, env),
    text: tpl1DayText(booking),
  });
  await logNotif(env, booking.id, 'reminder_1day', 'email', e);
  if (booking.phone) {
    const s = await sendSms(env, { to: booking.phone, message: tpl1DaySms(booking, env) });
    await logNotif(env, booking.id, 'reminder_1day', 'sms', s);
  }
}

export async function sendDayOfReminder(env, booking) {
  const e = await sendEmail(env, {
    to: booking.email,
    subject: `Today: your appointment is at ${formatTime12(booking.appointment_time)}`,
    html: tplDayOfHtml(booking, env),
    text: tplDayOfText(booking, env),
  });
  await logNotif(env, booking.id, 'reminder_dayof', 'email', e);
  if (booking.phone) {
    const s = await sendSms(env, { to: booking.phone, message: tplDayOfSms(booking, env) });
    await logNotif(env, booking.id, 'reminder_dayof', 'sms', s);
  }
}

export async function sendThankYou(env, booking) {
  const e = await sendEmail(env, {
    to: booking.email,
    subject: `Thanks for visiting ${env.BUSINESS_NAME || 'us'} today!`,
    html: tplThankYouHtml(booking, env),
    text: tplThankYouText(booking, env),
  });
  await logNotif(env, booking.id, 'thankyou', 'email', e);
  if (booking.phone) {
    const s = await sendSms(env, { to: booking.phone, message: tplThankYouSms(booking, env) });
    await logNotif(env, booking.id, 'thankyou', 'sms', s);
  }
}

// ─── small utils ─────────────────────────────────────────────────────────────
function formatTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  let hour12 = h % 12; if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
