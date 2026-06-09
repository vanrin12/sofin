import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as jwt from 'jsonwebtoken';
import { AppModule } from './app.module';

const log = new Logger('gateway');
const ISSUER = process.env.TOKEN_ISSUER || 'sofin-auth';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:4001';

const TARGETS: Record<string, string> = {
  '/auth': AUTH_URL,
  '/lms': process.env.LMS_URL || 'http://localhost:4002',
  '/crm': process.env.CRM_URL || 'http://localhost:4003',
  '/notifications': process.env.NOTIF_URL || 'http://localhost:4004',
};

// Public (no-auth) routes — login/register/refresh + key.
const PUBLIC = new Set([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'GET /auth/public-key.pem',
]);
const isPublic = (req: Request) => PUBLIC.has(`${req.method} ${req.path}`) || req.path === '/health';

let publicKey: string | null = null;

async function loadPublicKey(retries = 30): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${AUTH_URL}/auth/public-key.pem`);
      if (r.ok) {
        publicKey = await r.text();
        log.log('loaded auth public key');
        return;
      }
    } catch {
      /* auth not up yet */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  log.error('could not load auth public key — auth unreachable');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  await loadPublicKey();

  // correlation id
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('x-request-id', id);
    next();
  });

  app.use(
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
      max: Number(process.env.RATE_LIMIT_MAX || 100),
      standardHeaders: true,
    }),
  );

  // AuthN: never trust client identity headers; verify JWT; inject trusted ones.
  app.use((req: Request, res: Response, next: NextFunction) => {
    delete req.headers['x-user-id'];
    delete req.headers['x-user-roles'];
    if (isPublic(req)) return next();
    if (!publicKey) return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'auth key not loaded' } });

    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    try {
      const claims = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: ISSUER }) as jwt.JwtPayload;
      req.headers['x-user-id'] = String(claims.sub);
      req.headers['x-user-roles'] = ((claims.roles as string[]) || []).join(',');
      next();
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'invalid or missing token' } });
    }
  });

  // Routing: each proxy matches its prefix and forwards the full path intact.
  for (const [prefix, target] of Object.entries(TARGETS)) {
    app.use(createProxyMiddleware(prefix, { target, changeOrigin: true }));
  }

  await app.listen(Number(process.env.GATEWAY_PORT || 8080));
  log.log(`gateway listening on ${process.env.GATEWAY_PORT || 8080}`);
}

bootstrap();
