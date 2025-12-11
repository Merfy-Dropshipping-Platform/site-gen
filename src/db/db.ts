// Подключение к PostgreSQL через Drizzle (node-postgres pool)
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env.local' });
}

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        // Respect credentials provided inside the connection string (e.g., cloud Postgres URLs).
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres123',
        database: process.env.POSTGRES_DB || 'sites_service',
      },
);

export const db = drizzle(pool, { schema });
