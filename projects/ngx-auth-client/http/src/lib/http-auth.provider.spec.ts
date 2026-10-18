import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { NgZone, PLATFORM_ID, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  AUTH_PROVIDER,
  InvalidCredentialsError,
  supportsCredentialSignIn,
  supportsProfile,
} from '@ismailza/ngx-auth-client';
import type { HttpAuthConfiguration } from './http-auth-configuration.model';
import {
  HttpAuthProvider,
  ProfileHttpAuthProvider,
  type HttpAuthSession,
  type HttpAuthSessionChange,
} from './http-auth.provider';
import { withHttpAuth } from './with-http-auth';

const ENDPOINTS = {
  signIn: '/api/auth/login',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
};

/** An unsigned JWT — the adapter decodes, it never verifies. */
const jwt = (payload: Record<string, unknown>): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${base64}.signature`;
};

const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

const TOKEN = jwt({ sub: 'user-1', name: 'Tester', roles: ['admin'], exp: inSeconds(300) });

const setup = (
  config: Partial<HttpAuthConfiguration> = {},
  { platformId = 'browser', interceptor = vi.fn(), providers = [] as Provider[] } = {},
) => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(
        withInterceptors([
          (request, next) => {
            interceptor(request.url);
            return next(request);
          },
        ]),
      ),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: PLATFORM_ID, useValue: platformId },
      ...withHttpAuth({ endpoints: ENDPOINTS, ...config }).providers,
      ...providers,
    ],
  });

  return {
    provider: TestBed.inject(AUTH_PROVIDER) as HttpAuthProvider,
    backend: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    interceptor,
  };
};

/** Restores a session through `init()`, the way a page load does. */
const signedIn = async (config: Partial<HttpAuthConfiguration> = {}, token = TOKEN) => {
  const context = setup(config);
  const init = context.provider.init();
  context.backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: token });
  await init;
  return context;
};

const reject = (status: number) => ({ status, statusText: 'Rejected' });

/** Moves the clock without firing timers — "the user came back later". */
const jump = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** Spies on the protected `onSessionChange` hook. */
const spyOnSessionChange = (provider: HttpAuthProvider) =>
  vi.spyOn(
    provider as unknown as {
      onSessionChange: (session: HttpAuthSession | null, reason: HttpAuthSessionChange) => void;
    },
    'onSessionChange',
  );

describe('HttpAuthProvider', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('init()', () => {
    it('restores the session from the refresh cookie', async () => {
      const { provider, backend } = setup();

      const init = provider.init();
      const request = backend.expectOne(ENDPOINTS.refresh);
      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBe(true);
      request.flush({ accessToken: TOKEN });
      await init;

      expect(provider.authenticated()).toBe(true);
      expect(provider.claims()?.sub).toBe('user-1');
      expect(provider.roles()).toEqual(['admin']);
    });

    it('leaves the user unauthenticated when there is no session', async () => {
      const { provider, backend } = setup();

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush(null, reject(401));
      await init;

      expect(provider.authenticated()).toBe(false);
      expect(provider.roles()).toEqual([]);
    });

    it('rejects when the backend is unreachable, so it surfaces as initError', async () => {
      const { provider, backend } = setup();

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).error(new ProgressEvent('error'));

      await expect(init).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(provider.authenticated()).toBe(false);
    });

    it('treats a 403 as a failure, not as "no session", by default', async () => {
      const { provider, backend } = setup();

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush(null, reject(403));

      await expect(init).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it('reports no session change on an anonymous page load', async () => {
      const { provider, backend } = setup();
      const onSessionChange = spyOnSessionChange(provider);

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush(null, reject(401));
      await init;

      expect(onSessionChange).not.toHaveBeenCalled();
    });

    it('makes no request on the server', async () => {
      const { provider, backend } = setup({}, { platformId: 'server' });

      await provider.init();

      backend.expectNone(ENDPOINTS.refresh);
      expect(provider.authenticated()).toBe(false);
    });

    it('bypasses HttpClient interceptors, so authTokenInterceptor cannot loop', async () => {
      const interceptor = vi.fn();
      const { provider, backend } = setup({}, { interceptor });

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN });
      await init;

      expect(interceptor).not.toHaveBeenCalled();
    });
  });

  describe('signIn()', () => {
    it('posts the credentials and establishes the session', async () => {
      const { provider, backend } = setup();

      const signIn = provider.signIn({ username: 'tester', password: 'secret', otp: '123456' });
      const request = backend.expectOne(ENDPOINTS.signIn);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        username: 'tester',
        password: 'secret',
        otp: '123456',
      });
      expect(request.request.withCredentials).toBe(true);
      request.flush({ access_token: TOKEN });
      await signIn;

      expect(provider.authenticated()).toBe(true);
      await expect(provider.getToken()).resolves.toBe(TOKEN);
    });

    it('rejects with InvalidCredentialsError on 401', async () => {
      const { provider, backend } = setup();

      const signIn = provider.signIn({ username: 'tester', password: 'wrong' });
      backend.expectOne(ENDPOINTS.signIn).flush(null, reject(401));

      await expect(signIn).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(provider.authenticated()).toBe(false);
    });

    it.each([400, 403])('does not report a %i as bad credentials by default', async (status) => {
      const { provider, backend } = setup();

      const signIn = provider.signIn({ username: 'tester', password: 'secret' });
      backend.expectOne(ENDPOINTS.signIn).flush(null, reject(status));

      await expect(signIn).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it('honours configured rejection statuses', async () => {
      const { provider, backend } = setup({ rejectionStatuses: [400, 401] });

      const signIn = provider.signIn({ username: 'tester', password: 'wrong' });
      backend.expectOne(ENDPOINTS.signIn).flush(null, reject(400));

      await expect(signIn).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('passes server failures through, so they are not shown as bad credentials', async () => {
      const { provider, backend } = setup();

      const signIn = provider.signIn({ username: 'tester', password: 'secret' });
      backend.expectOne(ENDPOINTS.signIn).flush(null, reject(500));

      await expect(signIn).rejects.toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('getToken()', () => {
    it('throws when unauthenticated', async () => {
      const { provider } = setup();
      await expect(provider.getToken()).rejects.toThrow(/not authenticated/);
    });

    it('returns a fresh token without a network call', async () => {
      const { provider, backend } = await signedIn();

      await expect(provider.getToken()).resolves.toBe(TOKEN);
      backend.expectNone(ENDPOINTS.refresh);
    });

    it('refreshes a token close to expiry, once for concurrent callers', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const renewed = jwt({ sub: 'user-1', exp: inSeconds(600) });
      const { provider, backend } = await signedIn();
      jump(271_000); // inside the last 30 s of a 300 s token

      const tokens = Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: renewed });

      expect(await tokens).toEqual([renewed, renewed, renewed]);
    });

    it('signs the user out when the refresh is refused', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { provider, backend } = await signedIn();
      jump(271_000);

      const token = provider.getToken();
      backend.expectOne(ENDPOINTS.refresh).flush(null, reject(401));

      await expect(token).rejects.toThrow(/expired/);
      expect(provider.authenticated()).toBe(false);
    });

    it('keeps the session when the refresh fails for network reasons', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { provider, backend } = await signedIn();
      jump(271_000);

      const token = provider.getToken();
      backend.expectOne(ENDPOINTS.refresh).error(new ProgressEvent('error'));

      await expect(token).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(provider.authenticated()).toBe(true);
    });

    it('prefers expiresIn over the exp claim', async () => {
      // `exp` says five minutes, `expiresIn` says one minute — the server's
      // answer wins because it does not depend on the client clock.
      vi.useFakeTimers({ toFake: ['Date'] });
      const { provider, backend } = setup();
      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 60 });
      await init;
      jump(31_000);

      void provider.getToken();
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN });
    });

    it('returns the session of a sign-in that completed during the refresh', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const signedInAgain = jwt({ sub: 'user-1', exp: inSeconds(900) });
      const { provider, backend } = await signedIn();
      jump(271_000);

      const token = provider.getToken();
      const refresh = backend.expectOne(ENDPOINTS.refresh);
      const signIn = provider.signIn({ username: 'tester', password: 'secret' });
      backend.expectOne(ENDPOINTS.signIn).flush({ accessToken: signedInAgain });
      await signIn;

      refresh.flush({ accessToken: TOKEN });
      await expect(token).resolves.toBe(signedInAgain);
    });

    it('applies a refresh that completes while a sign-in is still pending', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const renewed = jwt({ sub: 'user-1', exp: inSeconds(900) });
      const { provider, backend } = await signedIn();
      jump(271_000);

      const token = provider.getToken();
      const refresh = backend.expectOne(ENDPOINTS.refresh);
      const signIn = provider.signIn({ username: 'tester', password: 'wrong' });
      const signInRequest = backend.expectOne(ENDPOINTS.signIn);

      refresh.flush({ accessToken: renewed });
      // Not the stale, nearly expired token the session held before.
      await expect(token).resolves.toBe(renewed);

      // A failed sign-in leaves the refreshed session in place.
      signInRequest.flush(null, reject(401));
      await expect(signIn).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(provider.getToken()).resolves.toBe(renewed);
    });
  });

  describe('background refresh', () => {
    const start = async (config: Partial<HttpAuthConfiguration>, response: object) => {
      vi.useFakeTimers();
      const context = setup(config);
      const init = context.provider.init();
      context.backend.expectOne(ENDPOINTS.refresh).flush(response);
      await init;
      return context;
    };

    it('refreshes ahead of expiry without any API call', async () => {
      const { provider, backend } = await start({}, { accessToken: TOKEN, expiresIn: 120 });

      await vi.advanceTimersByTimeAsync(89_999);
      backend.expectNone(ENDPOINTS.refresh);

      await vi.advanceTimersByTimeAsync(1);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 120 });
      await vi.waitFor(() => expect(provider.authenticated()).toBe(true));
    });

    it('does not loop when the token lives no longer than minTokenValidity', async () => {
      const { backend } = await start(
        { minTokenValidity: 30 },
        { accessToken: TOKEN, expiresIn: 30 },
      );

      // Halfway through, not immediately.
      await vi.advanceTimersByTimeAsync(14_999);
      backend.expectNone(ENDPOINTS.refresh);
      await vi.advanceTimersByTimeAsync(1);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 30 });

      await vi.advanceTimersByTimeAsync(14_999);
      backend.expectNone(ENDPOINTS.refresh);
    });

    it('waits at least 5 s between refreshes, even for an already-expired exp', async () => {
      const dead = jwt({ sub: 'user-1', exp: inSeconds(-60) });
      const { backend } = await start({}, { accessToken: dead });

      await vi.advanceTimersByTimeAsync(4_999);
      backend.expectNone(ENDPOINTS.refresh);
      await vi.advanceTimersByTimeAsync(1);
      backend.expectOne(ENDPOINTS.refresh).flush(null, reject(401));
    });

    it('measures the lifetime with exp - iat, so a fast client clock does not matter', async () => {
      vi.useFakeTimers();
      const issued = jwt({ sub: 'user-1', iat: inSeconds(0), exp: inSeconds(300) });
      jump(10 * 60_000); // the client clock is ten minutes ahead of the server

      const { provider, backend } = setup();
      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: issued });
      await init;

      await vi.advanceTimersByTimeAsync(269_999);
      backend.expectNone(ENDPOINTS.refresh);
      await expect(provider.getToken()).resolves.toBe(issued);
      await vi.advanceTimersByTimeAsync(1);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: issued });
    });

    it('retries after a network failure, then ends the session at expiry', async () => {
      const { provider, backend } = await start({}, { accessToken: TOKEN, expiresIn: 60 });

      // Refresh at 30 s, retries at 40 s and 50 s; 60 s is expiry.
      for (const wait of [30_000, 10_000, 10_000]) {
        await vi.advanceTimersByTimeAsync(wait);
        backend.expectOne(ENDPOINTS.refresh).error(new ProgressEvent('error'));
        await vi.advanceTimersByTimeAsync(0);
        expect(provider.authenticated()).toBe(true);
      }

      await vi.advanceTimersByTimeAsync(10_000);
      backend.expectNone(ENDPOINTS.refresh);
      expect(provider.authenticated()).toBe(false);
    });

    it('recovers when a retry succeeds', async () => {
      const { provider, backend } = await start({}, { accessToken: TOKEN, expiresIn: 60 });

      await vi.advanceTimersByTimeAsync(30_000);
      backend.expectOne(ENDPOINTS.refresh).error(new ProgressEvent('error'));
      await vi.advanceTimersByTimeAsync(10_000);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 60 });

      await vi.advanceTimersByTimeAsync(25_000);
      expect(provider.authenticated()).toBe(true);
    });

    it('stops once signed out', async () => {
      const { provider, backend } = await start({}, { accessToken: TOKEN, expiresIn: 60 });

      const logout = provider.logout();
      backend.expectOne(ENDPOINTS.logout).flush(null);
      await logout;

      await vi.advanceTimersByTimeAsync(60_000);
      backend.expectNone(ENDPOINTS.refresh);
    });

    it('schedules its timer outside the Angular zone and runs it inside', async () => {
      vi.useFakeTimers();
      const { provider, backend } = setup();
      const zone = TestBed.inject(NgZone);
      const outside = vi.spyOn(zone, 'runOutsideAngular');
      const inside = vi.spyOn(zone, 'run');

      const init = provider.init();
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 60 });
      await init;
      expect(outside).toHaveBeenCalledTimes(1);
      expect(inside).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(30_000);
      expect(inside).toHaveBeenCalledTimes(1);
      backend.expectOne(ENDPOINTS.refresh).flush({ accessToken: TOKEN, expiresIn: 60 });
    });
  });

  describe('request headers', () => {
    const clearCookie = () => {
      document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'CSRF=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    };
    afterEach(clearCookie);

    it('sends the XSRF cookie as a header, like Angular’s interceptor would', () => {
      document.cookie = 'XSRF-TOKEN=abc%20123; path=/';
      const { provider, backend } = setup();

      void provider.init().catch(() => undefined);
      const request = backend.expectOne(ENDPOINTS.refresh);
      expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('abc 123');
      request.flush(null, reject(401));
    });

    it('never sends the XSRF token to another origin', () => {
      document.cookie = 'XSRF-TOKEN=abc; path=/';
      const refresh = 'https://auth.example.com/refresh';
      const { provider, backend } = setup({ endpoints: { ...ENDPOINTS, refresh } });

      void provider.init();
      const request = backend.expectOne(refresh);
      expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
      request.flush(null, reject(401));
    });

    it('honours custom XSRF names, and can be turned off', () => {
      document.cookie = 'CSRF=xyz; path=/';
      const custom = setup({ xsrf: { cookieName: 'CSRF', headerName: 'X-CSRF' } });
      void custom.provider.init();
      const request = custom.backend.expectOne(ENDPOINTS.refresh);
      expect(request.request.headers.get('X-CSRF')).toBe('xyz');
      request.flush(null, reject(401));
      TestBed.resetTestingModule();

      document.cookie = 'XSRF-TOKEN=abc; path=/';
      const off = setup({ xsrf: false });
      void off.provider.init();
      const bare = off.backend.expectOne(ENDPOINTS.refresh);
      expect(bare.request.headers.keys()).toEqual([]);
      bare.flush(null, reject(401));
    });

    it('adds the configured static headers to every auth request', async () => {
      const { provider, backend } = setup({ headers: { 'X-Tenant': 'acme' } });

      const signIn = provider.signIn({ username: 'tester', password: 'secret' });
      const request = backend.expectOne(ENDPOINTS.signIn);
      expect(request.request.headers.get('X-Tenant')).toBe('acme');
      request.flush({ accessToken: TOKEN });
      await signIn;

      const logout = provider.logout();
      const logoutRequest = backend.expectOne(ENDPOINTS.logout);
      expect(logoutRequest.request.headers.get('X-Tenant')).toBe('acme');
      logoutRequest.flush(null);
      await logout;
    });
  });

  describe('login()', () => {
    it('navigates to the login route with an in-app return URL', async () => {
      const { provider, router } = setup();

      await provider.login({ redirectUri: `${location.origin}/admin?tab=users#top` });

      const tree = router.parseUrl(router.url);
      expect(tree.root.children['primary']?.toString()).toBe('login');
      expect(tree.queryParams).toEqual({ returnUrl: '/admin?tab=users#top' });
    });

    it('drops a return URL on another origin', async () => {
      const { provider, router } = setup();

      await provider.login({ redirectUri: 'https://evil.example/phish' });

      expect(router.url).toBe('/login');
    });

    it('removes the <base href> from an absolute return URL', async () => {
      const { provider, router } = setup(
        {},
        { providers: [{ provide: APP_BASE_HREF, useValue: '/app/' }] },
      );

      await provider.login({ redirectUri: `${location.origin}/app/admin?tab=users` });

      expect(router.parseUrl(router.url).queryParams).toEqual({ returnUrl: '/admin?tab=users' });
    });

    it('accepts an in-app path as the return URL', async () => {
      const { provider, router } = setup();

      await provider.login({ redirectUri: '/admin' });

      expect(router.parseUrl(router.url).queryParams).toEqual({ returnUrl: '/admin' });
    });

    it('honours a custom login route and parameter', async () => {
      const { provider, router } = setup({
        loginRoute: '/auth/sign-in?lang=fr',
        returnUrlParam: 'next',
      });

      await provider.login({ redirectUri: `${location.origin}/admin` });

      expect(router.parseUrl(router.url).queryParams).toEqual({ lang: 'fr', next: '/admin' });
    });
  });

  describe('logout()', () => {
    it('clears the session, tells the backend and navigates', async () => {
      const { provider, backend, router } = await signedIn();
      await router.navigateByUrl('/dashboard');

      const logout = provider.logout({ redirectUri: '/goodbye' });
      expect(provider.authenticated()).toBe(false);

      const request = backend.expectOne(ENDPOINTS.logout);
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      request.flush(null);
      await logout;

      expect(router.url).toBe('/goodbye');
    });

    it('removes the <base href> from an absolute logout target', async () => {
      const { provider, backend, router } = setup(
        {},
        { providers: [{ provide: APP_BASE_HREF, useValue: '/app/' }] },
      );

      const logout = provider.logout({ redirectUri: `${location.origin}/app/goodbye` });
      backend.expectOne(ENDPOINTS.logout).flush(null);
      await logout;

      expect(router.url).toBe('/goodbye');
    });

    it('reports the logout of a signed-in user, once', async () => {
      const { provider, backend } = await signedIn();
      const onSessionChange = spyOnSessionChange(provider);

      const logout = provider.logout();
      backend.expectOne(ENDPOINTS.logout).flush(null);
      await logout;

      expect(onSessionChange.mock.calls).toEqual([[null, 'logout']]);
    });

    it('still signs out locally when the backend fails, and says so', async () => {
      const { provider, backend, router } = await signedIn();

      const logout = provider.logout();
      backend.expectOne(ENDPOINTS.logout).flush(null, reject(500));

      await expect(logout).rejects.toThrow(/did not confirm the logout/);
      expect(provider.authenticated()).toBe(false);
      expect(router.url).toBe('/');
    });

    it('is not undone by a refresh that was already in flight', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { provider, backend } = await signedIn();
      jump(271_000);

      const token = provider.getToken();
      const refresh = backend.expectOne(ENDPOINTS.refresh);

      const logout = provider.logout();
      backend.expectOne(ENDPOINTS.logout).flush(null);
      await logout;

      refresh.flush({ accessToken: TOKEN });
      await expect(token).rejects.toThrow(/expired/);
      expect(provider.authenticated()).toBe(false);
    });
  });

  describe('mapping', () => {
    it('accepts claims from mapTokenResponse for opaque tokens', async () => {
      const { provider, backend } = setup({
        mapTokenResponse: (body) => {
          const { token, user } = body as { token: string; user: { id: string; groups: string[] } };
          return {
            accessToken: token,
            expiresIn: 300,
            claims: { sub: user.id, groups: user.groups },
          };
        },
        mapRoles: (claims) => claims['groups'] as string[],
      });

      const init = provider.init();
      backend
        .expectOne(ENDPOINTS.refresh)
        .flush({ token: 'opaque-token', user: { id: 'user-2', groups: ['editor'] } });
      await init;

      expect(provider.claims()?.sub).toBe('user-2');
      expect(provider.roles()).toEqual(['editor']);
      await expect(provider.getToken()).resolves.toBe('opaque-token');
    });

    it('reads Spring Security authorities when there is no roles claim', async () => {
      const { provider } = await signedIn(
        {},
        jwt({ sub: 'user-1', authorities: ['ROLE_ADMIN', { authority: 'ROLE_USER' }, 42] }),
      );
      expect(provider.roles()).toEqual(['ROLE_ADMIN', 'ROLE_USER']);
    });
  });

  describe('capabilities', () => {
    it('supports credential sign-in but not profiles without a profile endpoint', () => {
      const { provider } = setup();

      expect(provider).toBeInstanceOf(HttpAuthProvider);
      expect(provider).not.toBeInstanceOf(ProfileHttpAuthProvider);
      expect(supportsCredentialSignIn(provider)).toBe(true);
      expect(supportsProfile(provider)).toBe(false);
    });

    it('loads the profile with the bearer token when configured', async () => {
      const { provider, backend } = await signedIn({
        endpoints: { ...ENDPOINTS, profile: '/api/auth/me' },
      });
      const profiled = provider as ProfileHttpAuthProvider;
      expect(supportsProfile(profiled)).toBe(true);

      const load = profiled.loadProfile();
      // The GET goes out only after `getToken()` resolves, a microtask later.
      const request = await vi.waitFor(() => backend.expectOne('/api/auth/me'));
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      request.flush({ id: 'user-1', username: 'tester', emailVerified: true, extra: 'dropped' });

      await expect(load).resolves.toEqual({
        id: 'user-1',
        username: 'tester',
        emailVerified: true,
      });
      expect(profiled.profile()?.username).toBe('tester');
    });

    it('forgets the profile on logout', async () => {
      const { provider, backend } = await signedIn({
        endpoints: { ...ENDPOINTS, profile: '/api/auth/me' },
      });
      const profiled = provider as ProfileHttpAuthProvider;

      const load = profiled.loadProfile();
      (await vi.waitFor(() => backend.expectOne('/api/auth/me'))).flush({ id: 'user-1' });
      await load;

      const logout = profiled.logout();
      backend.expectOne(ENDPOINTS.logout).flush(null);
      await logout;

      expect(profiled.profile()).toBeNull();
    });
  });
});
