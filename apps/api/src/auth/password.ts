import * as argon2 from 'argon2';

const passwordOptions: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordOptions);
}

export function verifyPassword(encodedHash: string, password: string): Promise<boolean> {
  return argon2.verify(encodedHash, password);
}
