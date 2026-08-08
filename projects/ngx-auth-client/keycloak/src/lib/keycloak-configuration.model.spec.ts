import { resolveKeycloakConfiguration } from './keycloak-configuration.model';

const base = { url: 'https://auth.example.com', realm: 'r', clientId: 'c' };

describe('resolveKeycloakConfiguration', () => {
  it('applies the documented defaults', () => {
    const config = resolveKeycloakConfiguration(base);

    expect(config.onLoad).toBe('check-sso');
    expect(config.checkLoginIframe).toBe(false);
    expect(config.pkceMethod).toBe('S256');
    expect(config.minTokenValidity).toBe(30);
    expect(config.roles).toEqual({ realm: true, resource: true });
  });

  it('keeps the consumer values it is given', () => {
    const config = resolveKeycloakConfiguration({
      ...base,
      onLoad: 'login-required',
      minTokenValidity: 60,
    });

    expect(config.onLoad).toBe('login-required');
    expect(config.minTokenValidity).toBe(60);
  });

  it('merges role sources rather than replacing them wholesale', () => {
    const config = resolveKeycloakConfiguration({
      ...base,
      roles: { resource: ['my-app'] },
    });

    expect(config.roles).toEqual({ realm: true, resource: ['my-app'] });
  });

  // Spreading a config built from optional fields would otherwise overwrite the
  // defaults with `undefined` — a silent way to lose PKCE.
  it('ignores explicitly undefined values', () => {
    const config = resolveKeycloakConfiguration({
      ...base,
      pkceMethod: undefined,
      onLoad: undefined,
    });

    expect(config.pkceMethod).toBe('S256');
    expect(config.onLoad).toBe('check-sso');
  });

  it('allows disabling PKCE only by naming a different method', () => {
    expect(
      resolveKeycloakConfiguration({ ...base, pkceMethod: false }).pkceMethod,
    ).toBe(false);
  });
});
