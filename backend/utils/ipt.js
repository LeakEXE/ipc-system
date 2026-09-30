const db = require('../config/database');

// Resolve a pembina to { id, nama } from either a guru user id or a name.
// Returns { id: null, nama: fallback } when unresolvable (caller decides).
async function resolvePembina(pembinaId, pembinaName) {
    if (pembinaId) {
        const [rows] = await db.query("SELECT id, nama FROM users WHERE id = ? AND role IN ('guru', 'pegawai')", [pembinaId]);
        if (rows.length > 0) {
            return { id: rows[0].id, nama: rows[0].nama };
        }
    }
    if (pembinaName) {
        const [rows] = await db.query("SELECT id, nama FROM users WHERE nama = ? AND role IN ('guru', 'pegawai')", [pembinaName]);
        if (rows.length > 0) {
            return { id: rows[0].id, nama: rows[0].nama };
        }
        return { id: null, nama: pembinaName };
    }
    return { id: null, nama: '' };
}

// Single source of truth for ipt_history "keterangan" text on every
// create/approve path (direct superadmin submit AND approval of
// teacher/student submissions). All inputs must use this so history
// reads identically in /wali-kelas, reports, and profile.
function buildKeterangan(type, data) {
    const d = data || {};
    switch (type) {
        case 'prestasi':
            return `Prestasi: ${d.nama_lomba || '-'} - ${d.juara || '-'} ${d.kategori || ''}`.trim();
        case 'event':
            return `Event: ${d.nama_event || '-'} - ${d.tingkat || '-'}`;
        case 'organisasi':
            return `Organisasi: ${d.kategori_organisasi || '-'} - ${d.jabatan_organisasi || '-'}`;
        case 'kepanitiaan':
            return `Kepanitiaan: ${d.kategori_kepanitiaan || '-'} - ${d.jabatan_kepanitiaan || '-'}`;
        case 'pelanggaran':
            return `Pelanggaran: ${d.jenis_pelanggaran || '-'}`;
        case 'perilaku':
            return `Perilaku: ${d.karakter_siswa || d.karakter || '-'}`;
        default:
            return `${type}: ${d.keterangan || ''}`.trim();
    }
}

async function resolveStudentIdByNis(nis, fallbackUserId) {
    if (!nis) {
        return fallbackUserId;
    }

    const [rows] = await db.query(
        'SELECT id FROM users WHERE nis = ? AND role = ?',
        [nis, 'siswa']
    );

    if (rows.length === 0) {
        const error = new Error('Siswa dengan NIS tersebut tidak ditemukan');
        error.statusCode = 400;
        throw error;
    }

    return rows[0].id;
}

async function applyIptChange(userId, jenis, pointChange, keterangan) {
    const [user] = await db.query('SELECT ipt_total FROM users WHERE id = ?', [userId]);
    if (user.length === 0) {
        return null;
    }

    const iptSebelum = user[0].ipt_total;
    // Allow negative IPT values - remove the minimum constraint
    const iptBaru = iptSebelum + pointChange;

    await db.query('UPDATE users SET ipt_total = ? WHERE id = ?', [iptBaru, userId]);
    await db.query(
        `INSERT INTO ipt_history (user_id, jenis_perubahan, point_change, ipt_sebelum, ipt_sesudah, keterangan)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, jenis, pointChange, iptSebelum, iptBaru, keterangan]
    );

    return { iptSebelum, iptBaru };
}

async function applyPerilakuIptChange(userId, newPoint, keterangan, excludePerilakuId = null) {
    const params = [userId, 'approved'];
    let sql = 'SELECT id, point FROM perilaku WHERE user_id = ? AND status = ?';
    if (excludePerilakuId) {
        sql += ' AND id <> ?';
        params.push(excludePerilakuId);
    }

    const [previous] = await db.query(sql, params);
    let reversedPoints = 0;

    for (const old of previous) {
        reversedPoints += old.point || 0;
        await db.query(
            `UPDATE perilaku SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
            ['Diganti oleh penilaian perilaku baru', old.id]
        );
    }

    const netChange = (newPoint || 0) - reversedPoints;
    if (netChange !== 0) {
        await applyIptChange(userId, 'perilaku', netChange, keterangan);
    }

    return { netChange, supersededCount: previous.length };
}

module.exports = { resolveStudentIdByNis, resolvePembina, applyIptChange, applyPerilakuIptChange, buildKeterangan };
