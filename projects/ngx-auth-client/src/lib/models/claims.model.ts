/**
 * Decoded payload of the access token, normalised to the standard OIDC claim
 * names. Provider-specific claims remain reachable through the index signature.
 *
 * The core never reads a provider-specific claim — role extraction is the
 * adapter's job (see `AuthProvider.roles`).
 */
export interface Claims {
  /** Subject — the stable, unique identifier of the user. */
  readonly sub?: string;

  /** Issuer that minted the token. */
  readonly iss?: string;

  /** Intended audience(s). */
  readonly aud?: string | string[];

  /** Expiry, in seconds since the epoch. */
  readonly exp?: number;

  /** Issued-at, in seconds since the epoch. */
  readonly iat?: number;

  /** Display name. */
  readonly name?: string;

  /** Login name. */
  readonly preferred_username?: string;

  /** First name. */
  readonly given_name?: string;

  /** Last name. */
  readonly family_name?: string;

  /** Email address. */
  readonly email?: string;

  /** Whether the issuer has verified the email address. */
  readonly email_verified?: boolean;

  /** Any additional claim the provider includes. */
  readonly [claim: string]: unknown;
}

/**
 * User profile fetched from the provider's user endpoint.
 *
 * Distinct from {@link Claims}: claims come from the token and are free, the
 * profile costs a network round-trip and is therefore loaded on demand.
 */
export interface UserProfile {
  /** Provider-side identifier — usually matches `Claims.sub`. */
  readonly id?: string;

  /** Login name. */
  readonly username?: string;

  /** Email address. */
  readonly email?: string;

  /** Whether the provider has verified the email address. */
  readonly emailVerified?: boolean;

  /** First name. */
  readonly firstName?: string;

  /** Last name. */
  readonly lastName?: string;

  /** Provider-specific custom attributes. */
  readonly attributes?: Readonly<Record<string, unknown>>;
}
