import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import {
  type AuthenticatedRequest,
  readBearerToken,
} from '../types/authenticated-request';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers);

    if (token === undefined) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        jwtKey: process.env.CLERK_JWT_KEY,
      });
      const sub = payload.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new UnauthorizedException('Invalid token');
      }
      request.auth = { userId: sub };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.debug('Clerk JWT verification failed');
      throw new UnauthorizedException('Invalid token');
    }
  }
}
