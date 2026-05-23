# ARQAgents.com

Static homepage + secure AI chat backend for **ARQAgents.com**.

## Quick start

1. Read **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** — full step-by-step instructions
2. Deploy the Supabase Edge Function (holds your API key securely)
3. Deploy the website to Vercel or Netlify
4. Point ARQAgents.com domain at your hosting

## File map

| File | Purpose |
|---|---|
| `index.html` | Your homepage |
| `vercel.json` | Vercel hosting config |
| `netlify.toml` | Netlify hosting config |
| `supabase/functions/chat/index.ts` | Secure Claude proxy (Edge Function) |
| `DEPLOY_GUIDE.md` | Full deployment walkthrough |
| `.gitignore` | Keep secrets out of git |

## Why this architecture?

- 🔒 API key never reaches the browser
- 💰 Free on both Vercel and Supabase free tiers
- ⚡ Edge function = fast global response
- 🛡 Built-in CORS, model allow-list, and message validation

See **DEPLOY_GUIDE.md** for everything else.
