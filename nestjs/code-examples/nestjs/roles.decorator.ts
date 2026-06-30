/**
 * `@Roles()` metadata decorator (Q18, Q22).
 *
 * Attaches required-role metadata to a route handler/controller. The RolesGuard
 * reads this metadata via the Nest `Reflector` to make an authorization
 * decision — keeping the rule declarative and colocated with the endpoint.
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Usage:
//   @Roles('admin')
//   @Get('users')
//   listUsers() { ... }
