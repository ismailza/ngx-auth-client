import { Signal } from '@angular/core';
import {
  RegisterOptions,
  UpdatePasswordOptions,
} from '../models/auth-options.model';
import { UserProfile } from '../models/claims.model';
import { AuthProvider } from './auth-provider';

/**
 * Optional capabilities an {@link AuthProvider} may also implement.
 *
 * These exist so the port stays honest. The alternative — folding every
 * provider's features into `AuthProvider` — forces adapters to stub methods
 * they cannot support, which is how multi-provider abstractions decay into a
 * lowest common denominator plus a `getNativeClient()` escape hatch.
 *
 * The core feature-detects with the type guards below; `AuthService` exposes a
 * matching `can*` signal so applications can hide UI they cannot deliver.
 */

/** Provider can send the user to a hosted sign-up flow. */
export interface SupportsRegistration {
  register(options?: RegisterOptions): Promise<void>;
}

/** Provider hosts a self-service account console. */
export interface SupportsAccountManagement {
  accountManagement(): Promise<void>;
}

/** Provider hosts a password-change flow. */
export interface SupportsPasswordUpdate {
  updatePassword(options?: UpdatePasswordOptions): Promise<void>;
}

/** Provider can fetch a user profile beyond what the token carries. */
export interface SupportsProfile {
  /** Last loaded profile, or `null` until {@link loadProfile} has resolved. */
  readonly profile: Signal<UserProfile | null>;

  /** Fetches the profile and updates {@link profile}. */
  loadProfile(): Promise<UserProfile>;
}

/** Narrows to a provider that implements {@link SupportsRegistration}. */
export const supportsRegistration = (
  provider: AuthProvider,
): provider is AuthProvider & SupportsRegistration =>
  typeof (provider as Partial<SupportsRegistration>).register === 'function';

/** Narrows to a provider that implements {@link SupportsAccountManagement}. */
export const supportsAccountManagement = (
  provider: AuthProvider,
): provider is AuthProvider & SupportsAccountManagement =>
  typeof (provider as Partial<SupportsAccountManagement>).accountManagement ===
  'function';

/** Narrows to a provider that implements {@link SupportsPasswordUpdate}. */
export const supportsPasswordUpdate = (
  provider: AuthProvider,
): provider is AuthProvider & SupportsPasswordUpdate =>
  typeof (provider as Partial<SupportsPasswordUpdate>).updatePassword ===
  'function';

/** Narrows to a provider that implements {@link SupportsProfile}. */
export const supportsProfile = (
  provider: AuthProvider,
): provider is AuthProvider & SupportsProfile =>
  typeof (provider as Partial<SupportsProfile>).loadProfile === 'function';

/**
 * Thrown when an application calls a capability the configured adapter does
 * not implement.
 *
 * Guard the call with the matching `AuthService.can*` signal to avoid it.
 */
export class UnsupportedCapabilityError extends Error {
  constructor(readonly capability: string) {
    super(
      `The configured auth provider does not support "${capability}". ` +
        `Check AuthService.can${capability.charAt(0).toUpperCase()}${capability.slice(1)}() before calling it.`,
    );
    this.name = 'UnsupportedCapabilityError';
  }
}
