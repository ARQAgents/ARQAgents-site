/**
 * ════════════════════════════════════════════════════════════════════════
 *  ARQAgents — Claude Chat Cloudflare Worker
 * ════════════════════════════════════════════════════════════════════════
 *
 *  This Worker runs on Cloudflare's edge network. It holds your Anthropic
 *  API key as a secret, validates each request, and forwards it to Claude.
 *  Your website (arqagents.com) calls THIS worker; the key never reaches
 *  the browser.
 *
 *  ┌──────────────────┐     ┌─────────────────────┐     ┌──────────────┐
 *  │  arqagents.com   │────▶│  Cloudflare Worker  │────▶│ Claude API   │
 *  │  (Pages)         │◀────│  (holds API key)    │◀────│              │
 *  └──────────────────┘     └─────────────────────┘     └──────────────┘
 *
 *  DEPLOY: see DEPLOY_GUIDE.md
 * ════════════════════════════════════════════════════════════════════════
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://arqagents.com",
  "https://www.arqagents.com",
  "https://arqagents-web.pages.dev",
  "http://localhost:5500",          // VS Code Live Server
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
]);

const DEFAULT_MODEL  = "claude-sonnet-4-20250514";
const MAX_TOKENS_CAP = 400;     // hard ceiling per reply
const MAX_MESSAGES   = 30;      // max conversation length

// ─── HELPERS ────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url    = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return jsonResponse(
        { status: "ok", service: "ARQAgents Claude Worker", time: new Date().toISOString() },
        200, origin
      );
    }

    // Only the chat endpoint takes POSTs
    if (url.pathname !== "/api/chat") {
      return jsonResponse({ error: "Not found. Use POST /api/chat" }, 404, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed. Use POST." }, 405, origin);
    }

    // Get the API key from Worker secrets
    const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "Server not configured (missing API key)." }, 500, origin);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
    }

    const { model, max_tokens, system, messages } = body || {};

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "A non-empty 'messages' array is required." }, 400, origin);
    }
    if (messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: `Conversation too long (max ${MAX_MESSAGES} messages).` }, 400, origin);
    }
    for (const m of messages) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
        return jsonResponse({ error: "Each message needs role 'user'|'assistant' and string content." }, 400, origin);
      }
    }

    // Sanitize inputs
    const safeModel  = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
    const safeTokens = Math.min(Number(max_tokens) || 350, MAX_TOKENS_CAP);
    const safeSystem = typeof system === "string" ? system : "";

    // Forward to Anthropic
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
      return jsonResponse(data, claudeRes.status, origin);

    } catch (err) {
      console.error("Upstream error:", err);
      return jsonResponse({ error: "Failed to reach Anthropic API.", detail: String(err) }, 502, origin);
    }
  },
};
