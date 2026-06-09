import { Body, Controller, Get, Header, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, AuthUser, Permissions, Public, Raw, EventBus } from '@app/common';
import { publicKey } from '../keys';
import { AuthService } from './auth.service';
import { UsersStore } from './users.store';
import { LoginDto, RefreshDto, RegisterDto, RolesDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersStore,
    private readonly bus: EventBus,
  ) {}

  // ── Public: token verification key (gateway fetches this) ────────────────
  @Public()
  @Raw()
  @Get('public-key.pem')
  @Header('content-type', 'text/plain')
  publicKey(): string {
    return publicKey;
  }

  // ── Public auth endpoints ────────────────────────────────────────────────
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // ── Authenticated (identity injected by gateway) ─────────────────────────
  @Get('me')
  me(@CurrentUser() current: AuthUser) {
    const user = this.users.findById(current.id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    return { id: user.id, email: user.email, name: user.name, roles: user.roles };
  }

  @Post('logout')
  logout(@CurrentUser() current: AuthUser) {
    this.users.revokeAllForUser(current.id);
    return { loggedOut: true };
  }

  // internal lookup used by other services
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    const user = this.users.findById(id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    return { id: user.id, email: user.email, name: user.name, roles: user.roles };
  }

  // ── Role management (needs role:assign) ──────────────────────────────────
  @Permissions('role:assign')
  @Put('users/:id/roles')
  setRoles(@Param('id') id: string, @Body() dto: RolesDto) {
    const user = this.users.setRoles(id, dto.roles);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    this.bus.publish('user.roles_changed', { userId: user.id, roles: user.roles }, { producer: 'auth' });
    return { id: user.id, roles: user.roles };
  }
}
