import { computed, Injectable, signal, Signal } from '@angular/core';
import type {
  AuthFeature,
  AuthProvider,
  Claims,
  LoginOptions,
  LogoutOptions,
  RegisterOptions,
  SupportsRegistration,
} from '@ismailza/ngx-auth-client';
import { AUTH_PROVIDER } from '@ismailza/ngx-auth-client';

/**
 * A third-party adapter, written the way a contributor would write one.
 *
 * This is the load-bearing part of the fixture: `AuthProvider` is the contract
 * the whole library is built around, so if implementing it stops compiling on
 * some Angular major, that is a breaking change for every downstream adapter —
 * not just for this package's own code.
 *
 * It implements one capability and omits the rest, which is the case the
 * capability interfaces exist to support.
 */
@Injectable()
export class FixtureAuthProvider implements AuthProvider, SupportsRegistration {
  private readonly _claims = signal<Claims | null>(null);

  readonly claims: Signal<Claims | null> = this._claims.asReadonly();
  readonly authenticated: Signal<boolean> = computed(() => this._claims() !== null);

  /** Role normalisation is the adapter's job — the core only sees `string[]`. */
  readonly roles: Signal<readonly string[]> = computed(() => {
    const groups = this._claims()?.['groups'];
    return Array.isArray(groups) ? groups.filter((g): g is string => typeof g === 'string') : [];
  });

  init(): Promise<void> {
    this._claims.set({ sub: 'fixture-user', groups: ['admin'] });
    return Promise.resolve();
  }

  getToken(): Promise<string> {
    return Promise.resolve('fixture-token');
  }

  login(options?: LoginOptions): Promise<void> {
    void options;
    return Promise.resolve();
  }

  logout(options?: LogoutOptions): Promise<void> {
    void options;
    this._claims.set(null);
    return Promise.resolve();
  }

  register(options?: RegisterOptions): Promise<void> {
    void options;
    return Promise.resolve();
  }
}

/** Adapters compose the same way the shipped ones do. */
export const withFixtureAuth = (): AuthFeature => ({
  kind: 'fixture',
  providers: [FixtureAuthProvider, { provide: AUTH_PROVIDER, useExisting: FixtureAuthProvider }],
});
