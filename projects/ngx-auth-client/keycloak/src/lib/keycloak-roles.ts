import type { Claims } from '@ismailza/ngx-auth-client';
import type {
  KeycloakRoleSources,
  ResolvedKeycloakConfiguration,
} from './keycloak-configuration.model';

/**
 * Normalises Keycloak's two role locations into the flat `string[]` the core
 * works with.
 *
 * Keycloak splits roles across `realm_access.roles` and, per client,
 * `resource_access[client].roles`. Which of those an application means by "the
 * user's roles" is a deployment decision, so it is configurable rather than
 * assumed.
 *
 * Every claim is treated as untrusted shape: a token from a misconfigured
 * mapper should yield no roles, not a crash inside a route guard.
 */
export const extractRoles = (
  claims: Claims | null,
  config: Pick<ResolvedKeycloakConfiguration, 'roles' | 'mapRoles'>,
): readonly string[] => {
  if (claims === null) {
    return [];
  }

  if (config.mapRoles) {
    return config.mapRoles(claims);
  }

  const sources: KeycloakRoleSources = config.roles;
  const roles = new Set<string>();

  if (sources.realm !== false) {
    for (const role of readRoles(claims['realm_access'])) {
      roles.add(role);
    }
  }

  for (const role of resourceRoles(claims['resource_access'], sources.resource)) {
    roles.add(role);
  }

  return [...roles];
};

const resourceRoles = (
  claim: unknown,
  resource: KeycloakRoleSources['resource'],
): readonly string[] => {
  if (resource === false || !isRecord(claim)) {
    return [];
  }

  // `true` (or omitted) means every client; an explicit list narrows to named
  // clients, which matters when two clients define roles with the same name.
  const clients =
    resource === true || resource === undefined ? Object.keys(claim) : resource;

  return clients.flatMap((client) => readRoles(claim[client]));
};

/** Reads `{ roles: string[] }`, tolerating anything else. */
const readRoles = (access: unknown): readonly string[] => {
  if (!isRecord(access)) {
    return [];
  }

  const roles = access['roles'];
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
