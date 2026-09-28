const express = require('express');
const router = express.Router();
const VALID_TEACHER_JABATAN = ['Guru', 'Pegawai'];
const bcrypt = require('bcryptjs');
const { auth, superAdminOnly, teacherOrSuperAdmin } = require('../middleware/auth');
const db = require('../config/database');
const { getStudentRecords } = require('../utils/studentRecords');
const { validateTahunPelajaran, calculateCurrentClass, shouldGraduate, getClassInfo, calculateFullClass } = require('../utils/academicYear');
const { logActivity } = require('../utils/logger');
const { gradePrefixFromKelas, getIpcAwalForGrade } = require('../utils/ipcConfig');
const { syncBiodataChange } = require('../utils/biodataSync');

async function applyIpcAwalUpdate(userId, newIpcAwal, adminId) {
    const parsedAwal = parseInt(newIpcAwal, 10);
    if (Number.isNaN(parsedAwal) || parsedAwal < 0) {
        const error = new Error('IPC awal tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const [users] = await db.query(
        'SELECT id, role, ipc_awal, ipc_total FROM users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const user = users[0];
    if (user.role === 'superadmin') {
        const error = new Error('Tidak dapat mengubah IPC superadmin');
        error.statusCode = 400;
        throw error;
    }

    const oldAwal = user.ipc_awal ?? 0;
    const delta = parsedAwal - oldAwal;
    let newTotal = (user.ipc_total ?? 0) + delta;
    if (newTotal < 0) {
        newTotal = 0;
    }

    await db.query(
        'UPDATE users SET ipc_awal = ?, ipc_total = ? WHERE id = ?',
        [parsedAwal, newTotal, userId]
    );

    if (delta !== 0) {
        await db.query(
            `INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan)
             VALUES (?, 'manual', ?, ?, ?, ?)`,
            [userId, delta, user.ipc_total ?? 0, newTotal, 'Penyesuaian IPC awal oleh superadmin']
        );

        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [adminId, 'UPDATE_IPC_AWAL', `Updated IPC awal for user ID ${userId} to ${parsedAwal}`]
        );
    }

    return { ipc_awal: parsedAwal, ipc_total: newTotal };
}

// Bulk update IPC awal for multiple users
router.post('/bulk-update-ipc-awal', auth, superAdminOnly, async (req, res) => {
    try {
        const { userIds, ipcAwal } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'User IDs array is required' });
        }
        
        const parsedAwal = parseInt(ipcAwal, 10);
        if (Number.isNaN(parsedAwal) || parsedAwal < 0) {
            return res.status(400).json({ message: 'IPC awal harus angka valid (min 0)' });
        }
        
        // Note: IPC awal should stay >= 0, but IPC total can go negative due to pelanggaran

        const results = [];
        
        for (const userId of userIds) {
            try {
                const result = await applyIpcAwalUpdate(userId, parsedAwal, req.user.id);
                results.push({ userId, success: true, ...result });
            } catch (error) {
                results.push({ userId, success: false, message: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        res.json({ 
            message: `IPC awal berhasil diupdate untuk ${successCount} dari ${userIds.length} pengguna`,
            results 
        });
    } catch (error) {
        console.error('Bulk update IPC awal error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student data by NIS (for auto-fill in input forms) - MUST BE BEFORE /:id
router.get('/nis/:nis', auth, async (req, res) => {
    try {
        console.log('Fetching student by NIS:', req.params.nis);
        const [users] = await db.query(
            'SELECT id, nama, nis, kelas, grha FROM users WHERE nis = ? AND role = ?',
            [req.params.nis, 'siswa']
        );
        
        console.log('Found students:', users.length);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'Siswa tidak ditemukan' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Error fetching student by NIS:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student data by name (for auto-fill in input forms) - MUST BE BEFORE /:id
router.get('/nama/:nama', auth, async (req, res) => {
    try {
        console.log('Fetching student by name:', req.params.nama);
        const [users] = await db.query(
            'SELECT id, nama, nis, kelas, grha FROM users WHERE nama = ? AND role = ?',
            [req.params.nama, 'siswa']
        );
        
        console.log('Found students:', users.length);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'Siswa tidak ditemukan' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Error fetching student by name:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (Superadmin and Teacher) - with pagination
router.get('/', auth, teacherOrSuperAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', role: roleFilter } = req.query;
        const offset = (page - 1) * limit;

        // If guru, only return students (excluding graduated)
        if (req.user.role === 'guru') {
            let query = 'SELECT id, nama, nis, nip, role, kelas, grha, wali_kelas, ipc_total, ipc_awal, created_at, tahun_pelajaran, is_graduated, jurusan, detail, alamat, no_hp FROM users WHERE role = ? AND (is_graduated = 0 OR is_graduated IS NULL)';
            let params = ['siswa'];

            if (search) {
                query += ' AND (nama LIKE ? OR nis LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ' ORDER BY nama ASC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [users] = await db.query(query, params);

            // Get total count for pagination
            let countQuery = 'SELECT COUNT(*) as total FROM users WHERE role = ? AND (is_graduated = 0 OR is_graduated IS NULL)';
            let countParams = ['siswa'];
            if (search) {
                countQuery += ' AND (nama LIKE ? OR nis LIKE ?)';
                countParams.push(`%${search}%`, `%${search}%`);
            }
            const [countResult] = await db.query(countQuery, countParams);

            // Calculate and update class for each student
            const usersWithCalculatedClass = users.map(user => {
                const calculatedClass = calculateFullClass(user.tahun_pelajaran, user.jurusan);
                return {
                    ...user,
                    kelas: calculatedClass || user.kelas
                };
            });

            return res.json({
                users: usersWithCalculatedClass,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    totalPages: Math.ceil(countResult[0].total / limit)
                }
            });
        }

        // If superadmin, return all users (including graduated)
        let query = 'SELECT id, nama, nis, nip, role, kelas, grha, wali_kelas, ipc_total, ipc_awal, created_at, tahun_pelajaran, is_graduated, jurusan, detail, alamat, no_hp FROM users WHERE 1=1';
        let params = [];

        if (roleFilter) {
            query += ' AND role = ?';
            params.push(roleFilter);
        }

        if (search) {
            query += ' AND (nama LIKE ? OR nis LIKE ? OR nip LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY nama ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [users] = await db.query(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        let countParams = [];

        if (roleFilter) {
            countQuery += ' AND role = ?';
            countParams.push(roleFilter);
        }

        if (search) {
            countQuery += ' AND (nama LIKE ? OR nis LIKE ? OR nip LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [countResult] = await db.query(countQuery, countParams);

        // Calculate and update class for each student
        const usersWithCalculatedClass = users.map(user => {
            if (user.role === 'siswa') {
                const calculatedClass = calculateFullClass(user.tahun_pelajaran, user.jurusan);
                return {
                    ...user,
                    kelas: calculatedClass || user.kelas
                };
            }
            return user;
        });

        res.json({
            users: usersWithCalculatedClass,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (Superadmin and Teacher)
router.get('/biodata-approvals', auth, superAdminOnly, async (req, res) => {
    try {
        const [approvals] = await db.query(
            `SELECT b.*, u.nama as student_name, u.nis as student_nis, 
                    requester.nama as requested_by_name
             FROM biodata_update_approvals b
             JOIN users u ON b.user_id = u.id
             JOIN users requester ON b.requested_by = requester.id
             WHERE b.superadmin_status = 'pending'
             ORDER BY b.created_at DESC`
        );
        res.json(approvals);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student creation approvals for SuperAdmin - MUST BE BEFORE /:id
router.get('/student-creation-approvals', auth, superAdminOnly, async (req, res) => {
    try {
        const [approvals] = await db.query(
            `SELECT s.*, requester.nama as requested_by_name
             FROM student_creation_approvals s
             JOIN users requester ON s.requested_by = requester.id
             WHERE s.superadmin_status = 'pending'
             ORDER BY s.created_at DESC`
        );
        res.json(approvals);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Bulk update IPC awal (Superadmin only) - MUST BE BEFORE /:id
router.put('/bulk/ipc-awal', auth, superAdminOnly, async (req, res) => {
    try {
        const { user_ids: userIds, ipc_awal: ipcAwal } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'Pilih minimal satu pengguna' });
        }

        const results = [];
        for (const rawId of userIds) {
            const userId = parseInt(rawId, 10);
            if (Number.isNaN(userId)) {
                continue;
            }
            const updated = await applyIpcAwalUpdate(userId, ipcAwal, req.user.id);
            results.push({ userId, ...updated });
        }

        res.json({
            message: `IPC awal berhasil diupdate untuk ${results.length} pengguna`,
            updated: results.length,
            results
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Get student approved records (Guru/Superadmin)
router.get('/:id/records', auth, teacherOrSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const [user] = await db.query('SELECT id, role FROM users WHERE id = ?', [userId]);

        if (user.length === 0 || user[0].role !== 'siswa') {
            return res.status(404).json({ message: 'Siswa tidak ditemukan' });
        }

        const records = await getStudentRecords(userId);
        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student IPC history (Guru/Superadmin)
router.get('/:id/ipc-history', auth, teacherOrSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const [user] = await db.query('SELECT id, role FROM users WHERE id = ?', [userId]);

        if (user.length === 0 || user[0].role !== 'siswa') {
            return res.status(404).json({ message: 'Siswa tidak ditemukan' });
        }

        const [history] = await db.query(
            'SELECT id, user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan, created_at FROM ipc_history WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user by ID - IDOR protection: users can only access their own data unless they are admin/teacher
router.get('/:id', auth, async (req, res) => {
    try {
        const requestedUserId = parseInt(req.params.id);
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // IDOR protection: Only allow access if:
        // 1. User is requesting their own data, OR
        // 2. User is a superadmin, OR
        // 3. User is a teacher
        if (requestedUserId !== currentUserId && currentUserRole !== 'superadmin' && currentUserRole !== 'guru') {
            return res.status(403).json({ message: 'Access denied. You can only view your own profile.' });
        }

        const [users] = await db.query(
            'SELECT id, nama, nis, nip, role, kelas, grha, wali_kelas, ipc_total, alamat, no_hp, detail, detail AS jabatan, created_at FROM users WHERE id = ?',
            [requestedUserId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const user = users[0];
        
        // If user is a student, fetch wali kelas information
        if (user.role === 'siswa' && user.kelas) {
            const [waliData] = await db.query(`
                SELECT u.nama as wali_kelas_nama, u.nip as wali_kelas_nip
                FROM wali_kelas_assignment wka
                JOIN users u ON wka.guru_id = u.id
                WHERE wka.kelas = ? AND SPLIT_PART(wka.tahun_ajaran, '-', 1)::INT = EXTRACT(YEAR FROM CURRENT_DATE)::INT
                ORDER BY wka.id DESC
                LIMIT 1
            `, [user.kelas]);
            
            if (waliData.length > 0) {
                user.wali_kelas_nama = waliData[0].wali_kelas_nama;
                user.wali_kelas_nip = waliData[0].wali_kelas_nip;
            }
        }
        
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create student account (Superadmin creates directly, Guru needs approval)
router.post('/create-student', auth, teacherOrSuperAdmin, async (req, res) => {
    try {
        const { nama, nis, jurusan, password, wali_kelas, grha, tahun_pelajaran } = req.body;

        // Validate tahun_pelajaran format
        if (!tahun_pelajaran || !validateTahunPelajaran(tahun_pelajaran)) {
            return res.status(400).json({ message: 'Tahun pelajaran tidak valid. Format harus YYYY-YYYY (contoh: 2024-2025)' });
        }

        // Calculate initial class based on enrollment year
        const calculatedClass = calculateFullClass(tahun_pelajaran, jurusan);

        // Check for duplicate in users table
        const [existing] = await db.query(
            'SELECT id FROM users WHERE nis = ?',
            [nis]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'NIS sudah terdaftar' });
        }

        // Check for duplicate in pending approvals
        const [existingApproval] = await db.query(
            "SELECT id FROM student_creation_approvals WHERE nis = ? AND superadmin_status = 'pending'",
            [nis]
        );

        if (existingApproval.length > 0) {
            return res.status(400).json({ message: 'NIS sedang dalam proses approval' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        // If SuperAdmin, create directly
        if (req.user.role === 'superadmin') {
            const ipc_awal = await getIpcAwalForGrade(gradePrefixFromKelas(calculatedClass));
            const [result] = await db.query(
                'INSERT INTO users (nama, nis, password, role, kelas, wali_kelas, grha, jurusan, ipc_total, ipc_awal, tahun_pelajaran) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [nama, nis, hashedPassword, 'siswa', calculatedClass, wali_kelas, grha, jurusan, ipc_awal, ipc_awal, tahun_pelajaran]
            );

            // Create default permissions
            await db.query(
                'INSERT INTO permissions (user_id) VALUES (?)',
                [result.insertId]
            );

            // Log IPC history
            await db.query(
                'INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [result.insertId, 'initial', ipc_awal, 0, ipc_awal, 'IPC awal diberikan']
            );

            // Log activity
            await db.query(
                'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
                [req.user.id, 'CREATE_STUDENT', `Created student account for ${nama} (${nis})`]
            );

            return res.status(201).json({ message: 'Akun siswa berhasil dibuat!' });
        }

        // If Guru, create approval request
        const [result] = await db.query(
            "INSERT INTO student_creation_approvals (nama, nis, kelas, grha, jurusan, password, tahun_pelajaran, requested_by, superadmin_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
            [nama, nis, calculatedClass, grha, jurusan, hashedPassword, tahun_pelajaran, req.user.id]
        );

        // Notify superadmin
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) 
                 VALUES (?, 'approval_needed', 'Persetujuan Pembuatan Akun Siswa', ?, ?, 'student_creation')`,
                [admin.id, `Guru mengajukan pembuatan akun siswa: ${nama} (${nis})`, result.insertId]
            );
        }

        res.status(201).json({ message: 'Permintaan pembuatan akun siswa berhasil diajukan, menunggu persetujuan SuperAdmin!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create teacher account
router.post('/create-teacher', auth, superAdminOnly, async (req, res) => {
    try {
        const { nama, nip, password, jabatan, detail, alamat, no_hp, wali_kelas } = req.body;
        const teacherJabatan = jabatan || detail;
        if (!VALID_TEACHER_JABATAN.includes(teacherJabatan)) {
            return res.status(400).json({ message: `Jabatan tidak valid. Gunakan: ${VALID_TEACHER_JABATAN.join(', ')}` });
        }

        // Check for duplicate
        const [existing] = await db.query(
            'SELECT id FROM users WHERE nip = ?',
            [nip]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'NIP already exists' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const [result] = await db.query(
            'INSERT INTO users (nama, nip, password, role, detail, alamat, no_hp, wali_kelas, ipc_total, ipc_awal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nama, nip, hashedPassword, 'guru', teacherJabatan, alamat, no_hp, wali_kelas, 0, 0]
        );

        // Create default permissions
        await db.query(
            'INSERT INTO permissions (user_id) VALUES (?)',
            [result.insertId]
        );

        // Log activity
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'CREATE_TEACHER', `Created teacher account for ${nama} (${nip})`]
        );

        res.status(201).json({ message: 'Teacher account created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user
router.put('/:id', auth, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const currentUser = req.user;

        // Check permissions
        if (currentUser.role !== 'superadmin' && currentUser.id !== userId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Teachers can only edit their own biodata, not superadmin
        if (currentUser.role === 'guru') {
            const [targetUser] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
            if (targetUser.length > 0 && targetUser[0].role === 'superadmin') {
                return res.status(403).json({ message: 'Cannot edit superadmin account' });
            }
        }

        const { nama, alamat, no_hp, jabatan, detail } = req.body;

        // Get current user data for logging (dan untuk validasi jabatan)
        const [targetUserData] = await db.query('SELECT nama, role, detail FROM users WHERE id = ?', [userId]);
        const storedJabatan = targetUserData[0]?.detail || null;
        const oldUserName = targetUserData[0]?.nama || null;

        let teacherJabatan = jabatan || detail;
        if (!teacherJabatan) {
            // Tidak dikirim / kosong -> pertahankan nilai yang sudah ada
            teacherJabatan = storedJabatan;
        } else if (teacherJabatan !== storedJabatan && !VALID_TEACHER_JABATAN.includes(teacherJabatan)) {
            // Hanya nilai BARU yang divalidasi; nilai lama (legacy) yang tidak
            // diubah tetap diterima agar edit biodata lain tidak terkunci
            return res.status(400).json({ message: `Jabatan tidak valid. Gunakan: ${VALID_TEACHER_JABATAN.join(', ')}` });
        }

        await db.query(
            'UPDATE users SET nama = ?, alamat = ?, no_hp = ?, detail = ? WHERE id = ?',
            [nama, alamat, no_hp, teacherJabatan, userId]
        );

        // Propagate renamed biodata into record snapshots, pembina names, logs.
        await syncBiodataChange(userId, { nama: oldUserName });

        // Log activity
        await logActivity(currentUser.id, 'UPDATE_BIODATA', `User ${currentUser.nama} (${currentUser.role}) updated biodata for ${targetUserData[0]?.nama || userId} (${targetUserData[0]?.role})`, req.ip);

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

async function deleteUserAndDependencies(conn, userId) {
    const tryQuery = async (sql, params) => {
        try {
            await conn.query(sql, params);
            return true;
        } catch (e) {
            // Some installations/older schemas may not have certain columns (e.g. pembina_id).
            // In that case we retry with a simpler query instead of failing deletion.
            if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === '42703')) {
                return false;
            }
            throw e;
        }
    };

    // Tables with FK references to users.id but without ON DELETE CASCADE in skema.sql
    // (these can block deleting a student/teacher who has pending approvals/notifications)
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [userId]);

    // Approval tables: some schemas use pembina_id, some don't.
    if (!(await tryQuery('DELETE FROM prestasi_approvals WHERE user_id = ? OR pembina_id = ?', [userId, userId]))) {
        await conn.query('DELETE FROM prestasi_approvals WHERE user_id = ?', [userId]);
    }
    if (!(await tryQuery('DELETE FROM event_approvals WHERE user_id = ? OR pembina_id = ?', [userId, userId]))) {
        await conn.query('DELETE FROM event_approvals WHERE user_id = ?', [userId]);
    }
    if (!(await tryQuery('DELETE FROM organisasi_approvals WHERE user_id = ? OR pembina_id = ?', [userId, userId]))) {
        await conn.query('DELETE FROM organisasi_approvals WHERE user_id = ?', [userId]);
    }

    // Siswa approvals: schema should have created_by, but keep it simple if not.
    if (!(await tryQuery('DELETE FROM siswa_approvals WHERE user_id = ? OR created_by = ?', [userId, userId]))) {
        await conn.query('DELETE FROM siswa_approvals WHERE user_id = ?', [userId]);
    }

    // These *do* have cascades in most schemas, but delete defensively anyway.
    await conn.query('DELETE FROM student_creation_approvals WHERE requested_by = ?', [userId]);
    await conn.query('DELETE FROM biodata_update_approvals WHERE user_id = ? OR requested_by = ?', [userId, userId]);

    await conn.query('DELETE FROM users WHERE id = ?', [userId]);
}

// Bulk delete users (Superadmin only) - must be BEFORE /:id
router.post('/bulk-delete', auth, superAdminOnly, async (req, res) => {
    let conn;
    try {
        const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : [];
        const parsed = [...new Set(userIds.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0))];

        if (parsed.length === 0) {
            return res.status(400).json({ message: 'user_ids harus berisi minimal 1 id' });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        // Prevent deleting any superadmin
        const [superadmins] = await conn.query(
            `SELECT id FROM users WHERE id IN (${parsed.map(() => '?').join(',')}) AND role = 'superadmin'`,
            parsed
        );
        if (superadmins.length > 0) {
            await conn.rollback();
            return res.status(403).json({ message: 'Tidak bisa menghapus akun SuperAdmin' });
        }

        for (const id of parsed) {
            await deleteUserAndDependencies(conn, id);
        }

        await conn.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'BULK_DELETE_USER', `Deleted ${parsed.length} users: ${parsed.join(',')}`]
        );

        await conn.commit();
        res.json({ message: `Berhasil menghapus ${parsed.length} akun` });
    } catch (error) {
        if (conn) {
            try { await conn.rollback(); } catch (_) {}
        }
        console.error(error);
        res.status(500).json({ message: error.message || 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// Delete user
router.delete('/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Prevent deleting superadmin
        const [user] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (user.length > 0 && user[0].role === 'superadmin') {
            return res.status(403).json({ message: 'Cannot delete superadmin account' });
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await deleteUserAndDependencies(conn, userId);
            await conn.query(
                'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
                [req.user.id, 'DELETE_USER', `Deleted user ID ${userId}`]
            );
            await conn.commit();
        } catch (e) {
            try { await conn.rollback(); } catch (_) {}
            throw e;
        } finally {
            conn.release();
        }

        // Log activity
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// Update IPC awal (Superadmin only)
router.put('/:id/ipc', auth, superAdminOnly, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { ipc_awal: ipcAwal } = req.body;

        const updated = await applyIpcAwalUpdate(userId, ipcAwal, req.user.id);
        res.json({ message: 'IPC awal berhasil diupdate', ...updated });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Request biodata update (Guru only - needs SuperAdmin approval)
router.post('/:id/biodata-request', auth, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const requestedBy = req.user.id;
        const { nama, nis, jurusan, grha, tahun_pelajaran } = req.body;

        // Only guru can request biodata updates
        if (req.user.role !== 'guru') {
            return res.status(403).json({ message: 'Only teachers can request biodata updates' });
        }
        
        // Validate tahun_pelajaran format if provided
        if (tahun_pelajaran && !validateTahunPelajaran(tahun_pelajaran)) {
            return res.status(400).json({ message: 'Tahun pelajaran tidak valid. Format harus YYYY-YYYY (contoh: 2024-2025)' });
        }

        // Calculate class based on jurusan and tahun_pelajaran
        const calculatedClass = calculateFullClass(tahun_pelajaran, jurusan);
        
        // Get current student data
        const [student] = await db.query(
            'SELECT nama, nis, jurusan, grha, tahun_pelajaran FROM users WHERE id = ? AND role = ?',
            [userId, 'siswa']
        );
        
        if (student.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        const current = student[0];
        
        // Create approval request
        const [result] = await db.query(
            `INSERT INTO biodata_update_approvals 
            (user_id, nama_baru, nis_baru, kelas_baru, jurusan_baru, tahun_pelajaran_baru, grha_baru,
             nama_lama, nis_lama, kelas_lama, jurusan_lama, tahun_pelajaran_lama, grha_lama, requested_by,
             pembina_status, superadmin_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
            [userId, nama, nis, calculatedClass, jurusan, tahun_pelajaran, grha,
             current.nama, current.nis, current.kelas, current.jurusan, current.tahun_pelajaran, current.grha,
             requestedBy]
        );
        
        // Notify superadmin
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) 
                 VALUES (?, 'approval_needed', 'Persetujuan Update Biodata', ?, ?, 'biodata')`,
                [admin.id, `Guru mengajukan perubahan biodata untuk siswa: ${current.nama} (${current.nis})`, result.insertId]
            );
        }
        
        res.json({ message: 'Permintaan update biodata berhasil diajukan, menunggu persetujuan SuperAdmin' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve/Reject biodata update (SuperAdmin only)
router.put('/biodata-approvals/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const approvalId = parseInt(req.params.id);
        const { status, notes } = req.body;

        // Get approval data
        const [approval] = await db.query(
            'SELECT id, user_id, nama_baru, nis_baru, kelas_baru, jurusan_baru, tahun_pelajaran_baru, grha_baru, nama_lama, nis_lama, kelas_lama, jurusan_lama, tahun_pelajaran_lama, grha_lama, requested_by, superadmin_status, created_at FROM biodata_update_approvals WHERE id = ?',
            [approvalId]
        );

        if (approval.length === 0) {
            return res.status(404).json({ message: 'Approval request not found' });
        }

        const data = approval[0];

        if (status === 'approved') {
            // Capture pre-update identity so copies can be synced afterwards.
            const [currentUserRows] = await db.query(
                'SELECT nama, nis FROM users WHERE id = ?',
                [data.user_id]
            );
            const oldBiodata = {
                nama: currentUserRows[0]?.nama || data.nama_lama || null,
                nis: currentUserRows[0]?.nis || data.nis_lama || null,
            };

            // Update student data with new biodata
            await db.query(
                'UPDATE users SET nama = ?, nis = ?, kelas = ?, jurusan = ?, tahun_pelajaran = ?, grha = ? WHERE id = ?',
                [data.nama_baru, data.nis_baru, data.kelas_baru, data.jurusan_baru, data.tahun_pelajaran_baru, data.grha_baru, data.user_id]
            );

            // Propagate the approved biodata into record snapshots, logs, notifications.
            await syncBiodataChange(data.user_id, oldBiodata);

            // Update approval status
            await db.query(
                'UPDATE biodata_update_approvals SET superadmin_status = ?, superadmin_notes = ?, superadmin_approved_at = NOW() WHERE id = ?',
                ['approved', notes || 'Disetujui oleh SuperAdmin', approvalId]
            );

            // Log activity
            await logActivity(req.user.id, 'APPROVE_BIODATA_UPDATE', `SuperAdmin ${req.user.nama} approved biodata update for student ${data.nama_lama} (${data.nis_lama})`, req.ip);

            // Notify student
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approved', 'Biodata Diperbarui', ?, ?, 'biodata')`,
                [data.user_id, 'Biodata Anda telah berhasil diperbarui oleh SuperAdmin.', approvalId]
            );

            res.json({ message: 'Biodata siswa berhasil diupdate' });
        } else {
            // Reject
            await db.query(
                'UPDATE biodata_update_approvals SET superadmin_status = ?, superadmin_notes = ? WHERE id = ?',
                ['rejected', notes || 'Ditolak oleh SuperAdmin', approvalId]
            );

            // Log activity
            await logActivity(req.user.id, 'REJECT_BIODATA_UPDATE', `SuperAdmin ${req.user.nama} rejected biodata update for student ${data.nama_lama} (${data.nis_lama})`, req.ip);

            // Notify student
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'rejected', 'Pengajuan Update Biodata Ditolak', ?, ?, 'biodata')`,
                [data.user_id, `Pengajuan update biodata ditolak: ${notes || 'Tidak ada alasan'}`, approvalId]
            );

            res.json({ message: 'Pengajuan update biodata ditolak' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update biodata directly (Superadmin only - no approval needed)
router.put('/:id/biodata', auth, superAdminOnly, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nama, nis, jurusan, grha, tahun_pelajaran, nip, jabatan, detail, alamat, no_hp } = req.body;
        const teacherJabatan = jabatan || detail;

        // Get user current data
        const [user] = await db.query('SELECT nama, role, detail, nis, nip, alamat, no_hp FROM users WHERE id = ?', [userId]);
        if (user.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const role = user[0].role;
        const oldName = user[0].nama;
        const oldNis = user[0].nis || null;
        const oldNip = user[0].nip || null;

        if (role === 'siswa') {
            // Validate tahun_pelajaran format if provided
            if (tahun_pelajaran && !validateTahunPelajaran(tahun_pelajaran)) {
                return res.status(400).json({ message: 'Tahun pelajaran tidak valid. Format harus YYYY-YYYY (contoh: 2024-2025)' });
            }

            // Calculate new class based on updated jurusan and tahun_pelajaran
            const calculatedClass = calculateFullClass(tahun_pelajaran, jurusan);

            // Update siswa biodata
            await db.query(
                'UPDATE users SET nama = ?, nis = ?, jurusan = ?, grha = ?, tahun_pelajaran = ?, kelas = ? WHERE id = ?',
                [nama, nis, jurusan, grha, tahun_pelajaran, calculatedClass, userId]
            );

            // Propagate the edited biodata into record snapshots, logs, notifications.
            await syncBiodataChange(userId, { nama: oldName, nis: oldNis });

            // Log activity
            await logActivity(req.user.id, 'UPDATE_BIODATA_DIRECT', `SuperAdmin ${req.user.nama} directly updated biodata for student ${oldName} (${nis}) to ${nama}`, req.ip);
        } else if (role === 'guru') {
            const storedDetail = user[0].detail || null;
            const newJabatan = teacherJabatan || storedDetail;
            // Nilai BARU harus valid; nilai lama (legacy) yang tidak diubah tetap diterima
            if (newJabatan && newJabatan !== storedDetail && !VALID_TEACHER_JABATAN.includes(newJabatan)) {
                return res.status(400).json({ message: `Jabatan tidak valid. Gunakan: ${VALID_TEACHER_JABATAN.join(', ')}` });
            }
            // Update guru biodata (preserve alamat/no_hp when the form does not send them)
            const newAlamat = alamat !== undefined ? alamat : user[0].alamat;
            const newNoHp = no_hp !== undefined ? no_hp : user[0].no_hp;
            await db.query(
                'UPDATE users SET nama = ?, nip = ?, detail = ?, alamat = ?, no_hp = ? WHERE id = ?',
                [nama, nip, newJabatan, newAlamat, newNoHp, userId]
            );

            // Propagate the renamed teacher into pembina names, logs, notifications.
            await syncBiodataChange(userId, { nama: oldName, nip: oldNip });

            // Log activity
            await logActivity(req.user.id, 'UPDATE_BIODATA_DIRECT', `SuperAdmin ${req.user.nama} directly updated biodata for teacher ${oldName} (${nip}) to ${nama}`, req.ip);
        }

        res.json({ message: 'Biodata updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve/Reject student creation (SuperAdmin only)
router.put('/student-creation-approvals/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const approvalId = parseInt(req.params.id);
        const { status, notes } = req.body;
        
        // Get approval data
        const [approval] = await db.query(
            'SELECT id, nama, nis, kelas, grha, jurusan, password, tahun_pelajaran, requested_by, superadmin_status, created_at FROM student_creation_approvals WHERE id = ?',
            [approvalId]
        );
        
        if (approval.length === 0) {
            return res.status(404).json({ message: 'Approval request not found' });
        }
        
        const data = approval[0];
        
        if (status === 'approved') {
            // Create student account (IPC awal follows the grade default)
            const ipc_awal = await getIpcAwalForGrade(gradePrefixFromKelas(data.kelas));
            const [result] = await db.query(
                'INSERT INTO users (nama, nis, password, role, kelas, grha, jurusan, ipc_total, ipc_awal, tahun_pelajaran) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [data.nama, data.nis, data.password, 'siswa', data.kelas, data.grha, data.jurusan, ipc_awal, ipc_awal, data.tahun_pelajaran]
            );
            
            // Create default permissions
            await db.query(
                'INSERT INTO permissions (user_id) VALUES (?)',
                [result.insertId]
            );
            
            // Log IPC history
            await db.query(
                'INSERT INTO ipc_history (user_id, jenis_perubahan, point_change, ipc_sebelum, ipc_sesudah, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [result.insertId, 'initial', ipc_awal, 0, ipc_awal, 'IPC awal diberikan']
            );
            
            // Update approval status
            await db.query(
                'UPDATE student_creation_approvals SET superadmin_status = ?, superadmin_notes = ?, superadmin_approved_at = NOW() WHERE id = ?',
                ['approved', notes || 'Disetujui oleh SuperAdmin', approvalId]
            );
            
            // Notify the requesting teacher
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) 
                 VALUES (?, 'approved', 'Pembuatan Akun Siswa Disetujui', ?, ?, 'student_creation')`,
                [data.requested_by, `Pembuatan akun siswa ${data.nama} (${data.nis}) telah disetujui oleh SuperAdmin.`, approvalId]
            );
            
            res.json({ message: 'Akun siswa berhasil dibuat!' });
        } else {
            // Reject
            await db.query(
                'UPDATE student_creation_approvals SET superadmin_status = ?, superadmin_notes = ? WHERE id = ?',
                ['rejected', notes || 'Ditolak oleh SuperAdmin', approvalId]
            );
            
            // Notify the requesting teacher
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) 
                 VALUES (?, 'rejected', 'Pembuatan Akun Siswa Ditolak', ?, ?, 'student_creation')`,
                [data.requested_by, `Pembuatan akun siswa ${data.nama} (${data.nis}) ditolak: ${notes || 'Tidak ada alasan'}`, approvalId]
            );
            
            res.json({ message: 'Pengajuan pembuatan akun siswa ditolak' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
