// One-off backfill: generate usernames (plain letters of the name, no random
// suffix) for existing rows that lack one, then flag every account for
// first-login credential setup.
// Usage: cd backend && node scripts/backfillUsernames.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/database');
const { generateUsername } = require('../utils/username');

(async () => {
    try {
        const [rows] = await db.query(
            'SELECT id, nama, nis, nip FROM users WHERE username IS NULL OR username = ? ORDER BY id',
            ['']
        );
        console.log(`Found ${rows.length} users without username`);
        for (const row of rows) {
            const username = await generateUsername(row.nama, { nis: row.nis, nip: row.nip });
            await db.query('UPDATE users SET username = ? WHERE id = ?', [username, row.id]);
            console.log(`  id=${row.id} nama=${row.nama} -> ${username}`);
        }
        await db.query('UPDATE users SET must_change_credentials = TRUE');
        console.log('All users flagged for first-login setup. Done.');
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err.message);
        process.exit(1);
    }
})();
