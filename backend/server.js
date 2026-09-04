'use strict';
/**
 * Shax Store — Main Server
 * Run:   npm start
 * Dev:   npm run dev
 * Seed:  npm run seed
 */
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';

/* ── Fail fast on missing critical config in production ── */
(function validateEnv() {
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET is missing or shorter than 32 characters.');
  }
  if (!process.env.DB_NAME)     problems.push('DB_NAME is not set.');
  if (!process.env.DB_USER)     problems.push('DB_USER is not set.');
  if (IS_PROD && (!process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN === '*')) {
    problems.push('ALLOWED_ORIGIN should be set to your real domain in production (not "*").');
  }
  if (problems.length) {
    console.error('\n❌  Configuration problem(s) found:');
    problems.forEach(p => console.error('   • ' + p));
    if (IS_PROD) {
      console.error('\nRefusing to start in production with invalid config.\n');
      process.exit(1);
    } else {
      console.error('   (Continuing because NODE_ENV is not "production".)\n');
    }
  }
})();

const app = express();

/* ── Behind a proxy/load-balancer (Render, Railway, Nginx, etc.) ──
   Lets express-rate-limit and secure cookies see the real client IP
   and the https protocol forwarded by the host. */
app.set('trust proxy', 1);

/* ── Security Headers ─────────────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc   : ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "fonts.googleapis.com"],
      fontSrc    : ["'self'", "cdnjs.cloudflare.com", "fonts.gstatic.com"],
      imgSrc     : ["'self'", "data:", "https:"],
      connectSrc : ["'self'"],
      // Tells browsers to auto-upgrade any http resource to https in production.
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

/* ── CORS ─────────────────────────────────────────────── */
/* ALLOWED_ORIGIN may be a single origin OR a comma-separated list.
   This keeps the production website working exactly as before while
   also letting the bundled Capacitor app (whose WebView origin is
   https://localhost on both Android and iOS) call the same HTTPS API.
   Requests without an Origin header (curl, server-side, native HTTP)
   are still allowed, matching the previous string-origin behaviour. */
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (allowedOrigins.includes('*')) return cb(null, true);
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods       : ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/* ── Global API Rate Limit: 300 req / 15 min / IP ─────── */
app.use('/api/', rateLimit({
  windowMs      : 15 * 60 * 1000,
  max           : 300,
  standardHeaders: true,
  legacyHeaders : false
}));

/* ── Body Parsing ─────────────────────────────────────── */
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

/* ── Static Files ─────────────────────────────────────── */
/* Serves the storefront, the admin panel (public/admin/),    */
/* assets (logo, flags, placeholders) and admin-uploaded      */
/* images (public/uploads/) — all from one origin.            */
app.use(express.static(path.join(__dirname, 'public')));

/* ── Health check (used by hosting platforms / uptime monitors) ── */
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/* ── API Routes ───────────────────────────────────────── */
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/filters',    require('./routes/filters'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/push',          require('./routes/push'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/content',    require('./routes/content'));
app.use('/api/stats',      require('./routes/stats'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/sponsor',    require('./routes/sponsor'));

/* ── 404 for unknown API paths ────────────────────────── */
app.use('/api/', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

/* ── SPA Fallback for all other paths ─────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Global error handler (last middleware) ───────────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong.' });
});

/* ── Start ────────────────────────────────────────────── */
const PORT = parseInt(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  if (IS_PROD) {
    console.log(`\n🚀  Shax Store running in PRODUCTION on port ${PORT}`);
    console.log(`   Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
    console.log(`   Product photos in Telegram: ${process.env.PUBLIC_BASE_URL ? 'enabled' : 'disabled (set PUBLIC_BASE_URL)'}\n`);
  } else {
    console.log(`\n🚀  Shax Store  ›  http://localhost:${PORT}`);
    console.log(`   Mode: development\n`);
  }
});

/* Keep the process alive on unexpected errors rather than crashing silently. */
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));
process.on('uncaughtException',  (err)    => console.error('Uncaught exception:', err));

/* Graceful shutdown so in-flight requests finish when the host restarts. */
['SIGTERM', 'SIGINT'].forEach(sig => {
  process.on(sig, () => {
    console.log(`\n${sig} received — shutting down gracefully…`);
    server.close(() => { console.log('Closed. Bye.'); process.exit(0); });
    // Force-exit if it hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  });
});

module.exports = app;
