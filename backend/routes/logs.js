const express = require('express');
const router = express.Router();
const { auth, superAdminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get activity logs (paginated, newest first)
router.get('/', auth, superAdminOnly, async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const offset = (page - 1) * limit;

        const [countResult] = await db.query('SELECT COUNT(*) AS total FROM activity_logs');
        const total = parseInt(countResult[0]?.total, 10) || 0;

        // LEFT JOIN: deleting a user keeps their log rows (no cleanup on
        // delete), so orphaned rows must still show instead of vanishing.
        const [logs] = await db.query(`
            SELECT al.*, COALESCE(u.nama, '(akun dihapus)') AS nama, COALESCE(u.role, '-') AS role
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get logs by user
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const [logs] = await db.query(
            'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.params.userId]
        );
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
