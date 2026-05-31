// ─────────────────────────────────────────────────────────────────────────────
// chat.js — Anthropic API proxy with tool-use loop for bookings
// ─────────────────────────────────────────────────────────────────────────────
import { BOOKING_TOOLS, executeTool } from './tools.js';

const MAX_TOOL_ITERATIONS = 6; // safety: prevent runaway loops
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Handles POST /api/chat.
 *
 * Accepts the same body shape as the existing index.html:
 *   { model, max_tokens, system, messages }
 *
 * Returns an Anthropic-compatible response shape so the existing
 * HTML frontend keeps working with no changes:
 *   { content: [{ type:'text', text:'...' }], usage: { input_tokens, output_tokens } }
 *
 * Internally we add the booking tools and run a tool-use loop.
 */
export async function handleChat(request, env, corsHeaders) {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(500, 'ANTHROPIC_API_KEY not configured on the worker', corsHeaders);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }

  const model = body.model || env.CLAUDE_MODEL || 'claude-haiku-4-5';
  const maxTokens = clampInt(body.max_tokens, 50, 2048, 400);
  const userSystem = typeof body.system === 'string' ? body.system : '';
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) return jsonError(400, 'messages required', corsHeaders);

  // Compose final system prompt: caller's system + booking instructions appended.
  const system = [userSystem, BOOKING_AGENT_SUFFIX].filter(Boolean).join('\n\n');

  // ── Tool-use loop ──────────────────────────────────────────────────────────
  let convoMessages = [...messages];
  let totalInTokens = 0;
  let totalOutTokens = 0;
  let finalText = '';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const apiResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        tools: BOOKING_TOOLS,
        messages: convoMessages,
      }),
    });

    if (!apiResp.ok) {
      const errBody = await apiResp.json().catch(() => ({}));
      return jsonError(apiResp.status, errBody.error?.message || `Claude API ${apiResp.status}`, corsHeaders);
    }

    const data = await apiResp.json();
    totalInTokens  += data.usage?.input_tokens  || 0;
    totalOutTokens += data.usage?.output_tokens || 0;

    const stopReason = data.stop_reason;
    const blocks = Array.isArray(data.content) ? data.content : [];

    // Accumulate any text Claude wrote in this turn (only used if no tools were called)
    const textBlocks = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n').trim();

    if (stopReason !== 'tool_use') {
      // We're done. Return Claude's text as-is.
      finalText = textBlocks;
      break;
    }

    // Claude wants to call one or more tools. Execute them, then send results back.
    const toolUses = blocks.filter(b => b.type === 'tool_use');
    const toolResults = [];
    for (const tu of toolUses) {
      const out = await executeTool(env, tu.name, tu.input || {});
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }

    // Add assistant turn (full content with tool_use blocks) + our user turn with tool_results
    convoMessages = [
      ...convoMessages,
      { role: 'assistant', content: blocks },
      { role: 'user', content: toolResults },
    ];
    // loop
  }

  if (!finalText) {
    finalText = "Sorry — I got stuck while booking. Could you try again, or email hello@arqagents.com?";
  }

  // Anthropic-compatible response shape so the existing HTML works as-is.
  const responseBody = {
    content: [{ type: 'text', text: finalText }],
    usage: { input_tokens: totalInTokens, output_tokens: totalOutTokens },
  };
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function jsonError(status, message, corsHeaders) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...(corsHeaders || {}) },
  });
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suffix appended to whatever system prompt the website sends.
// This teaches Claude how to use the booking tools.
// ─────────────────────────────────────────────────────────────────────────────
const BOOKING_AGENT_SUFFIX = `
## BOOKING CAPABILITY

You can book appointments directly via the tools provided. Follow this exact flow when a visitor wants to book:

1. **Acknowledge** their request to book and ask what the appointment is for if not already clear.
2. **Call \`get_business_info\`** ONCE early in the booking flow to learn today's date, business hours, and days open. Use the \`today_manila\` field to resolve relative dates like "tomorrow" or "next Tuesday" to YYYY-MM-DD.
3. If they haven't picked a date, **call \`list_open_dates\`** and present 3–5 options conversationally (e.g., "I have openings on Mon Dec 2, Tue Dec 3, or Thu Dec 5 — any of those work?").
4. Once they pick a date, **call \`check_availability\`** for that date and list the times in 12-hour format (e.g., "9:00 AM, 10:30 AM, 2:00 PM"). Never invent times — only offer what the tool returned.
5. Once they pick a time, ask for their **name** and **email** (required) and **phone number** (optional, for SMS reminders). Collect all in one turn if possible. Don't ask for one field at a time.
6. **Read back** the full details ("So I have you down for Tue Dec 3 at 2 PM, name X, email Y. Shall I confirm?") and wait for a clear yes.
7. Only after explicit confirmation, **call \`create_booking\`**. Then tell them confirmation has been sent to their email (and SMS if they gave a phone).

### Rules
- Never offer a date or time that wasn't returned by the tools.
- All times are Manila local. When the visitor says "tomorrow" or "Friday", convert based on \`today_manila\` from get_business_info.
- If \`check_availability\` returns no slots (reason: closed_day, time_off, past_date, beyond_horizon), explain politely and suggest another day.
- If \`create_booking\` returns \`ok: false\`, explain the issue gently and offer to pick another slot.
- Be warm, brief, and confident. One question at a time when the visitor seems unsure, but combine fields when they're clearly ready to book.
- For non-booking questions, answer normally without calling tools.
`;
