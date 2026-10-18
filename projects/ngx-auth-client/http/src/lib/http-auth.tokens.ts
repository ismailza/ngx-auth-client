import { InjectionToken } from '@angular/core';
import type { ResolvedHttpAuthConfiguration } from './http-auth-configuration.model';

/** HTTP adapter configuration, resolved against its defaults by `withHttpAuth()`. */
export const HTTP_AUTH_CONFIG = new InjectionToken<ResolvedHttpAuthConfiguration>(
  'HTTP_AUTH_CONFIG',
);
