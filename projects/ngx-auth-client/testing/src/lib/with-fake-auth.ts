import { AUTH_PROVIDER, type AuthFeature } from '@ismailza/ngx-auth-client';
import { FakeAuthProvider, type FakeAuthOptions } from './fake-auth.provider';

/**
 * Configures the in-memory {@link FakeAuthProvider} as the identity provider.
 *
 * Pass the result to `provideAuth()` exactly as you would `withKeycloak()` —
 * that symmetry is the point. Nothing under test knows which adapter it got.
 *
 * @example
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [
 *     provideAuth(
 *       withFakeAuth({
 *         authenticated: true,
 *         roles: ['admin'],
 *         claims: { sub: 'user-1', name: 'Test User' },
 *       }),
 *     ),
 *     provideRouter(routes),
 *   ],
 * });
 * ```
 *
 * Inject `FakeAuthProvider` in the test to drive state changes after setup.
 */
export const withFakeAuth = (options: FakeAuthOptions = {}): AuthFeature => ({
  kind: 'fake',
  providers: [
    FakeAuthProvider,
    {
      provide: AUTH_PROVIDER,
      // The same instance backs both tokens, so a test can inject
      // `FakeAuthProvider` to drive it while the code under test sees only
      // `AUTH_PROVIDER`.
      useFactory: (fake: FakeAuthProvider) => {
        fake.configure(options);
        return fake;
      },
      deps: [FakeAuthProvider],
    },
  ],
});
