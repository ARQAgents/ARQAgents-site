// ════════════════════════════════════════════════════════════════════════
//  ARQ Agents — Claude Chat Edge Function (Supabase)
// ════════════════════════════════════════════════════════════════════════
//
//  This runs on Supabase's edge network. It holds your Anthropic API key
//  as a secret, validates each request, and forwards it to Claude.
//  Your website never sees the API key.
//
//  ┌──────────────┐    ┌──────────────────────┐    ┌─────────────────┐
//  │ ARQAgents.com│───▶│ Supabase Edge Func   │───▶│ api.anthropic.. │
//  │  (browser)   │◀───│ (holds ANTHROPIC_KEY)│◀───│                 │
//  └──────────────┘    └──────────────────────┘    └─────────────────┘
//
//  DEPLOY:  see DEPLOY_GUIDE.md in the project root
// ════════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─── CONFIG ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://arqagents.com",
  "https://www.arqagents.com",
  "http://localhost:5500",          // VS Code Live Server
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:5173",
];

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-5-20251001",
]);

const DEFAULT_MODEL  = "claude-sonnet-4-20250514";
const MAX_TOKENS_CAP = 400;     // hard ceiling per reply
const MAX_MESSAGES   = 30;      // max conversation length

// ─── CORS HELPER ────────────────────────────────────────────────────────
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, apikey",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // Pre-flight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Reject anything that's not POST
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405, origin);
  }

  // Get the API key from Supabase secrets
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Server not configured (missing API key)." }, 500, origin);
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, origin);
  }

  const { model, max_tokens, system, messages } = body || {};

  // Validate messages array
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "A non-empty 'messages' array is required." }, 400, origin);
  }
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `Conversation too long (max ${MAX_MESSAGES} messages).` }, 400, origin);
  }
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return json({ error: "Each message needs role 'user'|'assistant' and string content." }, 400, origin);
    }
  }

  // Sanitize model & tokens
  const safeModel  = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const safeTokens = Math.min(Number(max_tokens) || 350, MAX_TOKENS_CAP);
  const safeSystem = typeof system === "string" ? system : "";

  // Forward to Claude
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      safeModel,
        max_tokens: safeTokens,
        system:     safeSystem,
        messages,
      }),
    });

    const data = await claudeRes.json();
    return json(data, claudeRes.status, origin);

  } catch (err) {
    console.error("Upstream error:", err);
    return json({ error: "Failed to reach Anthropic API.", detail: String(err) }, 502, origin);
  }
});
