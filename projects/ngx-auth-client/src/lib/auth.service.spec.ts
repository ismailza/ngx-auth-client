import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeAuthProvider, withFakeAuth } from '@ismailza/ngx-auth-client/testing';
import { AuthService } from './auth.service';
import { AUTH_PROVIDER } from './auth.tokens';
import { Claims } from './models/claims.model';
import { AuthProvider } from './ports/auth-provider';
import {
  InvalidCredentialsError,
  UnsupportedCapabilityError,
} from './ports/capabilities';
import { AuthFeature, provideAuth } from './provide-auth';

/**
 * The narrowest possible adapter: the port and nothing else.
 *
 * Its purpose is to prove the capability interfaces work — a provider that
 * implements only `AuthProvider` must be usable, and must report every optional
 * capability as unavailable rather than throwing at construction.
 */
@Injectable()
class MinimalAuthProvider implements AuthProvider {
  readonly authenticated = signal(true).asReadonly();
  readonly claims = signal<Claims | null>(null).asReadonly();
  readonly roles = signal<readonly string[]>([]).asReadonly();

  init(): Promise<void> {
    return Promise.resolve();
  }

  getToken(): Promise<string> {
    return Promise.resolve('minimal-token');
  }

  login(): Promise<void> {
    return Promise.resolve();
  }

  logout(): Promise<void> {
    return Promise.resolve();
  }
}

const withMinimalAuth = (): AuthFeature => ({
  kind: 'minimal',
  providers: [
    MinimalAuthProvider,
    { provide: AUTH_PROVIDER, useExisting: MinimalAuthProvider },
  ],
});

const setup = (feature: AuthFeature) => {
  TestBed.configureTestingModule({ providers: [provideAuth(feature)] });
  return TestBed.inject(AuthService);
};

describe('AuthService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('state', () => {
    it('exposes the adapter state as signals', () => {
      const auth = setup(
        withFakeAuth({
          authenticated: true,
          claims: { sub: 'user-1', name: 'Test User' },
          roles: ['admin'],
        }),
      );

      expect(auth.authenticated()).toBe(true);
      expect(auth.claims()?.name).toBe('Test User');
      expect(auth.roles()).toEqual(['admin']);
    });

    it('tracks adapter state changes reactively', () => {
      const auth = setup(withFakeAuth({ authenticated: true, roles: ['admin'] }));
      const fake = TestBed.inject(FakeAuthProvider);

      expect(auth.hasRole('admin')).toBe(true);

      fake.setRoles(['viewer']);

      expect(auth.roles()).toEqual(['viewer']);
      expect(auth.hasRole('admin')).toBe(false);
    });
  });

  describe('initialisation', () => {
    it('starts init eagerly and reports readiness', async () => {
      const auth = setup(withFakeAuth({ authenticated: true }));

      expect(auth.ready()).toBe(false);
      await auth.whenReady();

      expect(auth.ready()).toBe(true);
      expect(auth.initError()).toBeNull();
    });

    // A provider that cannot be reached means "not signed in", not "crash the
    // app" — every guard would otherwise have to handle a rejected promise.
    it('resolves whenReady and records the error when init fails', async () => {
      const failure = new Error('keycloak unreachable');
      const auth = setup(withFakeAuth({ failInit: failure }));

      await expect(auth.whenReady()).resolves.toBeUndefined();
      expect(auth.initError()).toBe(failure);
      expect(auth.authenticated()).toBe(false);
    });
  });

  describe('role predicates', () => {
    let auth: AuthService;

    beforeEach(() => {
      auth = setup(withFakeAuth({ roles: ['admin', 'finance'] }));
    });

    it('hasRole checks a single role', () => {
      expect(auth.hasRole('admin')).toBe(true);
      expect(auth.hasRole('owner')).toBe(false);
    });

    it('hasAnyRole passes on a single match', () => {
      expect(auth.hasAnyRole(['owner', 'finance'])).toBe(true);
      expect(auth.hasAnyRole(['owner', 'viewer'])).toBe(false);
    });

    it('hasAllRoles requires every role', () => {
      expect(auth.hasAllRoles(['admin', 'finance'])).toBe(true);
      expect(auth.hasAllRoles(['admin', 'owner'])).toBe(false);
    });

    it('treats an empty requirement as satisfied', () => {
      expect(auth.hasAnyRole([])).toBe(true);
      expect(auth.hasAllRoles([])).toBe(true);
    });
  });

  describe('capabilities', () => {
    it('reports every capability on an adapter that implements them all', () => {
      const auth = setup(withFakeAuth());

      expect(auth.canRegister()).toBe(true);
      expect(auth.canManageAccount()).toBe(true);
      expect(auth.canUpdatePassword()).toBe(true);
      expect(auth.canLoadProfile()).toBe(true);
      expect(auth.canSignIn()).toBe(true);
    });

    it('reports no capability on an adapter that implements only the port', () => {
      const auth = setup(withMinimalAuth());

      expect(auth.canRegister()).toBe(false);
      expect(auth.canManageAccount()).toBe(false);
      expect(auth.canUpdatePassword()).toBe(false);
      expect(auth.canLoadProfile()).toBe(false);
      expect(auth.canSignIn()).toBe(false);
    });

    it('keeps the port itself working on a minimal adapter', async () => {
      const auth = setup(withMinimalAuth());

      await expect(auth.getToken()).resolves.toBe('minimal-token');
      await expect(auth.login()).resolves.toBeUndefined();
      await expect(auth.logout()).resolves.toBeUndefined();
    });

    it('exposes a null profile signal on an adapter without profiles', () => {
      expect(setup(withMinimalAuth()).profile()).toBeNull();
    });

    it('rejects with UnsupportedCapabilityError rather than failing silently', async () => {
      const auth = setup(withMinimalAuth());

      await expect(auth.register()).rejects.toBeInstanceOf(
        UnsupportedCapabilityError,
      );
      await expect(auth.accountManagement()).rejects.toBeInstanceOf(
        UnsupportedCapabilityError,
      );
      await expect(auth.updatePassword()).rejects.toBeInstanceOf(
        UnsupportedCapabilityError,
      );
      await expect(auth.loadProfile()).rejects.toBeInstanceOf(
        UnsupportedCapabilityError,
      );
      await expect(
        auth.signIn({ username: 'u', password: 'p' }),
      ).rejects.toBeInstanceOf(UnsupportedCapabilityError);
    });

    it('names the matching can* signal in UnsupportedCapabilityError', () => {
      expect(new UnsupportedCapabilityError('signIn').message).toContain(
        'AuthService.canSignIn()',
      );
    });
  });

  describe('operations', () => {
    it('forwards login and logout options to the adapter', async () => {
      const auth = setup(withFakeAuth({ authenticated: true }));
      const fake = TestBed.inject(FakeAuthProvider);

      await auth.login({ redirectUri: '/after-login', locale: 'fr' });
      await auth.logout({ redirectUri: '/goodbye' });

      expect(fake.loginCalls[0].options).toEqual({
        redirectUri: '/after-login',
        locale: 'fr',
      });
      expect(fake.logoutCalls[0].options).toEqual({ redirectUri: '/goodbye' });
      expect(auth.authenticated()).toBe(false);
    });

    it('publishes the loaded profile on the profile signal', async () => {
      const auth = setup(
        withFakeAuth({ profile: { id: 'user-1', username: 'test' } }),
      );

      expect(auth.profile()).toBeNull();
      await auth.loadProfile();

      expect(auth.profile()?.username).toBe('test');
    });

    it('signs in with credentials through the adapter', async () => {
      const auth = setup(withFakeAuth({ roles: ['admin'] }));
      const fake = TestBed.inject(FakeAuthProvider);

      await auth.signIn({ username: 'tester', password: 'secret' });

      expect(fake.signInCalls[0].options).toEqual({
        username: 'tester',
        password: 'secret',
      });
      expect(auth.authenticated()).toBe(true);
      expect(auth.hasRole('admin')).toBe(true);
    });

    it('propagates rejected credentials', async () => {
      const auth = setup(withFakeAuth({ failSignIn: true }));

      await expect(
        auth.signIn({ username: 'tester', password: 'wrong' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(auth.authenticated()).toBe(false);
    });

    it('propagates a failed token refresh', async () => {
      const failure = new Error('refresh token expired');
      const auth = setup(withFakeAuth({ authenticated: true, failToken: failure }));

      await expect(auth.getToken()).rejects.toBe(failure);
    });
  });
});
