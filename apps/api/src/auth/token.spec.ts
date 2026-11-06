import { createOpaqueToken, hashToken } from './token';

describe('opaque tokens', () => {
  it('creates high-entropy URL-safe tokens and stores only deterministic digests', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(first)).toBe(hashToken(first));
    expect(hashToken(first)).not.toBe(hashToken(second));
    expect(hashToken(first)).not.toContain(first);
  });
});
