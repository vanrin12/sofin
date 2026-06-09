import { Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventBus } from '@app/common';
import { UsersStore, User } from './users.store';

const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL || 604800);

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly users: UsersStore,
    private readonly jwt: JwtService,
    private readonly bus: EventBus,
  ) {}

  // Seed a default admin so role-gated endpoints are reachable out of the box.
  async onApplicationBootstrap() {
    try {
      const admin = await this.users.createUser({
        email: 'admin@sofin.dev',
        password: 'admin1234',
        name: 'Admin',
        roles: ['admin'],
      });
      this.logger.log(`seeded admin ${admin.email}`);
    } catch {
      /* already seeded */
    }
  }

  private signAccess(user: User): string {
    // roles travel in the token; services map roles -> permissions locally
    return this.jwt.sign({ email: user.email, roles: user.roles }, { subject: user.id });
  }

  async register(email: string, password: string, name: string) {
    const user = await this.users.createUser({ email, password, name }); // defaults to ['learner']
    this.bus.publish('user.created', { userId: user.id, email: user.email, name: user.name }, { producer: 'auth' });
    return { id: user.id, email: user.email, roles: user.roles };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.users.verifyPassword(user, password)))
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'invalid email or password' });
    return {
      accessToken: this.signAccess(user),
      refreshToken: await this.users.issueRefreshToken(user.id, REFRESH_TTL),
      user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
    };
  }

  async refresh(refreshToken: string) {
    const userId = await this.users.consumeRefreshToken(refreshToken);
    if (!userId) throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'invalid or expired refresh token' });
    const user = (await this.users.findById(userId)) as User;
    return {
      accessToken: this.signAccess(user),
      refreshToken: await this.users.issueRefreshToken(user.id, REFRESH_TTL),
    };
  }
}
