import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './dto';

function registration(password: string): RegisterDto {
  return Object.assign(new RegisterDto(), {
    email: 'person@example.com',
    name: 'Person Example',
    password,
  });
}

describe('registration password validation', () => {
  it.each([
    ['Abc1!x', true],
    ['Abc1!xy', true],
    ['abc1!x', false],
    ['ABC1!X', false],
    ['Abcdef!', false],
    ['Abc1xy', false],
    ['Ab1!', false],
  ])('validates %s as %s', async (password, valid) => {
    const errors = await validate(registration(password));
    const passwordErrors = errors.filter((error) => error.property === 'password');
    expect(passwordErrors.length === 0).toBe(valid);
  });

  it('continues to accept shorter existing passwords at login', async () => {
    const login = Object.assign(new LoginDto(), {
      email: 'person@example.com',
      password: 'short',
    });

    await expect(validate(login)).resolves.toHaveLength(0);
  });
});
