/**
 * Role requirement attached to a route.
 *
 * `anyOf` and `allOf` may be combined; both must then be satisfied.
 */
export interface RoleRequirement {
  /** The user must hold **at least one** of these roles. */
  anyOf?: readonly string[];

  /** The user must hold **every** one of these roles. */
  allOf?: readonly string[];
}

/**
 * Route `data` contract read by `authGuard`.
 *
 * Requirements **accumulate down the route tree** — a requirement declared on a
 * parent route applies to every child, so a protected section is configured
 * once at its root.
 *
 * @example
 * ```ts
 * export const routes: Routes = [
 *   {
 *     path: 'admin',
 *     canActivate: [authGuard],
 *     data: { auth: { anyOf: ['admin', 'owner'] } } satisfies AuthRouteData,
 *     children: [
 *       // inherits `anyOf: ['admin', 'owner']` and adds its own requirement
 *       {
 *         path: 'billing',
 *         data: { auth: { allOf: ['finance'] } } satisfies AuthRouteData,
 *         loadComponent: () => import('./billing'),
 *       },
 *     ],
 *   },
 * ];
 * ```
 */
export interface AuthRouteData {
  /** Omit to require authentication only. */
  auth?: RoleRequirement;
}
