import type { Claims } from '@ismailza/ngx-auth-client';
import {
  KEYCLOAK_CONFIGURATION_DEFAULTS,
  type ResolvedKeycloakConfiguration,
} from './keycloak-configuration.model';
import { extractRoles } from './keycloak-roles';

const claims = (overrides: Partial<Claims> = {}): Claims => ({
  sub: 'user-1',
  realm_access: { roles: ['realm-admin', 'offline_access'] },
  resource_access: {
    'my-app': { roles: ['editor'] },
    'other-app': { roles: ['viewer', 'editor'] },
  },
  ...overrides,
});

const config = (
  overrides: Partial<ResolvedKeycloakConfiguration> = {},
): Pick<ResolvedKeycloakConfiguration, 'roles' | 'mapRoles'> => ({
  roles: KEYCLOAK_CONFIGURATION_DEFAULTS.roles,
  ...overrides,
});

describe('extractRoles', () => {
  it('returns nothing when there are no claims', () => {
    expect(extractRoles(null, config())).toEqual([]);
  });

  it('merges realm and resource roles by default', () => {
    expect(extractRoles(claims(), config())).toEqual([
      'realm-admin',
      'offline_access',
      'editor',
      'viewer',
    ]);
  });

  it('de-duplicates a role granted by several clients', () => {
    const roles = extractRoles(claims(), config());

    expect(roles.filter((role) => role === 'editor')).toHaveLength(1);
  });

  it('omits realm roles when realm is false', () => {
    const roles = extractRoles(
      claims(),
      config({ roles: { realm: false, resource: true } }),
    );

    expect(roles).toEqual(['editor', 'viewer']);
  });

  it('omits resource roles when resource is false', () => {
    const roles = extractRoles(
      claims(),
      config({ roles: { realm: true, resource: false } }),
    );

    expect(roles).toEqual(['realm-admin', 'offline_access']);
  });

  // Two clients defining a role with the same name is common; naming the client
  // is how an app avoids inheriting another client's authority.
  it('restricts resource roles to the named clients', () => {
    const roles = extractRoles(
      claims(),
      config({ roles: { realm: false, resource: ['my-app'] } }),
    );

    expect(roles).toEqual(['editor']);
  });

  it('ignores a named client that is absent from the token', () => {
    const roles = extractRoles(
      claims(),
      config({ roles: { realm: false, resource: ['missing-app'] } }),
    );

    expect(roles).toEqual([]);
  });

  it('uses mapRoles in preference to the configured sources', () => {
    const roles = extractRoles(
      claims({ groups: ['/tenants/acme/admins'] }),
      config({
        roles: { realm: true, resource: true },
        mapRoles: (c) => (c['groups'] as string[] | undefined) ?? [],
      }),
    );

    expect(roles).toEqual(['/tenants/acme/admins']);
  });

  it('tolerates malformed role claims', () => {
    const roles = extractRoles(
      { realm_access: 'not-an-object', resource_access: 42 },
      config(),
    );

    expect(roles).toEqual([]);
  });

  it('tolerates a token with no role claims at all', () => {
    expect(extractRoles({ sub: 'user-1' }, config())).toEqual([]);
  });
});
