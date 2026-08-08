import type { Provider } from '@angular/core';
import { provideAuth, type AuthFeature } from '@ismailza/ngx-auth-client';
import {
  FakeAuthProvider,
  withFakeAuth,
  type FakeAuthOptions,
  type RecordedCall,
} from '@ismailza/ngx-auth-client/testing';
import type { LoginOptions } from '@ismailza/ngx-auth-client';

/**
 * The `/testing` entry point, used the way a consumer's specs use it.
 *
 * Deliberately free of `TestBed`: this file is bundled by the `ng build` leg,
 * and pulling in the testing infrastructure would say more about
 * `@angular/core/testing` than about this package. Composing the providers is
 * what proves the entry point resolves, type-checks and links.
 */
const fakeOptions: FakeAuthOptions = {
  authenticated: true,
  roles: ['admin', 'finance'],
  claims: { sub: 'user-1', name: 'Test User', groups: ['admin'] },
  profile: { id: 'user-1', username: 'tester', emailVerified: true },
  token: 'test-token',
};

export const fakeAuthFeature: AuthFeature = withFakeAuth(fakeOptions);

/** What a spec's `TestBed.configureTestingModule({ providers })` would receive. */
export const testProviders: Provider[] = [];

export const testEnvironmentProviders = [provideAuth(fakeAuthFeature), ...testProviders];

/** The fake also has to compose with no options at all. */
export const bareFakeFeature: AuthFeature = withFakeAuth();

/**
 * The recorded-call accessors are public surface: specs assert against them, so
 * a change in their shape breaks consumers' tests rather than their build.
 */
export const inspectFake = (fake: FakeAuthProvider) => {
  const logins: RecordedCall<LoginOptions>[] = fake.loginCalls;

  fake.setAuthenticated(true);
  fake.setRoles(['viewer']);
  fake.setClaims({ sub: 'user-2' });

  return {
    firstRedirectUri: logins[0]?.options?.redirectUri,
    logoutCount: fake.logoutCalls.length,
    registerCount: fake.registerCalls.length,
    passwordUpdateCount: fake.updatePasswordCalls.length,
    accountManagementCalls: fake.accountManagementCalls,
    initialized: fake.initialized(),
    authenticated: fake.authenticated(),
    roles: fake.roles(),
    claims: fake.claims(),
    profile: fake.profile(),
  };
};
