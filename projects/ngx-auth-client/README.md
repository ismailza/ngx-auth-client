<p align="center">
  <a href="https://ismailza.github.io/ngx-auth-client/">
    <img src="https://ismailza.github.io/ngx-auth-client/img/logo.svg" alt="" width="88" height="88">
  </a>
</p>

<h1 align="center">ngx-auth-client</h1>

<p align="center">
  Keycloak authentication for modern Angular — signals, zoneless, standalone.
</p>

<p align="center">
  <a href="https://ismailza.github.io/ngx-auth-client/"><strong>Documentation</strong></a> ·
  <a href="https://github.com/ismailza/ngx-auth-client"><strong>GitHub</strong></a> ·
  <a href="https://ismailza.github.io/ngx-auth-client/docs/getting-started/quick-start"><strong>Quick start</strong></a> ·
  <a href="https://ismailza.github.io/ngx-auth-client/docs/api/provide-auth"><strong>API reference</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ismailza/ngx-auth-client"><img src="https://img.shields.io/npm/v/@ismailza/ngx-auth-client.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@ismailza/ngx-auth-client"><img src="https://img.shields.io/npm/dm/@ismailza/ngx-auth-client.svg" alt="npm downloads"></a>
  <a href="https://ismailza.github.io/ngx-auth-client/"><img src="https://img.shields.io/badge/docs-online-brightgreen.svg" alt="Documentation"></a>
  <a href="https://github.com/ismailza/ngx-auth-client/actions/workflows/ci.yml"><img src="https://github.com/ismailza/ngx-auth-client/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/ismailza/ngx-auth-client/actions/workflows/release.yml"><img src="https://github.com/ismailza/ngx-auth-client/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/ismailza/ngx-auth-client/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@ismailza/ngx-auth-client.svg" alt="License"></a>
</p>

A reactive authentication layer for Angular applications. Exposes auth state as **signals**, protects routes with a **functional guard**, and keeps your feature code free of any identity-provider imports.

Ships with a Keycloak adapter. Built on a provider-agnostic port, so additional adapters can be added without touching application code.

```ts
bootstrapApplication(App, {
  providers: [provideAuth(withKeycloak({ url, realm, clientId }))],
});
```

```ts
@Component({
  template: `@if (auth.authenticated()) {
    Hello {{ auth.claims()?.name }}
  }`,
})
export class Header {
  protected readonly auth = inject(AuthService);
}
```

## Why this exists

Angular is signals-first and zoneless by default. Reading authentication state should look like reading any other piece of state in your application.

Today it doesn't. Authentication state lives on the identity provider's client object as plain getters, so deriving reactive state from it is left to you — and every application ends up writing that same layer. In a zoneless application those getters aren't merely inconvenient, they're invisible:

```ts
@if (keycloak.authenticated) { ... }   // ✗ never updates — nothing schedules CD
@if (auth.authenticated()) { ... }     // ✓ updates on login, logout, refresh
```

This package writes that derivation layer once and gives you the state directly.

## Installation

```bash
npm install @ismailza/ngx-auth-client keycloak-js
```

`keycloak-js` is an **optional** peer dependency, required only by the Keycloak adapter. The core package has no identity-provider dependencies.

## Quick start

```ts
// app.config.ts
import { provideAuth, authTokenInterceptor } from '@ismailza/ngx-auth-client';
import { withKeycloak } from '@ismailza/ngx-auth-client/keycloak';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAuth(
      withKeycloak({
        url: 'https://auth.example.com',
        realm: 'my-realm',
        clientId: 'my-app',
      }),
    ),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideRouter(routes),
  ],
};
```

That's the complete setup for the common case. Everything else is defaulted: `check-sso` on load, PKCE `S256`, automatic token refresh, and the bearer token attached to same-origin `/api/*` requests.

→ [Quick start guide](https://ismailza.github.io/ngx-auth-client/docs/getting-started/quick-start)

## Using your own backend

No Keycloak? `withHttpAuth()` adapts a backend you run yourself. Your app shows its own login form, and the backend issues a JWT access token plus a refresh token in an `httpOnly` cookie:

```ts
import { withHttpAuth } from '@ismailza/ngx-auth-client/http';

provideAuth(
  withHttpAuth({
    endpoints: {
      signIn: '/api/auth/login',
      refresh: '/api/auth/refresh',
      logout: '/api/auth/logout',
    },
  }),
);
```

```ts
// login page
await auth.signIn({ username, password }); // rejects with InvalidCredentialsError on 401
await router.navigateByUrl(sanitizeReturnUrl(route.snapshot.queryParamMap.get('returnUrl')));
```

The access token stays in memory, the session survives reloads through the cookie, and concurrent requests share a single refresh. No extra dependency.

→ [Your own backend](https://ismailza.github.io/ngx-auth-client/docs/guides/http-backend)

## Reading auth state

`AuthService` is the only thing your components inject. Every piece of state on it is a signal, so templates update on login, logout and token refresh.

| Member                                              | Type                          | Notes                     |
| --------------------------------------------------- | ----------------------------- | ------------------------- |
| `authenticated`                                     | `Signal<boolean>`             |                           |
| `claims`                                            | `Signal<Claims \| null>`      | Decoded token payload     |
| `roles`                                             | `Signal<readonly string[]>`   | Normalised by the adapter |
| `profile`                                           | `Signal<UserProfile \| null>` | Loaded lazily             |
| `ready` / `initError`                               | `Signal<…>`                   | Initialisation state      |
| `getToken()`                                        | `Promise<string>`             | Refreshes if near expiry  |
| `login(opts?)` / `logout(opts?)`                    | `Promise<void>`               |                           |
| `hasRole(r)` / `hasAnyRole([])` / `hasAllRoles([])` | `boolean`                     |                           |

`getToken()` is the one deliberately promise-based member: a token refresh is an operation, not a state. Everything that _is_ state is a signal.

→ [Reading auth state](https://ismailza.github.io/ngx-auth-client/docs/guides/auth-state) · [`AuthService` reference](https://ismailza.github.io/ngx-auth-client/docs/api/auth-service)

## Protecting routes

```ts
export const routes: Routes = [
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./dashboard') },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { auth: { anyOf: ['admin', 'owner'] } } satisfies AuthRouteData,
    loadComponent: () => import('./admin'),
  },
];
```

Unauthenticated users are sent to the provider's login page and returned to the route they requested. Authenticated users missing a required role are redirected to the configured forbidden route. Role requirements **accumulate down the route tree**, so a requirement on a parent route applies to its children.

→ [Protecting routes](https://ismailza.github.io/ngx-auth-client/docs/guides/route-protection)

## Attaching the token to requests

```ts
provideHttpClient(withInterceptors([authTokenInterceptor]));
```

By default the interceptor matches same-origin `/api/*` requests only. It is an **allowlist** — public endpoints, static assets and third-party calls never receive your token unless you say so.

→ [Attaching tokens](https://ismailza.github.io/ngx-auth-client/docs/guides/attaching-tokens)

## Testing

Testing authenticated components shouldn't require a Keycloak server or a mocked `window.location`. The package ships a fake adapter:

```ts
import { provideAuth } from '@ismailza/ngx-auth-client';
import { withFakeAuth } from '@ismailza/ngx-auth-client/testing';

TestBed.configureTestingModule({
  providers: [provideAuth(withFakeAuth({ authenticated: true, roles: ['admin'] }))],
});
```

The fake is a real implementation of the same port, not a stub — guards, interceptors and components exercise the same code paths they do in production.

→ [Testing](https://ismailza.github.io/ngx-auth-client/docs/guides/testing)

## Security

- **Tokens are held in memory only.** Nothing is written to `localStorage` or `sessionStorage`, where any XSS payload on the page could read them. Session continuity comes from the provider's own SSO cookie via silent re-authentication.
- **PKCE (`S256`) is on by default** and cannot be silently disabled by omission.
- **The bearer interceptor is an allowlist.** A misconfigured pattern fails closed rather than leaking a token to a third-party host.
- **SSR-safe.** Browser globals are guarded; the library no-ops on the server rather than throwing during prerender.

Client-side role checks are UX, not authorisation — enforce every rule that matters in your API.

→ [Security](https://ismailza.github.io/ngx-auth-client/docs/guides/security) · [Report a vulnerability](https://github.com/ismailza/ngx-auth-client/blob/main/SECURITY.md)

## Entry points

| Import path                          | Contains                                                             |
| ------------------------------------ | -------------------------------------------------------------------- |
| `@ismailza/ngx-auth-client`          | `provideAuth`, `AuthService`, `authGuard`, the interceptor, the port |
| `@ismailza/ngx-auth-client/keycloak` | `withKeycloak`, Keycloak configuration and tokens                    |
| `@ismailza/ngx-auth-client/http`     | `withHttpAuth` for your own backend, `sanitizeReturnUrl`             |
| `@ismailza/ngx-auth-client/testing`  | `withFakeAuth`, `FakeAuthProvider`                                   |

Nothing in the core imports `keycloak-js`, so an application shipping its own adapter never pulls it into the bundle.

## Compatibility

Supports **Angular 17 – 22** (`>=17.0.0 <23.0.0`). Signals-based state requires Angular 17+; zoneless is supported but not required.

Every release is verified against each supported major in CI — the packed tarball is type-checked with `ngc`, bundled through a production `ng build` (which runs the Angular linker over the shipped declarations) and executed in Node, for all four entry points.

## Documentation

Full documentation is at **[ismailza.github.io/ngx-auth-client](https://ismailza.github.io/ngx-auth-client/)**.

- [Introduction](https://ismailza.github.io/ngx-auth-client/docs/intro) — what it is and what it deliberately isn't
- [Installation](https://ismailza.github.io/ngx-auth-client/docs/getting-started/installation) · [Quick start](https://ismailza.github.io/ngx-auth-client/docs/getting-started/quick-start)
- [Configuration](https://ismailza.github.io/ngx-auth-client/docs/guides/configuration) · [Keycloak adapter](https://ismailza.github.io/ngx-auth-client/docs/guides/keycloak) · [Your own backend](https://ismailza.github.io/ngx-auth-client/docs/guides/http-backend) · [Capabilities](https://ismailza.github.io/ngx-auth-client/docs/guides/capabilities)
- [Server-side rendering](https://ismailza.github.io/ngx-auth-client/docs/guides/server-side-rendering) · [Writing a custom provider](https://ismailza.github.io/ngx-auth-client/docs/guides/custom-provider)
- [API reference](https://ismailza.github.io/ngx-auth-client/docs/api/provide-auth)

## License

[MIT](https://github.com/ismailza/ngx-auth-client/blob/main/LICENSE) © [Ismail ZAHIR](https://github.com/ismailza)
