import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthRouteData } from '../models/auth-route-data.model';
import { collectRoleRequirements, isSatisfiedBy } from './route-requirements';

/**
 * Builds a snapshot chain root → … → leaf, wiring `pathFromRoot` the way the
 * router does. Only `data` and `pathFromRoot` matter to the code under test.
 */
const snapshotChain = (
  ...data: (AuthRouteData | Record<string, never>)[]
): ActivatedRouteSnapshot => {
  const chain = data.map(
    (routeData) => ({ data: routeData }) as unknown as ActivatedRouteSnapshot,
  );

  chain.forEach((snapshot, index) => {
    Object.defineProperty(snapshot, 'pathFromRoot', {
      value: chain.slice(0, index + 1),
    });
  });

  return chain[chain.length - 1];
};

describe('collectRoleRequirements', () => {
  it('returns no requirements for routes without auth data', () => {
    const requirements = collectRoleRequirements(snapshotChain({}, {}));

    expect(requirements.anyOf).toEqual([]);
    expect(requirements.allOf).toEqual([]);
  });

  it('reads a requirement declared on the leaf route', () => {
    const requirements = collectRoleRequirements(
      snapshotChain({}, { auth: { anyOf: ['admin'] } }),
    );

    expect(requirements.anyOf).toEqual([['admin']]);
  });

  // The guard this library replaces read `route.data['roles']` from the leaf
  // only, silently dropping a requirement declared on the section's parent.
  it('inherits a requirement declared on a parent route', () => {
    const requirements = collectRoleRequirements(
      snapshotChain({}, { auth: { anyOf: ['admin'] } }, {}),
    );

    expect(requirements.anyOf).toEqual([['admin']]);
  });

  it('accumulates requirements from every level of the tree', () => {
    const requirements = collectRoleRequirements(
      snapshotChain(
        {},
        { auth: { anyOf: ['admin', 'owner'] } },
        { auth: { allOf: ['finance'] } },
      ),
    );

    expect(requirements.anyOf).toEqual([['admin', 'owner']]);
    expect(requirements.allOf).toEqual(['finance']);
  });

  it('keeps sibling anyOf groups separate rather than merging them', () => {
    const requirements = collectRoleRequirements(
      snapshotChain(
        { auth: { anyOf: ['staff', 'contractor'] } },
        { auth: { anyOf: ['admin', 'owner'] } },
      ),
    );

    expect(requirements.anyOf).toEqual([
      ['staff', 'contractor'],
      ['admin', 'owner'],
    ]);
  });

  it('de-duplicates allOf roles repeated down the tree', () => {
    const requirements = collectRoleRequirements(
      snapshotChain(
        { auth: { allOf: ['admin'] } },
        { auth: { allOf: ['admin', 'finance'] } },
      ),
    );

    expect(requirements.allOf).toEqual(['admin', 'finance']);
  });

  it('ignores empty requirement arrays', () => {
    const requirements = collectRoleRequirements(
      snapshotChain({ auth: { anyOf: [], allOf: [] } }),
    );

    expect(requirements.anyOf).toEqual([]);
    expect(requirements.allOf).toEqual([]);
  });
});

describe('isSatisfiedBy', () => {
  it('passes when there are no requirements', () => {
    expect(isSatisfiedBy({ anyOf: [], allOf: [] }, [])).toBe(true);
  });

  it('passes anyOf when one listed role is held', () => {
    expect(isSatisfiedBy({ anyOf: [['admin', 'owner']], allOf: [] }, ['owner'])).toBe(
      true,
    );
  });

  it('fails anyOf when no listed role is held', () => {
    expect(
      isSatisfiedBy({ anyOf: [['admin', 'owner']], allOf: [] }, ['viewer']),
    ).toBe(false);
  });

  it('fails allOf when only some roles are held', () => {
    expect(isSatisfiedBy({ anyOf: [], allOf: ['admin', 'finance'] }, ['admin'])).toBe(
      false,
    );
  });

  it('passes allOf when every role is held', () => {
    expect(
      isSatisfiedBy({ anyOf: [], allOf: ['admin', 'finance'] }, [
        'admin',
        'finance',
        'viewer',
      ]),
    ).toBe(true);
  });

  // Each group is an independent condition; one role covering both would be
  // an authorisation hole, not a convenience.
  it('requires every anyOf group to be satisfied independently', () => {
    const requirements = {
      anyOf: [
        ['staff', 'contractor'],
        ['admin', 'owner'],
      ],
      allOf: [],
    };

    expect(isSatisfiedBy(requirements, ['staff'])).toBe(false);
    expect(isSatisfiedBy(requirements, ['staff', 'admin'])).toBe(true);
  });

  it('requires anyOf and allOf together when both are declared', () => {
    const requirements = { anyOf: [['admin', 'owner']], allOf: ['finance'] };

    expect(isSatisfiedBy(requirements, ['admin'])).toBe(false);
    expect(isSatisfiedBy(requirements, ['finance'])).toBe(false);
    expect(isSatisfiedBy(requirements, ['admin', 'finance'])).toBe(true);
  });
});
