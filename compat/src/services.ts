import { computed, inject, Injectable, Signal } from '@angular/core';
import { AuthService, UnsupportedCapabilityError } from '@ismailza/ngx-auth-client';
import type { ProfileOrNull, TenantClaims } from './models';

/**
 * Typical consumer service: injects `AuthService` and reads state as signals.
 *
 * The `Signal<T>` annotations are deliberate — an inferred type would still
 * compile if a member quietly changed shape, which is exactly the regression
 * this fixture is meant to catch.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);

  readonly authenticated: Signal<boolean> = this.auth.authenticated;
  readonly roles: Signal<readonly string[]> = this.auth.roles;
  readonly profile: Signal<ProfileOrNull> = this.auth.profile;
  readonly ready: Signal<boolean> = this.auth.ready;
  readonly initError: Signal<unknown> = this.auth.initError;

  /** Consumers narrow `claims` to their own provider-specific shape. */
  readonly claims: Signal<TenantClaims | null> = computed(
    () => this.auth.claims() as TenantClaims | null,
  );

  readonly tenantId: Signal<string | undefined> = computed(() => this.claims()?.tenant_id);

  /** Derived state — the whole point of exposing state as signals. */
  readonly isAdmin: Signal<boolean> = computed(() => this.auth.hasRole('admin'));

  readonly canEditBilling: Signal<boolean> = computed(() =>
    this.auth.hasAllRoles(['admin', 'finance']),
  );

  readonly isStaff: Signal<boolean> = computed(() => this.auth.hasAnyRole(['admin', 'support']));

  /** Capability detection — applications hide UI they cannot deliver. */
  readonly showRegisterLink: Signal<boolean> = this.auth.canRegister;
  readonly showAccountLink: Signal<boolean> = this.auth.canManageAccount;
  readonly showPasswordLink: Signal<boolean> = this.auth.canUpdatePassword;
  readonly canLoadProfile: Signal<boolean> = this.auth.canLoadProfile;

  whenReady(): Promise<void> {
    return this.auth.whenReady();
  }

  token(): Promise<string> {
    return this.auth.getToken();
  }

  signIn(returnTo: string): Promise<void> {
    return this.auth.login({
      redirectUri: returnTo,
      scope: 'openid profile email',
      locale: 'fr',
      prompt: 'select_account',
      loginHint: 'user@example.com',
    });
  }

  signOut(): Promise<void> {
    return this.auth.logout({ redirectUri: '/goodbye' });
  }

  loadProfile(): Promise<ProfileOrNull> {
    return this.auth.loadProfile();
  }

  /** The documented way to call an optional capability defensively. */
  async changePassword(): Promise<'done' | 'unsupported'> {
    if (!this.auth.canUpdatePassword()) return 'unsupported';

    try {
      await this.auth.updatePassword({ redirectUri: '/settings', locale: 'en' });
      return 'done';
    } catch (error) {
      if (error instanceof UnsupportedCapabilityError) return 'unsupported';
      throw error;
    }
  }

  openAccountConsole(): Promise<void> {
    return this.auth.accountManagement();
  }

  register(): Promise<void> {
    return this.auth.register({ redirectUri: '/welcome' });
  }
}
