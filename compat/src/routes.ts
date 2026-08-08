import type { Routes } from '@angular/router';
import {
  authGuard,
  collectRoleRequirements,
  isSatisfiedBy,
  type AuthRouteData,
  type RoleRequirement,
} from '@ismailza/ngx-auth-client';

/**
 * Route configuration is public surface: `authGuard` must stay assignable to
 * `CanActivateFn` and `AuthRouteData` must keep satisfying `Route['data']` on
 * every supported major. Both are router types, which is why the router is a
 * hard peer.
 */
export const routes: Routes = [
  {
    path: 'dashboard',
    canActivate: [authGuard],
    children: [],
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { auth: { anyOf: ['admin', 'owner'] } } satisfies AuthRouteData,
    children: [
      {
        // Requirements accumulate down the tree, so a child adds to the parent
        // rather than replacing it.
        path: 'billing',
        data: { auth: { allOf: ['finance'] } } satisfies AuthRouteData,
        children: [],
      },
    ],
  },
];

/** The requirement helpers are exported, so a consumer can reuse them. */
export const previewAccess = (requirement: RoleRequirement, granted: string[]): boolean =>
  isSatisfiedBy({ anyOf: requirement.anyOf ? [requirement.anyOf] : [], allOf: requirement.allOf ?? [] }, granted);

export const requirementHelpers = [collectRoleRequirements, isSatisfiedBy] as const;
