'use strict';
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { createLogger, requestLogger } = require('@sofin/shared-logger');
const { identity, requirePermission } = require('@sofin/shared-auth');
const { getBus } = require('@sofin/shared-events');

const log = createLogger('lms');
const bus = getBus();

// In-memory data (swap for Prisma + Postgres — schema in docs/03-data-models.md)
const courses = new Map();
const enrollments = new Map(); // key: `${courseId}:${userId}`

const ok = (res, data, status = 200) => res.status(status).json({ data, meta: { requestId: res.getHeader('x-request-id') } });
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

const app = express();
app.use(express.json());
app.use(requestLogger(log));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(identity()); // everything below needs a valid identity from the gateway

// List courses — any authenticated user with course:read
app.get('/lms/courses', requirePermission('course:read'), (_req, res) => {
  ok(res, [...courses.values()]);
});

// Create course — instructor/admin (course:create)
const courseSchema = z.object({ title: z.string().min(1), description: z.string().optional() });
app.post('/lms/courses', requirePermission('course:create'), (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0].message);
  const course = {
    id: crypto.randomUUID(),
    ...parsed.data,
    instructorId: req.user.id,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  courses.set(course.id, course);
  ok(res, course, 201);
});

// Course detail
app.get('/lms/courses/:id', requirePermission('course:read'), (req, res) => {
  const course = courses.get(req.params.id);
  if (!course) return fail(res, 404, 'NOT_FOUND', 'course not found');
  ok(res, course);
});

// Update course — permission gate THEN ownership check (docs/08 §6)
app.patch('/lms/courses/:id', requirePermission('course:update'), (req, res) => {
  const course = courses.get(req.params.id);
  if (!course) return fail(res, 404, 'NOT_FOUND', 'course not found');
  const isOwner = course.instructorId === req.user.id;
  const isAdmin = req.user.roles.includes('admin');
  if (!isOwner && !isAdmin) return fail(res, 403, 'FORBIDDEN', 'not your course');
  Object.assign(course, req.body, { id: course.id, instructorId: course.instructorId });
  ok(res, course);
});

// Enroll current user — learner (enrollment:create) → emits an event
app.post('/lms/courses/:id/enroll', requirePermission('enrollment:create'), (req, res) => {
  const course = courses.get(req.params.id);
  if (!course) return fail(res, 404, 'NOT_FOUND', 'course not found');
  const key = `${course.id}:${req.user.id}`;
  if (enrollments.has(key)) return fail(res, 409, 'ALREADY_ENROLLED', 'already enrolled');
  const enrollment = { id: crypto.randomUUID(), courseId: course.id, userId: req.user.id, enrolledAt: new Date().toISOString() };
  enrollments.set(key, enrollment);
  bus.publish(
    'enrollment.created',
    { userId: req.user.id, courseId: course.id, courseTitle: course.title },
    { producer: 'lms', correlationId: req.requestId }
  );
  ok(res, enrollment, 201);
});

app.get('/lms/enrollments/me', requirePermission('course:read'), (req, res) => {
  ok(res, [...enrollments.values()].filter((e) => e.userId === req.user.id));
});

app.use((err, req, res, _next) => {
  log.error('unhandled', { requestId: req.requestId, err: err.message });
  fail(res, 500, 'INTERNAL', 'internal error');
});

const PORT = Number(process.env.LMS_PORT || 4002);
app.listen(PORT, () => log.info('lms listening', { port: PORT }));
