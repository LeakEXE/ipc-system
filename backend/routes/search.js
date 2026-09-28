const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Search students by name or NIS
router.get('/students', auth, async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({ message: 'Query parameter is required' });
        }

        // Optimized single query with subqueries instead of N+1
        const [students] = await db.query(`
            SELECT
                u.id,
                u.nama,
                u.nis,
                u.kelas,
                u.grha,
                u.ipc_total,
                COALESCE(prestasi.count, 0) as total_prestasi
            FROM users u
            LEFT JOIN (
                SELECT user_id, COUNT(*) as count
                FROM prestasi
                WHERE status = 'approved'
                GROUP BY user_id
            ) prestasi ON u.id = prestasi.user_id
            WHERE u.role = 'siswa'
            AND (u.nama LIKE ? OR u.nis LIKE ?)
            LIMIT 20
        `, [`%${query}%`, `%${query}%`]);

        res.json(students);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student details with achievements
router.get('/student/:userId', auth, async (req, res) => {
    try {
        const userId = req.params.userId;

        const [student] = await db.query(
            'SELECT id, nama, nis, kelas, grha, ipc_total FROM users WHERE id = ? AND role = ?',
            [userId, 'siswa']
        );

        if (student.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const [prestasi] = await db.query(
            'SELECT * FROM prestasi WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
            [userId, 'approved']
        );

        const [organisasi] = await db.query(
            'SELECT * FROM organisasi WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
            [userId, 'approved']
        );

        const [event] = await db.query(
            'SELECT * FROM event WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
            [userId, 'approved']
        );

        res.json({
            student: student[0],
            prestasi,
            organisasi,
            event,
            total_prestasi: prestasi.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// IPC category leaderboards (Top 20) — ranked by approved IPC points.
// Pelanggaran stores deductions as negative points, so it ranks most-negative first.
const LEADERBOARD_CATEGORIES = {
    prestasi: { table: 'prestasi', pointCol: 'point' },
    organisasi: { table: 'organisasi', pointCol: 'point' },
    kepanitiaan: { table: 'kepanitiaan', pointCol: 'point' },
    event: { table: 'event', pointCol: 'point' },
    pelanggaran: { table: 'pelanggaran', pointCol: 'point_dikurangi', order: 'ASC' },
    perilaku: { table: 'perilaku', pointCol: 'point' }
};

// Get leaderboard for one IPC category — GET /search/leaderboard/category/:category
router.get('/leaderboard/category/:category', auth, async (req, res) => {
    try {
        // Whitelisted map only — no raw user input reaches the SQL
        const config = LEADERBOARD_CATEGORIES[req.params.category];
        if (!config) {
            return res.status(400).json({ message: 'Kategori tidak valid' });
        }
        const order = config.order === 'ASC' ? 'ASC' : 'DESC';

        const [students] = await db.query(`
            SELECT
                u.id,
                u.nama,
                u.nis,
                u.kelas,
                u.grha,
                u.foto,
                COALESCE(SUM(t.${config.pointCol}), 0) as total_point
            FROM users u
            JOIN ${config.table} t ON t.user_id = u.id AND t.status = 'approved'
            WHERE u.role = 'siswa'
            GROUP BY u.id, u.nama, u.nis, u.kelas, u.grha, u.foto
            ORDER BY total_point ${order}, u.nama ASC
            LIMIT 20
        `);

        res.json(students.map((student, index) => ({
            ...student,
            total_point: Number(student.total_point) || 0,
            rank: index + 1
        })));
    } catch (error) {
        console.error('Error fetching category leaderboard:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
