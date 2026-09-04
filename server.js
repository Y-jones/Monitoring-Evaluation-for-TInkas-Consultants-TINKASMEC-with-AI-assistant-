// TinkasMec website backend: chat widget (Groq) + contact form (SQLite)
// Run locally with: npm install && npm start
// See README.md in this folder for deployment instructions.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Groq = require('groq-sdk');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_KEY = process.env.ADMIN_KEY || '';

if (!process.env.GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.warn('Warning: ADMIN_KEY is not set. /api/inquiries will be unreachable until you set one in .env.');
}

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.txt'), 'utf8');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Database setup ----
const db = new Database(path.join(__dirname, 'contacts.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
const insertSubmission = db.prepare(
  'INSERT INTO contact_submissions (name, email, message) VALUES (?, ?, ?)'
);
const listSubmissions = db.prepare(
  'SELECT id, name, email, message, created_at FROM contact_submissions ORDER BY created_at DESC'
);

const app = express();
app.use(express.json({ limit: '32kb' }));

// Only allow requests from the site(s) you list in ALLOWED_ORIGINS.
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow tools like curl/Postman (no origin header) during setup/testing.
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  })
);

app.get('/health', (req, res) => res.json({ ok: true }));

// ============================================================
// Chat widget
// ============================================================
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // 30 messages per IP per 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again in a few minutes.' },
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (messages.length > 40) {
      return res.status(400).json({ error: 'Conversation too long for this endpoint.' });
    }
    for (const m of messages) {
      if (
        !m ||
        (m.role !== 'user' && m.role !== 'assistant') ||
        typeof m.content !== 'string' ||
        m.content.length > 4000
      ) {
        return res.status(400).json({ error: 'Invalid message format.' });
      }
    }

    // Groq uses the OpenAI-style chat format: the system prompt is just
    // another message at the front of the array, not a separate parameter.
    const chatMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    const completion = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: chatMessages,
    });

    const text = completion.choices?.[0]?.message?.content || '';

    res.json({ reply: text });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
});

// ============================================================
// Contact form
// ============================================================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later or contact us by phone.' },
});

app.post('/api/contact', contactLimiter, (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 200) {
      return res.status(400).json({ error: 'Please enter a valid name.' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 200) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > 5000) {
      return res.status(400).json({ error: 'Please enter a message (at least a few words).' });
    }

    insertSubmission.run(name.trim(), email.trim(), message.trim());

    res.json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again, or email us directly.' });
  }
});

// Simple password-protected page to view submissions.
// Visit: https://your-backend-url/api/inquiries?key=YOUR_ADMIN_KEY
app.get('/api/inquiries', (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(401).send('Not authorized. Add ?key=YOUR_ADMIN_KEY to the URL.');
  }

  const rows = listSubmissions.all();
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.created_at)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></td>
        <td style="white-space:pre-wrap;">${escapeHtml(r.message)}</td>
      </tr>`
    )
    .join('');

  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>TinkasMec — Website Inquiries</title>
<style>
  body{font-family:system-ui,sans-serif;background:#10151C;color:#F4F1E8;padding:32px;}
  h1{font-size:20px;margin-bottom:4px;}
  p.count{color:#7C8A9A;margin-top:0;margin-bottom:24px;font-size:14px;}
  table{width:100%;border-collapse:collapse;font-size:14px;}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #2a3444;vertical-align:top;}
  th{color:#E8B347;font-size:12px;text-transform:uppercase;letter-spacing:.03em;}
  tr:hover{background:#1A2230;}
  a{color:#E8B347;}
</style>
</head><body>
  <h1>Website Inquiries</h1>
  <p class="count">${rows.length} submission${rows.length === 1 ? '' : 's'}</p>
  <table>
    <thead><tr><th>Received</th><th>Name</th><th>Email</th><th>Message</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="4">No submissions yet.</td></tr>'}</tbody>
  </table>
</body></html>`);
});

app.listen(PORT, () => {
  console.log(`TinkasMec backend running on port ${PORT}`);
});