import {
  defaultMapProfile,
  defaultMapRoles,
  defaultMapTokenResponse,
  HTTP_AUTH_CONFIGURATION_DEFAULTS,
  resolveHttpAuthConfiguration,
} from './http-auth-configuration.model';

const endpoints = { signIn: '/login', refresh: '/refresh' };

describe('resolveHttpAuthConfiguration', () => {
  it('applies defaults', () => {
    expect(resolveHttpAuthConfiguration({ endpoints })).toEqual({
      ...HTTP_AUTH_CONFIGURATION_DEFAULTS,
      endpoints,
    });
  });

  it('merges a partial XSRF configuration over the defaults, or disables it', () => {
    expect(
      resolveHttpAuthConfiguration({ endpoints, xsrf: { headerName: 'X-CSRF' } }).xsrf,
    ).toEqual({ cookieName: 'XSRF-TOKEN', headerName: 'X-CSRF' });
    expect(resolveHttpAuthConfiguration({ endpoints, xsrf: false }).xsrf).toBe(false);
  });

  it('treats only 401 as a refusal by default', () => {
    expect(resolveHttpAuthConfiguration({ endpoints }).rejectionStatuses).toEqual([401]);
  });

  it('does not let an explicit undefined erase a default', () => {
    const resolved = resolveHttpAuthConfiguration({ endpoints, withCredentials: undefined });
    expect(resolved.withCredentials).toBe(true);
  });
});

describe('defaultMapTokenResponse', () => {
  it.each([
    [
      { accessToken: 't', expiresIn: 60 },
      { accessToken: 't', expiresIn: 60 },
    ],
    [
      { access_token: 't', expires_in: 60 },
      { accessToken: 't', expiresIn: 60 },
    ],
    [{ token: 't' }, { accessToken: 't' }],
  ])('reads %o', (body, expected) => {
    expect(defaultMapTokenResponse(body)).toEqual(expected);
  });

  it.each([null, 'token', {}, { accessToken: '' }, { accessToken: 1 }])('throws on %o', (body) => {
    expect(() => defaultMapTokenResponse(body)).toThrow(/mapTokenResponse/);
  });
});

describe('defaultMapRoles', () => {
  it('prefers roles over authorities and keeps only strings', () => {
    expect(defaultMapRoles({ roles: ['a', 1], authorities: ['b'] })).toEqual(['a']);
    expect(defaultMapRoles({ authorities: ['ROLE_B'] })).toEqual(['ROLE_B']);
    expect(defaultMapRoles({})).toEqual([]);
  });

  it('reads serialised GrantedAuthority objects', () => {
    expect(
      defaultMapRoles({ authorities: [{ authority: 'ROLE_ADMIN' }, { name: 'x' }, 'ROLE_USER'] }),
    ).toEqual(['ROLE_ADMIN', 'ROLE_USER']);
  });

  it('splits a single delimited string', () => {
    expect(defaultMapRoles({ roles: 'admin' })).toEqual(['admin']);
    expect(defaultMapRoles({ roles: 'admin, editor viewer' })).toEqual([
      'admin',
      'editor',
      'viewer',
    ]);
  });
});

describe('defaultMapProfile', () => {
  it('copies only well-typed profile fields', () => {
    expect(
      defaultMapProfile({
        id: 'u1',
        email: 3,
        emailVerified: true,
        attributes: { a: 1 },
        other: 'x',
      }),
    ).toEqual({ id: 'u1', emailVerified: true, attributes: { a: 1 } });
  });

  it('returns an empty profile for a non-object', () => {
    expect(defaultMapProfile('nope')).toEqual({});
  });
});
