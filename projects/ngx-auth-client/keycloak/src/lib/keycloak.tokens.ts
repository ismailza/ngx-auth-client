import { InjectionToken } from '@angular/core';
import type Keycloak from 'keycloak-js';
import type { ResolvedKeycloakConfiguration } from './keycloak-configuration.model';

/** Keycloak configuration, resolved against its defaults by `withKeycloak()`. */
export const KEYCLOAK_CONFIG = new InjectionToken<ResolvedKeycloakConfiguration>(
  'KEYCLOAK_CONFIG',
);

/**
 * The underlying `keycloak-js` instance, or `null` on a non-browser platform.
 *
 * Provided as an escape hatch for genuinely Keycloak-specific work — authz
 * policy evaluation, custom required actions — that has no meaning in a
 * provider-agnostic port.
 *
 * Injecting it couples that file to Keycloak, which is the point: the coupling
 * stays visible and local instead of being smuggled into `AuthService`.
 */
export const KEYCLOAK_INSTANCE = new InjectionToken<Keycloak | null>(
  'KEYCLOAK_INSTANCE',
);
