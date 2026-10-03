import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { AuthError, ConflictError, type AuthService, type AuthSession } from '@moonwitness/auth';

export interface AuthRoutesOptions {
  authService: AuthService;
  accessTtlSeconds: number;
  /** Max login attempts per IP per minute. */
  loginRateMax: number;
}

const refreshBody = {
  type: 'object',
  required: ['refresh_token'],
  additionalProperties: false,
  properties: { refresh_token: { type: 'string', minLength: 1, maxLength: 512 } },
} as const;

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (fastify, options) => {
  const { authService, accessTtlSeconds, loginRateMax } = options;

  const tokenResponse = (session: AuthSession) => ({
    success: true,
    data: {
      access_token: fastify.jwt.sign({ role: session.role }, { sub: String(session.userId) }),
      token_type: 'Bearer',
      expires_in: accessTtlSeconds,
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAt,
      user: {
        id: session.userId,
        login: session.login,
        role: session.role,
        partner_id: session.partnerId,
      },
    },
  });

  fastify.post<{ Body: { login: string; password: string; name?: string; email?: string } }>(
    '/auth/register',
    {
      config: { rateLimit: { max: loginRateMax, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user account',
        body: {
          type: 'object',
          required: ['login', 'password'],
          additionalProperties: false,
          properties: {
            login: { type: 'string', minLength: 3, maxLength: 255 },
            password: { type: 'string', minLength: 6, maxLength: 1024 },
            name: { type: 'string', minLength: 1, maxLength: 255 },
            email: { type: 'string', format: 'email', maxLength: 255 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const session = await authService.register(
          {
            login: req.body.login,
            password: req.body.password,
            name: req.body.name,
            email: req.body.email,
          },
          {
            userAgent: req.headers['user-agent'],
          }
        );
        req.log.info({ userId: session.userId, ip: req.ip }, 'registration succeeded');
        return reply.code(201).header('Cache-Control', 'no-store').send(tokenResponse(session));
      } catch (error) {
        if (error instanceof ConflictError) {
          req.log.warn({ login: req.body.login, ip: req.ip }, 'registration conflict');
          return reply.code(409).send({ success: false, error: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post<{ Body: { login: string; password: string } }>(
    '/auth/login',
    {
      config: { rateLimit: { max: loginRateMax, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Exchange login and password for an access and refresh token',
        body: {
          type: 'object',
          required: ['login', 'password'],
          additionalProperties: false,
          properties: {
            login: { type: 'string', minLength: 1, maxLength: 255 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const session = await authService.login(req.body.login, req.body.password, {
          userAgent: req.headers['user-agent'],
        });
        req.log.info({ userId: session.userId, ip: req.ip }, 'login succeeded');
        return reply.header('Cache-Control', 'no-store').send(tokenResponse(session));
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        req.log.warn({ login: req.body.login, ip: req.ip }, 'login failed');
        return reply.code(401).send({ success: false, error: error.message });
      }
    }
  );

  const refreshInFlight = new Map<string, Promise<AuthSession>>();
  fastify.post<{ Body: { refresh_token: string } }>(
    '/auth/refresh',
    {
      config: { rateLimit: { max: loginRateMax * 3, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token for a new access and refresh token',
        body: refreshBody,
      },
    },
    async (req, reply) => {
      try {
        const tokenKey = createHash('sha256').update(req.body.refresh_token).digest('hex');
        let entry = refreshInFlight.get(tokenKey);
        if (!entry) {
          const promise = authService.refresh(req.body.refresh_token, {
            userAgent: req.headers['user-agent'],
          });
          entry = promise;
          refreshInFlight.set(tokenKey, promise);
          void promise
            .finally(() => {
              if (refreshInFlight.get(tokenKey) === promise) refreshInFlight.delete(tokenKey);
            })
            .catch(() => undefined);
        }
        const session = await entry;
        return reply.header('Cache-Control', 'no-store').send(tokenResponse(session));
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        req.log.warn({ ip: req.ip }, 'refresh rejected');
        return reply.code(401).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{ Body: { refresh_token: string } }>(
    '/auth/logout',
    { schema: { tags: ['Auth'], summary: 'Revoke a refresh token session', body: refreshBody } },
    async (req) => {
      await authService.logout(req.body.refresh_token);
      return { success: true };
    }
  );

  fastify.get(
    '/auth/me',
    { schema: { tags: ['Auth'], summary: 'Return the authenticated user' } },
    async (req, reply) => {
      const UserModel = req.env.get('base.user');
      const user = req.auth
        ? ((await UserModel.query().findById(req.auth.userId)) as
            | (InstanceType<typeof UserModel> & {
                login: string;
                role: string;
                partner_id?: number;
              })
            | undefined)
        : undefined;
      if (!user || user.active === false) {
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      }
      return {
        success: true,
        data: {
          id: user.id,
          login: user.login,
          role: user.role,
          partner_id: user.partner_id,
          company_id: req.auth?.companyId,
        },
      };
    }
  );
};
