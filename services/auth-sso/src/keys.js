'use strict';
const crypto = require('crypto');

// Generate an RSA keypair at boot. The PRIVATE key never leaves this service;
// it signs access tokens. The PUBLIC key is served at /auth/public-key.pem so
// the gateway (and other services) can verify tokens locally.
//
// Production: persist the keypair (or use a JWKS with key rotation) instead of
// regenerating on restart — see docs/04-auth-flow.md.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

module.exports = { publicKey, privateKey };
