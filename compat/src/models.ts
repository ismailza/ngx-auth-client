import type { Claims, UserProfile } from '@ismailza/ngx-auth-client';

/** Domain type standing in for a consumer's own models. */
export interface Tenant {
  id: string;
  name: string;
}

/**
 * Consumers narrow `Claims` with their own provider-specific fields. The index
 * signature has to keep permitting that on every supported major.
 */
export interface TenantClaims extends Claims {
  tenant_id?: string;
}

/** The profile type must stay usable in a consumer's own aliases. */
export type ProfileOrNull = UserProfile | null;
