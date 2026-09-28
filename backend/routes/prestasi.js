const express = require('express');
const router = express.Router();
const { auth, superAdminOnly } = require('../middleware/auth');
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { movePhotoToApprovedFolder } = require('../utils/fileUtils');
const { ensureUploadSubdir, resolveUploadPath } = require('../utils/paths');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, ensureUploadSubdir('prestasi'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
const { calculatePrestasiPoints } = require('../constants/points');

// Get all prestasi (for approvals)
router.get('/all', auth, async (req, res) => {
    try {
        const [prestasi] = await db.query(`
            SELECT p.*, u.nama as user_name 
            FROM prestasi p 
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        res.json(prestasi);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all teachers (for pembina dropdown)
router.get('/teachers', auth, async (req, res) => {
    try {
        const [teachers] = await db.query(
            'SELECT id, nama, nip FROM users WHERE role = ? ORDER BY nama ASC',
            ['guru']
        );
        res.json(teachers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's prestasi
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const [prestasi] = await db.query(
            'SELECT id, user_id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point, status, rejection_reason, created_at FROM prestasi WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
            [req.params.userId, 'approved']
        );
        res.json(prestasi);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create prestasi
router.post('/', auth, upload.single('foto'), async (req, res) => {
    try {
        const { nama, nis, nama_lomba, kelas, pembina, grha, juara, kategori } = req.body;
        let foto = req.file ? req.file.filename : null;

        // Rename file to NIS_Nama Lomba format
        if (req.file && foto) {
            const oldPath = resolveUploadPath(path.join('uploads/prestasi', foto));
            const ext = path.extname(req.file.originalname);
            const newFileName = `${nis}_${nama_lomba}${ext}`;
            const newPath = resolveUploadPath(path.join('uploads/prestasi', newFileName));

            // Rename the file
            fs.renameSync(oldPath, newPath);
            foto = newFileName;
        }

        const point = await calculatePrestasiPoints(juara, kategori);

        const [result] = await db.query(
            'INSERT INTO prestasi (user_id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point]
        );

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'SUBMIT_PRESTASI', `Submitted prestasi: ${nama_lomba}`]
        );

        res.status(201).json({ message: 'Prestasi submitted for approval', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve prestasi (superadmin only)
router.put('/:id/approve', auth, superAdminOnly, async (req, res) => {
    try {
        const prestasiId = req.params.id;
        
        const [prestasi] = await db.query('SELECT id, user_id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point, status, rejection_reason, created_at FROM prestasi WHERE id = ?', [prestasiId]);
        if (prestasi.length === 0) {
            return res.status(404).json({ message: 'Prestasi not found' });
        }

        const prestasiData = prestasi[0];
        let newFotoPath = prestasiData.foto;
        
        // Move photo to approved folder if it exists
        if (prestasiData.foto) {
            const movedPath = movePhotoToApprovedFolder(path.join('uploads/prestasi', prestasiData.foto), 'prestasi');
            if (movedPath) {
                newFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
            }
        }
        
        // Update status and photo path
        await db.query('UPDATE prestasi SET status = ?, foto = ? WHERE id = ?', ['approved', newFotoPath, prestasiId]);
        
        // Update user IPC (can go negative due to pelanggaran, can recover with prestasi)
        const [user] = await db.query('SELECT ipc_total FROM users WHERE id = ?', [prestasiData.user_id]);
        const ipcSebelum = user[0].ipc_total;
        const ipcSesudah = ipcSebelum + prestasiData.point;
        
        await db.query('UPDATE users SET ipc_total = ? WHERE id = ?', [ipcSesudah, prestasiData.user_id]);
        
        // Log IPC history
        await db.query(
            'INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
            [prestasiData.user_id, 'prestasi', prestasiData.point, ipcSebelum, ipcSesudah, `Prestasi: ${prestasiData.nama_lomba}`]
        );

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'APPROVE_PRESTASI', `Approved prestasi ID ${prestasiId}`]
        );

        res.json({ message: 'Prestasi approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject prestasi (superadmin only)
router.put('/:id/reject', auth, superAdminOnly, async (req, res) => {
    try {
        const { rejection_reason } = req.body;
        const prestasiId = req.params.id;
        
        await db.query('UPDATE prestasi SET status = ?, rejection_reason = ? WHERE id = ?', ['rejected', rejection_reason, prestasiId]);

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'REJECT_PRESTASI', `Rejected prestasi ID ${prestasiId}`]
        );

        res.json({ message: 'Prestasi rejected' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update prestasi (for superadmin)
router.put('/:id', auth, upload.single('foto'), async (req, res) => {
    try {
        const prestasiId = req.params.id;
        const { nama, nis, nama_lomba, kelas, pembina, grha, juara, kategori } = req.body;
        
        const [prestasi] = await db.query('SELECT id, user_id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point, status, rejection_reason, created_at FROM prestasi WHERE id = ?', [prestasiId]);
        if (prestasi.length === 0) {
            return res.status(404).json({ message: 'Prestasi not found' });
        }

        const prestasiData = prestasi[0];
        let foto = prestasiData.foto;

        // Handle new photo upload
        if (req.file) {
            // Delete old photo if exists
            if (foto) {
                const oldPath = resolveUploadPath(path.join('uploads/prestasi', foto));
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            
            // Rename new file
            const ext = path.extname(req.file.originalname);
            const newFileName = `${nis}_${nama_lomba}${ext}`;
            const oldPath = resolveUploadPath(path.join('uploads/prestasi', req.file.filename));
            const newPath = resolveUploadPath(path.join('uploads/prestasi', newFileName));
            fs.renameSync(oldPath, newPath);
            foto = newFileName;
        }

        // Recalculate points if juara or kategori changed
        const point = await calculatePrestasiPoints(juara, kategori);

        await db.query(
            'UPDATE prestasi SET nama = ?, nis = ?, nama_lomba = ?, foto = ?, kelas = ?, pembina = ?, grha = ?, juara = ?, kategori = ?, point = ? WHERE id = ?',
            [nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point, prestasiId]
        );

        // If status is approved and point changed, update user IPC
        if (prestasiData.status === 'approved' && prestasiData.point !== point) {
            const pointDiff = point - prestasiData.point;
            await db.query('UPDATE users SET ipc_total = ipc_total + ? WHERE id = ?', [pointDiff, prestasiData.user_id]);
            
            await db.query(
                'INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [prestasiData.user_id, 'prestasi_update', pointDiff, prestasiData.ipc_sebelum || prestasiData.ipc_total, prestasiData.ipc_total + pointDiff, `Update Prestasi: ${nama_lomba}`]
            );
        }

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'UPDATE_PRESTASI', `Updated prestasi ID ${prestasiId}`]
        );

        res.json({ message: 'Prestasi updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete prestasi (superadmin only)
router.delete('/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const prestasiId = req.params.id;
        
        const [prestasi] = await db.query('SELECT id, user_id, nama, nis, nama_lomba, foto, kelas, pembina, grha, juara, kategori, point, status, rejection_reason, created_at FROM prestasi WHERE id = ?', [prestasiId]);
        if (prestasi.length === 0) {
            return res.status(404).json({ message: 'Prestasi not found' });
        }

        const prestasiData = prestasi[0];

        // If approved, revert IPC change
        if (prestasiData.status === 'approved') {
            const [user] = await db.query('SELECT ipc_total FROM users WHERE id = ?', [prestasiData.user_id]);
            const ipcSebelum = user[0].ipc_total;
            const ipcSesudah = ipcSebelum - prestasiData.point;
            
            await db.query('UPDATE users SET ipc_total = ? WHERE id = ?', [ipcSesudah, prestasiData.user_id]);
            
            // Log IPC history
            await db.query(
                'INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [prestasiData.user_id, 'prestasi_delete', -prestasiData.point, ipcSebelum, ipcSesudah, `Delete Prestasi: ${prestasiData.nama_lomba}`]
            );
        }

        // Delete photo file if exists
        if (prestasiData.foto) {
            const photoPath = resolveUploadPath(path.join('uploads', prestasiData.foto));
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        // Delete from database
        await db.query('DELETE FROM prestasi WHERE id = ?', [prestasiId]);

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'DELETE_PRESTASI', `Deleted prestasi ID ${prestasiId}`]
        );

        res.json({ message: 'Prestasi deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
