// Generic migration runner: executes a SQL file against the configured DB.
// Usage: node scripts/runMigration.js database/migrate_some_change.sql
// Same connection resolution as setupDb.js (DATABASE_URL or DB_* env vars).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const file = process.argv[2];
if (!file) {
    console.error('Usage: node scripts/runMigration.js <path/to/migration.sql>');
    process.exit(1);
}

const sqlPath = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
if (!fs.existsSync(sqlPath)) {
    console.error(`Migration file not found: ${sqlPath}`);
    process.exit(1);
}

const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'postgres',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
        database: process.env.DB_NAME || 'ipt_school',
    };

async function main() {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const client = new Client(config);
    await client.connect();
    try {
        await client.query(sql);
        console.log(`Applied migration: ${sqlPath}`);
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
