const express = require('express');
const router = express.Router();
const { auth, checkInputAccess, superAdminOnly, checkPermission } = require('../middleware/auth');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const {
    calculatePerilakuPoints,
    calculatePerilakuPointsFromFields,
    formatPerilakuKarakter
} = require('../constants/points');
const { resolveStudentIdByNis, applyPerilakuIptChange, buildKeterangan } = require('../utils/ipt');
const { movePhotoToApprovedFolder } = require('../utils/fileUtils');

// Get all perilaku (for approvals)
router.get('/all', auth, async (req, res) => {
    try {
        const [perilaku] = await db.query(`
            SELECT p.*, u.nama as user_name 
            FROM perilaku p 
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        res.json(perilaku);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's perilaku
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const [perilaku] = await db.query(
            'SELECT id, user_id, nama, nis, kelas, grha, karakter_siswa, point, status, rejection_reason, created_at FROM perilaku WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
            [req.params.userId, 'approved']
        );
        res.json(perilaku);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create perilaku
router.post('/', auth, checkPermission('perilaku'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const {
            nama,
            nis,
            kelas,
            grha,
            karakter_siswa,
            tanggung_jawab,
            disiplin,
            kepedulian,
            kemandirian,
            spiritual,
            kejujuran,
            kepercayaan_diri
        } = req.body;

        const userId = await resolveStudentIdByNis(nis, req.user.id);
        const karakter = karakter_siswa || formatPerilakuKarakter({
            tanggung_jawab,
            disiplin,
            kepedulian,
            kemandirian,
            spiritual,
            kejujuran,
            kepercayaan_diri
        });
        const point = karakter_siswa
            ? await calculatePerilakuPoints(karakter_siswa)
            : await calculatePerilakuPointsFromFields({
                tanggung_jawab,
                disiplin,
                kepedulian,
                kemandirian,
                spiritual,
                kejujuran,
                kepercayaan_diri
            });

        if (userRole === 'superadmin' || userRole === 'guru' || userRole === 'pegawai') {
            const [result] = await db.query(
                `INSERT INTO perilaku (user_id, submitted_by, nama, nis, kelas, grha, karakter_siswa, point, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, req.user.id, nama, nis, kelas, grha, karakter, point]
            );

            await applyPerilakuIptChange(
                userId,
                point,
                buildKeterangan('perilaku', { karakter_siswa: karakter }),
                result.insertId
            );

            // Log activity
            await logActivity(req.user.id, 'SUBMIT_PERILAKU', `${req.user.nama} (${req.user.role}) directly submitted perilaku for ${nama} (${nis}): ${karakter}`, req.ip);

            return res.status(201).json({
                message: 'Perilaku berhasil ditambahkan',
                id: result.insertId
            });
        }

        const [result] = await db.query(
            'INSERT INTO perilaku (user_id, submitted_by, nama, nis, kelas, grha, karakter_siswa, point, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, req.user.id, nama, nis, kelas, grha, karakter, point, 'pending']
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_PERILAKU', `User ${req.user.nama} (${req.user.role}) submitted perilaku for ${nama} (${nis}): ${karakter}`, req.ip);

        const [recipients] = await db.query(
            `SELECT DISTINCT u.id FROM users u LEFT JOIN permissions p ON p.user_id = u.id WHERE u.role = 'superadmin' OR p.can_approve IS TRUE`
        );
        for (const recipient of recipients) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approval_needed', 'Persetujuan Perilaku', ?, ?, 'perilaku')`,
                [recipient.id, `${nama} (${nis}) mengajukan perilaku`, result.insertId]
            );
        }

        res.status(201).json({ message: 'Perilaku berhasil diajukan untuk persetujuan', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Approve perilaku
router.put('/:id/approve', auth, superAdminOnly, async (req, res) => {
    try {
        const perilakuId = req.params.id;
        
        const [perilaku] = await db.query(
            'SELECT id, user_id, nama, nis, kelas, grha, karakter_siswa, point, status, rejection_reason, created_at FROM perilaku WHERE id = ? AND status = ?',
            [perilakuId, 'pending']
        );
        if (perilaku.length === 0) {
            return res.status(404).json({ message: 'Perilaku not found or already processed' });
        }

        const perilakuData = perilaku[0];
        
        await db.query(
            'UPDATE perilaku SET status = ? WHERE id = ? AND status = ?',
            ['approved', perilakuId, 'pending']
        );
        
        await applyPerilakuIptChange(
            perilakuData.user_id,
            perilakuData.point,
            `Perilaku: ${perilakuData.karakter_siswa}`,
            perilakuId
        );

        // Log activity
        await logActivity(req.user.id, 'APPROVE_PERILAKU', `SuperAdmin ${req.user.nama} approved perilaku for ${perilakuData.nama} (${perilakuData.nis}): ${perilakuData.karakter_siswa}`, req.ip);

        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
             VALUES (?, 'approved', 'Pengajuan Disetujui', ?, ?, 'perilaku')`,
            [perilakuData.user_id, 'Pengajuan perilaku Anda telah disetujui', perilakuId]
        );

        res.json({ message: 'Perilaku approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject perilaku
router.put('/:id/reject', auth, superAdminOnly, async (req, res) => {
    try {
        const { rejection_reason } = req.body;
        const perilakuId = req.params.id;

        const [perilaku] = await db.query('SELECT * FROM perilaku WHERE id = ?', [perilakuId]);

        await db.query('UPDATE perilaku SET status = ?, rejection_reason = ? WHERE id = ?', ['rejected', rejection_reason, perilakuId]);

        // Log activity
        await logActivity(req.user.id, 'REJECT_PERILAKU', `SuperAdmin ${req.user.nama} rejected perilaku for ${perilaku[0]?.nama || 'unknown'} (${perilaku[0]?.nis || 'unknown'}): ${rejection_reason || 'No reason'}`, req.ip);

        res.json({ message: 'Perilaku rejected' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update perilaku
router.put('/:id', auth, async (req, res) => {
    try {
        const perilakuId = req.params.id;
        const { nama, nis, kelas, grha, karakter_siswa, tanggung_jawab, disiplin, kepedulian, kemandirian, spiritual, kejujuran, kepercayaan_diri } = req.body;
        
        const [perilaku] = await db.query('SELECT id, user_id, nama, nis, kelas, grha, karakter_siswa, point, status, rejection_reason, created_at FROM perilaku WHERE id = ?', [perilakuId]);
        if (perilaku.length === 0) {
            return res.status(404).json({ message: 'Perilaku not found' });
        }

        const perilakuData = perilaku[0];
        const karakter = karakter_siswa || formatPerilakuKarakter({
            tanggung_jawab,
            disiplin,
            kepedulian,
            kemandirian,
            spiritual,
            kejujuran,
            kepercayaan_diri
        });
        const point = karakter_siswa
            ? await calculatePerilakuPoints(karakter_siswa)
            : await calculatePerilakuPointsFromFields({
                tanggung_jawab,
                disiplin,
                kepedulian,
                kemandirian,
                spiritual,
                kejujuran,
                kepercayaan_diri
            });

        await db.query(
            'UPDATE perilaku SET nama = ?, nis = ?, kelas = ?, grha = ?, karakter_siswa = ?, point = ? WHERE id = ?',
            [nama, nis, kelas, grha, karakter, point, perilakuId]
        );

        // If status is approved and point changed, update user IPT
        if (perilakuData.status === 'approved' && perilakuData.point !== point) {
            const pointDiff = point - perilakuData.point;
            const [userBefore] = await db.query('SELECT ipt_total FROM users WHERE id = ?', [perilakuData.user_id]);
            const iptSebelum = userBefore[0].ipt_total;
            const iptSesudah = iptSebelum + pointDiff;
            
            // Update user IPT (can go negative due to pelanggaran, can recover with perilaku)
            await db.query('UPDATE users SET ipt_total = ? WHERE id = ?', [iptSesudah, perilakuData.user_id]);
            
            await db.query(
                'INSERT INTO ipt_history (user_id, jenis_perubahan, point_change, ipt_sebelum, ipt_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [perilakuData.user_id, 'perilaku_update', pointDiff, iptSebelum, iptSesudah, `Update Perilaku: ${karakter}`]
            );
        }

        // Log activity
        await logActivity(req.user.id, 'UPDATE_PERILAKU', `User ${req.user.nama} (${req.user.role}) updated perilaku ID ${perilakuId}`, req.ip);

        res.json({ message: 'Perilaku updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete perilaku (superadmin only)
router.delete('/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const perilakuId = req.params.id;
        
        const [perilaku] = await db.query('SELECT id, user_id, nama, nis, kelas, grha, karakter_siswa, point, status, rejection_reason, created_at FROM perilaku WHERE id = ?', [perilakuId]);
        if (perilaku.length === 0) {
            return res.status(404).json({ message: 'Perilaku not found' });
        }

        const perilakuData = perilaku[0];

        // If approved, revert IPT change
        if (perilakuData.status === 'approved') {
            const [user] = await db.query('SELECT ipt_total FROM users WHERE id = ?', [perilakuData.user_id]);
            const iptSebelum = user[0].ipt_total;
            const iptSesudah = iptSebelum - perilakuData.point;
            
            await db.query('UPDATE users SET ipt_total = ? WHERE id = ?', [iptSesudah, perilakuData.user_id]);
            
            // Log IPT history
            await db.query(
                'INSERT INTO ipt_history (user_id, jenis_perubahan, point_change, ipt_sebelum, ipt_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [perilakuData.user_id, 'perilaku_delete', -perilakuData.point, iptSebelum, iptSesudah, `Delete Perilaku: ${perilakuData.karakter_siswa}`]
            );
        }

        // Delete from database
        await db.query('DELETE FROM perilaku WHERE id = ?', [perilakuId]);

        // Log activity
        await logActivity(req.user.id, 'DELETE_PERILAKU', `SuperAdmin ${req.user.nama} deleted perilaku for ${perilakuData.nama} (${perilakuData.nis}): ${perilakuData.karakter_siswa}`, req.ip);

        res.json({ message: 'Perilaku deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
