/**
 * Role-based authorization guard (Q22).
 *
 * Runs AFTER JwtAuthGuard (which populates req.user). Reads required roles from
 * route metadata set by @Roles() and checks them against the authenticated
 * principal's roles (e.g., Cognito groups). Authorization is always enforced
 * server-side — never trust client-supplied role claims (Q77 broken access
 * control).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Merge method-level and class-level @Roles metadata.
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No @Roles on the route => no role restriction (authn still required).
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: { roles?: string[] } }>();
    const userRoles = req.user?.roles ?? [];

    const allowed = required.some((role) => userRoles.includes(role));
    if (!allowed) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
