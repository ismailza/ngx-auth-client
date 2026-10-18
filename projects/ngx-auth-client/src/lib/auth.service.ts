import { computed, inject, Injectable, signal, Signal } from '@angular/core';
import { AUTH_PROVIDER } from './auth.tokens';
import {
  Credentials,
  LoginOptions,
  LogoutOptions,
  RegisterOptions,
  UpdatePasswordOptions,
} from './models/auth-options.model';
import { Claims, UserProfile } from './models/claims.model';
import {
  supportsAccountManagement,
  supportsCredentialSignIn,
  supportsPasswordUpdate,
  supportsProfile,
  supportsRegistration,
  UnsupportedCapabilityError,
} from './ports/capabilities';

const NO_PROFILE: Signal<UserProfile | null> = signal(null).asReadonly();

/**
 * The single service application code injects.
 *
 * Wraps the configured {@link AuthProvider} and adds three things the raw port
 * deliberately leaves out: initialisation state, capability detection, and role
 * predicates.
 *
 * @example
 * ```ts
 * @Component({
 *   template: `@if (auth.authenticated()) { Hello {{ auth.claims()?.name }} }`,
 * })
 * export class Header {
 *   protected readonly auth = inject(AuthService);
 *   protected readonly isAdmin = computed(() => this.auth.hasRole('admin'));
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly provider = inject(AUTH_PROVIDER);

  private readonly _ready = signal(false);
  private readonly _initError = signal<unknown>(null);

  /**
   * Resolves once initialisation has settled — successfully or not. Guards
   * await this so they never decide against a half-initialised session.
   */
  private readonly initialization: Promise<void> = this.provider
    .init()
    .catch((error: unknown) => {
      // A failed init is not a crash: it means "not authenticated". Surfacing
      // it through `initError` lets the app react without every guard and
      // interceptor having to handle a rejected promise.
      this._initError.set(error);
    })
    .finally(() => {
      this._ready.set(true);
    });

  /** Whether a valid session currently exists. */
  readonly authenticated = this.provider.authenticated;

  /** Decoded access-token payload, or `null` when unauthenticated. */
  readonly claims: Signal<Claims | null> = this.provider.claims;

  /** Roles held by the user, normalised by the adapter. */
  readonly roles: Signal<readonly string[]> = this.provider.roles;

  /**
   * Profile loaded via {@link loadProfile}. Stays `null` on adapters that do
   * not support profiles.
   */
  readonly profile: Signal<UserProfile | null> = supportsProfile(this.provider)
    ? this.provider.profile
    : NO_PROFILE;

  /** Whether {@link whenReady} has settled. `false` during the initial load. */
  readonly ready = this._ready.asReadonly();

  /** The error that failed initialisation, if any. */
  readonly initError = this._initError.asReadonly();

  /** Whether the adapter supports {@link signIn}. */
  readonly canSignIn = computed(() => supportsCredentialSignIn(this.provider));

  /** Whether the adapter supports {@link register}. */
  readonly canRegister = computed(() => supportsRegistration(this.provider));

  /** Whether the adapter supports {@link accountManagement}. */
  readonly canManageAccount = computed(() =>
    supportsAccountManagement(this.provider),
  );

  /** Whether the adapter supports {@link updatePassword}. */
  readonly canUpdatePassword = computed(() =>
    supportsPasswordUpdate(this.provider),
  );

  /** Whether the adapter supports {@link loadProfile}. */
  readonly canLoadProfile = computed(() => supportsProfile(this.provider));

  /**
   * Resolves once the session has been restored (or definitively not restored).
   *
   * Never rejects — inspect {@link initError} to distinguish "no session" from
   * "the provider is unreachable".
   */
  whenReady(): Promise<void> {
    return this.initialization;
  }

  /**
   * Returns an access token valid *now*, refreshing it first if it is close to
   * expiry.
   *
   * Promise-based on purpose: a refresh is an operation, not state.
   *
   * @throws When the session cannot be renewed and the user must log in again.
   */
  getToken(): Promise<string> {
    return this.provider.getToken();
  }

  /** Sends the user to the provider's login page. */
  login(options?: LoginOptions): Promise<void> {
    return this.provider.login(options);
  }

  /**
   * Authenticates credentials from the application's own login form.
   *
   * @throws {UnsupportedCapabilityError} When {@link canSignIn} is `false`.
   * @throws {InvalidCredentialsError} When the credentials are rejected.
   */
  signIn(credentials: Credentials): Promise<void> {
    if (!supportsCredentialSignIn(this.provider)) {
      return Promise.reject(new UnsupportedCapabilityError('signIn'));
    }
    return this.provider.signIn(credentials);
  }

  /** Terminates the session. */
  logout(options?: LogoutOptions): Promise<void> {
    return this.provider.logout(options);
  }

  /**
   * Sends the user to the provider's sign-up page.
   *
   * @throws {UnsupportedCapabilityError} When {@link canRegister} is `false`.
   */
  register(options?: RegisterOptions): Promise<void> {
    if (!supportsRegistration(this.provider)) {
      return Promise.reject(new UnsupportedCapabilityError('registration'));
    }
    return this.provider.register(options);
  }

  /**
   * Sends the user to the provider's self-service account console.
   *
   * @throws {UnsupportedCapabilityError} When {@link canManageAccount} is `false`.
   */
  accountManagement(): Promise<void> {
    if (!supportsAccountManagement(this.provider)) {
      return Promise.reject(
        new UnsupportedCapabilityError('accountManagement'),
      );
    }
    return this.provider.accountManagement();
  }

  /**
   * Sends the user to the provider's password-change flow.
   *
   * @throws {UnsupportedCapabilityError} When {@link canUpdatePassword} is `false`.
   */
  updatePassword(options?: UpdatePasswordOptions): Promise<void> {
    if (!supportsPasswordUpdate(this.provider)) {
      return Promise.reject(new UnsupportedCapabilityError('passwordUpdate'));
    }
    return this.provider.updatePassword(options);
  }

  /**
   * Fetches the user profile and publishes it on {@link profile}.
   *
   * @throws {UnsupportedCapabilityError} When {@link canLoadProfile} is `false`.
   */
  loadProfile(): Promise<UserProfile> {
    if (!supportsProfile(this.provider)) {
      return Promise.reject(new UnsupportedCapabilityError('profile'));
    }
    return this.provider.loadProfile();
  }

  /** Whether the user holds `role`. */
  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  /** Whether the user holds **at least one** of `roles`. An empty list passes. */
  hasAnyRole(roles: readonly string[]): boolean {
    if (roles.length === 0) {
      return true;
    }
    const granted = new Set(this.roles());
    return roles.some((role) => granted.has(role));
  }

  /** Whether the user holds **every** one of `roles`. An empty list passes. */
  hasAllRoles(roles: readonly string[]): boolean {
    const granted = new Set(this.roles());
    return roles.every((role) => granted.has(role));
  }
}
