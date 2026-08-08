/** HTTP methods the bearer-token interceptor can be restricted to. */
export type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS';

/**
 * Which outgoing requests receive an `Authorization: Bearer …` header.
 *
 * This is an **allowlist**. A pattern that matches nothing fails closed — no
 * token is attached — rather than leaking a token to an unintended host.
 */
export interface BearerTokenConfiguration {
  /**
   * URL pattern a request must match to receive the header.
   *
   * @default `/^\/api(\/.*)?$/` — same-origin, relative `/api/*` requests
   */
  urlPattern?: RegExp;

  /**
   * Restricts the header to these methods. Omit to allow every method.
   */
  methods?: readonly HttpMethod[];
}

/**
 * Provider-agnostic configuration, passed as the second argument to
 * `provideAuth()`. Everything provider-specific belongs in the adapter's own
 * configuration (e.g. `withKeycloak({ … })`).
 */
export interface AuthConfiguration {
  /**
   * Where to send an authenticated user who lacks the roles a route requires.
   *
   * Set to `null` to block activation without navigating anywhere, which lets
   * the application handle the refusal itself.
   *
   * @default '/forbidden'
   */
  forbiddenRoute?: string | null;

  /**
   * Bearer-token interceptor allowlist, or `false` to attach the token to
   * nothing (useful when a different layer owns outgoing authorisation).
   */
  bearer?: BearerTokenConfiguration | false;
}

/** {@link AuthConfiguration} after defaults have been applied. */
export interface ResolvedAuthConfiguration {
  readonly forbiddenRoute: string | null;
  readonly bearer: Required<BearerTokenConfiguration> | null;
}

/** Bearer allowlist applied when the consumer omits `bearer`. */
export const BEARER_CONFIGURATION_DEFAULTS: Required<BearerTokenConfiguration> =
  {
    urlPattern: /^\/api(\/.*)?$/,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  };

/** Defaults applied by `provideAuth()` when the consumer omits a value. */
export const AUTH_CONFIGURATION_DEFAULTS: ResolvedAuthConfiguration = {
  forbiddenRoute: '/forbidden',
  bearer: BEARER_CONFIGURATION_DEFAULTS,
};

/** Merges consumer configuration over {@link AUTH_CONFIGURATION_DEFAULTS}. */
export const resolveAuthConfiguration = (
  config: AuthConfiguration | undefined,
): ResolvedAuthConfiguration => {
  // An explicit `null` is meaningful — it disables the redirect rather than
  // falling back to the default route, so `??` would be wrong here.
  const forbiddenRoute =
    config?.forbiddenRoute === undefined
      ? AUTH_CONFIGURATION_DEFAULTS.forbiddenRoute
      : config.forbiddenRoute;

  if (config?.bearer === false) {
    return { forbiddenRoute, bearer: null };
  }

  return {
    forbiddenRoute,
    bearer: {
      urlPattern: withoutStatefulFlags(
        config?.bearer?.urlPattern ?? BEARER_CONFIGURATION_DEFAULTS.urlPattern,
      ),
      methods:
        config?.bearer?.methods ?? BEARER_CONFIGURATION_DEFAULTS.methods,
    },
  };
};

/**
 * Drops the `g` and `y` flags.
 *
 * Both make `RegExp.test()` stateful through `lastIndex`, so the same pattern
 * would match every other request — a token silently missing from half your
 * calls is a miserable bug to track down.
 */
const withoutStatefulFlags = (pattern: RegExp): RegExp =>
  /[gy]/.test(pattern.flags)
    ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
    : pattern;
