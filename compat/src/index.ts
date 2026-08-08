/**
 * Consumer fixture for the Angular compatibility matrix.
 *
 * Type-checked with `ngc` and bundled with `ng build` against every Angular
 * major covered by the published package's `peerDependencies`. It deliberately
 * declares no components: standalone semantics changed between v17 and v19, and
 * the library ships no declarables, so DI, the public types, the guard and the
 * interceptor are the entire compatibility surface.
 *
 * All three entry points are exercised — the core, `/keycloak` and `/testing`.
 */
export * from './adapter';
export * from './models';
export * from './providers';
export * from './routes';
export * from './services';
export * from './testing-usage';
