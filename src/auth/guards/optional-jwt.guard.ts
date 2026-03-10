import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like AuthGuard('jwt') but does NOT reject unauthenticated requests.
 * If a valid JWT cookie is present → req.user is populated.
 * If not → req.user remains undefined, request continues.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Don't throw on missing/invalid token — just return null
    return user || null;
  }
}
