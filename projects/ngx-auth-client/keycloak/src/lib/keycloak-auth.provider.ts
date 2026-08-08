import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
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
import Keycloak, {
  type KeycloakInitOptions,
  type KeycloakLoginOptions,
  type KeycloakProfile,
} from 'keycloak-js';
import { extractRoles } from './keycloak-roles';
import { KEYCLOAK_CONFIG, KEYCLOAK_INSTANCE } from './keycloak.tokens';

/**
 * Keycloak adapter for the {@link AuthProvider} port.
 *
 * Built directly on `keycloak-js` rather than on `keycloak-angular`, which
 * version-locks to a single Angular major. Owning the Angular integration is
 * what lets this package support Angular 17–22 from one release.
 *
 * Implements every optional capability the port defines, because Keycloak
 * genuinely offers all of them.
 *
 * Tokens are held in memory by `keycloak-js` and never written to
 * `localStorage` or `sessionStorage`; a full page reload re-establishes the
 * session silently against Keycloak's SSO cookie.
 */
@Injectable()
export class KeycloakAuthProvider
  implements
    AuthProvider,
    SupportsRegistration,
    SupportsAccountManagement,
    SupportsPasswordUpdate,
    SupportsProfile
{
  private readonly config = inject(KEYCLOAK_CONFIG);
  private readonly keycloak = inject(KEYCLOAK_INSTANCE);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _claims = signal<Claims | null>(null);
  private readonly _profile = signal<UserProfile | null>(null);

  readonly claims = this._claims.asReadonly();
  readonly profile = this._profile.asReadonly();

  readonly authenticated = computed(() => this._claims() !== null);

  readonly roles = computed(() => extractRoles(this._claims(), this.config));

  async init(): Promise<void> {
    // No session exists on the server — tokens are memory-only — so the
    // adapter reports "unauthenticated" instead of throwing during prerender.
    if (!this.isBrowser || this.keycloak === null) {
      return;
    }

    this.registerEventHandlers(this.keycloak);
    await this.keycloak.init(this.buildInitOptions());
    this.syncState();
  }

  async getToken(): Promise<string> {
    const keycloak = this.requireInstance();

    // Refreshes only when the token expires within `minTokenValidity`;
    // otherwise this resolves immediately without a network call.
    await keycloak.updateToken(this.config.minTokenValidity);
    this.syncState();

    const token = keycloak.token;
    if (token === undefined) {
      throw new Error(
        'No access token available — the user is not authenticated.',
      );
    }
    return token;
  }

  async login(options?: LoginOptions): Promise<void> {
    await this.requireInstance().login({
      redirectUri: options?.redirectUri ?? this.config.redirectUri,
      scope: options?.scope,
      locale: options?.locale,
      // keycloak-js types `prompt` more narrowly than OIDC defines it, but
      // forwards the value to the authorization endpoint verbatim, so
      // `select_account` reaches Keycloak intact.
      prompt: options?.prompt as KeycloakLoginOptions['prompt'],
      loginHint: options?.loginHint,
    });
  }

  async logout(options?: LogoutOptions): Promise<void> {
    await this.requireInstance().logout({
      redirectUri: options?.redirectUri ?? this.config.postLogoutRedirectUri,
    });
  }

  async register(options?: RegisterOptions): Promise<void> {
    await this.requireInstance().register({
      redirectUri: options?.redirectUri ?? this.config.redirectUri,
      scope: options?.scope,
      locale: options?.locale,
    });
  }

  async accountManagement(): Promise<void> {
    await this.requireInstance().accountManagement();
  }

  async updatePassword(options?: UpdatePasswordOptions): Promise<void> {
    // UPDATE_PASSWORD runs mid-session, so the default return target is the
    // page the user is actually on — not the init-time redirect URI, which
    // would drop them back at the app root.
    await this.requireInstance().login({
      action: 'UPDATE_PASSWORD',
      redirectUri: options?.redirectUri ?? globalThis.location.href,
      locale: options?.locale,
    });
  }

  async loadProfile(): Promise<UserProfile> {
    const profile = toUserProfile(
      await this.requireInstance().loadUserProfile(),
    );
    this._profile.set(profile);
    return profile;
  }

  private registerEventHandlers(keycloak: Keycloak): void {
    // keycloak-js reports state changes through callbacks; this is the one
    // place where they are turned into signals, so nothing downstream has to.
    keycloak.onAuthSuccess = () => this.syncState();
    keycloak.onAuthRefreshSuccess = () => this.syncState();
    keycloak.onAuthError = () => this.syncState();
    keycloak.onAuthRefreshError = () => this.syncState();

    keycloak.onAuthLogout = () => {
      this._profile.set(null);
      this.syncState();
    };

    keycloak.onTokenExpired = () => {
      // Fire-and-forget: a failed refresh triggers onAuthLogout, which clears
      // the state. There is nothing further to handle here.
      void keycloak.updateToken(this.config.minTokenValidity).catch(() => {
        this.syncState();
      });
    };
  }

  private syncState(): void {
    const keycloak = this.keycloak;

    this._claims.set(
      keycloak?.authenticated === true && keycloak.tokenParsed !== undefined
        ? keycloak.tokenParsed
        : null,
    );
  }

  private buildInitOptions(): KeycloakInitOptions {
    return {
      onLoad: this.config.onLoad,
      redirectUri: this.config.redirectUri,
      checkLoginIframe: this.config.checkLoginIframe,
      silentCheckSsoRedirectUri: this.config.silentCheckSsoRedirectUri,
      pkceMethod: this.config.pkceMethod,
      enableLogging: this.config.enableLogging,
    };
  }

  private requireInstance(): Keycloak {
    if (this.keycloak === null) {
      throw new Error(
        'Keycloak is unavailable on this platform. Guard authentication calls with `isPlatformBrowser()` when running with SSR.',
      );
    }
    return this.keycloak;
  }
}

const toUserProfile = (profile: KeycloakProfile): UserProfile => ({
  id: profile.id,
  username: profile.username,
  email: profile.email,
  emailVerified: profile.emailVerified,
  firstName: profile.firstName,
  lastName: profile.lastName,
  attributes: profile.attributes,
});
