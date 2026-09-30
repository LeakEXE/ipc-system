const db = require('../config/database');

let snapshotTablesCache = null;
let pembinaTablesCache = null;

async function getSnapshotTables() {
    if (snapshotTablesCache) {
        return snapshotTablesCache;
    }
    const [rows] = await db.query(`
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY table_name
        HAVING COUNT(*) FILTER (WHERE column_name IN ('user_id', 'nama', 'nis', 'kelas', 'grha')) = 5
    `);
    snapshotTablesCache = rows.map((r) => r.table_name);
    return snapshotTablesCache;
}

async function getPembinaTables() {
    if (pembinaTablesCache) {
        return pembinaTablesCache;
    }
    const [rows] = await db.query(`
        SELECT table_name,
               BOOL_OR(column_name = 'pembina_id') AS has_pembina_id
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND column_name IN ('pembina', 'pembina_id')
        GROUP BY table_name
        HAVING BOOL_OR(column_name = 'pembina')
    `);
    pembinaTablesCache = rows.map((r) => ({
        table: r.table_name,
        hasId: r.has_pembina_id === true,
    }));
    return pembinaTablesCache;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function likeEscape(s) {
    return s.replace(/([%_\\])/g, '\\$1');
}

function applyPairs(text, namePairs, idPairs) {
    if (!text) {
        return text;
    }
    // Single-pass replacement: collect every old -> new variant, longest first,
    // so rewritten text is never rescanned (e.g. renaming "Siswa 1" to
    // "Siswa 1 Test" must not produce "Siswa 1 Test Test").
    const replacements = new Map();
    const addVariant = (oldText, newText) => {
        if (!oldText || !newText || oldText === newText || replacements.has(oldText)) {
            return;
        }
        replacements.set(oldText, newText);
    };
    for (const n of namePairs) {
        for (const i of idPairs) {
            addVariant(`${n.old} (${i.old})`, `${n.new} (${i.new})`);
        }
    }
    for (const i of idPairs) {
        addVariant(i.old, i.new);
    }
    for (const n of namePairs) {
        addVariant(n.old, n.new);
    }
    if (replacements.size === 0) {
        return text;
    }
    const alternatives = [...replacements.keys()]
        .map(escapeRegExp)
        .sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`(?<![A-Za-z0-9])(?:${alternatives.join('|')})(?![A-Za-z0-9])`, 'g');
    return text.replace(pattern, (match) => replacements.get(match));
}

async function rewriteUserTextReferences(user, oldValues) {
    const namePairs = [];
    const idPairs = [];

    if (oldValues.nama && user.nama && oldValues.nama !== user.nama) {
        namePairs.push({ old: oldValues.nama, new: user.nama });
    }
    if (oldValues.nis && user.nis && oldValues.nis !== user.nis) {
        idPairs.push({ old: oldValues.nis, new: user.nis });
    }
    if (oldValues.nip && user.nip && oldValues.nip !== user.nip) {
        idPairs.push({ old: oldValues.nip, new: user.nip });
    }

    if (namePairs.length === 0 && idPairs.length === 0) {
        return 0;
    }

    const scanKeys = [
        ...namePairs.map((p) => p.old),
        ...idPairs.map((p) => p.old),
    ].filter(Boolean);
    const uniqueKeys = [...new Set(scanKeys)];

    let rewritten = 0;
    const seenLogs = new Set();
    const seenNotifs = new Set();

    for (const key of uniqueKeys) {
        const pattern = `%${likeEscape(key)}%`;
        // Biodata change-event rows intentionally record old -> new, keep their wording.
        const [logs] = await db.query(
            "SELECT id, details FROM activity_logs WHERE action NOT ILIKE '%biodata%' AND details LIKE ?",
            [pattern]
        );
        for (const row of logs) {
            if (seenLogs.has(row.id)) {
                continue;
            }
            seenLogs.add(row.id);
            const next = applyPairs(row.details, namePairs, idPairs);
            if (next !== row.details) {
                await db.query('UPDATE activity_logs SET details = ? WHERE id = ?', [next, row.id]);
                rewritten += 1;
            }
        }

        const [notifs] = await db.query(
            'SELECT id, message FROM notifications WHERE message LIKE ?',
            [pattern]
        );
        for (const row of notifs) {
            if (seenNotifs.has(row.id)) {
                continue;
            }
            seenNotifs.add(row.id);
            const next = applyPairs(row.message, namePairs, idPairs);
            if (next !== row.message) {
                await db.query('UPDATE notifications SET message = ? WHERE id = ?', [next, row.id]);
                rewritten += 1;
            }
        }
    }

    return rewritten;
}

// Propagate a user's current biodata (nama/nis/kelas/grha, guru pembina name)
// into every table that stores a denormalized copy. oldValues holds the
// pre-update identity ({ nama, nis, nip }) used for pembina + free-text sync.
async function syncBiodataChange(userId, oldValues = {}) {
    const [rows] = await db.query(
        'SELECT id, nama, nis, nip, kelas, grha, role FROM users WHERE id = ?',
        [userId]
    );
    if (rows.length === 0) {
        return { snapshotRows: 0, pembinaRows: 0, textRows: 0 };
    }
    const user = rows[0];
    let snapshotRows = 0;
    let pembinaRows = 0;

    if (user.role === 'siswa') {
        const tables = await getSnapshotTables();
        for (const table of tables) {
            const [result] = await db.query(
                `UPDATE ${table} SET nama = ?, nis = ?, kelas = ?, grha = ? WHERE user_id = ?`,
                [user.nama, user.nis, user.kelas, user.grha, userId]
            );
            snapshotRows += result.affectedRows || 0;
        }
    }

    // Guru/pegawai renames must also update the pembina name stored as free text.
    // Scoped by role so a student sharing a name with a teacher is never touched.
    if ((user.role === 'guru' || user.role === 'pegawai') && oldValues.nama && oldValues.nama !== user.nama) {
        const pembinaTables = await getPembinaTables();
        for (const { table, hasId } of pembinaTables) {
            if (hasId) {
                const [byId] = await db.query(
                    `UPDATE ${table} SET pembina = ? WHERE pembina_id = ?`,
                    [user.nama, userId]
                );
                pembinaRows += byId.affectedRows || 0;
                const [legacy] = await db.query(
                    `UPDATE ${table} SET pembina = ? WHERE pembina = ? AND pembina_id IS NULL`,
                    [user.nama, oldValues.nama]
                );
                pembinaRows += legacy.affectedRows || 0;
            } else {
                const [byName] = await db.query(
                    `UPDATE ${table} SET pembina = ? WHERE pembina = ?`,
                    [user.nama, oldValues.nama]
                );
                pembinaRows += byName.affectedRows || 0;
            }
        }
    }

    const textRows = await rewriteUserTextReferences(user, oldValues);

    return { snapshotRows, pembinaRows, textRows };
}

module.exports = { syncBiodataChange, rewriteUserTextReferences, applyPairs };
