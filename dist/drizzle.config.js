export default {
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/sites_service',
    },
};
//# sourceMappingURL=drizzle.config.js.map