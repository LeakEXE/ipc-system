const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Get dashboard statistics
router.get('/stats', auth, async (req, res) => {
    try {
        // Run independent queries in parallel for better performance
        const [
            [totalStudents],
            [totalTeachers],
            [byGrha],
            [byKelas],
            [prestasiCounts],
            [totalPelanggaran],
            [pelanggaranByGrha],
            [activityCounts],
            [ipcStats],
            [topIpcStudents]
        ] = await Promise.all([
            // Total students
            db.query("SELECT COUNT(*) as count FROM users WHERE role = 'siswa'"),

            // Total teachers
            db.query("SELECT COUNT(*) as count FROM users WHERE role = 'guru'"),

            // Total by grha
            db.query(`
                SELECT grha, COUNT(*) as count
                FROM users
                WHERE role = 'siswa' AND grha IS NOT NULL
                GROUP BY grha
            `),

            // Total by kelas
            db.query(`
                SELECT kelas, COUNT(*) as count
                FROM users
                WHERE role = 'siswa' AND kelas IS NOT NULL AND is_graduated = 0
                GROUP BY kelas
                ORDER BY kelas
            `),

            // Prestasi count (single category — no more akademik/nonakademik split)
            db.query(`
                SELECT COUNT(*) as total
                FROM prestasi
                WHERE status = 'approved'
            `),

            // Total pelanggaran
            db.query("SELECT COUNT(*) as count FROM pelanggaran WHERE status = 'approved'"),

            // Total pelanggaran by grha
            db.query(`
                SELECT u.grha, COUNT(p.id) as count
                FROM users u
                LEFT JOIN pelanggaran p ON u.id = p.user_id AND p.status = 'approved'
                WHERE u.role = 'siswa' AND u.grha IS NOT NULL
                GROUP BY u.grha
            `),

            // Activity counts (combined query for organisasi, kepanitiaan, event, perilaku)
            db.query(`
                SELECT
                    (SELECT COUNT(*) FROM organisasi WHERE status = 'approved') as organisasi,
                    (SELECT COUNT(*) FROM kepanitiaan WHERE status = 'approved') as kepanitiaan,
                    (SELECT COUNT(*) FROM event WHERE status = 'approved') as event,
                    (SELECT COUNT(*) FROM perilaku WHERE status = 'approved') as perilaku
            `),

            // IPC Statistics
            db.query(`
                SELECT
                    AVG(ipc_total) as rata_rata,
                    MAX(ipc_total) as tertinggi,
                    MIN(ipc_total) as terendah
                FROM users
                WHERE role = 'siswa' AND is_graduated = 0 AND ipc_total IS NOT NULL
            `),

            // Siswa dengan IPC tertinggi
            db.query(`
                SELECT id, nama, nis, kelas, grha, foto, ipc_total
                FROM users
                WHERE role = 'siswa' AND is_graduated = 0 AND ipc_total IS NOT NULL
                ORDER BY ipc_total DESC
                LIMIT 5
            `)
        ]);

        res.json({
            total_students: totalStudents[0].count,
            total_teachers: totalTeachers[0].count,
            by_grha: byGrha,
            by_kelas: byKelas,
            total_prestasi: prestasiCounts[0].total || 0,
            pelanggaran_by_grha: pelanggaranByGrha,
            total_pelanggaran: totalPelanggaran[0].count,
            total_organisasi: activityCounts[0].organisasi || 0,
            total_kepanitiaan: activityCounts[0].kepanitiaan || 0,
            total_event: activityCounts[0].event || 0,
            total_perilaku: activityCounts[0].perilaku || 0,
            ipc_stats: {
                rata_rata: Math.round(ipcStats[0].rata_rata || 0),
                tertinggi: ipcStats[0].tertinggi || 0,
                terendah: ipcStats[0].terendah || 0
            },
            top_ipc_students: topIpcStudents
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
