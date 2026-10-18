import type { Claims, UserProfile } from '@ismailza/ngx-auth-client';

/**
 * Backend endpoints the HTTP adapter calls.
 *
 * These requests bypass every `HttpClient` interceptor (see `HttpAuthProvider`),
 * so give each URL exactly as it should be sent — a base-URL interceptor will
 * not rewrite it.
 */
export interface HttpAuthEndpoints {
  /**
   * `POST` with the credentials as a JSON body. Responds with the access token,
   * and sets the refresh-token cookie.
   */
  signIn: string;

  /**
   * `POST` with no body, authenticated by the refresh-token cookie. Responds
   * with a fresh access token. Called on page load to restore the session, and
   * shortly before the access token expires.
   */
  refresh: string;

  /**
   * `POST` that ends the server-side session and clears the refresh-token
   * cookie. Omit only if your backend has no such endpoint — without it, a
   * reload after logout restores the session.
   */
  logout?: string;

  /**
   * `GET`, authenticated with the bearer token. Responds with the user
   * profile. Configuring it enables `AuthService.loadProfile()`.
   */
  profile?: string;
}

/** What {@link HttpAuthConfiguration.mapTokenResponse} extracts from a response. */
export interface HttpAuthTokenResponse {
  /** The bearer token attached to API requests. */
  readonly accessToken: string;

  /**
   * Lifetime of the access token, in seconds. Preferred over the JWT `exp`
   * claim when present, because it does not depend on the client clock.
   */
  readonly expiresIn?: number;

  /**
   * Claims for the session. Omit to decode them from the access token, which
   * then has to be a JWT. Supply them when your backend issues opaque tokens.
   */
  readonly claims?: Claims;
}

/**
 * Where the XSRF token is read from and which header carries it. The defaults
 * match Angular's own `withXsrfConfiguration()` defaults.
 */
export interface HttpAuthXsrfConfiguration {
  /** @default 'XSRF-TOKEN' */
  cookieName?: string;

  /** @default 'X-XSRF-TOKEN' */
  headerName?: string;
}

/** Configuration for `withHttpAuth()`. */
export interface HttpAuthConfiguration {
  /** Backend endpoints. */
  endpoints: HttpAuthEndpoints;

  /**
   * Application route that hosts the login form. `login()` — and therefore
   * `authGuard` — navigates here.
   *
   * @default '/login'
   */
  loginRoute?: string;

  /**
   * Query parameter `login()` uses to pass the page the user was trying to
   * reach. Read it on the login page through `sanitizeReturnUrl()`.
   *
   * @default 'returnUrl'
   */
  returnUrlParam?: string;

  /**
   * Where `logout()` lands when no `redirectUri` is given.
   *
   * @default '/'
   */
  postLogoutRoute?: string;

  /**
   * Send cookies with the auth requests. Required for the refresh-token cookie
   * whenever the backend is on another origin.
   *
   * @default true
   */
  withCredentials?: boolean;

  /**
   * Seconds of remaining validity below which the access token is refreshed.
   *
   * @default 30
   */
  minTokenValidity?: number;

  /**
   * HTTP statuses that mean the backend **refused**: bad credentials on
   * `signIn`, no valid session on `refresh`. A refused refresh signs the user
   * out; every other failure is reported as an error and keeps the session.
   *
   * Only `401` by default, so a validation `400` or a firewall `403` is not
   * mistaken for "wrong password". Add the codes your backend uses, e.g.
   * `[400, 401]` when a missing refresh cookie answers `400`.
   *
   * @default [401]
   */
  rejectionStatuses?: readonly number[];

  /**
   * Sends the XSRF cookie back as a header on same-origin `POST`s, the way
   * Angular's XSRF interceptor would — auth requests bypass interceptors, so
   * the adapter does it itself. `false` disables it.
   *
   * @default `{ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }`
   */
  xsrf?: HttpAuthXsrfConfiguration | false;

  /**
   * Static headers added to every auth request — an API key, a tenant
   * header — since interceptors that would normally add them are bypassed.
   *
   * @default {}
   */
  headers?: Readonly<Record<string, string>>;

  /**
   * Extracts the token from a `signIn` or `refresh` response body.
   *
   * The default accepts `accessToken`, `access_token` or `token`, and
   * `expiresIn` or `expires_in`.
   */
  mapTokenResponse?: (body: unknown) => HttpAuthTokenResponse;

  /**
   * Reads roles from the claims.
   *
   * The default reads a `roles` claim, then Spring Security's `authorities`.
   * Each may be an array of strings, an array of `{ authority }` objects (a
   * serialised Spring `GrantedAuthority`), or a single space- or
   * comma-separated string.
   */
  mapRoles?: (claims: Claims) => readonly string[];

  /**
   * Maps the `profile` response body to a {@link UserProfile}.
   *
   * The default copies the `UserProfile` fields that have the expected type.
   */
  mapProfile?: (body: unknown) => UserProfile;
}

/** {@link HttpAuthConfiguration} after defaults have been applied. */
export type ResolvedHttpAuthConfiguration = Readonly<
  Required<Omit<HttpAuthConfiguration, 'endpoints' | 'xsrf'>> & {
    endpoints: Readonly<HttpAuthEndpoints>;
    xsrf: Readonly<Required<HttpAuthXsrfConfiguration>> | false;
  }
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Role names from an array of strings or `{ authority }` objects, or a delimited string. */
const roleNames = (value: unknown): readonly string[] => {
  if (typeof value === 'string') {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (typeof entry === 'string') {
      return [entry];
    }
    const authority = isRecord(entry) ? entry['authority'] : undefined;
    return typeof authority === 'string' ? [authority] : [];
  });
};

/** Default {@link HttpAuthConfiguration.mapTokenResponse}. */
export const defaultMapTokenResponse = (body: unknown): HttpAuthTokenResponse => {
  const record = isRecord(body) ? body : {};
  const accessToken = record['accessToken'] ?? record['access_token'] ?? record['token'];
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new Error(
      'The auth response has no access token. Configure `mapTokenResponse` to match your backend.',
    );
  }

  const expiresIn = record['expiresIn'] ?? record['expires_in'];
  return typeof expiresIn === 'number' ? { accessToken, expiresIn } : { accessToken };
};

/** Default {@link HttpAuthConfiguration.mapRoles}. */
export const defaultMapRoles = (claims: Claims): readonly string[] =>
  claims['roles'] !== undefined ? roleNames(claims['roles']) : roleNames(claims['authorities']);

/** Default {@link HttpAuthConfiguration.mapProfile}. */
export const defaultMapProfile = (body: unknown): UserProfile => {
  if (!isRecord(body)) {
    return {};
  }

  const text = (key: string) => (typeof body[key] === 'string' ? body[key] : undefined);

  return stripUndefined({
    id: text('id'),
    username: text('username'),
    email: text('email'),
    emailVerified: typeof body['emailVerified'] === 'boolean' ? body['emailVerified'] : undefined,
    firstName: text('firstName'),
    lastName: text('lastName'),
    attributes: isRecord(body['attributes']) ? body['attributes'] : undefined,
  });
};

/** Defaults applied by `withHttpAuth()` when the consumer omits a value. */
export const HTTP_AUTH_CONFIGURATION_DEFAULTS = {
  loginRoute: '/login',
  returnUrlParam: 'returnUrl',
  postLogoutRoute: '/',
  withCredentials: true,
  minTokenValidity: 30,
  rejectionStatuses: [401],
  xsrf: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
  headers: {},
  mapTokenResponse: defaultMapTokenResponse,
  mapRoles: defaultMapRoles,
  mapProfile: defaultMapProfile,
} as const satisfies Omit<ResolvedHttpAuthConfiguration, 'endpoints'>;

/** Merges consumer configuration over {@link HTTP_AUTH_CONFIGURATION_DEFAULTS}. */
export const resolveHttpAuthConfiguration = (
  config: HttpAuthConfiguration,
): ResolvedHttpAuthConfiguration => ({
  ...HTTP_AUTH_CONFIGURATION_DEFAULTS,
  // An explicit `undefined` must not erase a default underneath it.
  ...stripUndefined(config),
  endpoints: { ...config.endpoints },
  xsrf:
    config.xsrf === false
      ? false
      : { ...HTTP_AUTH_CONFIGURATION_DEFAULTS.xsrf, ...stripUndefined(config.xsrf ?? {}) },
});

const stripUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
