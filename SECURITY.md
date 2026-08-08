# Security Policy

## Supported Versions

The following versions of `@ismailza/ngx-auth-client` currently receive security updates.

| Version               | Supported |
| :-------------------- | :-------: |
| Latest stable release |    ✅     |
| Older releases        |    ❌     |

We recommend always upgrading to the latest stable version to receive security fixes.

## Reporting a Vulnerability

If you believe you have found a security vulnerability, **please do not open a public GitHub issue**.

Instead, use GitHub's **Private vulnerability reporting** feature by clicking **Security** → **Report a vulnerability** in this repository.

When submitting a report, please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- A proof of concept (if applicable)
- Suggested remediation (optional)

## Our Commitment

We will:

- Acknowledge receipt of your report as soon as reasonably possible.
- Investigate the reported issue.
- Keep you informed of our progress.
- Release a fix if the vulnerability is confirmed.
- Credit you for your responsible disclosure, unless you prefer to remain anonymous.

## Security Guarantees

The library is built around a small set of guarantees. A report showing that any of them can be broken is always in scope:

- **Tokens are held in memory only.** Nothing is written to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies by this library.
- **PKCE (`S256`) is enabled by default** and cannot be disabled by omitting configuration.
- **The bearer interceptor is an allowlist** and fails closed: a request that does not match the configured pattern and method list receives no token.
- **Guards fail closed.** An error while resolving authentication state or roles must deny access, never grant it.

## Scope

Examples of security issues include:

- Leakage of access tokens, refresh tokens, ID tokens, or decoded claims — for example to a non-allowlisted or cross-origin host, into the URL, into logs or error messages, or into browser storage.
- Flaws that let the route guard (`authGuard`) be bypassed, or that let role requirements (`anyOf` / `allOf`, including requirements accumulated from parent routes) be satisfied without the user actually holding those roles.
- Incorrect role normalization or claim parsing in an adapter that grants more privilege than the identity provider issued.
- Weaknesses in the authentication flow itself: PKCE downgrade or omission, missing `state`/`nonce` validation, redirect-URI or post-logout-redirect manipulation, session fixation, or an open redirect through login/logout return handling.
- Token lifecycle problems, such as an expired or revoked token continuing to be attached to requests, or a failed refresh leaving the application in an authenticated state.
- The testing adapter (`withFakeAuth`) being reachable from, or leaking into, a production build path.
- Dependency vulnerabilities that affect the security of the library.
- Any issue that could allow an attacker to bypass intended security guarantees provided by the library.

### Out of scope

- Misconfiguration of your identity provider (realm, client, redirect URIs, token lifetimes, CORS) or of your backend's token validation. This library obtains and attaches tokens; **the server remains responsible for verifying them**.
- Client-side route guards being bypassed by a user editing their own browser state. Guards control navigation and rendering, not authorization — enforcement belongs on the API.
- Vulnerabilities in `keycloak-js`, Angular, or other upstream packages. Please report those to the corresponding project; we will pick up the fix on our side.
- Deliberately widening the bearer `urlPattern` to include a third-party host.

General bugs, feature requests, configuration questions, and documentation improvements should be reported through GitHub Issues.

## Disclosure Policy

We follow a coordinated vulnerability disclosure process. Please avoid publicly disclosing security vulnerabilities until a fix has been released or a coordinated disclosure timeline has been agreed upon.
