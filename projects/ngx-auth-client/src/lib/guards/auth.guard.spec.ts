import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { FakeAuthProvider, withFakeAuth } from '@ismailza/ngx-auth-client/testing';
import { AuthService } from '../auth.service';
import { AuthConfiguration } from '../models/auth-configuration.model';
import { AuthRouteData } from '../models/auth-route-data.model';
import { provideAuth } from '../provide-auth';
import { authGuard } from './auth.guard';

const ORIGIN = 'https://app.example.com';

const snapshotChain = (
  ...data: (AuthRouteData | Record<string, never>)[]
): ActivatedRouteSnapshot => {
  const chain = data.map(
    (routeData) => ({ data: routeData }) as unknown as ActivatedRouteSnapshot,
  );

  chain.forEach((snapshot, index) => {
    Object.defineProperty(snapshot, 'pathFromRoot', {
      value: chain.slice(0, index + 1),
    });
  });

  return chain[chain.length - 1];
};

const stateFor = (url: string) => ({ url }) as RouterStateSnapshot;

interface SetupOptions {
  authenticated?: boolean;
  roles?: readonly string[];
  config?: AuthConfiguration;
  platformId?: string;
}

const setup = ({
  authenticated = true,
  roles = [],
  config,
  platformId = 'browser',
}: SetupOptions = {}) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideAuth(withFakeAuth({ authenticated, roles }), config),
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });

  return {
    auth: TestBed.inject(AuthService),
    fake: TestBed.inject(FakeAuthProvider),
    router: TestBed.inject(Router),
  };
};

/** Runs the guard inside an injection context, as the router would. */
const runGuard = (
  route: ActivatedRouteSnapshot,
  url = '/dashboard',
): Promise<boolean | UrlTree> =>
  TestBed.runInInjectionContext(
    () => authGuard(route, stateFor(url)) as Promise<boolean | UrlTree>,
  );

describe('authGuard', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: ORIGIN, href: `${ORIGIN}/dashboard` });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('allows an authenticated user through a route with no role requirement', async () => {
    setup({ authenticated: true });

    await expect(runGuard(snapshotChain({}))).resolves.toBe(true);
  });

  it('sends an unauthenticated user to the provider login page', async () => {
    const { fake } = setup({ authenticated: false });

    await expect(runGuard(snapshotChain({}), '/dashboard')).resolves.toBe(false);
    expect(fake.loginCalls).toHaveLength(1);
  });

  // Bug carried over from the prior implementation: the redirect URI was built
  // from `window.location.origin` unconditionally.
  it('returns the user to the route they asked for after login', async () => {
    const { fake } = setup({ authenticated: false });

    await runGuard(snapshotChain({}), '/reports/42?tab=summary');

    expect(fake.loginCalls[0].options?.redirectUri).toBe(
      `${ORIGIN}/reports/42?tab=summary`,
    );
  });

  it('waits for initialisation before deciding', async () => {
    const { fake, auth } = setup({ authenticated: true });

    expect(auth.ready()).toBe(false);
    await runGuard(snapshotChain({}));

    expect(fake.initialized()).toBe(true);
    expect(auth.ready()).toBe(true);
  });

  describe('role requirements', () => {
    it('allows a user holding one of the anyOf roles', async () => {
      setup({ roles: ['owner'] });

      const route = snapshotChain({ auth: { anyOf: ['admin', 'owner'] } });
      await expect(runGuard(route)).resolves.toBe(true);
    });

    it('allows a user holding every allOf role', async () => {
      setup({ roles: ['admin', 'finance'] });

      const route = snapshotChain({ auth: { allOf: ['admin', 'finance'] } });
      await expect(runGuard(route)).resolves.toBe(true);
    });

    it('refuses a user missing one of the allOf roles', async () => {
      const { router } = setup({ roles: ['admin'] });

      const route = snapshotChain({ auth: { allOf: ['admin', 'finance'] } });
      const result = await runGuard(route);

      expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
    });

    it('applies a requirement inherited from a parent route', async () => {
      const { router } = setup({ roles: ['viewer'] });

      const route = snapshotChain({}, { auth: { anyOf: ['admin'] } }, {});
      const result = await runGuard(route);

      expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
    });
  });

  describe('forbidden route', () => {
    it('redirects to /forbidden by default', async () => {
      const { router } = setup({ roles: [] });

      const route = snapshotChain({ auth: { anyOf: ['admin'] } });
      const result = await runGuard(route);

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
    });

    // Bug carried over from the prior implementation: `/forbidden` was hardcoded.
    it('redirects to a configured route', async () => {
      const { router } = setup({
        roles: [],
        config: { forbiddenRoute: '/no-access' },
      });

      const route = snapshotChain({ auth: { anyOf: ['admin'] } });
      const result = await runGuard(route);

      expect(router.serializeUrl(result as UrlTree)).toBe('/no-access');
    });

    it('refuses without navigating when the route is null', async () => {
      setup({ roles: [], config: { forbiddenRoute: null } });

      const route = snapshotChain({ auth: { anyOf: ['admin'] } });
      await expect(runGuard(route)).resolves.toBe(false);
    });
  });

  describe('server-side rendering', () => {
    // Tokens are memory-only, so the server has no session to evaluate.
    // Returning `true` would render protected content into a response that may
    // be cached and served to anyone.
    it('fails closed on a non-browser platform', async () => {
      const { fake } = setup({ authenticated: true, platformId: 'server' });

      await expect(runGuard(snapshotChain({}))).resolves.toBe(false);
      expect(fake.loginCalls).toHaveLength(0);
    });
  });
});
