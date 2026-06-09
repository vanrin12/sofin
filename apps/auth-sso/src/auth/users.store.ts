import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { User } from '@sofin/prisma-auth';
import { PrismaService } from '../prisma/prisma.service';

export type { User };

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Prisma-backed user + refresh-token repository (schema: apps/auth-sso/prisma).
@Injectable()
export class UsersStore {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: { email: string; password: string; name: string; roles?: string[] }): Promise<User> {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'email already registered' });
    return this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 10),
        roles: input.roles ?? ['learner'],
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async setRoles(id: string, roles: string[]): Promise<User | null> {
    try {
      return await this.prisma.user.update({ where: { id }, data: { roles } });
    } catch {
      return null; // not found
    }
  }

  // ── Refresh tokens (opaque, hashed at rest, single-use / rotated) ─────────
  async issueRefreshToken(userId: string, ttlSeconds: number): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    const id = randomUUID();
    await this.prisma.refreshToken.create({
      data: { id, userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
    });
    return `${id}.${raw}`;
  }

  async consumeRefreshToken(token: string): Promise<string | null> {
    const [id, raw] = (token || '').split('.');
    const rec = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!rec || rec.revoked || rec.expiresAt.getTime() < Date.now()) return null;
    if (rec.tokenHash !== sha256(raw || '')) {
      await this.prisma.refreshToken.update({ where: { id }, data: { revoked: true } }); // possible theft
      return null;
    }
    await this.prisma.refreshToken.update({ where: { id }, data: { revoked: true } }); // rotation: single-use
    return rec.userId;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }
}
