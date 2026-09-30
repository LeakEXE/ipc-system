const db = require('../config/database');
const { syncBiodataChange } = require('../utils/biodataSync');

/**
 * One-time Biodata Snapshot Repair Script
 *
 * Pushes the current biodata from `users` into every table that stores a
 * denormalized copy (record tables, approval tables, pembina names) and
 * rewrites old name references in activity_logs.details / notifications.message
 * (biodata change-event rows keep their original old -> new wording).
 *
 * Future edits stay in sync automatically via syncBiodataChange().
 *
 * Usage: node scripts/repairBiodataSnapshots.js
 */

const RECORD_TABLES = ['prestasi', 'organisasi', 'kepanitiaan', 'event', 'pelanggaran', 'perilaku'];

async function countStaleSnapshots() {
    let total = 0;
    for (const table of RECORD_TABLES) {
        try {
            const [rows] = await db.query(
                `SELECT COUNT(*) AS c FROM ${table} x JOIN users u ON u.id = x.user_id
                 WHERE x.nama IS DISTINCT FROM u.nama OR x.nis IS DISTINCT FROM u.nis
                    OR x.kelas IS DISTINCT FROM u.kelas OR x.grha IS DISTINCT FROM u.grha`
            );
            total += Number(rows[0]?.c || 0);
        } catch (e) {
            console.log(`  - (skip ${table}: ${e.message})`);
        }
    }
    return total;
}

async function buildRenameMaps() {
    // UPDATE_BIODATA_DIRECT rows record "for student OLD (newNis) to NEW".
    // Resolve the target user by the id in parens (falls back to new name).
    const [logs] = await db.query(
        "SELECT details FROM activity_logs WHERE action = 'UPDATE_BIODATA_DIRECT'"
    );
    const maps = [];
    const seen = new Set();
    for (const { details } of logs) {
        let m = details && details.match(/for student (.+?) \((\S+)\) to (.+)$/);
        if (m) {
            const [, oldName, newNis, newName] = m;
            let [u] = await db.query("SELECT id FROM users WHERE nis = ? AND role = 'siswa'", [newNis]);
            if (u.length === 0) {
                const [byName] = await db.query("SELECT id FROM users WHERE nama = ? AND role = 'siswa'", [newName]);
                if (byName.length === 1) {
                    u = byName;
                }
            }
            if (u.length > 0) {
                const key = `siswa:${u[0].id}:${oldName}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    maps.push({ userId: u[0].id, oldName });
                }
            }
            continue;
        }
        m = details && details.match(/for teacher (.+?) \((\S+)\) to (.+)$/);
        if (m) {
            const [, oldName, newNip, newName] = m;
            let [u] = await db.query("SELECT id FROM users WHERE nip = ? AND role IN ('guru', 'pegawai')", [newNip]);
            if (u.length === 0) {
                const [byName] = await db.query("SELECT id FROM users WHERE nama = ? AND role IN ('guru', 'pegawai')", [newName]);
                if (byName.length === 1) {
                    u = byName;
                }
            }
            if (u.length > 0) {
                const key = `guru:${u[0].id}:${oldName}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    maps.push({ userId: u[0].id, oldName });
                }
            }
        }
    }
    return maps;
}

async function repair() {
    try {
        console.log('Starting biodata snapshot repair...\n');

        const staleBefore = await countStaleSnapshots();
        console.log(`Stale record rows before repair: ${staleBefore}\n`);

        const [users] = await db.query('SELECT id, nama, role FROM users');
        console.log(`Syncing snapshots for ${users.length} users...`);
        let snapshotRows = 0;
        for (const u of users) {
            const r = await syncBiodataChange(u.id, {});
            snapshotRows += r.snapshotRows;
        }
        console.log(`  - Snapshot rows touched: ${snapshotRows}\n`);

        const maps = await buildRenameMaps();
        console.log(`Found ${maps.length} recorded rename(s) to propagate (pembina + log/notification text)...`);
        let pembinaRows = 0;
        let textRows = 0;
        for (const { userId, oldName } of maps) {
            console.log(`  - user#${userId}: "${oldName}" -> current`);
            const r = await syncBiodataChange(userId, { nama: oldName });
            snapshotRows += r.snapshotRows;
            pembinaRows += r.pembinaRows;
            textRows += r.textRows;
        }
        console.log(`  - Pembina rows updated: ${pembinaRows}`);
        console.log(`  - Log/notification texts rewritten: ${textRows}\n`);

        const staleAfter = await countStaleSnapshots();
        console.log(`Stale record rows after repair: ${staleAfter}`);
        console.log(staleAfter === 0 ? '\nAll record snapshots are in sync.' : '\nWARNING: some rows are still stale (see above).');
    } catch (error) {
        console.error('Fatal error during repair:', error);
        process.exit(1);
    } finally {
        await db.end();
    }
}

repair();
