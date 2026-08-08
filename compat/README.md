# Angular compatibility fixture

The workspace builds on the newest Angular, but `@ismailza/ngx-auth-client`
supports a range of majors. This directory is the consumer project used to check
that claim against every version in the range.

`scripts/check-angular-compat.mjs` copies these files into a throwaway project
outside the repo, installs one Angular major plus the packed tarball, and runs
three checks — each covering something the previous one cannot:

| Check                                 | Catches                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ngc -p tsconfig.json`                | type-level breaks between the shipped `.d.ts` and that version's Angular types                   |
| `ng build --configuration production` | Angular **linker** failures over the shipped partial declarations, plus bundler/AOT breakage     |
| `node smoke.mjs`                      | JIT compilation, injector behaviour and `exports` map resolution — none of which a build reaches |

The supported majors are derived from the library's `@angular/core` peer range,
so the matrix cannot drift from what is published.

All three entry points are covered — the core, `/keycloak` and `/testing`.
`keycloak-js` is installed into the fixture from the library's own optional peer
range; without it the `/keycloak` entry point would not be in the matrix at all.

## Running it

```bash
npm run build
npm run compat            # every supported major
npm run compat -- 17 22   # selected majors
npm run compat -- --list  # the derived matrix, as JSON
```

Each major installs a full Angular toolchain, so a complete local run takes a
while. CI fans the majors out across parallel jobs.

## Layout

| File                   | Role                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `src/models.ts`        | domain types, and `Claims` narrowed the way a consumer narrows it       |
| `src/adapter.ts`       | a third-party `AuthProvider` — the contributor-facing contract          |
| `src/services.ts`      | a service injecting `AuthService`, reading every signal                 |
| `src/routes.ts`        | `Routes` using `authGuard` and `AuthRouteData`                          |
| `src/providers.ts`     | `appConfig` wiring `provideAuth(withKeycloak(...))` and the interceptor |
| `src/testing-usage.ts` | the `/testing` entry point, composed as a spec would                    |
| `src/index.ts`         | barrel — the `ngc` entry point                                          |
| `src/browser.ts`       | the `ng build` entry point                                              |
| `tsconfig.json`        | `ngc` config (`skipLibCheck: false`, so the shipped types are checked)  |
| `tsconfig.app.json`    | `ng build` config                                                       |

## Editing the fixture

These sources must stay valid on **all** supported majors, so they declare no
components: standalone semantics changed between v17 and v19, and the library
ships no declarables anyway. Keep to DI, the public types, the guard and the
interceptor.

`src/adapter.ts` earns its place: `AuthProvider` is the contract every
downstream adapter implements, so if implementing it stops compiling on some
major, that is a breaking change for contributors — not just for this package's
own code.

`browser.ts` parks the fixture on `globalThis` deliberately — the application
builder tree-shakes aggressively, and without a live reference the library would
be dropped from the bundle, leaving the linker with nothing to do and the build
proving nothing. `assertBundleLinked()` in the runner guards both directions,
for the core and for `/keycloak`.

`smoke.mjs` deliberately avoids `TestBed` and constructs injectors directly.
`Injector.create()` does not carry the `root` scope, so anything declared
`providedIn: 'root'` — `AuthService` — has to be listed explicitly.

When a public export is added, reference it here — an export that no fixture
touches is an export the matrix does not cover.
