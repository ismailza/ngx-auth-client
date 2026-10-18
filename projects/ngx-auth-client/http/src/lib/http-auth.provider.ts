import { isPlatformBrowser, Location } from '@angular/common';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  NgZone,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  InvalidCredentialsError,
  type AuthProvider,
  type Claims,
  type Credentials,
  type LoginOptions,
  type LogoutOptions,
  type SupportsCredentialSignIn,
  type SupportsProfile,
  type UserProfile,
} from '@ismailza/ngx-auth-client';
import { firstValueFrom } from 'rxjs';
import { HTTP_AUTH_CONFIG } from './http-auth.tokens';
import { decodeJwtPayload } from './jwt';
import { sanitizeReturnUrl } from './return-url';

/** Why the session changed — see {@link HttpAuthProvider.onSessionChange}. */
export type HttpAuthSessionChange = 'signIn' | 'refresh' | 'logout' | 'expired';

/** An established session. Lives in memory only. */
export interface HttpAuthSession {
  readonly accessToken: string;
  readonly claims: Claims;
  /** Epoch milliseconds. `Infinity` when the backend gives no expiry. */
  readonly expiresAt: number;
  /** Epoch milliseconds at which the token is refreshed ahead of expiry. */
  readonly refreshAt: number;
}

/**
 * Shortest gap between two refreshes of the same session. Whatever the token
 * lifetime or the client clock says, the adapter can never refresh in a tight
 * loop.
 */
const MIN_REFRESH_DELAY = 5_000;

/** Wait before retrying a background refresh that failed for network reasons. */
const RETRY_DELAY = 10_000;

// `setTimeout` overflows above 2^31 - 1 ms and fires immediately.
const MAX_TIMER_DELAY = 2_147_483_647;

const ABSOLUTE_URL = /^([a-z][a-z\d+.-]*:|\/\/)/i;

/**
 * Adapter for a backend you run yourself: the application posts credentials
 * from its own login form, and the backend answers with an access token.
 *
 * **Token storage.** The access token is held in memory only, never in
 * `localStorage` or `sessionStorage`, where any XSS bug could read it. The
 * session survives a reload through a refresh token that the backend keeps in
 * an `httpOnly` cookie, which scripts cannot read at all.
 *
 * **Interceptors are bypassed.** Auth requests go straight to `HttpBackend`.
 * Routed through `HttpClient`, a refresh request would hit
 * `authTokenInterceptor`, which calls `getToken()`, which refreshes — a loop.
 * The XSRF header Angular's own interceptor would add is set here instead.
 *
 * **Refresh is single-flight.** Concurrent `getToken()` calls near expiry
 * share one refresh request instead of racing the backend with several.
 */
@Injectable()
export class HttpAuthProvider implements AuthProvider, SupportsCredentialSignIn {
  protected readonly config = inject(HTTP_AUTH_CONFIG);
  protected readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);
  private readonly location = inject(Location, { optional: true });
  private readonly zone = inject(NgZone, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly session = signal<HttpAuthSession | null>(null);

  /** The refresh in flight, shared by every caller that needs it. */
  private refreshing: Promise<HttpAuthSession | null> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Bumped whenever a session is replaced on purpose (a successful sign-in, a
   * logout), so a refresh that started earlier cannot bring back the session
   * it replaced.
   */
  private generation = 0;

  readonly claims = computed(() => this.session()?.claims ?? null);

  readonly authenticated = computed(() => this.session() !== null);

  readonly roles = computed(() => {
    const claims = this.claims();
    return claims === null ? [] : this.config.mapRoles(claims);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async init(): Promise<void> {
    // The refresh cookie is sent by the browser; a server render has none, so
    // the user is unauthenticated there by definition.
    if (!this.isBrowser) {
      return;
    }

    // `refresh()` resolves `null` when there is no session to restore, and
    // rejects only when the backend fails — which becomes `initError`.
    await this.refresh();
  }

  async getToken(): Promise<string> {
    let session = this.session();
    if (session === null) {
      throw new Error('No access token available — the user is not authenticated.');
    }

    if (Date.now() >= Math.min(session.refreshAt, session.expiresAt)) {
      session = await this.refresh();
      if (session === null) {
        throw new Error('The session has expired — the user must sign in again.');
      }
    }
    return session.accessToken;
  }

  /**
   * Navigates to the application's login route, passing the page the user was
   * trying to reach as the `returnUrl` query parameter.
   */
  async login(options?: LoginOptions): Promise<void> {
    const tree = this.router.parseUrl(this.config.loginRoute);
    const returnUrl = this.toRouterUrl(options?.redirectUri);
    if (returnUrl !== null) {
      tree.queryParams = {
        ...tree.queryParams,
        [this.config.returnUrlParam]: returnUrl,
      };
    }
    await this.router.navigateByUrl(tree);
  }

  async signIn(credentials: Credentials): Promise<void> {
    // Captured, not bumped: a sign-in only replaces the session once it has
    // succeeded, so a failed attempt leaves a concurrent refresh untouched.
    const generation = this.generation;

    let session: HttpAuthSession;
    try {
      session = await this.requestSession(this.config.endpoints.signIn, credentials);
    } catch (error) {
      throw this.isRejection(error) ? new InvalidCredentialsError(error) : error;
    }

    // A logout meanwhile wins over a sign-in that started before it.
    if (generation === this.generation) {
      this.generation++;
      this.setSession(session, 'signIn');
    }
  }

  /**
   * Clears the session locally, then tells the backend.
   *
   * The local session is gone even if the backend call fails, and the user is
   * still navigated away. The returned promise then rejects, with the backend
   * failure as `cause`, because the refresh cookie may have survived — a
   * reload would sign the user back in, and the application should be able to
   * say so.
   */
  async logout(options?: LogoutOptions): Promise<void> {
    const accessToken = this.session()?.accessToken;
    this.generation++;
    this.setSession(null, 'logout');

    let failure: unknown = null;
    const endpoint = this.config.endpoints.logout;
    if (endpoint !== undefined) {
      try {
        await firstValueFrom(
          this.http.post(endpoint, null, {
            withCredentials: this.config.withCredentials,
            headers: this.headersFor(endpoint, 'POST', accessToken),
          }),
        );
      } catch (error) {
        failure = error;
      }
    }

    await this.navigateAfterLogout(options?.redirectUri ?? this.config.postLogoutRoute);

    if (failure !== null) {
      throw new Error(
        'Signed out locally, but the backend did not confirm the logout — a reload may restore the session.',
        { cause: failure },
      );
    }
  }

  /** Called whenever the session changes. Subclasses hook in here. */
  protected onSessionChange(session: HttpAuthSession | null, reason: HttpAuthSessionChange): void {
    void session;
    void reason;
  }

  /**
   * Headers for an auth request: the configured static headers, the bearer
   * token when given, and the XSRF header for same-origin mutating requests.
   */
  protected headersFor(url: string, method: 'GET' | 'POST', accessToken?: string): HttpHeaders {
    let headers = new HttpHeaders({ ...this.config.headers });
    if (accessToken !== undefined) {
      headers = headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const xsrf = method === 'POST' ? this.xsrfHeader(url) : null;
    return xsrf === null ? headers : headers.set(xsrf.name, xsrf.value);
  }

  /**
   * Mirrors Angular's XSRF interceptor, which the bypass skips: the token from
   * the XSRF cookie, sent only to the application's own origin so it can never
   * leak to a third party.
   */
  private xsrfHeader(url: string): { name: string; value: string } | null {
    const xsrf = this.config.xsrf;
    if (xsrf === false || !this.isBrowser) {
      return null;
    }
    if (new URL(url, globalThis.location.href).origin !== globalThis.location.origin) {
      return null;
    }

    const value = readCookie(globalThis.document.cookie, xsrf.cookieName);
    return value === null ? null : { name: xsrf.headerName, value };
  }

  private isRejection(error: unknown): boolean {
    return (
      error instanceof HttpErrorResponse && this.config.rejectionStatuses.includes(error.status)
    );
  }

  /**
   * Fetches a new access token with the refresh cookie.
   *
   * Resolves `null` — and signs the user out — when the backend refuses.
   * Rejects, leaving the current session untouched, on any other failure.
   */
  private refresh(): Promise<HttpAuthSession | null> {
    this.refreshing ??= this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(): Promise<HttpAuthSession | null> {
    const generation = this.generation;

    let session: HttpAuthSession | null;
    try {
      session = await this.requestSession(this.config.endpoints.refresh, null);
    } catch (error) {
      if (!this.isRejection(error)) {
        throw error;
      }
      session = null;
    }

    // A sign-in or logout completed meanwhile. Its session is the current one,
    // and it is what callers waiting on this refresh should get.
    if (generation !== this.generation) {
      return this.session();
    }

    // Nobody was signed in and nobody is: nothing changed, so nothing to report.
    if (session === null && this.session() === null) {
      return null;
    }

    this.setSession(session, session === null ? 'logout' : 'refresh');
    return session;
  }

  private async requestSession(url: string, body: unknown): Promise<HttpAuthSession> {
    const response = await firstValueFrom(
      this.http.post<unknown>(url, body, {
        withCredentials: this.config.withCredentials,
        headers: this.headersFor(url, 'POST'),
      }),
    );

    const { accessToken, expiresIn, claims } = this.config.mapTokenResponse(response);
    return this.toSession(accessToken, claims ?? decodeJwtPayload(accessToken), expiresIn);
  }

  private toSession(
    accessToken: string,
    claims: Claims,
    expiresIn: number | undefined,
  ): HttpAuthSession {
    const receivedAt = Date.now();
    const lifetime = lifetimeOf(claims, expiresIn, receivedAt);

    // Refresh `minTokenValidity` ahead of expiry — but never earlier than
    // halfway through the lifetime, and never sooner than MIN_REFRESH_DELAY.
    // Without both bounds, a token that lives no longer than
    // `minTokenValidity` would be refreshed again the instant it arrived.
    const lead = Math.min(this.config.minTokenValidity * 1000, lifetime / 2);
    return {
      accessToken,
      claims,
      expiresAt: receivedAt + lifetime,
      refreshAt: receivedAt + Math.max(lifetime - lead, MIN_REFRESH_DELAY),
    };
  }

  private setSession(session: HttpAuthSession | null, reason: HttpAuthSessionChange): void {
    this.session.set(session);
    this.onSessionChange(session, reason);

    clearTimeout(this.timer);
    this.timer = undefined;
    if (session !== null && Number.isFinite(session.refreshAt)) {
      this.schedule(() => this.backgroundRefresh(session), session.refreshAt - Date.now());
    }
  }

  /**
   * Refreshes ahead of expiry, so `authenticated` and `claims` stay current
   * even when the application makes no API call for a while.
   */
  private backgroundRefresh(session: HttpAuthSession): void {
    this.refresh().catch(() => {
      // A refusal has already signed the user out inside `runRefresh()`; this
      // is a network or server failure. Retry while the token is still valid,
      // then end the session rather than claim it outlived its token.
      if (this.session() !== session) {
        return;
      }
      if (Date.now() + RETRY_DELAY < session.expiresAt) {
        this.schedule(() => this.backgroundRefresh(session), RETRY_DELAY);
      } else {
        this.schedule(() => this.expire(session), session.expiresAt - Date.now());
      }
    });
  }

  private expire(session: HttpAuthSession): void {
    if (this.session() === session) {
      this.setSession(null, 'expired');
    }
  }

  /**
   * Starts a timer outside the Angular zone, so a pending refresh — often an
   * hour away — does not keep a zone.js application from ever becoming
   * stable. The callback runs back inside the zone, so the state it changes
   * is picked up by change detection.
   */
  private schedule(callback: () => void, delay: number): void {
    const clamped = Math.min(Math.max(delay, 0), MAX_TIMER_DELAY);
    const zone = this.zone;
    this.timer =
      zone === null
        ? setTimeout(callback, clamped)
        : zone.runOutsideAngular(() => setTimeout(() => zone.run(callback), clamped));
  }

  /**
   * Turns a `redirectUri` into a URL the router can navigate to, or `null`
   * when it cannot be one.
   *
   * Absolute URLs must be on this origin, and lose the `<base href>` — the
   * router's URLs are relative to it. Anything else must already be an
   * in-app path.
   */
  private toRouterUrl(url: string | undefined): string | null {
    if (url === undefined || !this.isBrowser) {
      return null;
    }
    if (!ABSOLUTE_URL.test(url)) {
      return sanitizeReturnUrl(url, '') || null;
    }

    const parsed = new URL(url);
    if (parsed.origin !== globalThis.location.origin) {
      return null;
    }
    const path = this.location?.normalize(parsed.pathname) ?? parsed.pathname;
    return `${path.startsWith('/') ? path : `/${path}`}${parsed.search}${parsed.hash}`;
  }

  private async navigateAfterLogout(target: string): Promise<void> {
    const url = this.toRouterUrl(target);
    if (url !== null) {
      await this.router.navigateByUrl(url);
    } else if (this.isBrowser && ABSOLUTE_URL.test(target)) {
      // Configured by the application, not taken from user input, so an
      // off-site logout target is honoured.
      globalThis.location.assign(target);
    }
  }
}

/**
 * Token lifetime in milliseconds.
 *
 * `expiresIn` and `exp - iat` are both differences between server
 * timestamps, so they hold however wrong the client clock is. Only a bare
 * `exp` has to be compared with the client clock.
 */
const lifetimeOf = (claims: Claims, expiresIn: number | undefined, now: number): number => {
  if (expiresIn !== undefined) {
    return expiresIn * 1000;
  }
  if (typeof claims.exp !== 'number') {
    return Infinity;
  }
  return typeof claims.iat === 'number'
    ? (claims.exp - claims.iat) * 1000
    : claims.exp * 1000 - now;
};

const readCookie = (cookies: string, name: string): string | null => {
  for (const cookie of cookies.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator !== -1 && cookie.slice(0, separator).trim() === name) {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }
  return null;
};

/**
 * {@link HttpAuthProvider} with profile loading, used when
 * `endpoints.profile` is configured.
 *
 * A separate class rather than a flag: capabilities are feature-detected by
 * method, so the base adapter must not have a `loadProfile()` it cannot honour.
 */
@Injectable()
export class ProfileHttpAuthProvider extends HttpAuthProvider implements SupportsProfile {
  private readonly _profile = signal<UserProfile | null>(null);

  readonly profile = this._profile.asReadonly();

  async loadProfile(): Promise<UserProfile> {
    const endpoint = this.config.endpoints.profile;
    if (endpoint === undefined) {
      throw new Error('`endpoints.profile` is not configured.');
    }

    const accessToken = await this.getToken();
    const body = await firstValueFrom(
      this.http.get<unknown>(endpoint, {
        withCredentials: this.config.withCredentials,
        headers: this.headersFor(endpoint, 'GET', accessToken),
      }),
    );

    const profile = this.config.mapProfile(body);
    this._profile.set(profile);
    return profile;
  }

  protected override onSessionChange(
    session: HttpAuthSession | null,
    reason: HttpAuthSessionChange,
  ): void {
    void session;
    // A refresh keeps the same user; a sign-in may not, and the others have none.
    if (reason !== 'refresh') {
      this._profile.set(null);
    }
  }
}
