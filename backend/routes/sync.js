const express = require('express');
const router = express.Router();
const { auth, superAdminOnly } = require('../middleware/auth');
const { buildIptCardBreakdown } = require('../utils/iptCardBreakdown');
const db = require('../config/database');

/**
 * IPT Synchronization Routes
 * These routes allow for manual and automatic IPT recalculation
 */

// Sync IPT for a single student
router.post('/student/:userId', auth, superAdminOnly, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        
        if (isNaN(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        // Get the accurate breakdown from database
        const cardData = await buildIptCardBreakdown(userId);
        
        if (!cardData) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        const calculatedTotal = cardData.breakdown_total;
        const currentTotal = cardData.student.ipt_total;
        
        // Update if different
        if (calculatedTotal !== currentTotal) {
            await db.query(
                'UPDATE users SET ipt_total = ? WHERE id = ?',
                [calculatedTotal, userId]
            );
            
            // Log the sync in ipt_history
            await db.query(
                `INSERT INTO ipt_history (user_id, jenis_perubahan, point_change, ipt_sebelum, ipt_sesudah, keterangan)
                 VALUES (?, 'sync', ?, ?, ?, ?)`,
                [userId, calculatedTotal - currentTotal, currentTotal, calculatedTotal, 'Manual IPT Synchronization']
            );
            
            return res.json({
                message: 'IPT synchronized successfully',
                previous_total: currentTotal,
                new_total: calculatedTotal,
                difference: calculatedTotal - currentTotal
            });
        } else {
            return res.json({
                message: 'IPT already synchronized',
                current_total: currentTotal
            });
        }
    } catch (error) {
        console.error('Error syncing student IPT:', error);
        res.status(500).json({ message: 'Server error during synchronization' });
    }
});

// Sync IPT for all students
router.post('/all', auth, superAdminOnly, async (req, res) => {
    try {
        // Get all students
        const [students] = await db.query(
            "SELECT id, nama, nis, kelas, ipt_total FROM users WHERE role = 'siswa' AND (is_graduated = 0 OR is_graduated IS NULL)"
        );
        
        let updatedCount = 0;
        let alreadySyncedCount = 0;
        const details = [];
        
        for (const student of students) {
            try {
                // Get the accurate breakdown from database
                const cardData = await buildIptCardBreakdown(student.id);
                
                if (!cardData) {
                    continue;
                }
                
                const calculatedTotal = cardData.breakdown_total;
                const currentTotal = cardData.student.ipt_total;
                
                // Update if different
                if (calculatedTotal !== currentTotal) {
                    await db.query(
                        'UPDATE users SET ipt_total = ? WHERE id = ?',
                        [calculatedTotal, student.id]
                    );
                    
                    // Log the sync in ipt_history
                    await db.query(
                        `INSERT INTO ipt_history (user_id, jenis_perubahan, point_change, ipt_sebelum, ipt_sesudah, keterangan)
                         VALUES (?, 'sync', ?, ?, ?, ?)`,
                        [student.id, calculatedTotal - currentTotal, currentTotal, calculatedTotal, 'Bulk IPT Synchronization']
                    );
                    
                    updatedCount++;
                    details.push({
                        student_id: student.id,
                        nama: student.nama,
                        nis: student.nis,
                        previous_total: currentTotal,
                        new_total: calculatedTotal,
                        difference: calculatedTotal - currentTotal
                    });
                } else {
                    alreadySyncedCount++;
                }
            } catch (error) {
                console.error(`Error syncing student ${student.id}:`, error);
            }
        }
        
        res.json({
            message: 'Bulk IPT synchronization completed',
            total_students: students.length,
            updated_count: updatedCount,
            already_synced_count: alreadySyncedCount,
            details: updatedCount > 0 ? details : undefined
        });
    } catch (error) {
        console.error('Error during bulk IPT sync:', error);
        res.status(500).json({ message: 'Server error during bulk synchronization' });
    }
});

// Get sync status (check for discrepancies)
router.get('/status', auth, superAdminOnly, async (req, res) => {
    try {
        // Get all students
        const [students] = await db.query(
            "SELECT id, nama, nis, kelas, ipt_total FROM users WHERE role = 'siswa' AND (is_graduated = 0 OR is_graduated IS NULL)"
        );
        
        const discrepancies = [];
        
        for (const student of students) {
            try {
                const cardData = await buildIptCardBreakdown(student.id);
                
                if (!cardData) {
                    continue;
                }
                
                const calculatedTotal = cardData.breakdown_total;
                const currentTotal = cardData.student.ipt_total;
                
                if (calculatedTotal !== currentTotal) {
                    discrepancies.push({
                        student_id: student.id,
                        nama: student.nama,
                        nis: student.nis,
                        kelas: student.kelas,
                        current_total: currentTotal,
                        calculated_total: calculatedTotal,
                        difference: calculatedTotal - currentTotal
                    });
                }
            } catch (error) {
                console.error(`Error checking student ${student.id}:`, error);
            }
        }
        
        res.json({
            total_students: students.length,
            discrepancies_found: discrepancies.length,
            discrepancies: discrepancies.length > 0 ? discrepancies : []
        });
    } catch (error) {
        console.error('Error checking sync status:', error);
        res.status(500).json({ message: 'Server error during status check' });
    }
});

module.exports = router;