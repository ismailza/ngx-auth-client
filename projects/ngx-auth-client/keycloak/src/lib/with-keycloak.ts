import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { AUTH_PROVIDER, type AuthFeature } from '@ismailza/ngx-auth-client';
import Keycloak from 'keycloak-js';
import {
  type KeycloakConfiguration,
  resolveKeycloakConfiguration,
} from './keycloak-configuration.model';
import { KeycloakAuthProvider } from './keycloak-auth.provider';
import { KEYCLOAK_CONFIG, KEYCLOAK_INSTANCE } from './keycloak.tokens';

/**
 * Configures Keycloak as the identity provider.
 *
 * Pass the result to `provideAuth()`.
 *
 * @example
 * ```ts
 * provideAuth(
 *   withKeycloak({
 *     url: 'https://auth.example.com',
 *     realm: 'my-realm',
 *     clientId: 'my-app',
 *     roles: { realm: true, resource: ['my-app'] },
 *   }),
 * )
 * ```
 *
 * Defaults: `check-sso` on load, PKCE `S256`, no login iframe, refresh when the
 * token has under 30 seconds left, roles read from both `realm_access` and
 * `resource_access`.
 */
export const withKeycloak = (config: KeycloakConfiguration): AuthFeature => {
  const resolved = resolveKeycloakConfiguration(config);

  return {
    kind: 'keycloak',
    providers: [
      { provide: KEYCLOAK_CONFIG, useValue: resolved },
      {
        provide: KEYCLOAK_INSTANCE,
        // `new Keycloak()` touches browser globals, so the instance is only
        // constructed where one exists. On the server the adapter sees `null`
        // and reports the user as unauthenticated.
        useFactory: (platformId: object) =>
          isPlatformBrowser(platformId)
            ? new Keycloak({
                url: resolved.url,
                realm: resolved.realm,
                clientId: resolved.clientId,
              })
            : null,
        deps: [PLATFORM_ID],
      },
      { provide: AUTH_PROVIDER, useClass: KeycloakAuthProvider },
    ],
  };
};
