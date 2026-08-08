# ngx-auth-client

**Keycloak authentication for modern Angular — signals, zoneless, standalone.**

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

---

## Why this exists

Angular is signals-first and zoneless by default. Reading authentication state should look like reading any other piece of state in your application.

Today it doesn't. `keycloak-angular` exposes a signal for **events** (`KEYCLOAK_EVENT_SIGNAL`), but authentication _state_ still lives on the Keycloak instance as plain getters — `keycloak.authenticated`, `keycloak.token`, `keycloak.tokenParsed`. Deriving reactive state is left to you: subscribe to the event signal, decide which events matter, and maintain your own signals from them. Every application ends up writing that same layer.

In a zoneless application the getters aren't merely inconvenient, they're invisible:

```ts
@if (keycloak.authenticated) { ... }   // ✗ never updates — nothing schedules CD
```

Zone.js used to paper over this by re-rendering after every async task. Without it, getter-based state simply doesn't participate in change detection.

`ngx-auth-client` writes that derivation layer once and gives you the state directly:

```ts
@if (auth.authenticated()) { ... }     // ✓ updates on login, logout, refresh
```

The second reason is coupling. Auth touches routing, HTTP and templates — the parts of a codebase most expensive to change. This library puts a provider-agnostic port at that boundary, so swapping or upgrading your identity provider stays a one-file change.

### When you should use something else

- **You need certified, generic OIDC** across arbitrary providers → [`angular-auth-oidc-client`](https://github.com/damienbod/angular-auth-oidc-client). It is OpenID-certified, mature, and the right call if protocol breadth is your priority.
- **You're happy deriving state from events yourself** → [`keycloak-angular`](https://github.com/mauriciovigolo/keycloak-angular) is well maintained and closer to the metal. Use it directly if you don't want the abstraction.
- **You're on Auth0 / Entra ID today** → use their first-party SDKs. Adapters here are on the roadmap, but shipped beats planned.

---

## Installation

```bash
npm install @ismailza/ngx-auth-client keycloak-js
```

`keycloak-js` is an **optional** peer dependency, required only by the Keycloak adapter. The core package has no identity-provider dependencies.

## Quick start

```ts
// app.config.ts
import { provideAuth } from '@ismailza/ngx-auth-client';
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

That's the complete setup for the common case. Everything else is defaulted: `check-sso` on load, PKCE `S256`, automatic token refresh, bearer token attached to same-origin `/api/*` requests.

## Reading auth state

`AuthService` is the only thing your components inject.

```ts
export class ProfileMenu {
  private readonly auth = inject(AuthService);

  readonly authenticated = this.auth.authenticated; // Signal<boolean>
  readonly claims = this.auth.claims; // Signal<Claims | null>
  readonly roles = this.auth.roles; // Signal<string[]>

  readonly isAdmin = computed(() => this.auth.roles().includes('admin'));

  logout() {
    this.auth.logout();
  }
}
```

| Member                                              | Type                          | Notes                     |
| --------------------------------------------------- | ----------------------------- | ------------------------- |
| `authenticated`                                     | `Signal<boolean>`             |                           |
| `claims`                                            | `Signal<Claims \| null>`      | Decoded token payload     |
| `roles`                                             | `Signal<readonly string[]>`   | Normalized by the adapter |
| `profile`                                           | `Signal<UserProfile \| null>` | Loaded lazily             |
| `getToken()`                                        | `Promise<string>`             | Refreshes if near expiry  |
| `login(opts?)` / `logout(opts?)`                    | `Promise<void>`               |                           |
| `hasRole(r)` / `hasAnyRole([])` / `hasAllRoles([])` | `boolean`                     |                           |

`getToken()` is the one deliberately promise-based member: a token refresh is an
operation, not a state. Everything that _is_ state is a signal.

## Protecting routes

```ts
export const routes: Routes = [
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard'),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { auth: { anyOf: ['admin', 'owner'] } } satisfies AuthRouteData,
    loadComponent: () => import('./admin'),
  },
  {
    path: 'billing',
    canActivate: [authGuard],
    data: { auth: { allOf: ['admin', 'finance'] } } satisfies AuthRouteData,
    loadComponent: () => import('./billing'),
  },
];
```

- Unauthenticated users are sent to the provider's login page and returned to the
  route they requested.
- Authenticated users missing the required roles are redirected to the configured
  forbidden route (`/forbidden` by default, set via `provideAuth({ forbiddenRoute })`).
- Role requirements **accumulate down the route tree**, so a requirement on a parent
  route applies to its children.

## Attaching the token to requests

```ts
provideHttpClient(withInterceptors([authTokenInterceptor]));
```

By default the interceptor matches same-origin `/api/*` requests only. It is an
**allowlist** — public endpoints, static assets and third-party calls never receive
your token unless you say so:

```ts
provideAuth(withKeycloak({ ... }), {
  bearer: {
    urlPattern: /^https:\/\/api\.example\.com(\/.*)?$/i,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});
```

Pairs directly with [`@ismailza/ngx-api-client`](https://github.com/ismailza/ngx-api-client)
if you want a typed HTTP layer on top.

## Testing

Testing authenticated components shouldn't require a Keycloak server or a mocked
`window.location`. The package ships a fake adapter:

```ts
import { provideAuth } from '@ismailza/ngx-auth-client';
import { withFakeAuth } from '@ismailza/ngx-auth-client/testing';

TestBed.configureTestingModule({
  providers: [
    provideAuth(
      withFakeAuth({
        authenticated: true,
        roles: ['admin'],
        claims: { sub: 'user-1', name: 'Test User' },
      }),
    ),
  ],
});
```

The fake is a real implementation of the same port, not a stub — guards, interceptors
and components exercise the same code paths they do in production.

## Adding a provider

The core depends on a single interface:

```ts
export interface AuthProvider {
  readonly authenticated: Signal<boolean>;
  readonly claims: Signal<Claims | null>;

  init(): Promise<void>;
  getToken(): Promise<string>;
  login(options?: LoginOptions): Promise<void>;
  logout(options?: LogoutOptions): Promise<void>;
}
```

Provider-specific behaviour lives behind optional capability interfaces
(`SupportsRegistration`, `SupportsAccountManagement`, …), which the core feature-detects
rather than requiring. Nothing forces an adapter to pretend it has functionality it
doesn't.

**Role mapping belongs to the adapter.** Every provider stores roles somewhere different
— Keycloak in `realm_access`/`resource_access`, Auth0 in a namespaced custom claim,
Cognito in `cognito:groups`, Entra ID in `roles` or group GUIDs. The adapter normalizes;
the core only ever sees `string[]`:

```ts
withKeycloak({
  url,
  realm,
  clientId,
  roles: { realm: true, resource: ['my-app'] }, // or: mapRoles: (claims) => string[]
});
```

## Security notes

- **Tokens are held in memory only.** Nothing is written to `localStorage` or
  `sessionStorage`, where any XSS payload on the page could read them. Session
  continuity comes from the provider's own SSO cookie via silent re-authentication.
- **PKCE (`S256`) is on by default** and cannot be silently disabled by omission.
- **The bearer interceptor is an allowlist.** A misconfigured pattern fails closed
  (no token attached) rather than leaking a token to a third-party host.
- **SSR-safe.** Browser globals are guarded; the library no-ops on the server rather
  than throwing during prerender.

Found a security issue? See [SECURITY.md](./SECURITY.md) — please report privately
rather than opening a public issue.

## Angular support

| Angular | Supported |
| ------- | --------- |
| 17 – 22 | ✅        |

Signals-based state requires Angular 17+. Zoneless is supported but not required.

Every release is verified against each supported major in CI — the packed tarball is
type-checked with `ngc`, bundled through a production `ng build` (which runs the Angular
linker over the shipped declarations) and executed in Node, for all three entry points.

## Roadmap

- [x] Keycloak adapter
- [ ] Generic OIDC adapter (`oidc-client-ts`)
- [ ] Auth0 adapter
- [ ] Route-level scope requirements

Adapters ship when they're validated against a real deployment, not before.

## Support

Maintained on a best-effort basis alongside my other work. Issues are read and answered; feature requests outside the scope above are likely to be declined with a reason rather than left open.

## License

[MIT](./LICENSE) © [Ismail ZAHIR](https://github.com/ismailza)

## Support the Project

If you find this library useful, consider giving it a ⭐ on GitHub. It helps others discover the project and motivates future development.
