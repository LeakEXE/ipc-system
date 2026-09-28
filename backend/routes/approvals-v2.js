const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth, superAdminOnly, checkInputAccess } = require('../middleware/auth');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const {
    calculatePrestasiPoints,
    calculateEventPoints,
    calculateOrganisasiPoints,
    calculateKepanitiaanPoints,
    calculatePelanggaranPoints
} = require('../constants/points');
const { resolveStudentIdByNis, applyIpcChange, applyPerilakuIpcChange } = require('../utils/ipc');
const {
    getApprovalStatusColumn,
    getRowApprovalStatus,
    fetchPendingApprovals,
    approveSubmission,
    rejectSubmission
} = require('../utils/approvalSchema');
const { movePhotoToApprovedFolder } = require('../utils/fileUtils');
const { ensureUploadSubdir, UPLOAD_DIR } = require('../utils/paths');
// Local file storage only - Google Drive removed

// Configure multer for file uploads - use type-specific folders
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Determine upload subfolder based on route
        let subdir = 'approvals';
        if (req.originalUrl.includes('/prestasi/')) {
            subdir = 'prestasi';
        } else if (req.originalUrl.includes('/event/')) {
            subdir = 'event';
        } else if (req.originalUrl.includes('/organisasi/')) {
            subdir = 'organisasi';
        } else if (req.originalUrl.includes('/kepanitiaan/')) {
            subdir = 'kepanitiaan';
        } else if (req.originalUrl.includes('/pelanggaran/')) {
            subdir = 'pelanggaran';
        }

        // Absolute path (<backend>/uploads/...) + auto-create, independent of cwd
        cb(null, ensureUploadSubdir(subdir));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Helper function to save file locally - extracts the DB-relative path from the absolute file path
const saveFileLocally = (filePath) => {
    // filePath is absolute (multer destinations are absolute).
    // DB format stays 'uploads/<type>/<file>' no matter where UPLOAD_DIR lives.
    // filePath is absolute like: c:\...\backend\uploads\prestasi\filename.jpg
    // We want: uploads/prestasi/filename.jpg

    const rel = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');
    if (rel && !rel.startsWith('..')) {
        return `uploads/${rel}`;
    }

    // If file is outside UPLOAD_DIR, use the filename and default to approvals folder
    console.warn('Upload file outside UPLOAD_DIR, using fallback:', filePath);
    const filename = path.basename(filePath);
    return `uploads/approvals/${filename}`;
};

// ==================== SUBMIT FOR APPROVAL ====================

// Submit Prestasi for Approval (or Direct Submit for Superadmin)
router.post('/prestasi/submit', auth, checkInputAccess('prestasi'), upload.single('foto'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { nama, nis, nama_lomba, pembina, grha, juara, kategori } = req.body;
        const userId = await resolveStudentIdByNis(nis, req.user.id);
        let fotoPath = req.file ? saveFileLocally(req.file.path) : null;
        console.log('Prestasi - Using local path:', fotoPath);
        
        // Get student's calculated class from database
        const [studentData] = await db.query('SELECT kelas FROM users WHERE id = ?', [userId]);
        const calculatedClass = studentData[0]?.kelas || '';
        
        // SUPERADMIN: Direct submit to main table
        if (userRole === 'superadmin') {
            console.log('Prestasi - Superadmin direct submission');
            const point = await calculatePrestasiPoints(juara, kategori);
            
            // Move photo to organized folder if exists
            let finalFotoPath = fotoPath;
            if (fotoPath) {
                const movedPath = movePhotoToApprovedFolder(fotoPath, 'prestasi');
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }
            
            const [result] = await db.query(
                `INSERT INTO prestasi 
                (user_id, nama, nis, nama_lomba, kelas, pembina, grha, juara, kategori, foto, point, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, nama, nis, nama_lomba, calculatedClass, pembina, grha, juara, kategori, finalFotoPath, point]
            );
            
            await applyIpcChange(userId, 'prestasi', point, `Prestasi: ${nama_lomba} - ${juara} ${kategori}`);
            
            console.log('Prestasi - Directly added by superadmin:', result.insertId);
            
            return res.status(201).json({ 
                message: 'Prestasi berhasil ditambahkan', 
                id: result.insertId 
            });
        }

        // SISWA/GURU: Submit for approval (superadmin only)
        const [result] = await db.query(
            `INSERT INTO prestasi_approvals
            (user_id, submitted_by, nama, nis, nama_lomba, kelas, pembina, grha, juara, kategori, foto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, req.user.id, nama, nis, nama_lomba, calculatedClass, pembina, grha, juara, kategori, fotoPath]
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_PRESTASI', `User ${req.user.nama} (${req.user.role}) submitted prestasi for ${nama} (${nis}): ${nama_lomba}`, req.ip);

        // Create notification for superadmin only
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        console.log('Prestasi - Superadmins found:', superadmins.length);
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approval_needed', 'Persetujuan Prestasi', ?, ?, 'prestasi')`,
                [admin.id, `${nama} (${nis}) mengajukan prestasi: ${nama_lomba}`, result.insertId]
            );
            console.log('Prestasi - Notification sent to superadmin:', admin.id);
        }

        res.status(201).json({
            message: 'Prestasi berhasil diajukan untuk persetujuan',
            id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Submit Pelanggaran for Approval (or Direct Submit for Superadmin)
router.post('/pelanggaran/submit', auth, checkInputAccess('pelanggaran'), upload.single('foto'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { nama, nis, grha, keterangan, jenis_pelanggaran } = req.body;
        const userId = await resolveStudentIdByNis(nis, req.user.id);
        let foto_path = req.file ? saveFileLocally(req.file.path) : null;
        console.log('Pelanggaran - Using local path:', foto_path);
        const point = await calculatePelanggaranPoints(jenis_pelanggaran);
        if (!point) {
            return res.status(400).json({ message: 'Detail pelanggaran belum memiliki konfigurasi tingkat atau point aktif' });
        }

        // Get student's calculated class from database
        const [studentData] = await db.query('SELECT kelas FROM users WHERE id = ?', [userId]);
        const calculatedClass = studentData[0]?.kelas || '';

        // SUPERADMIN: Direct submit with approved status
        if (userRole === 'superadmin') {
            console.log('Pelanggaran - Superadmin direct submission');

            // Move photo to organized folder if exists
            let finalFotoPath = foto_path;
            if (foto_path) {
                const movedPath = movePhotoToApprovedFolder(foto_path, 'pelanggaran');
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }

            const [result] = await db.query(
                `INSERT INTO pelanggaran
                (user_id, submitted_by, nama, nis, kelas, grha, keterangan, foto, jenis_pelanggaran, point_dikurangi, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, req.user.id, nama, nis, calculatedClass, grha, keterangan, finalFotoPath, jenis_pelanggaran, point]
            );

            await applyIpcChange(userId, 'pelanggaran', point, `Pelanggaran: ${jenis_pelanggaran}`);

            // Log activity
            await logActivity(req.user.id, 'SUBMIT_PELANGGARAN', `SuperAdmin ${req.user.nama} submitted pelanggaran for ${nama} (${nis}): ${jenis_pelanggaran}`, req.ip);

            console.log('Pelanggaran - Directly added by superadmin:', result.insertId);

            return res.status(201).json({
                message: 'Pelanggaran berhasil ditambahkan',
                id: result.insertId
            });
        }

        // SISWA/GURU: Submit for approval with pending status
        const [result] = await db.query(
            `INSERT INTO pelanggaran
            (user_id, submitted_by, nama, nis, kelas, grha, keterangan, foto, jenis_pelanggaran, point_dikurangi, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [userId, req.user.id, nama, nis, calculatedClass, grha, keterangan, foto_path, jenis_pelanggaran, point]
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_PELANGGARAN', `${req.user.nama} submitted pelanggaran for approval: ${jenis_pelanggaran}`, req.ip);

        console.log('Pelanggaran - Submitted for approval:', result.insertId);

        return res.status(201).json({
            message: 'Pelanggaran berhasil diajukan untuk persetujuan',
            id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

router.post('/event/submit', auth, checkInputAccess('event'), upload.single('foto'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { nama, nis, grha, pembina, nama_event, tingkat } = req.body;
        const userId = await resolveStudentIdByNis(nis, req.user.id);
        let foto_path = req.file ? saveFileLocally(req.file.path) : null;
        console.log('Event - Using local path:', foto_path);
        
        // Get student's calculated class from database
        const [studentData] = await db.query('SELECT kelas FROM users WHERE id = ?', [userId]);
        const calculatedClass = studentData[0]?.kelas || '';
        
        // SUPERADMIN: Direct submit to main table
        if (userRole === 'superadmin') {
            console.log('Event - Superadmin direct submission');
            const point = await calculateEventPoints(tingkat);
            
            // Move photo to organized folder if exists
            let finalFotoPath = foto_path;
            if (foto_path) {
                const movedPath = movePhotoToApprovedFolder(foto_path, 'event');
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }
            
            const [result] = await db.query(
                `INSERT INTO event 
                (user_id, nama, nis, kelas, grha, nama_event, tingkat, foto, point, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, nama, nis, calculatedClass, grha, nama_event, tingkat, finalFotoPath, point]
            );
            
            await applyIpcChange(userId, 'event', point, `Event: ${nama_event} - ${tingkat}`);
            
            console.log('Event - Directly added by superadmin:', result.insertId);
            
            return res.status(201).json({ 
                message: 'Event berhasil ditambahkan', 
                id: result.insertId 
            });
        }

        // SISWA/GURU: Submit for approval (superadmin only)
        const [result] = await db.query(
            `INSERT INTO event_approvals
            (user_id, submitted_by, nama, nis, kelas, grha, pembina, nama_event, tingkat, foto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, req.user.id, nama, nis, calculatedClass, grha, pembina, nama_event, tingkat, foto_path]
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_EVENT', `User ${req.user.nama} (${req.user.role}) submitted event for ${nama} (${nis}): ${nama_event}`, req.ip);

        // Create notification for superadmin only
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        console.log('Event - Superadmins found:', superadmins.length);
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approval_needed', 'Persetujuan Event', ?, ?, 'event')`,
                [admin.id, `${nama} (${nis}) mengajukan event: ${nama_event}`, result.insertId]
            );
            console.log('Event - Notification sent to superadmin:', admin.id);
        }

        res.status(201).json({
            message: 'Event berhasil diajukan untuk persetujuan',
            id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Submit Organisasi for Approval (or Direct Submit for Superadmin)
router.post('/organisasi/submit', auth, checkInputAccess('organisasi'), upload.single('foto'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { nama, nis, grha, pembina, jabatan_organisasi, kategori_organisasi } = req.body;
        const userId = await resolveStudentIdByNis(nis, req.user.id);
        let foto_path = req.file ? saveFileLocally(req.file.path) : null;
        console.log('Organisasi - Using local path:', foto_path);
        
        // Get student's calculated class from database
        const [studentData] = await db.query('SELECT kelas FROM users WHERE id = ?', [userId]);
        const calculatedClass = studentData[0]?.kelas || '';
        
        // SUPERADMIN: Direct submit to main table
        if (userRole === 'superadmin') {
            console.log('Organisasi - Superadmin direct submission');
            const point = await calculateOrganisasiPoints(kategori_organisasi, jabatan_organisasi);
            
            // Move photo to organized folder if exists
            let finalFotoPath = foto_path;
            if (foto_path) {
                const movedPath = movePhotoToApprovedFolder(foto_path, 'organisasi');
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }
            
            const [result] = await db.query(
                `INSERT INTO organisasi 
                (user_id, nama, nis, kelas, grha, jabatan_organisasi, foto, kategori_organisasi, point, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, nama, nis, calculatedClass, grha, jabatan_organisasi, finalFotoPath, kategori_organisasi, point]
            );
            
            await applyIpcChange(
                userId,
                'organisasi',
                point,
                `Organisasi: ${kategori_organisasi} - ${jabatan_organisasi}`
            );
            
            console.log('Organisasi - Directly added by superadmin:', result.insertId);
            
            return res.status(201).json({ 
                message: 'Organisasi berhasil ditambahkan', 
                id: result.insertId 
            });
        }
        
        // SISWA/GURU: Submit for approval (superadmin only)
        const [result] = await db.query(
            `INSERT INTO organisasi_approvals
            (user_id, submitted_by, nama, nis, kelas, grha, pembina, jabatan_organisasi, kategori_organisasi, foto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, req.user.id, nama, nis, calculatedClass, grha, pembina, jabatan_organisasi, kategori_organisasi, foto_path]
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_ORGANISASI', `User ${req.user.nama} (${req.user.role}) submitted organisasi for ${nama} (${nis}): ${kategori_organisasi}`, req.ip);

        // Create notification for superadmin only
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        console.log('Organisasi - Superadmins found:', superadmins.length);
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approval_needed', 'Persetujuan Organisasi', ?, ?, 'organisasi')`,
                [admin.id, `${nama} (${nis}) mengajukan organisasi: ${kategori_organisasi}`, result.insertId]
            );
            console.log('Organisasi - Notification sent to superadmin:', admin.id);
        }

        res.status(201).json({
            message: 'Organisasi berhasil diajukan untuk persetujuan',
            id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Submit Kepanitiaan for Approval (or Direct Submit for Superadmin)
router.post('/kepanitiaan/submit', auth, checkInputAccess('kepanitiaan'), upload.single('foto'), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { nama, nis, grha, pembina, jabatan_kepanitiaan, kategori_kepanitiaan } = req.body;
        const userId = await resolveStudentIdByNis(nis, req.user.id);
        let foto_path = req.file ? saveFileLocally(req.file.path) : null;
        console.log('Kepanitiaan - Using local path:', foto_path);
        
        // Get student's calculated class from database
        const [studentData] = await db.query('SELECT kelas FROM users WHERE id = ?', [userId]);
        const calculatedClass = studentData[0]?.kelas || '';
        
        // SUPERADMIN: Direct submit to main table
        if (userRole === 'superadmin') {
            console.log('Kepanitiaan - Superadmin direct submission');
            const point = await calculateKepanitiaanPoints(jabatan_kepanitiaan);
            
            // Move photo to organized folder if exists
            let finalFotoPath = foto_path;
            if (foto_path) {
                const movedPath = movePhotoToApprovedFolder(foto_path, 'kepanitiaan');
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }
            
            const [result] = await db.query(
                `INSERT INTO kepanitiaan 
                (user_id, nama, nis, kelas, grha, jabatan_kepanitiaan, foto, kategori_kepanitiaan, point, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
                [userId, nama, nis, calculatedClass, grha, jabatan_kepanitiaan, finalFotoPath, kategori_kepanitiaan, point]
            );
            
            await applyIpcChange(
                userId,
                'kepanitiaan',
                point,
                `Kepanitiaan: ${kategori_kepanitiaan} - ${jabatan_kepanitiaan}`
            );
            
            console.log('Kepanitiaan - Directly added by superadmin:', result.insertId);
            
            return res.status(201).json({ 
                message: 'Kepanitiaan berhasil ditambahkan', 
                id: result.insertId 
            });
        }
        
        // SISWA/GURU: Submit for approval (superadmin only)
        const [result] = await db.query(
            `INSERT INTO kepanitiaan_approvals
            (user_id, submitted_by, nama, nis, kelas, grha, pembina, jabatan_kepanitiaan, kategori_kepanitiaan, foto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, req.user.id, nama, nis, calculatedClass, grha, pembina, jabatan_kepanitiaan, kategori_kepanitiaan, foto_path]
        );

        // Log activity
        await logActivity(req.user.id, 'SUBMIT_KEPANITIAAN', `User ${req.user.nama} (${req.user.role}) submitted kepanitiaan for ${nama} (${nis}): ${kategori_kepanitiaan}`, req.ip);

        // Create notification for superadmin only
        const [superadmins] = await db.query("SELECT id FROM users WHERE role = 'superadmin'");
        console.log('Kepanitiaan - Superadmins found:', superadmins.length);
        for (const admin of superadmins) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES (?, 'approval_needed', 'Persetujuan Kepanitiaan', ?, ?, 'kepanitiaan')`,
                [admin.id, `${nama} (${nis}) mengajukan kepanitiaan: ${kategori_kepanitiaan}`, result.insertId]
            );
            console.log('Kepanitiaan - Notification sent to superadmin:', admin.id);
        }

        res.status(201).json({
            message: 'Kepanitiaan berhasil diajukan untuk persetujuan',
            id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// ==================== APPROVAL ACTIONS ====================

// REMOVED: Pembina approval route - now only superadmin approval

// SuperAdmin Approve/Reject (single-step approval)
router.put('/superadmin/:type/:id', auth, superAdminOnly, async (req, res) => {
    try {
        const { type, id } = req.params;
        const { status, notes } = req.body;

        console.log(`SuperAdmin ${status} request: type=${type}, id=${id}`);

        if (type === 'pelanggaran' || type === 'perilaku') {
            return handleLegacyApproval(type, id, status, notes, req.user.id, req.ip, res);
        }

        let table, pointField, pointType, allowedColumns;
        switch(type) {
            case 'prestasi':
                table = 'prestasi_approvals';
                pointField = 'juara';
                pointType = 'Prestasi';
                allowedColumns = ['id', 'user_id', 'nama', 'nis', 'nama_lomba', 'foto', 'kelas', 'pembina', 'grha', 'juara', 'kategori', 'superadmin_status', 'created_at'];
                break;
            case 'event':
                table = 'event_approvals';
                pointField = 'tingkat';
                pointType = 'Event';
                allowedColumns = ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'pembina', 'nama_event', 'tingkat', 'foto', 'superadmin_status', 'created_at'];
                break;
            case 'organisasi':
                table = 'organisasi_approvals';
                pointField = 'jabatan_organisasi';
                pointType = 'Organisasi';
                allowedColumns = ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'jabatan_organisasi', 'foto', 'kategori_organisasi', 'superadmin_status', 'created_at'];
                break;
            case 'kepanitiaan':
                table = 'kepanitiaan_approvals';
                pointField = 'jabatan_kepanitiaan';
                pointType = 'Kepanitiaan';
                allowedColumns = ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'jabatan_kepanitiaan', 'foto', 'kategori_kepanitiaan', 'superadmin_status', 'created_at'];
                break;
            default:
                return res.status(400).json({ message: 'Invalid type' });
        }

        // Get submission data - use explicit column list instead of SELECT *
        const [submission] = await db.query(`SELECT ${allowedColumns.join(', ')} FROM ${table} WHERE id = ?`, [id]);
        if (submission.length === 0) {
            return res.status(404).json({ message: 'Submission not found' });
        }

        const data = submission[0];
        console.log('Submission data:', data);

        const approvalStatus = getRowApprovalStatus(data);
        if (approvalStatus !== 'pending') {
            return res.status(400).json({ message: 'Pengajuan ini sudah diproses' });
        }

        if (status === 'approved') {
            // Calculate points
            let pointChange = 0;
            if (type === 'prestasi') {
                pointChange = await calculatePrestasiPoints(data.juara, data.kategori);
            } else if (type === 'event') {
                pointChange = await calculateEventPoints(data.tingkat);
            } else if (type === 'kepanitiaan') {
                pointChange = await calculateKepanitiaanPoints(data[pointField]);
            } else {
                pointChange = await calculateOrganisasiPoints(data.kategori_organisasi, data[pointField]);
            }

            // Move photo to organized folder if exists
            // `foto` is the current column name (`foto_path` kept as fallback for older DBs)
            let finalFotoPath = data.foto ?? data.foto_path;
            if (finalFotoPath) {
                const movedPath = movePhotoToApprovedFolder(finalFotoPath, type);
                if (movedPath) {
                    finalFotoPath = path.join('uploads', movedPath).replace(/\\/g, '/');
                }
            }

            // Insert to actual table
            let insertQuery, insertParams;
            if (type === 'prestasi') {
                insertQuery = `INSERT INTO prestasi (user_id, nama, nis, nama_lomba, kelas, pembina, grha, juara, kategori, foto, point, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`;
                insertParams = [data.user_id, data.nama || 'Unknown', data.nis || '', data.nama_lomba || '', data.kelas || '', data.pembina || '', data.grha || '', data.juara || '', data.kategori || '', finalFotoPath || null, pointChange];
            } else if (type === 'event') {
                insertQuery = `INSERT INTO event (user_id, nama, nis, kelas, grha, nama_event, tingkat, foto, point, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`;
                insertParams = [data.user_id, data.nama || 'Unknown', data.nis || '', data.kelas || '', data.grha || '', data.nama_event || '', data.tingkat || '', finalFotoPath || null, pointChange];
            } else if (type === 'kepanitiaan') {
                insertQuery = `INSERT INTO kepanitiaan (user_id, nama, nis, kelas, grha, jabatan_kepanitiaan, kategori_kepanitiaan, foto, point, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`;
                insertParams = [data.user_id, data.nama || 'Unknown', data.nis || '', data.kelas || '', data.grha || '', data.jabatan_kepanitiaan || '', data.kategori_kepanitiaan || '', finalFotoPath || null, pointChange];
            } else {
                insertQuery = `INSERT INTO organisasi (user_id, nama, nis, kelas, grha, jabatan_organisasi, kategori_organisasi, foto, point, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`;
                insertParams = [data.user_id, data.nama || 'Unknown', data.nis || '', data.kelas || '', data.grha || '', data.jabatan_organisasi || '', data.kategori_organisasi || '', finalFotoPath || null, pointChange];
            }

            await db.query(insertQuery, insertParams);

            await applyIpcChange(
                data.user_id,
                type,
                pointChange,
                `Poin dari ${pointType}: ${data[pointField]}`
            );

            await approveSubmission(table, id, notes || 'Disetujui oleh SuperAdmin');

            // Log activity
            await logActivity(req.user.id, `APPROVE_${type.toUpperCase()}`, `SuperAdmin ${req.user.nama} approved ${type} for ${data.nama} (${data.nis}): ${data[pointField]}`, req.ip);

            // Notify student
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES (?, 'approved', 'Pengajuan Disetujui', ?, ?, ?)`,
                [data.user_id, `Pengajuan ${type} Anda telah disetujui`, id, type]
            );

            res.json({ message: `${type} berhasil disetujui` });
        } else {
            await rejectSubmission(table, id, notes || 'Ditolak oleh SuperAdmin');

            // Log activity
            await logActivity(req.user.id, `REJECT_${type.toUpperCase()}`, `SuperAdmin ${req.user.nama} rejected ${type} for ${data.nama} (${data.nis}): ${notes || 'No reason'}`, req.ip);

            // Notify student of rejection
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES (?, 'rejected', 'Pengajuan Ditolak', ?, ?, ?)`,
                [data.user_id, `Pengajuan ${type} Anda ditolak: ${notes || 'Tanpa alasan'}`, id, type]
            );

            res.json({ message: `${type} berhasil ditolak` });
        }
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

async function handleLegacyApproval(type, id, status, notes, approverId, ipAddress, res) {
    const table = type;
    try {
        // Define allowed columns for each table type
        const tableColumns = {
            'prestasi': ['id', 'user_id', 'nama', 'nis', 'jenis', 'nama_lomba', 'foto', 'kelas', 'pembina', 'grha', 'juara', 'kategori', 'point', 'status', 'rejection_reason', 'created_at'],
            'event': ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'pembina', 'nama_event', 'tingkat', 'foto', 'point', 'status', 'rejection_reason', 'created_at'],
            'organisasi': ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'jabatan_organisasi', 'foto', 'kategori_organisasi', 'point', 'status', 'rejection_reason', 'created_at'],
            'kepanitiaan': ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'jabatan_kepanitiaan', 'foto', 'point', 'status', 'rejection_reason', 'created_at'],
            'pelanggaran': ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'keterangan', 'foto', 'jenis_pelanggaran', 'point_dikurangi', 'status', 'rejection_reason', 'created_at'],
            'perilaku': ['id', 'user_id', 'nama', 'nis', 'kelas', 'grha', 'karakter_siswa', 'point', 'status', 'rejection_reason', 'created_at']
        };

        const allowedColumns = tableColumns[table] || ['id', 'user_id', 'nama', 'status', 'created_at'];
        const [rows] = await db.query(`SELECT ${allowedColumns.join(', ')} FROM ${table} WHERE id = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Submission not found' });
        }

        const data = rows[0];

        if (data.status !== 'pending') {
            return res.status(400).json({ message: 'Pengajuan ini sudah diproses' });
        }

        if (status === 'approved') {
            await db.query(`UPDATE ${table} SET status = 'approved' WHERE id = ? AND status = 'pending'`, [id]);

            if (type === 'pelanggaran') {
                await applyIpcChange(
                    data.user_id,
                    'pelanggaran',
                    // point_dikurangi sudah negatif (hasil calculatePelanggaranPoints),
                    // jadi langsung dijumlahkan — tanpa tanda minus.
                    data.point_dikurangi,
                    `Pelanggaran: ${data.jenis_pelanggaran}`
                );
            } else {
                await applyPerilakuIpcChange(
                    data.user_id,
                    data.point,
                    `Perilaku: ${data.karakter_siswa}`,
                    id
                );
            }

            // Log activity
            await logActivity(approverId, `APPROVE_${type.toUpperCase()}`, `SuperAdmin approved ${type} for ${data.nama} (${data.nis})`, ipAddress);

            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES (?, 'approved', 'Pengajuan Disetujui', ?, ?, ?)`,
                [data.user_id, `Pengajuan ${type} Anda telah disetujui`, id, type]
            );

            return res.json({ message: `${type} berhasil disetujui` });
        }

        await db.query(
            `UPDATE ${table} SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
            [notes || 'Ditolak oleh SuperAdmin', id]
        );

        // Log activity
        await logActivity(approverId, `REJECT_${type.toUpperCase()}`, `SuperAdmin rejected ${type} for ${data.nama} (${data.nis}): ${notes || 'No reason'}`, ipAddress);

        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES (?, 'rejected', 'Pengajuan Ditolak', ?, ?, ?)`,
            [data.user_id, `Pengajuan ${type} Anda ditolak: ${notes || 'Tanpa alasan'}`, id, type]
        );

        return res.json({ message: `${type} berhasil ditolak` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
}

// ==================== GET APPROVALS ====================

// Get pending approvals count for SuperAdmin
router.get('/pending-count', auth, superAdminOnly, async (req, res) => {
    try {
        const col = await getApprovalStatusColumn();

        const [prestasiCount] = await db.query(
            `SELECT COUNT(*) as count FROM prestasi_approvals WHERE ${col} = 'pending'`
        );
        const [eventCount] = await db.query(
            `SELECT COUNT(*) as count FROM event_approvals WHERE ${col} = 'pending'`
        );
        const [organisasiCount] = await db.query(
            `SELECT COUNT(*) as count FROM organisasi_approvals WHERE ${col} = 'pending'`
        );
        const [kepanitiaanCount] = await db.query(
            `SELECT COUNT(*) as count FROM kepanitiaan_approvals WHERE ${col} = 'pending'`
        );
        const [pelanggaranCount] = await db.query(
            "SELECT COUNT(*) as count FROM pelanggaran WHERE status = 'pending'"
        );
        const [perilakuCount] = await db.query(
            "SELECT COUNT(*) as count FROM perilaku WHERE status = 'pending'"
        );

        const total = (prestasiCount[0].count || 0) +
                     (eventCount[0].count || 0) +
                     (organisasiCount[0].count || 0) +
                     (kepanitiaanCount[0].count || 0) +
                     (pelanggaranCount[0].count || 0) +
                     (perilakuCount[0].count || 0);

        res.json({
            total,
            prestasi: prestasiCount[0].count || 0,
            event: eventCount[0].count || 0,
            organisasi: organisasiCount[0].count || 0,
            kepanitiaan: kepanitiaanCount[0].count || 0,
            pelanggaran: pelanggaranCount[0].count || 0,
            perilaku: perilakuCount[0].count || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all approvals for SuperAdmin
router.get('/all', auth, superAdminOnly, async (req, res) => {
    try {
        const [prestasi, event, organisasi, kepanitiaan] = await Promise.all([
            fetchPendingApprovals('prestasi_approvals', 'p'),
            fetchPendingApprovals('event_approvals', 'e'),
            fetchPendingApprovals('organisasi_approvals', 'o'),
            fetchPendingApprovals('kepanitiaan_approvals', 'k')
        ]);

        // "Diajukan Oleh" = actual submitter (submitted_by), not the target
        // student (user_id). COALESCE covers legacy rows with submitted_by NULL.
        const [pelanggaran] = await db.query(`
            SELECT p.*,
                   COALESCE(s.nama, u.nama) as user_name,
                   s.nama as submitted_by_name,
                   s.role as submitted_by_role
            FROM pelanggaran p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN users s ON p.submitted_by = s.id
            WHERE p.status = 'pending'
        `);

        const [perilaku] = await db.query(`
            SELECT p.*,
                   COALESCE(s.nama, u.nama) as user_name,
                   s.nama as submitted_by_name,
                   s.role as submitted_by_role
            FROM perilaku p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN users s ON p.submitted_by = s.id
            WHERE p.status = 'pending'
        `);

        res.json({
            prestasi: prestasi.map(p => ({ ...p, type: 'prestasi', status: getRowApprovalStatus(p) })),
            event: event.map(e => ({ ...e, type: 'event', status: getRowApprovalStatus(e) })),
            organisasi: organisasi.map(o => ({ ...o, type: 'organisasi', status: getRowApprovalStatus(o) })),
            kepanitiaan: kepanitiaan.map(k => ({ ...k, type: 'kepanitiaan', status: getRowApprovalStatus(k) })),
            pelanggaran: pelanggaran.map(p => ({ ...p, type: 'pelanggaran' })),
            perilaku: perilaku.map(p => ({ ...p, type: 'perilaku' }))
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Get approvals for Pembina (Guru) - REMOVED: No longer needed

// Get user's submissions
router.get('/user-submissions', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const col = await getApprovalStatusColumn();

        const [prestasi] = await db.query(`
            SELECT *,
                   superadmin_status as status,
                   'prestasi' as type
            FROM prestasi_approvals
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        const [event] = await db.query(`
            SELECT *,
                   superadmin_status as status,
                   'event' as type
            FROM event_approvals
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        const [organisasi] = await db.query(`
            SELECT *,
                   superadmin_status as status,
                   'organisasi' as type
            FROM organisasi_approvals
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        const [kepanitiaan] = await db.query(`
            SELECT *,
                   superadmin_status as status,
                   'kepanitiaan' as type
            FROM kepanitiaan_approvals
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        const [pelanggaran] = await db.query(`
            SELECT *,
                   status,
                   'pelanggaran' as type
            FROM pelanggaran
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        const [perilaku] = await db.query(`
            SELECT *,
                   status,
                   'perilaku' as type
            FROM perilaku
            WHERE user_id = ? OR submitted_by = ?
            ORDER BY created_at DESC
        `, [userId, userId]);

        res.json({
            prestasi,
            event,
            organisasi,
            kepanitiaan,
            pelanggaran,
            perilaku
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// ==================== NOTIFICATIONS ====================

// Get unread notifications count
router.get('/notifications/count', auth, async (req, res) => {
    try {
        const [result] = await db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );
        res.json({ count: result[0].count });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Get all notifications
router.get('/notifications', auth, async (req, res) => {
    try {
        const [notifications] = await db.query(
            `SELECT n.*, 
                CASE 
                    WHEN n.related_type = 'prestasi' THEN (SELECT nama_lomba FROM prestasi_approvals WHERE id = n.related_id)
                    WHEN n.related_type = 'event' THEN (SELECT nama_event FROM event_approvals WHERE id = n.related_id)
                    WHEN n.related_type = 'organisasi' THEN (SELECT kategori_organisasi FROM organisasi_approvals WHERE id = n.related_id)
                    WHEN n.related_type = 'student_creation' THEN (SELECT nama FROM student_creation_approvals WHERE id = n.related_id)
                    WHEN n.related_type = 'biodata' THEN (SELECT u.nama FROM biodata_update_approvals b JOIN users u ON b.user_id = u.id WHERE b.id = n.related_id)
                    WHEN n.related_type = 'pelanggaran' THEN (SELECT keterangan FROM pelanggaran WHERE id = n.related_id)
                    WHEN n.related_type = 'perilaku' THEN (SELECT karakter_siswa FROM perilaku WHERE id = n.related_id)
                END as detail_name
             FROM notifications n 
             WHERE n.user_id = ? 
             ORDER BY n.created_at DESC 
             LIMIT 50`,
            [req.user.id]
        );
        
        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Mark single notification as read
router.put('/notifications/:id/read', auth, async (req, res) => {
    try {
        const [result] = await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Mark all notifications as read
router.put('/notifications/read-all', auth, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

module.exports = router;
