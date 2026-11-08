import {
  assertInteractiveTerminal,
  normalizeAdminEmail,
  normalizeAdminName,
  parseCreateAdminArgs,
  validateAdminPassword,
} from './create-platform-admin';

describe('admin:create input validation', () => {
  it('accepts and normalizes optional email and name arguments', () => {
    expect(parseCreateAdminArgs(['--email', ' Admin@Example.com ', '--name', ' Admin User '])).toEqual({
      email: 'admin@example.com',
      name: 'Admin User',
    });
  });

  it('rejects unknown, duplicate, or password arguments instead of accepting secrets on the command line', () => {
    expect(() => parseCreateAdminArgs(['--password', 'secret-value'])).toThrow('Usage:');
    expect(() => parseCreateAdminArgs(['--email', 'a@example.com', '--email', 'b@example.com'])).toThrow(
      '--email may only be specified once.',
    );
    expect(() => parseCreateAdminArgs(['--name', 'Admin', '--name', 'Other'])).toThrow(
      '--name may only be specified once.',
    );
  });

  it('validates email and name for the database fields', () => {
    expect(() => normalizeAdminEmail('not-an-email')).toThrow('valid email');
    expect(() => normalizeAdminName('   ')).toThrow('Name must');
    expect(() => normalizeAdminName('x'.repeat(121))).toThrow('Name must');
  });

  it('requires a 12-character confirmed password', () => {
    expect(() => validateAdminPassword('short', 'short')).toThrow('at least 12');
    expect(() => validateAdminPassword('long-enough-password', 'different-password')).toThrow('do not match');
    expect(() => validateAdminPassword('x'.repeat(129), 'x'.repeat(129))).toThrow('no more than 128');
    expect(() => validateAdminPassword('long-enough-password', 'long-enough-password')).not.toThrow();
  });

  it('refuses non-interactive use', () => {
    expect(() => assertInteractiveTerminal(
      { isTTY: false, setRawMode: jest.fn() } as never,
      { isTTY: true } as never,
    )).toThrow('interactive terminal');
    expect(() => assertInteractiveTerminal(
      { isTTY: true, setRawMode: jest.fn() } as never,
      { isTTY: false } as never,
    )).toThrow('interactive terminal');
  });
});
