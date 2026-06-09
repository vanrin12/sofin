'use strict';
const jwt = require('jsonwebtoken');
const { privateKey } = require('./keys');

const ISSUER = process.env.TOKEN_ISSUER || 'sofin-auth';
const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL || 900);

// Sign a short-lived RS256 access token. Roles travel in the token; services
// map roles -> permissions locally (see packages/shared-auth/permissions.js).
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles },
    privateKey,
    { algorithm: 'RS256', expiresIn: ACCESS_TTL, issuer: ISSUER }
  );
}

module.exports = { signAccessToken, ACCESS_TTL, ISSUER };
