import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  roles: string[];
  permissions: Set<string>;
}

// Inject the authenticated user (populated by IdentityGuard) into a handler.
// Usage: myHandler(@CurrentUser() user: AuthUser)
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
