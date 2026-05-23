# 🤖 ARQAgents.com

Static homepage + secure AI chat backend, deployed entirely on **Cloudflare**.

## Quick start

1. Read **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** — full step-by-step instructions
2. Deploy the Cloudflare Worker (holds your API key securely)
3. Deploy the website to Cloudflare Pages
4. Connect ARQAgents.com via Cloudflare Pages custom domain

## File map

| File | Purpose |
|---|---|
| `index.html` | Your homepage with AI robot logo |
| `_headers` | Cloudflare Pages security headers |
| `worker/worker.js` | Secure Claude proxy (Cloudflare Worker) |
| `worker/wrangler.toml` | Worker config |
| `DEPLOY_GUIDE.md` | Full deployment walkthrough |
| `.gitignore` | Keep secrets out of git |

## Why all-Cloudflare?

- 🌐 Domain already there → zero DNS friction
- 🔒 API key stored as Worker secret, never exposed to browser
- 💰 Free on both Pages and Workers tiers
- ⚡ Edge network = fast worldwide response
- 🛡 Built-in CORS, model allow-list, message validation

See **DEPLOY_GUIDE.md** for everything else.
