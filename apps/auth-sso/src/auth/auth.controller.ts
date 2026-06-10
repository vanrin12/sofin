import { Body, Controller, Get, Header, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, AuthUser, Permissions, Public, Raw } from '@app/common';
import { publicKey } from '../keys';
import { AuthService } from './auth.service';
import { UsersStore } from './users.store';
import { LoginDto, RefreshDto, RegisterDto, RolesDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersStore,
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
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.users.findById(current.id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    return { id: user.id, email: user.email, name: user.name, roles: user.roles };
  }

  @Post('logout')
  async logout(@CurrentUser() current: AuthUser) {
    await this.users.revokeAllForUser(current.id);
    return { loggedOut: true };
  }

  // internal lookup used by other services
  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    return { id: user.id, email: user.email, name: user.name, roles: user.roles };
  }

  // ── Role management (needs role:assign) ──────────────────────────────────
  @Permissions('role:assign')
  @Put('users/:id/roles')
  async setRoles(@Param('id') id: string, @Body() dto: RolesDto) {
    // setRoles updates roles and enqueues user.roles_changed in one transaction
    const user = await this.users.setRoles(id, dto.roles);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    return { id: user.id, roles: user.roles };
  }
}
