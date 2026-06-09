'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createLogger, requestLogger } = require('@sofin/shared-logger');
const { verifyAccessToken } = require('@sofin/shared-auth');

const log = createLogger('gateway');
const ISSUER = process.env.TOKEN_ISSUER || 'sofin-auth';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:4001';

const TARGETS = {
  '/auth': AUTH_URL,
  '/lms': process.env.LMS_URL || 'http://localhost:4002',
  '/crm': process.env.CRM_URL || 'http://localhost:4003',
  '/notifications': process.env.NOTIF_URL || 'http://localhost:4004',
};

// Public (no-auth) routes — login/register/refresh + key + health.
const PUBLIC = [
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'GET /auth/public-key.pem',
];
const isPublic = (req) => PUBLIC.includes(`${req.method} ${req.path}`) || req.path === '/health';

let publicKey = null; // fetched from Auth at boot

async function loadPublicKey(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${AUTH_URL}/auth/public-key.pem`);
      if (r.ok) {
        publicKey = await r.text();
        log.info('loaded auth public key');
        return;
      }
    } catch { /* auth not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log.error('could not load auth public key — auth unreachable');
}

const app = express();
app.use(requestLogger(log));
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 100),
    standardHeaders: true,
  })
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── AuthN: verify JWT, strip client-supplied identity headers, inject ours ──
app.use((req, res, next) => {
  // never trust identity headers coming from the client
  delete req.headers['x-user-id'];
  delete req.headers['x-user-roles'];

  if (isPublic(req)) return next();
  if (!publicKey) return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'auth key not loaded' } });

  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  const claims = verifyAccessToken(token, publicKey, ISSUER);
  if (!claims) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'invalid or missing token' } });

  req.headers['x-user-id'] = claims.sub;
  req.headers['x-user-roles'] = (claims.roles || []).join(',');
  req.headers['x-request-id'] = req.requestId;
  next();
});

// ── Routing ─────────────────────────────────────────────────────────────────
// Mount WITHOUT a sub-path and use pathFilter so the full prefix (e.g.
// `/auth/register`) is forwarded intact rather than stripped by Express.
for (const [prefix, target] of Object.entries(TARGETS)) {
  app.use(createProxyMiddleware({ target, changeOrigin: true, pathFilter: `${prefix}/**` }));
}

const PORT = Number(process.env.GATEWAY_PORT || 8080);
loadPublicKey().then(() => app.listen(PORT, () => log.info('gateway listening', { port: PORT })));
