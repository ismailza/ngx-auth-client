import type { KeycloakOnLoad, KeycloakPkceMethod } from 'keycloak-js';
import type { Claims } from '@ismailza/ngx-auth-client';

/**
 * Where the Keycloak adapter looks for roles when normalising them to
 * `string[]`.
 *
 * Role location is where identity providers differ most, so it is configured
 * per-adapter and never leaks into the core.
 */
export interface KeycloakRoleSources {
  /**
   * Include realm roles from `realm_access.roles`.
   * @default true
   */
  realm?: boolean;

  /**
   * Include client roles from `resource_access`.
   *
   * `true` takes every client's roles, an array takes only the named clients,
   * `false` takes none. Naming clients explicitly is the safer default for
   * apps that hold roles in several clients with colliding names.
   *
   * @default true
   */
  resource?: boolean | readonly string[];
}

/** Configuration for `withKeycloak()`. */
export interface KeycloakConfiguration {
  /** Keycloak server URL, e.g. `https://auth.example.com`. */
  url: string;

  /** Realm name. */
  realm: string;

  /** Client ID registered in the realm for this application. */
  clientId: string;

  /** Where to land after login. Defaults to the current page. */
  redirectUri?: string;

  /** Where to land after logout. */
  postLogoutRedirectUri?: string;

  /**
   * What to do when the adapter loads.
   *
   * `'check-sso'` restores an existing session silently and leaves the user
   * unauthenticated otherwise; `'login-required'` redirects to the login page
   * immediately.
   *
   * @default 'check-sso'
   */
  onLoad?: KeycloakOnLoad;

  /**
   * Poll the session status through a hidden iframe.
   * @default false
   */
  checkLoginIframe?: boolean;

  /** URI of the static silent-check-sso page, when using one. */
  silentCheckSsoRedirectUri?: string;

  /**
   * PKCE method. Kept out of the "off by omission" path deliberately.
   * @default 'S256'
   */
  pkceMethod?: KeycloakPkceMethod;

  /** Log adapter activity to the console. Useful in development. */
  enableLogging?: boolean;

  /**
   * Seconds of remaining validity below which `getToken()` refreshes the token
   * before returning it.
   *
   * @default 30
   */
  minTokenValidity?: number;

  /**
   * Which token claims roles are read from.
   * @default `{ realm: true, resource: true }`
   */
  roles?: KeycloakRoleSources;

  /**
   * Full override of role extraction. Takes precedence over {@link roles}.
   *
   * Use it when roles live somewhere non-standard — a group claim, a mapper
   * output, a custom attribute.
   *
   * @example
   * ```ts
   * withKeycloak({
   *   url, realm, clientId,
   *   mapRoles: (claims) => (claims['groups'] as string[] | undefined) ?? [],
   * });
   * ```
   */
  mapRoles?: (claims: Claims) => readonly string[];
}

/** {@link KeycloakConfiguration} after defaults have been applied. */
export type ResolvedKeycloakConfiguration = KeycloakConfiguration &
  Required<
    Pick<
      KeycloakConfiguration,
      'onLoad' | 'checkLoginIframe' | 'pkceMethod' | 'minTokenValidity' | 'roles'
    >
  >;

/** Defaults applied by `withKeycloak()` when the consumer omits a value. */
export const KEYCLOAK_CONFIGURATION_DEFAULTS = {
  onLoad: 'check-sso',
  checkLoginIframe: false,
  pkceMethod: 'S256',
  minTokenValidity: 30,
  roles: { realm: true, resource: true },
} as const satisfies Partial<KeycloakConfiguration>;

/** Merges consumer configuration over {@link KEYCLOAK_CONFIGURATION_DEFAULTS}. */
export const resolveKeycloakConfiguration = (
  config: KeycloakConfiguration,
): ResolvedKeycloakConfiguration => ({
  ...KEYCLOAK_CONFIGURATION_DEFAULTS,
  ...stripUndefined(config),
  roles: { ...KEYCLOAK_CONFIGURATION_DEFAULTS.roles, ...config.roles },
});

// Spreading a config with explicit `undefined` values would erase the defaults
// underneath it, which is a surprising way to lose PKCE.
const stripUndefined = (config: KeycloakConfiguration): KeycloakConfiguration =>
  Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as unknown as KeycloakConfiguration;
