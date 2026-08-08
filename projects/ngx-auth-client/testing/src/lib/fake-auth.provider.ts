import { Injectable, signal } from '@angular/core';
import type {
  AuthProvider,
  Claims,
  LoginOptions,
  LogoutOptions,
  RegisterOptions,
  SupportsAccountManagement,
  SupportsPasswordUpdate,
  SupportsProfile,
  SupportsRegistration,
  UpdatePasswordOptions,
  UserProfile,
} from '@ismailza/ngx-auth-client';

/** Initial state for {@link FakeAuthProvider}. */
export interface FakeAuthOptions {
  /** @default false */
  authenticated?: boolean;

  /** Claims exposed while authenticated. */
  claims?: Claims | null;

  /** Roles exposed while authenticated. */
  roles?: readonly string[];

  /**
   * Profile that `loadProfile()` resolves to.
   *
   * Not published on the `profile` signal until `loadProfile()` is called —
   * the real adapters load it lazily, and a fake that pre-populates it would
   * hide a missing `loadProfile()` call in the code under test.
   */
  profile?: UserProfile | null;

  /**
   * Token returned by `getToken()`.
   * @default 'fake-token'
   */
  token?: string;

  /**
   * Make `init()` reject, to exercise the "provider unreachable" path.
   */
  failInit?: Error;

  /**
   * Make `getToken()` reject, to exercise expired-session handling.
   */
  failToken?: Error;
}

/** A call recorded by {@link FakeAuthProvider}. */
export interface RecordedCall<T> {
  readonly options: T | undefined;
}

/**
 * An in-memory {@link AuthProvider} for tests.
 *
 * This is a real implementation of the port, not a stub: guards, interceptors
 * and components exercise the same code paths they do in production, and no
 * test needs a Keycloak server or a mocked `window.location`.
 *
 * It doubles as a check on the abstraction. A port that is honest is easy to
 * implement twice; one that leaks provider assumptions is not.
 *
 * @example
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [
 *     provideAuth(withFakeAuth({ authenticated: true, roles: ['admin'] })),
 *   ],
 * });
 *
 * const fake = TestBed.inject(FakeAuthProvider);
 * fake.setRoles(['viewer']);          // drive state changes from the test
 * expect(fake.loginCalls.length).toBe(0);
 * ```
 */
@Injectable()
export class FakeAuthProvider
  implements
    AuthProvider,
    SupportsRegistration,
    SupportsAccountManagement,
    SupportsPasswordUpdate,
    SupportsProfile
{
  private readonly _authenticated = signal(false);
  private readonly _claims = signal<Claims | null>(null);
  private readonly _roles = signal<readonly string[]>([]);
  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _initialized = signal(false);

  private options: FakeAuthOptions = {};

  readonly authenticated = this._authenticated.asReadonly();
  readonly claims = this._claims.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly profile = this._profile.asReadonly();

  /** Whether `init()` has been called. */
  readonly initialized = this._initialized.asReadonly();

  /** Every `login()` call, in order. */
  readonly loginCalls: RecordedCall<LoginOptions>[] = [];

  /** Every `logout()` call, in order. */
  readonly logoutCalls: RecordedCall<LogoutOptions>[] = [];

  /** Every `register()` call, in order. */
  readonly registerCalls: RecordedCall<RegisterOptions>[] = [];

  /** Every `updatePassword()` call, in order. */
  readonly updatePasswordCalls: RecordedCall<UpdatePasswordOptions>[] = [];

  /** Number of `accountManagement()` calls. */
  accountManagementCalls = 0;

  /** Applies the options `withFakeAuth()` was configured with. */
  configure(options: FakeAuthOptions): void {
    this.options = options;
    this._authenticated.set(options.authenticated ?? false);
    this._claims.set(options.claims ?? null);
    this._roles.set(options.roles ?? []);
    this._profile.set(null);
  }

  init(): Promise<void> {
    this._initialized.set(true);
    return this.options.failInit === undefined
      ? Promise.resolve()
      : Promise.reject(this.options.failInit);
  }

  getToken(): Promise<string> {
    if (this.options.failToken !== undefined) {
      return Promise.reject(this.options.failToken);
    }
    return Promise.resolve(this.options.token ?? 'fake-token');
  }

  login(options?: LoginOptions): Promise<void> {
    this.loginCalls.push({ options });
    return Promise.resolve();
  }

  logout(options?: LogoutOptions): Promise<void> {
    this.logoutCalls.push({ options });
    this.setAuthenticated(false);
    return Promise.resolve();
  }

  register(options?: RegisterOptions): Promise<void> {
    this.registerCalls.push({ options });
    return Promise.resolve();
  }

  accountManagement(): Promise<void> {
    this.accountManagementCalls++;
    return Promise.resolve();
  }

  updatePassword(options?: UpdatePasswordOptions): Promise<void> {
    this.updatePasswordCalls.push({ options });
    return Promise.resolve();
  }

  loadProfile(): Promise<UserProfile> {
    const profile = this.options.profile ?? {};
    this._profile.set(profile);
    return Promise.resolve(profile);
  }

  /**
   * Flips authentication. Clears claims and roles when signing out, so tests
   * cannot accidentally assert against a state the real adapter never reaches.
   */
  setAuthenticated(authenticated: boolean): void {
    this._authenticated.set(authenticated);
    if (!authenticated) {
      this._claims.set(null);
      this._roles.set([]);
      this._profile.set(null);
    }
  }

  /** Replaces the roles the user holds. */
  setRoles(roles: readonly string[]): void {
    this._roles.set(roles);
  }

  /** Replaces the token claims. */
  setClaims(claims: Claims | null): void {
    this._claims.set(claims);
  }
}
