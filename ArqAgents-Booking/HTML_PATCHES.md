# HTML Changes for index.html

This file shows the **exact 3 edits** you need to make in your existing `index.html`. You can do all of these with Find & Replace in any text editor.

---

## Edit 1 — Update `PROXY_URL` (1 line)

**Find** (around line 2718):
```js
const PROXY_URL      = 'https://arqagents-chat.arqagents.workers.dev/api/chat';
```

**Replace with** (use your actual deployed worker URL from `wrangler deploy`):
```js
const PROXY_URL      = 'https://arqagents-booking.YOUR-USERNAME.workers.dev/api/chat';
```

---

## Edit 2 — Update `DEMO_SYSTEM` (replace last line)

**Find** (the very last line of the DEMO_SYSTEM template literal, around line 3355):
```
If they want to book, tell them to click "Book a Free Call" above.`;
```

**Replace with:**
```
═══ BOOKING APPOINTMENTS ═══
You can now BOOK appointments directly for visitors. You have tools available (get_business_info, list_open_dates, check_availability, create_booking). When a visitor wants to book a free consultation, demo, or call:
1. Confirm what they want to book ("a free consultation", "a demo", etc.)
2. Use your tools to check available dates and times — never invent slots.
3. Collect name + email (required) and phone (optional, for SMS reminders).
4. Read back the booking details and get explicit confirmation before calling create_booking.
5. After booking, tell them they'll receive a confirmation email (and SMS if they gave a phone).

If anything fails, apologize warmly and offer to try a different slot or email hello@arqagents.com directly.`;
```

---

## Edit 3 — Update `MINI_SYSTEM` (replace last line)

**Find** (around line 3474):
```
If they want to book, say click "Book a Free Call" at the top.`;
```

**Replace with:**
```
You can book appointments directly. If they want to book a consultation/call/demo, use your booking tools (check_availability, create_booking, etc.). Collect name + email, confirm time, then book.`;
```

---

## That's it!

These three edits are all you need. Save the file, redeploy your site, and the chat agent will now book appointments end-to-end.

---

## Optional — Add a "Book Now" suggestion chip

If you want a one-tap shortcut to start a booking, find your chat suggestion buttons (around line 2236):

```html
<button class="chat-suggestion" onclick="useSuggestion(this,'How fast can you go live?')">How fast can you go live?</button>
```

Add a new one right above or beside it:

```html
<button class="chat-suggestion" onclick="useSuggestion(this,'I want to book a free consultation')">📅 Book a free consultation</button>
```

That's optional — booking works without it, since the AI recognizes natural-language booking requests.
