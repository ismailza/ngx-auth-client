import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { withFakeAuth } from '@ismailza/ngx-auth-client/testing';
import { AuthConfiguration } from '../models/auth-configuration.model';
import { provideAuth } from '../provide-auth';
import { authTokenInterceptor } from './auth-token.interceptor';

interface SetupOptions {
  authenticated?: boolean;
  token?: string;
  config?: AuthConfiguration;
}

const setup = ({
  authenticated = true,
  token = 'fake-token',
  config,
}: SetupOptions = {}) => {
  TestBed.configureTestingModule({
    providers: [
      provideAuth(withFakeAuth({ authenticated, token }), config),
      provideHttpClient(withInterceptors([authTokenInterceptor])),
      provideHttpClientTesting(),
    ],
  });

  return {
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
  };
};

/** The interceptor awaits readiness, so requests leave on a later microtask. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('authTokenInterceptor', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('attaches the bearer token to an allowlisted request', async () => {
    const { http, httpMock } = setup({ token: 'access-token' });

    http.get('/api/patients').subscribe();
    await flush();

    const request = httpMock.expectOne('/api/patients');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
    request.flush({});
  });

  // The allowlist is the security boundary: anything unmatched must leave bare.
  it('leaves a non-matching URL untouched', async () => {
    const { http, httpMock } = setup();

    http.get('https://analytics.example.com/collect').subscribe();
    await flush();

    const request = httpMock.expectOne('https://analytics.example.com/collect');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('leaves the request bare when the user is not authenticated', async () => {
    const { http, httpMock } = setup({ authenticated: false });

    http.get('/api/public').subscribe();
    await flush();

    const request = httpMock.expectOne('/api/public');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('honours a custom URL pattern', async () => {
    const { http, httpMock } = setup({
      config: {
        bearer: { urlPattern: /^https:\/\/api\.example\.com(\/.*)?$/i },
      },
    });

    http.get('https://api.example.com/me').subscribe();
    http.get('/api/patients').subscribe();
    await flush();

    expect(
      httpMock
        .expectOne('https://api.example.com/me')
        .request.headers.has('Authorization'),
    ).toBe(true);
    expect(
      httpMock.expectOne('/api/patients').request.headers.has('Authorization'),
    ).toBe(false);

    httpMock.match(() => true).forEach((request) => request.flush({}));
  });

  it('restricts the header to the configured methods', async () => {
    const { http, httpMock } = setup({
      config: { bearer: { methods: ['GET'] } },
    });

    http.get('/api/patients').subscribe();
    http.post('/api/patients', {}).subscribe();
    await flush();

    expect(
      httpMock
        .expectOne((request) => request.method === 'GET')
        .request.headers.has('Authorization'),
    ).toBe(true);
    expect(
      httpMock
        .expectOne((request) => request.method === 'POST')
        .request.headers.has('Authorization'),
    ).toBe(false);

    httpMock.match(() => true).forEach((request) => request.flush({}));
  });

  it('attaches nothing when the bearer feature is disabled', async () => {
    const { http, httpMock } = setup({ config: { bearer: false } });

    http.get('/api/patients').subscribe();
    await flush();

    expect(
      httpMock.expectOne('/api/patients').request.headers.has('Authorization'),
    ).toBe(false);

    httpMock.match(() => true).forEach((request) => request.flush({}));
  });

  // A `/g` pattern is stateful through `lastIndex`, which would attach the
  // token to every other request — a bug that looks like flaky infrastructure.
  it('is not confused by a global regex flag', async () => {
    const { http, httpMock } = setup({
      config: { bearer: { urlPattern: /^\/api(\/.*)?$/g } },
    });

    http.get('/api/one').subscribe();
    await flush();
    httpMock.expectOne('/api/one').flush({});

    http.get('/api/two').subscribe();
    await flush();
    const second = httpMock.expectOne('/api/two');

    expect(second.request.headers.has('Authorization')).toBe(true);
    second.flush({});
  });
});
