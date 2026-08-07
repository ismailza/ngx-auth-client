import { Signal } from '@angular/core';
import { Claims } from '../models/claims.model';
import { LoginOptions, LogoutOptions } from '../models/auth-options.model';

/**
 * The port every identity provider is adapted to.
 *
 * Deliberately small: this is the surface the core, the guard and the
 * interceptor are allowed to depend on. Anything a provider offers beyond it
 * is expressed as an optional capability (see `./capabilities`) so no adapter
 * ever fakes a method it does not have.
 *
 * **State is signals, operations are promises.** The line is state vs. action —
 * a token refresh is an action, not a piece of state.
 *
 * **Role normalisation belongs here.** Providers disagree about where roles
 * live (Keycloak `realm_access`/`resource_access`, Auth0 a namespaced custom
 * claim, Cognito `cognito:groups`, Entra ID `roles` or group GUIDs). The
 * adapter resolves that; the core only ever sees `string[]`.
 */
export interface AuthProvider {
  /** Whether a valid session currently exists. */
  readonly authenticated: Signal<boolean>;

  /** Decoded access-token payload, or `null` when unauthenticated. */
  readonly claims: Signal<Claims | null>;

  /** Roles held by the user, normalised by the adapter. Never `null`. */
  readonly roles: Signal<readonly string[]>;

  /**
   * Establishes the session: restores it from the provider's SSO cookie,
   * completes a redirect callback, and starts token refresh.
   *
   * Called once by `provideAuth()`. Must be safe to call on a non-browser
   * platform, where it is expected to no-op and leave the user unauthenticated.
   */
  init(): Promise<void>;

  /**
   * Returns an access token that is valid *now*, refreshing it first if it is
   * close to expiry.
   *
   * @throws When no valid token can be produced and the user must
   * re-authenticate.
   */
  getToken(): Promise<string>;

  /** Sends the user to the provider's login page. */
  login(options?: LoginOptions): Promise<void>;

  /** Terminates the session. */
  logout(options?: LogoutOptions): Promise<void>;
}
