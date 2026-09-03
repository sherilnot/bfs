/**
 * BFS Projects - static site + enquiry API.
 *
 * Run:  npm start          (production-ish)
 *       npm run dev        (restarts on change)
 *
 * Environment:
 *   PORT          default 3000
 *   HOST          default 127.0.0.1  (use 0.0.0.0 to expose on the network)
 *   ADMIN_TOKEN   required to enable the admin read endpoints; omit and they
 *                 stay switched off (fail closed)
 *   DB_PATH       override the SQLite file location
 *   TRUST_PROXY   set when running behind nginx/Cloudflare so req.ip is real
 */
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';

import { createEnquiry, listEnquiries, getEnquiry, setEnquiryStatus, ENQUIRY_STATUSES } from './db.js';
import { validateEnquiry, looksLikeBot, SECTORS } from './validate.js';
import { rateLimit } from './rateLimit.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const SITE_ROOT = resolve(import.meta.dirname, '..');

// Configurable so tests can tighten or loosen them without editing code.
const SUBMIT_RATE_MAX = Number(process.env.SUBMIT_RATE_MAX ?? 5);
const SUBMIT_RATE_WINDOW_MS = Number(process.env.SUBMIT_RATE_WINDOW_MS ?? 10 * 60 * 1000);

const app = express();

app.disable('x-powered-by');

// Only trust forwarded headers when we're actually behind a proxy. Trusting
// them unconditionally would let a client spoof its IP and slip the limiter.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
}

/* ------------------------------------------------------------------ *
 * Security headers
 * ------------------------------------------------------------------ */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // The page sets a couple of bootstrap classes via inline <script>.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  );
  next();
});

/* ------------------------------------------------------------------ *
 * Body parsing - capped so a large POST can't exhaust memory
 * ------------------------------------------------------------------ */
app.use('/api', express.json({ limit: '16kb' }));

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), now: new Date().toISOString() });
});

app.get('/api/sectors', (req, res) => {
  res.json({ sectors: SECTORS });
});

/* ------------------------------------------------------------------ *
 * Enquiry submission (public)
 * ------------------------------------------------------------------ */
const submitLimiter = rateLimit({ windowMs: SUBMIT_RATE_WINDOW_MS, max: SUBMIT_RATE_MAX });

app.post('/api/enquiries', submitLimiter, (req, res, next) => {
  try {
    // Honeypot: accept and discard so the bot sees success and moves on.
    if (looksLikeBot(req.body)) {
      return res.status(202).json({ ok: true, reference: null });
    }

    const result = validateEnquiry(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: 'validation_failed', fields: result.errors });
    }

    const saved = createEnquiry({
      ...result.data,
      userAgent: String(req.get('user-agent') ?? '').slice(0, 300),
    });

    console.log(`[enquiry] ${saved.reference} from ${saved.email}`);

    // Echo only what the client needs; no internal id.
    return res.status(201).json({
      ok: true,
      reference: saved.reference,
      message: "Thanks - we've got your enquiry and will be in touch shortly.",
    });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 * Admin (token-gated)
 *
 * These expose submitted contact details, so they stay disabled unless
 * ADMIN_TOKEN is set. Failing closed is the safer default: forgetting to
 * configure it leaves the data unreadable rather than public.
 * ------------------------------------------------------------------ */
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: 'admin_disabled',
      message: 'Admin API is disabled. Set ADMIN_TOKEN to enable it.',
    });
  }

  const header = req.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supplied = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(ADMIN_TOKEN);
  // Compare lengths first: timingSafeEqual throws on a mismatch.
  const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!valid) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'unauthorized' });
  }

  return next();
}

const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

app.get('/api/enquiries', adminLimiter, requireAdmin, (req, res, next) => {
  try {
    res.json(listEnquiries({ limit: req.query.limit, offset: req.query.offset }));
  } catch (err) {
    next(err);
  }
});

app.get('/api/enquiries/:reference', adminLimiter, requireAdmin, (req, res, next) => {
  try {
    const found = getEnquiry(req.params.reference);
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json(found);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/enquiries/:reference/status', adminLimiter, requireAdmin, (req, res, next) => {
  try {
    const status = String(req.body?.status ?? '');
    if (!ENQUIRY_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'validation_failed',
        message: `status must be one of: ${ENQUIRY_STATUSES.join(', ')}`,
      });
    }
    const updated = setEnquiryStatus(req.params.reference, status);
    if (!updated) return res.status(404).json({ error: 'not_found' });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 * Static site
 * ------------------------------------------------------------------ */
app.use(
  express.static(SITE_ROOT, {
    extensions: ['html'],
    setHeaders(res, path) {
      // Frames and images are content-addressed by the ?v= query, so they can
      // cache hard. HTML must revalidate or content edits never show up.
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.(webp|png|jpe?g|svg|woff2?)$/.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

/* ------------------------------------------------------------------ *
 * Fallbacks
 * ------------------------------------------------------------------ */
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Single-page site: anything else resolves to the one document.
app.use((req, res) => {
  res.sendFile(resolve(SITE_ROOT, 'index.html'));
});

/* ------------------------------------------------------------------ *
 * Error handler - log detail, return something generic
 * ------------------------------------------------------------------ */
app.use((err, req, res, next) => {
  // A malformed JSON body surfaces here as a 400 from body-parser.
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  console.error('[error]', err);
  if (res.headersSent) return next(err);
  // Deliberately vague: internal messages can leak paths and query shapes.
  return res.status(500).json({ error: 'internal_error' });
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
const server = app.listen(PORT, HOST, () => {
  console.log(`BFS Projects running at http://${HOST}:${PORT}`);
  console.log(`  Admin API: ${ADMIN_TOKEN ? 'enabled' : 'disabled (set ADMIN_TOKEN)'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck keep-alive connection.
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

export { app, server };
