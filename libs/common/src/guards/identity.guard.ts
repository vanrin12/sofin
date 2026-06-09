import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { permissionsFor } from '../permissions';

// Runs in services BEHIND the gateway. Trusts the identity headers the gateway
// injected (x-user-id / x-user-roles) and attaches req.user. Rejects requests
// with no identity unless the route is @Public().
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const id = req.headers['x-user-id'];
    if (!id) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'missing identity' });

    const roles = String(req.headers['x-user-roles'] || '')
      .split(',')
      .filter(Boolean);
    req.user = { id, roles, permissions: permissionsFor(roles) };
    return true;
  }
}
