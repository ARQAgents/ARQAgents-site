# 🚀 ARQAgents.com — Cloudflare Deployment Guide

Your domain is on Cloudflare — let's deploy the **whole stack** on Cloudflare:

- 🌐 **Cloudflare Pages** → hosts ARQAgents.com (static site)
- ⚡ **Cloudflare Workers** → secure backend (holds your Anthropic API key)
- 🔒 Everything runs on Cloudflare's edge network, integrates seamlessly with your domain

**Cost: ₱0/month** on Cloudflare's free tier (100k Worker requests/day, unlimited Pages bandwidth).

---

## Architecture

```
┌────────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  arqagents.com     │────▶│  Cloudflare Worker   │────▶│ Claude API   │
│  (Pages)           │◀────│  (holds API key)     │◀────│              │
│  index.html        │     │  api.arqagents.com   │     │              │
└────────────────────┘     └──────────────────────┘     └──────────────┘
   👀 Public                  🔒 Secret stays here          🔒 Never exposed
```

---

## 📁 What's in this package

```
arqagents-site/
├── index.html              ← Your homepage (with 🤖 AI robot logo)
├── _headers                ← Cloudflare Pages security headers
├── .gitignore              ← Keep secrets out of git
├── README.md               ← Quick overview
├── DEPLOY_GUIDE.md         ← This file
└── worker/
    ├── worker.js           ← Secure Claude proxy (Cloudflare Worker)
    └── wrangler.toml       ← Worker config
```

---

# PART 1 — Deploy the Cloudflare Worker (secure backend)

This is the part that holds your API key. Do this **first**.

### Step 1.1 — Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler --version
```

### Step 1.2 — Log in

```bash
wrangler login
```
A browser window opens. Click **Allow**. You're now linked to your Cloudflare account.

### Step 1.3 — Set your Anthropic API key as a Worker secret

⚠️ Get your key at: https://console.anthropic.com/settings/keys

```bash
cd arqagents-site/worker
wrangler secret put ANTHROPIC_API_KEY
```

It will prompt:
```
Enter a secret value: ▢
```
Paste your `sk-ant-xxxxx` key and press Enter.

> ⚠️ The key is now encrypted and stored on Cloudflare. It will never be
> visible again — not in code, not in the dashboard. That's the point.

### Step 1.4 — Deploy the Worker

```bash
wrangler deploy
```

You'll see something like:
```
Deployed arqagents-chat
  https://arqagents-chat.YOUR-CF-USERNAME.workers.dev
```

**Copy that URL** — you'll paste it into `index.html` next.

### Step 1.5 — Test it

```bash
curl https://arqagents-chat.YOUR-CF-USERNAME.workers.dev/health
```

Should return:
```json
{ "status": "ok", "service": "ARQAgents Claude Worker" }
```

Now a real chat test:
```bash
curl -X POST https://arqagents-chat.YOUR-CF-USERNAME.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}]}'
```

You should see a JSON response with Claude's reply. ✅

---

# PART 2 — Connect your website to the Worker

### Step 2.1 — Update the URL in index.html

Open `index.html` and find this line (around line ~2360):

```js
const PROXY_URL = 'https://arqagents-chat.YOUR-CF-USERNAME.workers.dev/api/chat';
```

Replace `YOUR-CF-USERNAME` with your actual Cloudflare account subdomain.

### Step 2.2 — Test locally

Open `index.html` in VS Code → right-click → **Open with Live Server**.

Try the chat — it should respond. If not:
- Open DevTools (F12) → **Network** → click the failing request → check the response
- Most likely: **CORS error** — fix the `ALLOWED_ORIGINS` in `worker/worker.js`, then redeploy:
  ```bash
  wrangler deploy
  ```

---

# PART 3 — Deploy the website to Cloudflare Pages

### Option A — Via Cloudflare Dashboard (easiest)

#### Step 3A.1 — Push to GitHub

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

#### Step 3A.2 — Connect Pages to your repo

1. Go to **dash.cloudflare.com** → **Workers & Pages** → **Create**
2. Click the **Pages** tab → **Connect to Git**
3. Authorize GitHub → select your `arqagents-site` repo
4. Settings:
   - **Project name:** `arqagents`
   - **Production branch:** `main`
   - **Build command:** *(leave blank — static site)*
   - **Build output directory:** `/`
5. Click **Save and Deploy**

Wait ~30 seconds. You'll get a `arqagents.pages.dev` URL.

#### Step 3A.3 — Connect ARQAgents.com domain

Since your domain is **already on Cloudflare**, this is the easy part:

1. In your Pages project → **Custom domains** → **Set up a custom domain**
2. Enter `arqagents.com` → click **Continue**
3. Cloudflare auto-configures the DNS (since it manages your domain already)
4. Repeat for `www.arqagents.com`
5. SSL provisions automatically in ~1 minute

Done! 🎉 **arqagents.com** is live.

### Option B — Via Wrangler CLI

```bash
cd arqagents-site
wrangler pages deploy . --project-name=arqagents
```

Then add the custom domain via the Pages dashboard as in Option A Step 3.

---

# PART 4 — (Optional, recommended) Custom subdomain for your Worker

Right now your Worker is at `arqagents-chat.YOUR-CF-USERNAME.workers.dev`.
That looks unprofessional. Let's make it `api.arqagents.com` instead.

### Step 4.1 — Add DNS record

1. In Cloudflare dashboard → select **arqagents.com** zone
2. Go to **DNS** → **Records** → **Add record**
3. Type: `AAAA`, Name: `api`, IPv6 address: `100::` (placeholder), Proxy status: **Proxied (orange cloud)**
4. Save

### Step 4.2 — Update wrangler.toml

Open `worker/wrangler.toml` and uncomment the routes block:

```toml
[[routes]]
pattern = "api.arqagents.com/*"
zone_name = "arqagents.com"
custom_domain = true
```

### Step 4.3 — Redeploy

```bash
cd worker
wrangler deploy
```

### Step 4.4 — Update HTML

In `index.html`, change the proxy URL to:

```js
const PROXY_URL = 'https://api.arqagents.com/api/chat';
```

Commit and push — Pages auto-redeploys.

Now your stack is fully on `arqagents.com`. 🇵🇭

---

# 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `wrangler: command not found` | `npm install -g wrangler` |
| `CORS error` in browser | Add your domain to `ALLOWED_ORIGINS` in `worker/worker.js`, then `wrangler deploy` |
| `Server not configured (missing API key)` | Run `wrangler secret put ANTHROPIC_API_KEY` again |
| Chat says "Connection issue" | Check `PROXY_URL` in `index.html` matches your Worker URL exactly |
| Domain not resolving | Cloudflare DNS is usually instant. Wait 2-5 mins, check `dnschecker.org` |
| Want to update the Worker | Edit `worker/worker.js`, then `wrangler deploy` |
| Want to see Worker logs | `wrangler tail` (live tail) or check **Workers** → **Logs** in dashboard |
| Need to rotate your API key | `wrangler secret put ANTHROPIC_API_KEY` again with the new value |

---

# 💰 Cloudflare free tier limits

| Service | Free Tier Limit | When you'd pay |
|---|---|---|
| **Pages** | Unlimited bandwidth, 500 builds/month | If you build >500 times/month |
| **Workers** | 100,000 requests/day | After 100k daily chat requests |
| **Anthropic API** | Pay per token | ~$0.003 per simple chat reply |
| **Domain** | Cloudflare Registrar at-cost (~$10/year) | Annual renewal |

For a new business, you'll never hit Cloudflare's free tier limits.

---

# 🔄 Updating your site

After making changes to `index.html`:

```bash
git add .
git commit -m "Update homepage"
git push
```

Cloudflare Pages auto-redeploys in ~30 seconds.

---

# 📝 Where to edit AI behavior

Your AI's instructions live in two places in `index.html`:

- **`DEMO_SYSTEM`** (around line 2910) — the big chat widget on the page
- **`MINI_SYSTEM`** (around line 3030) — the popup chat bubble

Edit, push to GitHub — site auto-updates.

---

# ✅ Launch checklist

- [ ] Wrangler installed and logged in
- [ ] `wrangler secret put ANTHROPIC_API_KEY` — key encrypted on Cloudflare
- [ ] `wrangler deploy` — Worker live at `*.workers.dev`
- [ ] `/health` endpoint returns 200 OK
- [ ] `curl` test of `/api/chat` returns a Claude response
- [ ] `PROXY_URL` updated in `index.html` with real Worker URL
- [ ] Local Live Server test — chat works
- [ ] Code pushed to GitHub
- [ ] Cloudflare Pages connected to repo, deployment succeeded
- [ ] `arqagents.com` custom domain configured in Pages
- [ ] HTTPS works on arqagents.com
- [ ] Chat works on the live arqagents.com domain
- [ ] *(Optional)* `api.arqagents.com` custom domain set for Worker

You're live! 🤖🇵🇭
