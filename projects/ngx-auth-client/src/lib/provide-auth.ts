import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  Provider,
} from '@angular/core';
import { AuthService } from './auth.service';
import { AUTH_CONFIG } from './auth.tokens';
import {
  AuthConfiguration,
  resolveAuthConfiguration,
} from './models/auth-configuration.model';

/**
 * An adapter, packaged for `provideAuth()`.
 *
 * Produced by `withKeycloak()`, `withFakeAuth()`, or your own adapter — never
 * assembled by hand.
 */
export interface AuthFeature {
  /** Identifies the adapter in errors and devtools. */
  readonly kind: string;

  /** Providers the adapter needs, including `AUTH_PROVIDER` itself. */
  readonly providers: readonly Provider[];
}

/**
 * Configures authentication for an Angular application. Call it once.
 *
 * The adapter's `init()` starts as soon as the injector is created, and
 * `AuthService.whenReady()` resolves when it settles. Bootstrap is **not**
 * blocked: `authGuard` awaits readiness before deciding, so protected routes
 * are still safe, while unprotected shell UI renders immediately.
 *
 * @param feature The identity-provider adapter, e.g. `withKeycloak({ … })`.
 * @param config Provider-agnostic options — forbidden route, bearer allowlist.
 *
 * @example
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideAuth(
 *       withKeycloak({ url: 'https://auth.example.com', realm: 'my-realm', clientId: 'my-app' }),
 *       { forbiddenRoute: '/no-access' },
 *     ),
 *     provideHttpClient(withInterceptors([authTokenInterceptor])),
 *     provideRouter(routes),
 *   ],
 * };
 * ```
 */
export const provideAuth = (
  feature: AuthFeature,
  config?: AuthConfiguration,
): EnvironmentProviders =>
  makeEnvironmentProviders([
    ...feature.providers,
    { provide: AUTH_CONFIG, useValue: resolveAuthConfiguration(config) },
    {
      // Constructing AuthService is what kicks off `init()`, so doing it here
      // starts restoring the session during bootstrap rather than on first
      // injection.
      //
      // ENVIRONMENT_INITIALIZER is marked deprecated in Angular 20+, but its
      // replacement (`provideEnvironmentInitializer`) only exists from v19 and
      // this package supports v17. Deprecated-but-present is the one option
      // that compiles across the whole range; it is scheduled for removal in
      // v23, which the peer range already excludes.
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        inject(AuthService);
      },
    },
  ]);
