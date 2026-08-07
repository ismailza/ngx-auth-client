import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthRouteData } from '../models/auth-route-data.model';

/**
 * Role requirements gathered from every route between the root and the one
 * being activated.
 *
 * Each `anyOf` group is kept separate rather than flattened: two ancestors each
 * demanding "one of these" are two independent conditions, and merging them
 * into a single list would let one satisfy both.
 */
export interface AccumulatedRoleRequirements {
  /** Every group must be satisfied by at least one held role. */
  readonly anyOf: readonly (readonly string[])[];

  /** Every role in this set must be held. */
  readonly allOf: readonly string[];
}

/**
 * Walks the route tree from the root to `route`, collecting `data.auth`.
 *
 * Reading only the leaf's `data` — as the guard this library replaces did —
 * silently drops a requirement declared on a protected section's parent route,
 * which is exactly where people expect to declare it once.
 */
export const collectRoleRequirements = (
  route: ActivatedRouteSnapshot,
): AccumulatedRoleRequirements => {
  const anyOf: (readonly string[])[] = [];
  const allOf = new Set<string>();

  for (const ancestor of route.pathFromRoot) {
    const requirement = (ancestor.data as AuthRouteData | undefined)?.auth;

    if (requirement?.anyOf?.length) {
      anyOf.push(requirement.anyOf);
    }

    for (const role of requirement?.allOf ?? []) {
      allOf.add(role);
    }
  }

  return { anyOf, allOf: [...allOf] };
};

/** Whether `granted` satisfies every accumulated requirement. */
export const isSatisfiedBy = (
  requirements: AccumulatedRoleRequirements,
  granted: readonly string[],
): boolean => {
  const held = new Set(granted);

  return (
    requirements.allOf.every((role) => held.has(role)) &&
    requirements.anyOf.every((group) => group.some((role) => held.has(role)))
  );
};
