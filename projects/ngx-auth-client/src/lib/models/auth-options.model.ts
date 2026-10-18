/**
 * Options for {@link AuthProvider.login}.
 *
 * Every field is optional and advisory — an adapter forwards what its provider
 * understands and ignores the rest rather than throwing.
 */
export interface LoginOptions {
  /**
   * Absolute URL to return to once authentication completes.
   * Defaults to the provider's configured redirect URI.
   */
  redirectUri?: string;

  /** Additional OIDC scopes, space-separated (e.g. `'openid profile email'`). */
  scope?: string;

  /** Locale hint for the provider's hosted UI (e.g. `'fr'`, `'ar'`). */
  locale?: string;

  /**
   * OIDC `prompt` parameter.
   *
   * `'none'` performs a silent check against the SSO cookie and fails rather
   * than showing a login screen.
   */
  prompt?: 'none' | 'login' | 'consent' | 'select_account';

  /** Pre-fills the username field on the provider's login form. */
  loginHint?: string;
}

/** Options for {@link SupportsRegistration.register}. */
export type RegisterOptions = LoginOptions;

/** Options for {@link AuthProvider.logout}. */
export interface LogoutOptions {
  /**
   * Absolute URL to return to once the session has been terminated.
   * Defaults to the provider's configured post-logout redirect URI.
   */
  redirectUri?: string;
}

/** Options for {@link SupportsPasswordUpdate.updatePassword}. */
export interface UpdatePasswordOptions {
  /**
   * Absolute URL to return to once the password has been changed.
   * Defaults to the current page.
   */
  redirectUri?: string;

  /** Locale hint for the provider's hosted UI. */
  locale?: string;
}

/**
 * Credentials for {@link SupportsCredentialSignIn.signIn}, collected by the
 * application's own login form.
 *
 * `username` and `password` cover the common case; any extra field (a one-time
 * code, a tenant, "remember me") is forwarded to the backend as-is.
 */
export interface Credentials {
  readonly username: string;
  readonly password: string;
  readonly [field: string]: unknown;
}
