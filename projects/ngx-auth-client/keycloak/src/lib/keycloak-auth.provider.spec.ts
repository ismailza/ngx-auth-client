import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type Keycloak from 'keycloak-js';
import { KeycloakAuthProvider } from './keycloak-auth.provider';
import {
  type KeycloakConfiguration,
  resolveKeycloakConfiguration,
} from './keycloak-configuration.model';
import { KEYCLOAK_CONFIG, KEYCLOAK_INSTANCE } from './keycloak.tokens';

const BASE: KeycloakConfiguration = {
  url: 'https://auth.example.com',
  realm: 'my-realm',
  clientId: 'my-app',
};

const TOKEN_PARSED = {
  sub: 'user-1',
  preferred_username: 'tester',
  realm_access: { roles: ['admin'] },
  resource_access: { 'my-app': { roles: ['editor'] } },
};

/**
 * Minimal stand-in for `keycloak-js`. Only the surface the adapter touches is
 * implemented, so a change in what the adapter relies on shows up here.
 */
const createKeycloakStub = () => {
  const stub = {
    authenticated: false,
    token: undefined as string | undefined,
    tokenParsed: undefined as Record<string, unknown> | undefined,

    init: vi.fn(() => {
      stub.authenticated = true;
      stub.token = 'access-token';
      stub.tokenParsed = TOKEN_PARSED;
      return Promise.resolve(true);
    }),
    updateToken: vi.fn(() => Promise.resolve(false)),
    login: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    register: vi.fn(() => Promise.resolve()),
    accountManagement: vi.fn(() => Promise.resolve()),
    loadUserProfile: vi.fn(() =>
      Promise.resolve({ id: 'user-1', username: 'tester', emailVerified: true }),
    ),
  };

  return stub;
};

type KeycloakStub = ReturnType<typeof createKeycloakStub>;

const setup = (
  config: Partial<KeycloakConfiguration> = {},
  platformId = 'browser',
  stub: KeycloakStub | null = createKeycloakStub(),
) => {
  TestBed.configureTestingModule({
    providers: [
      KeycloakAuthProvider,
      {
        provide: KEYCLOAK_CONFIG,
        useValue: resolveKeycloakConfiguration({ ...BASE, ...config }),
      },
      { provide: KEYCLOAK_INSTANCE, useValue: stub as unknown as Keycloak },
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });

  return { provider: TestBed.inject(KeycloakAuthProvider), stub };
};

describe('KeycloakAuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  describe('init', () => {
    it('publishes authentication state as signals once init resolves', async () => {
      const { provider } = setup();

      expect(provider.authenticated()).toBe(false);
      await provider.init();

      expect(provider.authenticated()).toBe(true);
      expect(provider.claims()?.preferred_username).toBe('tester');
      expect(provider.roles()).toEqual(['admin', 'editor']);
    });

    it('passes the resolved configuration to keycloak-js', async () => {
      const { provider, stub } = setup({ onLoad: 'login-required' });
      await provider.init();

      expect(stub?.init).toHaveBeenCalledWith(
        expect.objectContaining({
          onLoad: 'login-required',
          pkceMethod: 'S256',
          checkLoginIframe: false,
        }),
      );
    });

    it('leaves the user unauthenticated when keycloak reports no session', async () => {
      const stub = createKeycloakStub();
      stub.init = vi.fn(() => Promise.resolve(false));

      const { provider } = setup({}, 'browser', stub);
      await provider.init();

      expect(provider.authenticated()).toBe(false);
      expect(provider.claims()).toBeNull();
      expect(provider.roles()).toEqual([]);
    });

    // Tokens are memory-only, so there is no session to restore on the server.
    // Prerendering must not throw on a browser global.
    it('no-ops on a non-browser platform', async () => {
      const { provider, stub } = setup({}, 'server');

      await expect(provider.init()).resolves.toBeUndefined();
      expect(stub?.init).not.toHaveBeenCalled();
      expect(provider.authenticated()).toBe(false);
    });

    it('no-ops when no keycloak instance was constructed', async () => {
      const { provider } = setup({}, 'server', null);

      await expect(provider.init()).resolves.toBeUndefined();
      expect(provider.authenticated()).toBe(false);
    });
  });

  describe('getToken', () => {
    it('refreshes against the configured minimum validity', async () => {
      const { provider, stub } = setup({ minTokenValidity: 45 });
      await provider.init();

      await expect(provider.getToken()).resolves.toBe('access-token');
      expect(stub?.updateToken).toHaveBeenCalledWith(45);
    });

    it('throws when no token is available', async () => {
      const stub = createKeycloakStub();
      stub.init = vi.fn(() => Promise.resolve(false));

      const { provider } = setup({}, 'browser', stub);
      await provider.init();

      await expect(provider.getToken()).rejects.toThrow(
        /No access token available/,
      );
    });

    it('propagates a failed refresh so the caller can re-authenticate', async () => {
      const stub = createKeycloakStub();
      const failure = new Error('refresh token expired');
      stub.updateToken = vi.fn(() => Promise.reject(failure));

      const { provider } = setup({}, 'browser', stub);
      await provider.init();

      await expect(provider.getToken()).rejects.toBe(failure);
    });
  });

  describe('operations', () => {
    it('falls back to the configured redirect URI on login', async () => {
      const { provider, stub } = setup({ redirectUri: 'https://app/home' });
      await provider.init();

      await provider.login();

      expect(stub?.login).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUri: 'https://app/home' }),
      );
    });

    it('prefers an explicit redirect URI over the configured one', async () => {
      const { provider, stub } = setup({ redirectUri: 'https://app/home' });
      await provider.init();

      await provider.login({ redirectUri: 'https://app/reports' });

      expect(stub?.login).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUri: 'https://app/reports' }),
      );
    });

    it('uses the post-logout redirect URI on logout', async () => {
      const { provider, stub } = setup({
        postLogoutRedirectUri: 'https://app/bye',
      });
      await provider.init();

      await provider.logout();

      expect(stub?.logout).toHaveBeenCalledWith({
        redirectUri: 'https://app/bye',
      });
    });

    // The prior implementation sent the user back to the init-time redirect URI,
    // dropping them at the app root after changing their password mid-session.
    it('returns to the current page after a password update', async () => {
      vi.stubGlobal('location', { href: 'https://app/settings/security' });

      const { provider, stub } = setup({ redirectUri: 'https://app/home' });
      await provider.init();

      await provider.updatePassword();

      expect(stub?.login).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_PASSWORD',
          redirectUri: 'https://app/settings/security',
        }),
      );
    });

    it('maps the keycloak profile onto the port shape', async () => {
      const { provider } = setup();
      await provider.init();

      const profile = await provider.loadProfile();

      expect(profile).toEqual({
        id: 'user-1',
        username: 'tester',
        email: undefined,
        emailVerified: true,
        firstName: undefined,
        lastName: undefined,
        attributes: undefined,
      });
      expect(provider.profile()?.username).toBe('tester');
    });

    it('throws a helpful error when called on a non-browser platform', async () => {
      const { provider } = setup({}, 'server', null);
      await provider.init();

      await expect(provider.login()).rejects.toThrow(/unavailable on this platform/);
    });
  });

  describe('event handling', () => {
    it('clears state when keycloak reports a logout', async () => {
      const { provider, stub } = setup();
      await provider.init();
      expect(provider.authenticated()).toBe(true);

      stub!.authenticated = false;
      stub!.tokenParsed = undefined;
      (stub as unknown as Keycloak).onAuthLogout?.();

      expect(provider.authenticated()).toBe(false);
      expect(provider.claims()).toBeNull();
      expect(provider.roles()).toEqual([]);
    });

    it('refreshes the token when keycloak reports it expired', async () => {
      const { provider, stub } = setup({ minTokenValidity: 30 });
      await provider.init();

      (stub as unknown as Keycloak).onTokenExpired?.();

      expect(stub?.updateToken).toHaveBeenCalledWith(30);
    });
  });
});
