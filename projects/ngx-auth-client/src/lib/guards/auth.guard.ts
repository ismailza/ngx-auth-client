import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth.service';
import { AUTH_CONFIG } from '../auth.tokens';
import { collectRoleRequirements, isSatisfiedBy } from './route-requirements';

/**
 * Protects a route behind authentication and, optionally, role requirements
 * declared in `data.auth`.
 *
 * - Unauthenticated users are sent to the provider's login page and returned to
 *   the route they asked for.
 * - Authenticated users missing a required role are redirected to
 *   `forbiddenRoute` (`/forbidden` by default; `null` refuses without
 *   navigating).
 * - Requirements accumulate down the route tree — see {@link AuthRouteData}.
 *
 * On a non-browser platform the guard **fails closed**: it refuses activation
 * without attempting a redirect. Tokens live in memory only, so the server has
 * no session to evaluate, and rendering protected content into an SSR response
 * that may be cached would leak it.
 *
 * @example
 * ```ts
 * export const routes: Routes = [
 *   { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./dashboard') },
 *   {
 *     path: 'admin',
 *     canActivate: [authGuard],
 *     data: { auth: { anyOf: ['admin', 'owner'] } } satisfies AuthRouteData,
 *     loadComponent: () => import('./admin'),
 *   },
 * ];
 * ```
 */
export const authGuard: CanActivateFn = async (
  route,
  state,
): Promise<boolean | UrlTree> => {
  // Every injection has to happen before the first `await`, while the
  // injection context is still active.
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const auth = inject(AuthService);
  const config = inject(AUTH_CONFIG);
  const router = inject(Router);

  if (!isBrowser) {
    return false;
  }

  await auth.whenReady();

  if (!auth.authenticated()) {
    await auth.login({
      redirectUri: `${globalThis.location.origin}${state.url}`,
    });
    return false;
  }

  if (isSatisfiedBy(collectRoleRequirements(route), auth.roles())) {
    return true;
  }

  return config.forbiddenRoute === null
    ? false
    : router.parseUrl(config.forbiddenRoute);
};
