# TinkasMec Chat Widget — Backend

This is a small Express server with one job: take a chat message from the
website widget, send it to Groq along with a system prompt describing
TinkasMec's real services and contact details, and return the reply. Your
Groq API key never touches the browser — it only lives on this server.

## 1. Get a Groq API key (free)

1. Go to https://console.groq.com and sign up (or log in).
2. Go to **API Keys** and click **Create API Key**.
3. Copy the key immediately — like most providers, it's shown only once.
4. Groq has a genuinely free tier with rate limits (requests per minute/day).
   For a website FAQ bot, this is normally enough on its own — check current
   limits at https://console.groq.com/docs/rate-limits since they can change.

## 2. Run it locally first (recommended)

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and paste in your real API key, e.g.:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
ALLOWED_ORIGINS=http://127.0.0.1:5500
```

(`http://127.0.0.1:5500` is the default address VS Code's Live Server uses —
adjust if you're serving the site differently.)

Then:

```bash
npm start
```

You should see `TinkasMec chat backend running on port 3000`. Visit
http://localhost:3000/health in a browser — it should show `{"ok":true}`.

## 3. Point the website at your local server

In `chatbot-widget.js` (in the site's root folder), set:

```js
const CHAT_API_URL = 'http://localhost:3000/api/chat';
```

Reload the website and try the chat button — you should get real replies.

## 4. Deploying so it's live on the internet

Pick one:

### Option A — Render.com (free tier, easiest)
1. Push this `server/` folder to a GitHub repo (or the whole site — Render
   can deploy from a subfolder).
2. On https://render.com, create a **New Web Service**, connect the repo.
3. Set **Root Directory** to `server` (if you pushed the whole site).
4. Build command: `npm install` — Start command: `npm start`.
5. Under **Environment**, add `GROQ_API_KEY` and `ALLOWED_ORIGINS`
   (set `ALLOWED_ORIGINS` to your real site's domain, e.g.
   `https://tinkasmec.co.tz`).
6. Deploy. Render gives you a URL like `https://tinkasmec-chat.onrender.com`.

### Option B — Railway.app
Same idea as Render: connect the repo, set the root to `server`, add the
same two environment variables, deploy.

### Option C — Your own VPS
Install Node.js 18+, copy the `server` folder up, run `npm install`,
set the environment variables in a `.env` file or your process manager
(e.g. `pm2 start server.js --name tinkasmec-chat`), and put it behind
Nginx with HTTPS (Let's Encrypt / certbot).

## 5. Point the live website at the deployed backend

Once deployed, update `chatbot-widget.js` on the live site:

```js
const CHAT_API_URL = 'https://your-backend-url.onrender.com/api/chat';
```

And make sure `ALLOWED_ORIGINS` on the backend matches exactly the domain
your website is served from (including `https://`, no trailing slash).

## Notes

- **Cost control**: the server rate-limits each visitor to 30 messages per
  10 minutes on top of Groq's own free-tier limits. Adjust `chatLimiter` in
  `server.js` if needed.
- **Model choice**: `GROQ_MODEL` in `.env` defaults to
  `llama-3.3-70b-versatile`. If you hit free-tier rate limits often, try
  `llama-3.1-8b-instant` instead — smaller and faster, with a higher free
  request allowance, at a small cost to answer quality. Check
  https://console.groq.com/docs/models for the current model list, since
  Groq's lineup changes over time.
- **Editing what the bot knows**: everything the bot says comes from
  `system-prompt.txt`. Edit that file (facts only, not code) whenever your
  services, contact details, or track record change, then redeploy.
- **Free-tier note**: Render's free web services sleep after inactivity and
  take a few seconds to wake on the next request — the widget shows a
  "thinking…" state, so this is a minor delay, not a bug.