import 'dotenv/config';
import { PlatformAdminRole, PlatformAdminStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

function getEmailArgument(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--email' || !args[1]?.trim()) {
    throw new Error('Usage: npm run admin:promote -w @imara/api -- --email <registered-user-email>');
  }
  const email = args[1].trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide a valid email address with --email.');
  }
  return email;
}

async function main() {
  const email = getEmailArgument(process.argv.slice(2));
  const prisma = new PrismaService();
  try {
    const matches = await prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, emailVerifiedAt: true, role: true },
      take: 2,
    });
    if (matches.length === 0) {
      throw new Error(`No registered user found for ${email}.`);
    }
    if (matches.length > 1) {
      throw new Error(`More than one user matches ${email} without regard to case; no account was changed.`);
    }
    const user = matches[0];
    if (!user.emailVerifiedAt) {
      throw new Error(`The email address ${email} is not verified; no account was changed.`);
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { role: UserRole.ADMIN },
      });
      await transaction.platformAdminProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          role: PlatformAdminRole.SUPER_ADMIN,
          status: PlatformAdminStatus.ACTIVE,
        },
        update: {
          role: PlatformAdminRole.SUPER_ADMIN,
          status: PlatformAdminStatus.ACTIVE,
        },
      });
    });
    console.log(`Ensured ${user.email} has the active SUPER_ADMIN profile.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Platform-admin promotion failed.');
  process.exitCode = 1;
});
