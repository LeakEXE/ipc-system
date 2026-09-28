// PostgreSQL setup helper: creates the database (if missing) and imports database/skema.sql.
// Usage: npm run db:setup
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const { Client } = require('pg');

const dbName = process.env.DB_NAME || 'ipc_school';
const baseConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'postgres',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    };

async function ensureDatabase() {
    const adminDb = process.env.DATABASE_URL ? undefined : 'postgres';
    const client = new Client(adminDb ? { ...baseConfig, database: adminDb } : baseConfig);
    await client.connect();
    try {
        const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (rows.length === 0) {
            // Quote identifier safely (db names are trusted local config, still escape quotes).
            await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
            console.log(`Created database "${dbName}".`);
        } else {
            console.log(`Database "${dbName}" already exists.`);
        }
    } finally {
        await client.end();
    }
}

async function importSchema() {
    const schemaPath = path.join(__dirname, '..', 'database', 'skema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const client = new Client(
        process.env.DATABASE_URL ? baseConfig : { ...baseConfig, database: dbName }
    );
    await client.connect();
    try {
        await client.query(sql);
        console.log(`Imported schema from ${schemaPath}.`);
    } finally {
        await client.end();
    }
}

(async () => {
    try {
        if (!process.env.DATABASE_URL) {
            await ensureDatabase();
        }
        await importSchema();
        console.log('PostgreSQL setup complete.');
        console.log("Next: set a real bcrypt hash for the superadmin row, e.g.:");
        console.log("  node -e \"console.log(require('bcryptjs').hashSync('admin123', 10))\"");
    } catch (err) {
        console.error('Setup failed:', err.message);
        process.exit(1);
    }
})();
