import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be configured');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  // User subscriptions are provisioned atomically during registration.
  // This seed is intentionally idempotent and does not create demo credentials.
  await prisma.$queryRaw`SELECT 1`;
  console.log('Database connection verified; no demo users created.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
