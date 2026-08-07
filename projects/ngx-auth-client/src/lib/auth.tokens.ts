import { InjectionToken } from '@angular/core';
import {
  AUTH_CONFIGURATION_DEFAULTS,
  ResolvedAuthConfiguration,
} from './models/auth-configuration.model';
import { AuthProvider } from './ports/auth-provider';

/**
 * The configured adapter. Provided by an auth feature such as
 * `withKeycloak()` or `withFakeAuth()`, never directly by the consumer.
 *
 * Application code should inject `AuthService` instead — it is the stable
 * surface and adds capability detection on top of the raw port.
 */
export const AUTH_PROVIDER = new InjectionToken<AuthProvider>('AUTH_PROVIDER');

/**
 * Provider-agnostic configuration, resolved against its defaults by
 * `provideAuth()`.
 */
export const AUTH_CONFIG = new InjectionToken<ResolvedAuthConfiguration>(
  'AUTH_CONFIG',
  { providedIn: 'root', factory: () => AUTH_CONFIGURATION_DEFAULTS },
);
