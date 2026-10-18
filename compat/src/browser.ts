/**
 * Browser entry for the `ng build` leg of the matrix.
 *
 * The application builder tree-shakes aggressively: without a live reference the
 * library would be dropped from the bundle and the Angular linker would never
 * run over its partial declarations, making the build a vacuous check.
 */
import {
  appConfig,
  bareFakeFeature,
  fixtureAdapterConfig,
  FixtureAuthProvider,
  httpAuthConfig,
  httpTypeShapes,
  inspectFake,
  loginReturnUrl,
  mappedRolesConfig,
  optionShapes,
  previewAccess,
  publicSymbols,
  requirementHelpers,
  routes,
  SessionService,
  testEnvironmentProviders,
} from './index';

(globalThis as Record<string, unknown>)['__compatFixture'] = {
  appConfig,
  mappedRolesConfig,
  fixtureAdapterConfig,
  FixtureAuthProvider,
  httpAuthConfig,
  httpTypeShapes,
  loginReturnUrl,
  SessionService,
  routes,
  previewAccess,
  requirementHelpers,
  optionShapes,
  publicSymbols,
  testEnvironmentProviders,
  bareFakeFeature,
  inspectFake,
};
