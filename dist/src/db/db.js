import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env.local' });
}
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    password: process.env.POSTGRES_PASSWORD || 'postgres123',
});
export const db = drizzle(pool, { schema });
//# sourceMappingURL=db.js.map