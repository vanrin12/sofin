'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// In-memory store for the scaffold. Replace with Prisma + Postgres
// (schema in docs/03-data-models.md). The method surface is intentionally
// repository-shaped so swapping the backend touches only this file.
const users = new Map();         // id -> user
const usersByEmail = new Map();  // email -> id
const refreshTokens = new Map(); // tokenId -> { userId, tokenHash, expiresAt, revoked }

function sha256(v) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

async function createUser({ email, password, name, roles = ['learner'] }) {
  email = email.toLowerCase();
  if (usersByEmail.has(email)) {
    const err = new Error('email already registered');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    roles,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  usersByEmail.set(email, user.id);
  return user;
}

function findByEmail(email) {
  return users.get(usersByEmail.get((email || '').toLowerCase()));
}

function findById(id) {
  return users.get(id);
}

async function verifyPassword(user, password) {
  return user && bcrypt.compare(password, user.passwordHash);
}

function setRoles(id, roles) {
  const user = users.get(id);
  if (user) user.roles = roles;
  return user;
}

// ── Refresh tokens (opaque, hashed at rest, rotated on use) ──────────────────
function issueRefreshToken(userId, ttlSeconds) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const id = crypto.randomUUID();
  refreshTokens.set(id, {
    userId,
    tokenHash: sha256(raw),
    expiresAt: Date.now() + ttlSeconds * 1000,
    revoked: false,
  });
  return `${id}.${raw}`; // client sends this back whole
}

function consumeRefreshToken(token) {
  const [id, raw] = (token || '').split('.');
  const rec = refreshTokens.get(id);
  if (!rec || rec.revoked || rec.expiresAt < Date.now()) return null;
  if (rec.tokenHash !== sha256(raw || '')) {
    // hash mismatch on a known id => possible theft: revoke the record
    rec.revoked = true;
    return null;
  }
  rec.revoked = true; // rotation: single-use
  return rec.userId;
}

function revokeAllForUser(userId) {
  for (const rec of refreshTokens.values()) if (rec.userId === userId) rec.revoked = true;
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  verifyPassword,
  setRoles,
  issueRefreshToken,
  consumeRefreshToken,
  revokeAllForUser,
};
