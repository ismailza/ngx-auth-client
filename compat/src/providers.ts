import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  AUTH_CONFIG,
  AUTH_PROVIDER,
  authTokenInterceptor,
  provideAuth,
  UnsupportedCapabilityError,
  type AuthConfiguration,
  type BearerTokenConfiguration,
  type HttpMethod,
  type LoginOptions,
  type LogoutOptions,
  type RegisterOptions,
  type UpdatePasswordOptions,
} from '@ismailza/ngx-auth-client';
import {
  KEYCLOAK_CONFIG,
  KEYCLOAK_INSTANCE,
  KeycloakAuthProvider,
  withKeycloak,
  type KeycloakConfiguration,
  type KeycloakRoleSources,
} from '@ismailza/ngx-auth-client/keycloak';
import { withFixtureAuth } from './adapter';
import { routes } from './routes';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const bearer: BearerTokenConfiguration = {
  urlPattern: /^https:\/\/api\.example\.com(\/.*)?$/i,
  methods,
};

const authConfig: AuthConfiguration = {
  forbiddenRoute: '/no-access',
  bearer,
};

const roles: KeycloakRoleSources = { realm: true, resource: ['compat-app'] };

const keycloakConfig: KeycloakConfiguration = {
  url: 'https://auth.example.com',
  realm: 'compat',
  clientId: 'compat-app',
  redirectUri: 'https://app.example.com/home',
  postLogoutRedirectUri: 'https://app.example.com/bye',
  onLoad: 'check-sso',
  checkLoginIframe: false,
  silentCheckSsoRedirectUri: 'https://app.example.com/silent-check-sso.html',
  pkceMethod: 'S256',
  enableLogging: false,
  minTokenValidity: 45,
  roles,
};

/** The documented setup, exactly as the README shows it. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideAuth(withKeycloak(keycloakConfig), authConfig),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideRouter(routes),
  ],
};

/** `mapRoles` is the escape hatch for roles in a non-standard claim. */
export const mappedRolesConfig: ApplicationConfig = {
  providers: [
    provideAuth(
      withKeycloak({
        ...keycloakConfig,
        roles: undefined,
        mapRoles: (claims) => {
          const groups = claims['groups'];
          return Array.isArray(groups) ? groups.filter((g): g is string => typeof g === 'string') : [];
        },
      }),
    ),
  ],
};

/** A third-party adapter has to compose the same way the shipped ones do. */
export const fixtureAdapterConfig: ApplicationConfig = {
  providers: [provideAuth(withFixtureAuth(), { forbiddenRoute: null, bearer: false })],
};

/** Option shapes are public surface — keep one of each referenced. */
export const optionShapes = {
  login: { redirectUri: '/', scope: 'openid', locale: 'en', prompt: 'none', loginHint: 'a@b.c' } satisfies LoginOptions,
  logout: { redirectUri: '/bye' } satisfies LogoutOptions,
  register: { redirectUri: '/welcome' } satisfies RegisterOptions,
  updatePassword: { redirectUri: '/settings', locale: 'en' } satisfies UpdatePasswordOptions,
};

/** DI tokens and classes are public surface — removals must break the build. */
export const publicSymbols = [
  AUTH_PROVIDER,
  AUTH_CONFIG,
  KEYCLOAK_CONFIG,
  KEYCLOAK_INSTANCE,
  KeycloakAuthProvider,
  UnsupportedCapabilityError,
] as const;
