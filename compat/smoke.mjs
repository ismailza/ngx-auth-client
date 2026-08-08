/**
 * Runtime smoke test: the published package ships partial (unlinked) Angular
 * declarations, so importing it under an older runtime exercises that runtime's
 * JIT compiler. Type-checking alone would not catch a linker/runtime break.
 *
 * Also asserts the `exports` map resolves the way consumers rely on it, across
 * all three entry points.
 */
import '@angular/compiler';
import { Injector, PLATFORM_ID } from '@angular/core';
import {
  AUTH_CONFIG,
  AUTH_PROVIDER,
  AuthService,
  UnsupportedCapabilityError,
  provideAuth,
  resolveAuthConfiguration,
  supportsProfile,
  supportsRegistration,
} from '@ismailza/ngx-auth-client';
import {
  KEYCLOAK_CONFIG,
  KEYCLOAK_INSTANCE,
  KeycloakAuthProvider,
  extractRoles,
  resolveKeycloakConfiguration,
  withKeycloak,
} from '@ismailza/ngx-auth-client/keycloak';
import { FakeAuthProvider, withFakeAuth } from '@ismailza/ngx-auth-client/testing';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// --- core + /testing -------------------------------------------------------

const injector = Injector.create({
  providers: [
    provideAuth(
      withFakeAuth({
        authenticated: true,
        roles: ['admin', 'finance'],
        claims: { sub: 'user-1', name: 'Test User' },
        profile: { id: 'user-1', username: 'tester' },
        token: 'smoke-token',
      }),
      { forbiddenRoute: '/no-access', bearer: { urlPattern: /^\/api(\/.*)?$/ } },
    ),
    AuthService,
  ],
});

const auth = injector.get(AuthService);

// Signals carry state across the DI boundary — the core claim of the package.
assert.equal(auth.authenticated(), true);
assert.equal(auth.claims().name, 'Test User');
assert.deepEqual([...auth.roles()], ['admin', 'finance']);
assert.equal(auth.hasRole('admin'), true);
assert.equal(auth.hasAnyRole(['owner', 'finance']), true);
assert.equal(auth.hasAllRoles(['admin', 'owner']), false);

// `init()` is kicked off by the service, and readiness settles.
assert.equal(auth.ready(), false);
await auth.whenReady();
assert.equal(auth.ready(), true);
assert.equal(auth.initError(), null);

assert.equal(await auth.getToken(), 'smoke-token');

// Capability detection has to work through the linker, not just the type system.
assert.equal(auth.canRegister(), true);
assert.equal(auth.canLoadProfile(), true);
assert.equal(auth.profile(), null);
assert.equal((await auth.loadProfile()).username, 'tester');
assert.equal(auth.profile().username, 'tester');

// The fake is reachable as itself, so specs can drive it.
const fake = injector.get(FakeAuthProvider);
assert.ok(fake instanceof FakeAuthProvider);
assert.equal(fake.initialized(), true);
await auth.login({ redirectUri: '/after' });
assert.equal(fake.loginCalls[0].options.redirectUri, '/after');

// Resolved configuration reaches the token the guard and interceptor read.
assert.equal(injector.get(AUTH_CONFIG).forbiddenRoute, '/no-access');
assert.ok(injector.get(AUTH_PROVIDER));

// --- capability refusal ----------------------------------------------------

const minimal = {
  authenticated: () => false,
  claims: () => null,
  roles: () => [],
  init: () => Promise.resolve(),
  getToken: () => Promise.resolve(''),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
};

assert.equal(supportsRegistration(minimal), false);
assert.equal(supportsProfile(minimal), false);

const minimalInjector = Injector.create({
  providers: [{ provide: AUTH_PROVIDER, useValue: minimal }, AuthService],
});
const minimalAuth = minimalInjector.get(AuthService);
assert.equal(minimalAuth.canRegister(), false);
await assert.rejects(
  () => minimalAuth.register(),
  (error) => error instanceof UnsupportedCapabilityError,
  'an unimplemented capability must reject, not no-op',
);

// --- /keycloak -------------------------------------------------------------

// PLATFORM_ID 'server' keeps `new Keycloak()` — which touches browser globals —
// out of the picture, while still exercising the adapter's own code path.
const keycloakInjector = Injector.create({
  providers: [
    ...withKeycloak({
      url: 'https://auth.example.com',
      realm: 'compat',
      clientId: 'compat-app',
      minTokenValidity: 45,
      roles: { realm: true, resource: ['compat-app'] },
    }).providers,
    { provide: PLATFORM_ID, useValue: 'server' },
  ],
});

assert.equal(keycloakInjector.get(KEYCLOAK_CONFIG).minTokenValidity, 45);
assert.equal(keycloakInjector.get(KEYCLOAK_INSTANCE), null);

const keycloakProvider = keycloakInjector.get(AUTH_PROVIDER);
assert.ok(keycloakProvider instanceof KeycloakAuthProvider);

// SSR-safety: init no-ops rather than throwing on a browser global.
await keycloakProvider.init();
assert.equal(keycloakProvider.authenticated(), false);
assert.deepEqual([...keycloakProvider.roles()], []);

// Role normalisation is pure, and the heart of the multi-provider design.
assert.deepEqual(
  [
    ...extractRoles(
      {
        realm_access: { roles: ['realm-admin'] },
        resource_access: { 'compat-app': { roles: ['editor'] }, other: { roles: ['viewer'] } },
      },
      { roles: { realm: true, resource: ['compat-app'] } },
    ),
  ],
  ['realm-admin', 'editor'],
);

assert.equal(resolveKeycloakConfiguration({ url: 'u', realm: 'r', clientId: 'c' }).pkceMethod, 'S256');
assert.equal(resolveAuthConfiguration(undefined).forbiddenRoute, '/forbidden');

// --- exports map -----------------------------------------------------------

// `./package.json` is exported so tooling can read the manifest.
const require = createRequire(import.meta.url);
const manifest = require('@ismailza/ngx-auth-client/package.json');
assert.equal(manifest.name, '@ismailza/ngx-auth-client');
assert.equal(manifest.peerDependenciesMeta?.['keycloak-js']?.optional, true);

// Deep imports must stay blocked: reaching past an entry point would let
// consumers depend on paths that are free to change between releases.
for (const specifier of [
  '@ismailza/ngx-auth-client/lib/auth.service',
  '@ismailza/ngx-auth-client/keycloak/lib/with-keycloak',
  '@ismailza/ngx-auth-client/testing/lib/fake-auth.provider',
]) {
  await assert.rejects(
    () => import(specifier),
    (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    `deep import "${specifier}" should be blocked by the exports map`,
  );
}

console.log('runtime smoke ok');
