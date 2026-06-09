'use strict';
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { createLogger, requestLogger } = require('@sofin/shared-logger');
const { identity, requirePermission } = require('@sofin/shared-auth');
const { getBus } = require('@sofin/shared-events');

const log = createLogger('crm');
const bus = getBus();

const contacts = new Map();
const deals = new Map();
const activities = []; // { contactId, type, payload, createdAt }

const ok = (res, data, status = 200) => res.status(status).json({ data, meta: { requestId: res.getHeader('x-request-id') } });
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

const app = express();
app.use(express.json());
app.use(requestLogger(log));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(identity());

// Contacts
const contactSchema = z.object({ name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional() });
app.get('/crm/contacts', requirePermission('contact:read'), (_req, res) => ok(res, [...contacts.values()]));
app.post('/crm/contacts', requirePermission('contact:create'), (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  const contact = { id: crypto.randomUUID(), ...parsed.data, ownerId: req.user.id, createdAt: new Date().toISOString() };
  contacts.set(contact.id, contact);
  ok(res, contact, 201);
});
app.get('/crm/contacts/:id/activities', requirePermission('activity:read'), (req, res) =>
  ok(res, activities.filter((a) => a.contactId === req.params.id))
);

// Deals
const dealSchema = z.object({ contactId: z.string().uuid(), title: z.string().min(1), amount: z.number().nonnegative().optional() });
app.post('/crm/deals', requirePermission('deal:create'), (req, res) => {
  const parsed = dealSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  const deal = { id: crypto.randomUUID(), ...parsed.data, stage: 'lead', ownerId: req.user.id, createdAt: new Date().toISOString() };
  deals.set(deal.id, deal);
  ok(res, deal, 201);
});
app.patch('/crm/deals/:id', requirePermission('deal:update'), (req, res) => {
  const deal = deals.get(req.params.id);
  if (!deal) return fail(res, 404, 'NOT_FOUND', 'deal not found');
  const from = deal.stage;
  if (req.body.stage) deal.stage = req.body.stage;
  bus.publish('deal.stage_changed', { dealId: deal.id, contactId: deal.contactId, from, to: deal.stage }, { producer: 'crm' });
  if (deal.stage === 'won') bus.publish('deal.won', { dealId: deal.id, contactId: deal.contactId, amount: deal.amount }, { producer: 'crm' });
  ok(res, deal);
});

// ── Event consumers: react to other services (idempotent upserts) ───────────
bus.subscribe('user.created', (env) => {
  log.info('event user.created', { userId: env.data.userId });
});
bus.subscribe('enrollment.created', (env) => {
  // log an activity on the contact timeline (system event)
  activities.push({ contactId: env.data.userId, type: 'system_event', payload: env.data, createdAt: env.occurredAt });
  log.info('logged enrollment activity', { userId: env.data.userId, courseId: env.data.courseId });
});

app.use((err, req, res, _next) => {
  log.error('unhandled', { requestId: req.requestId, err: err.message });
  fail(res, 500, 'INTERNAL', 'internal error');
});

const PORT = Number(process.env.CRM_PORT || 4003);
app.listen(PORT, () => log.info('crm listening', { port: PORT }));
