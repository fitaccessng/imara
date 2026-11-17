import { Plan, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createDatabaseConnectionConfig } from '../src/prisma/database-connection';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg(createDatabaseConnectionConfig(connectionString)),
});

async function main() {
  // User subscriptions are provisioned atomically during registration.
  // This seed is intentionally idempotent and does not create demo credentials.
  await prisma.$queryRaw`SELECT 1`;
  // Keep paid-plan feature defaults current without resetting administrator-
  // configured catalogue prices, limits, or other feature flags.
  await prisma.planCatalogue.updateMany({
    where: { plan: { in: [Plan.PRO, Plan.BUSINESS] } },
    data: { advancedTeamManagement: true },
  });
  console.log('Database connection verified; no demo users created.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
