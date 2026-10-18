import { sanitizeReturnUrl } from './return-url';

describe('sanitizeReturnUrl', () => {
  it.each(['/', '/admin', '/admin?tab=users#top', '/a/b//c'])('keeps %s', (url) => {
    expect(sanitizeReturnUrl(url)).toBe(url);
  });

  it.each([
    ['an absolute URL', 'https://evil.example'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash variant', '/\\evil.example'],
    ['a tab browsers would strip', '/\t/evil.example'],
    ['a newline', '/admin\n'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'admin'],
    ['an empty string', ''],
    ['null', null],
    ['a non-string', 42],
  ])('replaces %s with the fallback', (_, value) => {
    expect(sanitizeReturnUrl(value)).toBe('/');
    expect(sanitizeReturnUrl(value, '/home')).toBe('/home');
  });
});
