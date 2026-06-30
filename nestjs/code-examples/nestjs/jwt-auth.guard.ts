/**
 * JWT authentication guard verifying Amazon Cognito tokens (Q22, Q78).
 *
 * Key practices demonstrated:
 *  - Verify signature against the issuer's JWKS (asymmetric RS256) so the
 *    resource server holds NO shared secret.
 *  - Validate issuer, audience/client, token_use, and expiry.
 *  - Reject `alg: none` / algorithm confusion (jose enforces the allowed algs).
 *
 * Packages: @nestjs/common, jose
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';

const REGION = process.env.AWS_REGION!;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
// JWKS is fetched once and cached/refreshed automatically by jose.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = auth.slice('Bearer '.length);

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: ISSUER,
        algorithms: ['RS256'], // explicit allow-list; blocks alg confusion
      });

      // Cognito access tokens carry token_use=access and client_id (not aud).
      if (payload.token_use !== 'access' || payload.client_id !== CLIENT_ID) {
        throw new UnauthorizedException('Invalid token claims');
      }

      // Attach a normalized principal for downstream guards/handlers.
      (req as Request & { user?: unknown }).user = {
        sub: payload.sub,
        username: (payload as Record<string, unknown>)['username'],
        roles: ((payload as Record<string, unknown>)['cognito:groups'] as string[]) ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token verification failed');
    }
  }
}
