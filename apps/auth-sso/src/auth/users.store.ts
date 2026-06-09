import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: string[];
  status: 'active' | 'suspended';
  createdAt: string;
}

interface RefreshRecord {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  revoked: boolean;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// In-memory store for the scaffold. Replace with Prisma + Postgres (schema in
// docs/03-data-models.md); the method surface is repository-shaped so only this
// file changes.
@Injectable()
export class UsersStore {
  private users = new Map<string, User>();
  private byEmail = new Map<string, string>();
  private refresh = new Map<string, RefreshRecord>();

  async createUser(input: { email: string; password: string; name: string; roles?: string[] }): Promise<User> {
    const email = input.email.toLowerCase();
    if (this.byEmail.has(email)) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'email already registered' });
    const user: User = {
      id: randomUUID(),
      email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 10),
      roles: input.roles ?? ['learner'],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    return user;
  }

  findByEmail(email: string): User | undefined {
    return this.users.get(this.byEmail.get((email || '').toLowerCase()) as string);
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  setRoles(id: string, roles: string[]): User | undefined {
    const user = this.users.get(id);
    if (user) user.roles = roles;
    return user;
  }

  // ── Refresh tokens (opaque, hashed at rest, single-use / rotated) ─────────
  issueRefreshToken(userId: string, ttlSeconds: number): string {
    const raw = randomBytes(48).toString('base64url');
    const id = randomUUID();
    this.refresh.set(id, { userId, tokenHash: sha256(raw), expiresAt: Date.now() + ttlSeconds * 1000, revoked: false });
    return `${id}.${raw}`;
  }

  consumeRefreshToken(token: string): string | null {
    const [id, raw] = (token || '').split('.');
    const rec = this.refresh.get(id);
    if (!rec || rec.revoked || rec.expiresAt < Date.now()) return null;
    if (rec.tokenHash !== sha256(raw || '')) {
      rec.revoked = true; // hash mismatch on a known id => possible theft
      return null;
    }
    rec.revoked = true; // rotation: single-use
    return rec.userId;
  }

  revokeAllForUser(userId: string): void {
    for (const rec of this.refresh.values()) if (rec.userId === userId) rec.revoked = true;
  }
}
