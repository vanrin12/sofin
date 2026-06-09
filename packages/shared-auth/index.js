'use strict';
const jwt = require('jsonwebtoken');
const { permissionsFor, can } = require('./permissions');

// ── Token verification ──────────────────────────────────────────────────────
// Verify an RS256 access token with Auth's PUBLIC key. Used by the gateway.
function verifyAccessToken(token, publicKey, issuer) {
  try {
    return jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer });
  } catch {
    return null;
  }
}

// ── Identity middleware (for services behind the gateway) ───────────────────
// Services trust the headers the gateway injected. This populates req.user.
function identity() {
  return (req, res, next) => {
    const id = req.headers['x-user-id'];
    if (!id) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'missing identity' } });
    }
    const roles = (req.headers['x-user-roles'] || '').split(',').filter(Boolean);
    req.user = { id, roles, permissions: permissionsFor(roles) };
    next();
  };
}

// ── RBAC middleware ─────────────────────────────────────────────────────────
// Gate a route on a `resource:action` permission. Deny-by-default.
function requirePermission(needed) {
  return (req, res, next) => {
    const perms = req.user?.permissions || permissionsFor(req.user?.roles);
    if (!can(perms, needed)) {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: `requires ${needed}` } });
    }
    next();
  };
}

// Gate on having at least one of the given roles (coarse check).
function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (!roles.some((r) => allowed.includes(r))) {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: `requires role: ${allowed.join('|')}` } });
    }
    next();
  };
}

module.exports = {
  verifyAccessToken,
  identity,
  requirePermission,
  requireRole,
  permissionsFor,
  can,
};
