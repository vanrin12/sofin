import { generateKeyPairSync } from 'crypto';

// RSA keypair generated at boot. The PRIVATE key never leaves this service; it
// signs access tokens. The PUBLIC key is served at /auth/public-key.pem so the
// gateway can verify tokens locally. Production: persist/rotate via JWKS — see
// docs/04-auth-flow.md.
export const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
