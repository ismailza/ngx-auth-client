import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  AUTH_CONFIG,
  AUTH_PROVIDER,
  authTokenInterceptor,
  InvalidCredentialsError,
  provideAuth,
  UnsupportedCapabilityError,
  type AuthConfiguration,
  type BearerTokenConfiguration,
  type Credentials,
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
import {
  HTTP_AUTH_CONFIG,
  HttpAuthProvider,
  ProfileHttpAuthProvider,
  sanitizeReturnUrl,
  withHttpAuth,
  type HttpAuthConfiguration,
  type HttpAuthSessionChange,
  type HttpAuthTokenResponse,
  type HttpAuthXsrfConfiguration,
} from '@ismailza/ngx-auth-client/http';
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

const httpAuthConfiguration: HttpAuthConfiguration = {
  endpoints: {
    signIn: '/api/auth/login',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    profile: '/api/auth/me',
  },
  loginRoute: '/login',
  returnUrlParam: 'returnUrl',
  postLogoutRoute: '/',
  withCredentials: true,
  minTokenValidity: 45,
  rejectionStatuses: [400, 401],
  xsrf: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
  headers: { 'X-Client': 'compat' },
  mapTokenResponse: (body): HttpAuthTokenResponse => {
    const { token, ttl } = body as { token: string; ttl: number };
    return { accessToken: token, expiresIn: ttl };
  },
  mapRoles: (claims) => {
    const authorities = claims['authorities'];
    return Array.isArray(authorities) ? authorities.filter((a): a is string => typeof a === 'string') : [];
  },
  mapProfile: (body) => ({ id: (body as { id?: string }).id }),
};

/** The homemade-backend setup — the `/http` entry point. */
export const httpAuthConfig: ApplicationConfig = {
  providers: [
    provideAuth(withHttpAuth(httpAuthConfiguration), authConfig),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideRouter(routes),
  ],
};

/** Public types of the `/http` entry point stay importable. */
export const httpTypeShapes = {
  xsrfOff: false satisfies HttpAuthXsrfConfiguration | false,
  reasons: ['signIn', 'refresh', 'logout', 'expired'] satisfies HttpAuthSessionChange[],
};

/** A login page reads its return URL through the sanitiser. */
export const loginReturnUrl = (query: string | null): string => sanitizeReturnUrl(query, '/home');

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
  credentials: { username: 'tester', password: 'secret', otp: '123456' } satisfies Credentials,
};

/** DI tokens and classes are public surface — removals must break the build. */
export const publicSymbols = [
  AUTH_PROVIDER,
  AUTH_CONFIG,
  KEYCLOAK_CONFIG,
  KEYCLOAK_INSTANCE,
  KeycloakAuthProvider,
  HTTP_AUTH_CONFIG,
  HttpAuthProvider,
  ProfileHttpAuthProvider,
  UnsupportedCapabilityError,
  InvalidCredentialsError,
] as const;
