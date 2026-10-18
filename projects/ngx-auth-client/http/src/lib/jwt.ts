import type { Claims } from '@ismailza/ngx-auth-client';

/**
 * Decodes the payload of a JWT **without verifying its signature**.
 *
 * That is correct for a browser client: the token is only read to drive UI and
 * route guards. The backend verifies it on every request, which is the check
 * that actually protects data.
 *
 * @throws When `token` is not a well-formed JWT with a JSON object payload.
 */
export const decodeJwtPayload = (token: string): Claims => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === '') {
    throw new Error(
      'The access token is not a JWT. Return `claims` from `mapTokenResponse` when your backend issues opaque tokens.',
    );
  }

  const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('The access token payload is not a JSON object.');
  }
  return payload as Claims;
};

// `atob` yields one character per byte; TextDecoder turns those bytes back into
// UTF-8, so names like "Zahïr" survive the round-trip.
const decodeBase64Url = (segment: string): string => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
