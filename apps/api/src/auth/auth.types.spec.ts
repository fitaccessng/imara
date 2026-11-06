import { FREE_STORAGE_LIMIT_BYTES } from './auth.types';

describe('Free subscription quota', () => {
  it('uses the specified 5 GiB quota in bytes', () => {
    expect(FREE_STORAGE_LIMIT_BYTES).toBe(5_368_709_120n);
  });
});
