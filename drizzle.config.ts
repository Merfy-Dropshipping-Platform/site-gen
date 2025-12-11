import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres123@localhost:5432/sites_service',
  },
} satisfies Config;
