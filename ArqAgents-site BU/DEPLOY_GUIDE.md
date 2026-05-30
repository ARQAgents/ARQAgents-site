# 🚀 ARQAgents.com — Complete Deployment Guide

Everything you need to launch **ARQAgents.com** with a working AI chat,
where your API key stays completely private.

---

## Architecture overview

```
┌────────────────────┐     ┌──────────────────────────┐     ┌──────────────┐
│  ARQAgents.com     │────▶│ Supabase Edge Function   │────▶│ Claude API   │
│  (Vercel/Netlify)  │◀────│ (holds ANTHROPIC_API_KEY)│◀────│              │
│   index.html       │     │   /functions/v1/chat     │     │              │
└────────────────────┘     └──────────────────────────┘     └──────────────┘
   👀 Public                  🔒 Secret stays here            🔒 Never exposed
```

**Cost: ₱0/month** on the free tiers (Vercel + Supabase free).

---

## 📁 What's in this package

```
arqagents-site/
├── index.html              ← Your homepage
├── vercel.json             ← Vercel hosting config (security headers + caching)
├── netlify.toml            ← Netlify config (alternative to Vercel)
├── .gitignore              ← Keep secrets out of git
├── DEPLOY_GUIDE.md         ← This file
└── supabase/
    └── functions/
        └── chat/
            └── index.ts    ← Your secure Claude proxy (Deno/TypeScript)
```

---

# PART 1 — Deploy the Supabase Edge Function (the secure backend)

This is the part that holds your API key. Do this **first**.

### Step 1.1 — Install Supabase CLI

**macOS (Homebrew):**
```bash
brew install supabase/tap/supabase
```

**Windows (Scoop):**
```powershell
scoop install supabase
```

**Or via npm (any OS):**
```bash
npm install -g supabase
```

Verify:
```bash
supabase --version
```

### Step 1.2 — Log in and link to your project

```bash
supabase login
```
This opens your browser to authenticate.

Find your **project ref** at: `app.supabase.com` → your project → **Settings** → **General** → **Reference ID** (looks like `abcdefghijklmnop`).

```bash
# Navigate INTO the arqagents-site folder first
cd arqagents-site

# Link to your project
supabase link --project-ref YOUR-PROJECT-REF
```

### Step 1.3 — Set your API key as a secret

⚠️ Get your key at: https://console.anthropic.com/settings/keys

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

Verify it's set:
```bash
supabase secrets list
```

You should see `ANTHROPIC_API_KEY` (the value is hidden — that's correct).

### Step 1.4 — Deploy the function

```bash
supabase functions deploy chat --no-verify-jwt
```

> The `--no-verify-jwt` flag makes the function publicly callable from your
> website without requiring a user to be logged in. The function still
> enforces CORS, model allow-list, and message validation.

You'll see something like:
```
Deployed Function: chat
Function URL: https://YOUR-PROJECT-REF.supabase.co/functions/v1/chat
```

**Copy that URL.** You'll paste it into your HTML next.

### Step 1.5 — Test the function

```bash
curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}]}'
```

You should see a JSON response with Claude's reply. ✅

---

# PART 2 — Connect your website to the function

### Step 2.1 — Update the proxy URL in index.html

Open `index.html` and find this near line 2360:

```js
const PROXY_URL = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/chat';
```

Replace `YOUR-PROJECT-REF` with your actual project reference.

### Step 2.2 — Test locally first

Open `index.html` in VS Code → right-click → **Open with Live Server**.

Try the chat — it should respond. If it doesn't:

- Open browser DevTools (F12) → **Network** tab → click the failing request → check the response.
- Most common issue: **CORS error**. See troubleshooting below.

---

# PART 3 — Deploy ARQAgents.com (the website)

## Option A — Vercel (recommended, easiest)

### Step 3A.1 — Create a GitHub repo

```bash
cd arqagents-site
git init
git add .
git commit -m "Initial commit"
```

Create a new repo at github.com (don't add a README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/arqagents-site.git
git branch -M main
git push -u origin main
```

### Step 3A.2 — Import to Vercel

1. Go to **vercel.com** → log in with GitHub
2. Click **Add New** → **Project**
3. Select your `arqagents-site` repo → click **Import**
4. **Framework Preset:** `Other`
5. **Root Directory:** leave as `./`
6. Click **Deploy**

Wait ~30 seconds. You'll get a `*.vercel.app` URL — test it works.

### Step 3A.3 — Connect ARQAgents.com domain

1. In Vercel → your project → **Settings** → **Domains**
2. Add `arqagents.com` AND `www.arqagents.com`
3. Vercel shows you DNS records to add
4. Go to your domain registrar (where you bought ARQAgents.com)
5. Add the records Vercel shows (typically an `A` record and a `CNAME`)
6. Wait 5–60 minutes for DNS to propagate

Done! 🎉 ARQAgents.com is live.

## Option B — Netlify (also easy)

1. Push to GitHub same as above
2. Go to **netlify.com** → **Add new site** → **Import an existing project**
3. Connect repo → leave build settings as defaults → **Deploy**
4. **Domain settings** → **Add custom domain** → `arqagents.com`
5. Follow Netlify's DNS instructions at your registrar

---

# PART 4 — Final security check

After ARQAgents.com is live, make sure your **Supabase function CORS** allows
your real domain. Open `supabase/functions/chat/index.ts` and confirm:

```typescript
const ALLOWED_ORIGINS = [
  "https://arqagents.com",
  "https://www.arqagents.com",
  // ...
];
```

If you change this, redeploy with:
```bash
supabase functions deploy chat --no-verify-jwt
```

---

# 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `CORS error` in browser console | Add your domain to `ALLOWED_ORIGINS` in the function, redeploy |
| `Server not configured (missing API key)` | You forgot `supabase secrets set ANTHROPIC_API_KEY=...` |
| `401 Unauthorized` from Supabase | You deployed without `--no-verify-jwt`. Redeploy with that flag. |
| Chat says "Connection issue" | Check the `PROXY_URL` in `index.html` matches your function URL exactly |
| Domain not resolving | DNS takes up to 60 mins. Check at `dnschecker.org` |
| Want to update the function | Edit `index.ts`, then run `supabase functions deploy chat --no-verify-jwt` |
| Want to see function logs | `supabase functions logs chat` |
| Need to rotate your API key | Update at console.anthropic.com → `supabase secrets set ANTHROPIC_API_KEY=new-key` |

---

# 💰 Cost estimates

| Service | Free Tier | When you'd pay |
|---|---|---|
| **Vercel** | 100 GB bandwidth/month | Heavy traffic — unlikely for a small business site |
| **Supabase** | 500k Edge Function invocations/month | If you exceed 500k chat messages/month (very generous) |
| **Anthropic API** | Pay per token | ~$0.003 per simple chat reply with Claude Sonnet 4 |
| **Domain (ARQAgents.com)** | Annual renewal | ~$10–15/year |

**Realistic monthly cost for a new business:** ~$5–20 in API costs as traffic grows.

---

# 🔄 Updating your site

After making changes to `index.html` locally:

```bash
git add .
git commit -m "Update homepage"
git push
```

Vercel/Netlify auto-redeploys in ~30 seconds. That's it.

---

# 📝 Where to edit AI behavior

Your AI's instructions live in two places in `index.html`:

- **`DEMO_SYSTEM`** (around line 2901) — the big chat widget on the page
- **`MINI_SYSTEM`** (around line 3022) — the popup chat bubble

Edit these to change pricing, services, or AI personality. Then push to GitHub — your site updates automatically.

---

# ✅ Launch checklist

- [ ] Supabase CLI installed and logged in
- [ ] Function deployed: `supabase functions deploy chat --no-verify-jwt`
- [ ] `ANTHROPIC_API_KEY` secret set in Supabase
- [ ] `curl` test of the function returns a Claude response
- [ ] `PROXY_URL` updated in `index.html` with your real Supabase URL
- [ ] Local Live Server test — chat works
- [ ] Code pushed to GitHub
- [ ] Vercel/Netlify deployment succeeded
- [ ] ARQAgents.com DNS records added at registrar
- [ ] HTTPS works on ARQAgents.com
- [ ] Chat works on the live ARQAgents.com domain
- [ ] CORS in the Supabase function includes `arqagents.com`

You're live! 🇵🇭
