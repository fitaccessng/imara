import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('uses Argon2id and rejects mismatched credentials', async () => {
    const encoded = await hashPassword('a long test passphrase');
    expect(encoded).toContain('$argon2id$');
    await expect(verifyPassword(encoded, 'a long test passphrase')).resolves.toBe(true);
    await expect(verifyPassword(encoded, 'incorrect passphrase')).resolves.toBe(false);
    expect(encoded).not.toContain('a long test passphrase');
  });
});
