'use strict';
const express = require('express');
const { z } = require('zod');
const { createLogger, requestLogger } = require('@sofin/shared-logger');
const { identity, requirePermission } = require('@sofin/shared-auth');
const { getBus } = require('@sofin/shared-events');
const { publicKey } = require('./keys');
const { signAccessToken } = require('./tokens');
const store = require('./store');

const log = createLogger('auth-sso');
const bus = getBus();
const app = express();
app.use(express.json());
app.use(requestLogger(log));

const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL || 604800);
const ok = (res, data, status = 200) => res.status(status).json({ data, meta: { requestId: res.getHeader('x-request-id') } });
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

// ── Public key for token verification (gateway fetches this) ────────────────
app.get('/auth/public-key.pem', (_req, res) => res.type('text/plain').send(publicKey));

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.json({ status: 'ready' }));

// ── Register ─────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});
app.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  try {
    const user = await store.createUser(parsed.data); // defaults to ['learner']
    bus.publish('user.created', { userId: user.id, email: user.email, name: user.name }, { producer: 'auth' });
    ok(res, { id: user.id, email: user.email, roles: user.roles }, 201);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') return fail(res, 409, 'EMAIL_TAKEN', e.message);
    throw e;
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
const loginSchema = z.object({ email: z.string().email(), password: z.string() });
app.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  const user = store.findByEmail(parsed.data.email);
  if (!user || !(await store.verifyPassword(user, parsed.data.password)))
    return fail(res, 401, 'INVALID_CREDENTIALS', 'invalid email or password');
  ok(res, {
    accessToken: signAccessToken(user),
    refreshToken: store.issueRefreshToken(user.id, REFRESH_TTL),
    user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
  });
});

// ── Refresh (rotation) ─────────────────────────────────────────────────────────
app.post('/auth/refresh', (req, res) => {
  const userId = store.consumeRefreshToken(req.body?.refreshToken);
  if (!userId) return fail(res, 401, 'INVALID_REFRESH', 'invalid or expired refresh token');
  const user = store.findById(userId);
  ok(res, {
    accessToken: signAccessToken(user),
    refreshToken: store.issueRefreshToken(user.id, REFRESH_TTL),
  });
});

// ── Routes below require a valid identity (injected by the gateway) ─────────
app.use(identity());

app.get('/auth/me', (req, res) => {
  const user = store.findById(req.user.id);
  if (!user) return fail(res, 404, 'NOT_FOUND', 'user not found');
  ok(res, { id: user.id, email: user.email, name: user.name, roles: user.roles });
});

app.post('/auth/logout', (req, res) => {
  store.revokeAllForUser(req.user.id);
  ok(res, { loggedOut: true });
});

// Internal lookup used by other services
app.get('/auth/users/:id', (req, res) => {
  const user = store.findById(req.params.id);
  if (!user) return fail(res, 404, 'NOT_FOUND', 'user not found');
  ok(res, { id: user.id, email: user.email, name: user.name, roles: user.roles });
});

// ── Role management (needs role:assign) ─────────────────────────────────────
const rolesSchema = z.object({ roles: z.array(z.string()).min(1) });
app.put('/auth/users/:id/roles', requirePermission('role:assign'), (req, res) => {
  const parsed = rolesSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  const user = store.setRoles(req.params.id, parsed.data.roles);
  if (!user) return fail(res, 404, 'NOT_FOUND', 'user not found');
  bus.publish('user.roles_changed', { userId: user.id, roles: user.roles }, { producer: 'auth' });
  ok(res, { id: user.id, roles: user.roles });
});

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  log.error('unhandled', { requestId: req.requestId, err: err.message });
  fail(res, 500, 'INTERNAL', 'internal error');
});

// Seed a default admin so role-gated endpoints are reachable out of the box.
async function seed() {
  try {
    const admin = await store.createUser({
      email: 'admin@sofin.dev',
      password: 'admin1234',
      name: 'Admin',
      roles: ['admin'],
    });
    log.info('seeded admin', { id: admin.id, email: admin.email });
  } catch { /* already seeded */ }
}

const PORT = Number(process.env.AUTH_PORT || 4001);
seed().then(() => app.listen(PORT, () => log.info('auth-sso listening', { port: PORT })));
