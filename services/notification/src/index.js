'use strict';
const crypto = require('crypto');
const express = require('express');
const { createLogger, requestLogger } = require('@sofin/shared-logger');
const { identity, requirePermission } = require('@sofin/shared-auth');
const { getBus } = require('@sofin/shared-events');

const log = createLogger('notification');
const bus = getBus();

const notifications = []; // { id, userId, channel, template, payload, status, createdAt }
const seen = new Set();   // eventId dedupe — consumers are at-least-once

const ok = (res, data) => res.status(200).json({ data, meta: { requestId: res.getHeader('x-request-id') } });

function deliver({ userId, channel, template, payload }) {
  const n = { id: crypto.randomUUID(), userId, channel, template, payload, status: 'sent', createdAt: new Date().toISOString() };
  notifications.push(n);
  // Production: integrate an email/SMS/push provider here.
  log.info('notification sent', { userId, channel, template });
  return n;
}

// ── Event-driven: this service mostly reacts to events ──────────────────────
function once(env, handler) {
  if (seen.has(env.eventId)) return; // idempotent
  seen.add(env.eventId);
  handler(env);
}
bus.subscribe('enrollment.created', (env) =>
  once(env, () => deliver({ userId: env.data.userId, channel: 'email', template: 'welcome_course', payload: env.data }))
);
bus.subscribe('deal.won', (env) =>
  once(env, () => deliver({ userId: env.data.contactId, channel: 'in_app', template: 'deal_won', payload: env.data }))
);
bus.subscribe('user.created', (env) =>
  once(env, () => deliver({ userId: env.data.userId, channel: 'email', template: 'welcome', payload: env.data }))
);

const app = express();
app.use(express.json());
app.use(requestLogger(log));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(identity());
app.get('/notifications/me', requirePermission('notification:read'), (req, res) =>
  ok(res, notifications.filter((n) => n.userId === req.user.id))
);

const PORT = Number(process.env.NOTIF_PORT || 4004);
app.listen(PORT, () => log.info('notification listening', { port: PORT }));
