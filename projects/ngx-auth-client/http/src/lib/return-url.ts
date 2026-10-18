// A single leading slash, then no control characters anywhere.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const SAFE_PATH = /^\/(?![/\\])[^\u0000-\u001f\u007f]*$/;

/**
 * Turns an untrusted return URL — typically the login page's `returnUrl`
 * query parameter — into a path that is safe to navigate to.
 *
 * Anything that could leave the application is replaced by `fallback`:
 * absolute URLs, protocol-relative `//evil.example`, and the `/\evil.example`
 * form browsers also treat as protocol-relative. Control characters are
 * rejected too, because browsers strip tabs and newlines — `/\t/evil.example`
 * would otherwise collapse into `//evil.example`. This is what stops the login
 * page from becoming an open redirect.
 *
 * @example
 * ```ts
 * const returnUrl = sanitizeReturnUrl(route.snapshot.queryParamMap.get('returnUrl'));
 * await auth.signIn(credentials);
 * await router.navigateByUrl(returnUrl);
 * ```
 */
export const sanitizeReturnUrl = (value: unknown, fallback = '/'): string =>
  typeof value === 'string' && SAFE_PATH.test(value) ? value : fallback;
