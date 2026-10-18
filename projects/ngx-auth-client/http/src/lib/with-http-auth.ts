import { AUTH_PROVIDER, type AuthFeature } from '@ismailza/ngx-auth-client';
import {
  type HttpAuthConfiguration,
  resolveHttpAuthConfiguration,
} from './http-auth-configuration.model';
import { HttpAuthProvider, ProfileHttpAuthProvider } from './http-auth.provider';
import { HTTP_AUTH_CONFIG } from './http-auth.tokens';

/**
 * Configures your own backend as the identity provider: the application signs
 * users in with its own form, and the backend issues the tokens.
 *
 * Pass the result to `provideAuth()`. Requires `provideHttpClient()` and
 * `provideRouter()` in the same injector.
 *
 * @example
 * ```ts
 * provideAuth(
 *   withHttpAuth({
 *     endpoints: {
 *       signIn: '/api/auth/login',
 *       refresh: '/api/auth/refresh',
 *       logout: '/api/auth/logout',
 *       profile: '/api/auth/me',
 *     },
 *   }),
 * )
 * ```
 *
 * Defaults: login form at `/login`, cookies sent with auth requests, refresh
 * when the token has under 30 seconds left, roles read from a `roles` or
 * `authorities` claim.
 */
export const withHttpAuth = (config: HttpAuthConfiguration): AuthFeature => {
  const resolved = resolveHttpAuthConfiguration(config);
  const adapter =
    resolved.endpoints.profile === undefined ? HttpAuthProvider : ProfileHttpAuthProvider;

  return {
    kind: 'http',
    providers: [
      { provide: HTTP_AUTH_CONFIG, useValue: resolved },
      { provide: AUTH_PROVIDER, useClass: adapter },
    ],
  };
};
