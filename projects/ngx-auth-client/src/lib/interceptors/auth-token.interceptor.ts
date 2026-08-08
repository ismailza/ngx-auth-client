import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from '../auth.service';
import { AUTH_CONFIG } from '../auth.tokens';
import {
  HttpMethod,
  ResolvedAuthConfiguration,
} from '../models/auth-configuration.model';

/**
 * Attaches `Authorization: Bearer <token>` to outgoing requests that match the
 * configured allowlist, refreshing the token first when it is close to expiry.
 *
 * The allowlist is an allowlist on purpose: a pattern that matches nothing
 * fails closed rather than leaking a token to a third-party host. Requests to
 * public endpoints, static assets and other origins are left untouched.
 *
 * Register it yourself so you control ordering relative to your other
 * interceptors:
 *
 * ```ts
 * provideHttpClient(withInterceptors([authTokenInterceptor]));
 * ```
 */
export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(AUTH_CONFIG);
  const auth = inject(AuthService);

  if (!shouldAttachToken(config, request.url, request.method)) {
    return next(request);
  }

  // Waiting for readiness matters on the first paint: a request fired while
  // the session is still being restored would otherwise go out bare and come
  // back 401, even though the user is signed in.
  return from(resolveToken(auth)).pipe(
    switchMap((token) =>
      next(
        token === null
          ? request
          : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
      ),
    ),
  );
};

const resolveToken = async (auth: AuthService): Promise<string | null> => {
  await auth.whenReady();

  // Unauthenticated requests go out bare and let the API answer 401. Rejecting
  // here would turn "not signed in yet" into a client-side crash.
  return auth.authenticated() ? await auth.getToken() : null;
};

const shouldAttachToken = (
  config: ResolvedAuthConfiguration,
  url: string,
  method: string,
): boolean => {
  if (config.bearer === null) {
    return false;
  }

  return (
    config.bearer.urlPattern.test(url) &&
    config.bearer.methods.includes(method.toUpperCase() as HttpMethod)
  );
};
