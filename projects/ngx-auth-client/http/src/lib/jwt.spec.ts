import { decodeJwtPayload } from './jwt';

const encode = (value: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('decodeJwtPayload', () => {
  it('decodes a base64url payload, including UTF-8', () => {
    const token = `h.${encode(JSON.stringify({ sub: 'u1', name: 'Zahïr ✓' }))}.s`;
    expect(decodeJwtPayload(token)).toEqual({ sub: 'u1', name: 'Zahïr ✓' });
  });

  it('handles payloads that need padding and url-safe characters', () => {
    // `?>` encodes to `Pz4` — it exercises both padding and `-`/`_` handling
    // once wrapped in a JSON string.
    const payload = { data: '??>>~~' };
    expect(decodeJwtPayload(`h.${encode(JSON.stringify(payload))}.s`)).toEqual(payload);
  });

  it.each(['opaque-token', 'a.b', 'a..c'])('rejects %s as not a JWT', (token) => {
    expect(() => decodeJwtPayload(token)).toThrow(/not a JWT/);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => decodeJwtPayload(`h.${encode('[1,2]')}.s`)).toThrow(/not a JSON object/);
  });
});
