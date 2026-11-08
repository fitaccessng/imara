import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Plan, PlatformAdminRole, UserRole } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

export interface CreateAdminOptions {
  email?: string;
  name?: string;
}

export function normalizeAdminEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide a valid email address (maximum 320 characters).');
  }
  return email;
}

export function normalizeAdminName(input: string): string {
  const name = input.trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Name must contain 1–120 characters and no control characters.');
  }
  return name;
}

export function parseCreateAdminArgs(args: string[]): CreateAdminOptions {
  const options: CreateAdminOptions = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if ((option !== '--email' && option !== '--name') || !value || value.startsWith('--')) {
      throw new Error('Usage: npm run admin:create -w @imara/api -- [--email <email>] [--name <name>]');
    }
    if (option === '--email') {
      if (options.email) throw new Error('--email may only be specified once.');
      options.email = normalizeAdminEmail(value);
    } else {
      if (options.name) throw new Error('--name may only be specified once.');
      options.name = normalizeAdminName(value);
    }
  }
  return options;
}

export function validateAdminPassword(password: string, confirmation: string): void {
  const length = Array.from(password).length;
  if (length < 12) throw new Error('Password must be at least 12 characters.');
  if (length > 128) throw new Error('Password must be no more than 128 characters.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
}

export function assertInteractiveTerminal(
  input: Pick<NodeJS.ReadStream, 'isTTY' | 'setRawMode'> = process.stdin,
  output: Pick<NodeJS.WriteStream, 'isTTY'> = process.stdout,
): void {
  if (input.isTTY !== true || output.isTTY !== true || typeof input.setRawMode !== 'function') {
    throw new Error('admin:create must be run directly in an interactive terminal (TTY).');
  }
}

async function promptLine(prompt: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await terminal.question(prompt);
  } finally {
    terminal.close();
  }
}

function promptHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stderr;
  return new Promise((resolve, reject) => {
    const previousRawMode = input.isRaw;
    let value = '';
    let finished = false;
    output.write(prompt);
    input.setRawMode(true);

    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      input.off('data', onData);
      input.off('error', onError);
      input.setRawMode(Boolean(previousRawMode));
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onError = (error: Error) => finish(error);
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') return finish(new Error('Input cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character >= ' ') {
          value += character;
        }
      }
    };

    input.on('data', onData);
    input.once('error', onError);
    input.resume();
  });
}

async function main(): Promise<void> {
  const options = parseCreateAdminArgs(process.argv.slice(2));
  assertInteractiveTerminal();

  const email = options.email ?? normalizeAdminEmail(await promptLine('Admin email: '));
  const name = options.name ?? normalizeAdminName(await promptLine('Admin name: '));
  const password = await promptHidden('Password (input hidden): ');
  const confirmation = await promptHidden('Confirm password (input hidden): ');
  validateAdminPassword(password, confirmation);
  const passwordHash = await hashPassword(password);

  const { PrismaService } = await import('../src/prisma/prisma.service');
  const prisma = new PrismaService();
  try {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new Error(`A user already exists for ${email}; admin:create only creates a new identity.`);
    }
    const freePlan = await prisma.planCatalogue.findUnique({
      where: { plan: Plan.FREE },
      select: { storageLimitBytes: true },
    });
    if (!freePlan) throw new Error('Plan catalogue is unavailable; apply backend migrations before creating an admin.');

    try {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: UserRole.ADMIN,
          emailVerifiedAt: new Date(),
          platformAdminProfile: {
            create: {
              role: PlatformAdminRole.SUPER_ADMIN,
            },
          },
          subscription: {
            create: {
              plan: Plan.FREE,
              storageLimitBytes: freePlan.storageLimitBytes,
              storageUsedBytes: 0n,
            },
          },
        },
        select: { id: true, email: true, name: true, role: true },
      });
      console.log(`Created verified platform-admin identity ${user.email}.`);
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'P2002'
      ) {
        throw new Error(`A user already exists for ${email}; admin:create only creates a new identity.`);
      }
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Platform-admin creation failed.');
    process.exitCode = 1;
  });
}
