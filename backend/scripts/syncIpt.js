const db = require('../config/database');
const { buildIptCardBreakdown } = require('../utils/iptCardBreakdown');

/**
 * IPT Synchronization Script
 * 
 * This script recalculates and synchronizes IPT totals for all students
 * based on the actual breakdown data from database.
 * 
 * Usage: node scripts/syncIpt.js
 */

async function syncStudentIPT(userId) {
    try {
        console.log(`Syncing IPT for user ID: ${userId}`);
        
        // Get the accurate breakdown from database
        const cardData = await buildIptCardBreakdown(userId);
        
        if (!cardData) {
            console.log(`  - Student not found`);
            return false;
        }
        
        const calculatedTotal = cardData.breakdown_total;
        const currentTotal = cardData.student.ipt_total;
        
        // Get current breakdown for logging
        const points = cardData.points;
        
        console.log(`  - Current IPT: ${currentTotal}`);
        console.log(`  - Calculated IPT: ${calculatedTotal}`);
        console.log(`  - Breakdown:`, {
            point_awal: points.point_awal,
            prestasi: points.prestasi,
            karakter: points.tanggung_jawab + points.disiplin + points.kepedulian + 
                      points.kemandirian + points.spiritual + points.kejujuran + points.kepercayaan_diri,
            organisasi: points.organisasi,
            kepanitiaan: points.kepanitiaan,
            event: points.event,
            pelanggaran: -(points.pelanggaran_ringan + points.pelanggaran_sedang + points.pelanggaran_berat)
        });
        
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
                [userId, calculatedTotal - currentTotal, currentTotal, calculatedTotal, 'IPT Synchronization']
            );
            
            console.log(`  - ✅ Updated: ${currentTotal} → ${calculatedTotal} (diff: ${calculatedTotal - currentTotal})`);
            return true;
        } else {
            console.log(`  - ✅ Already synchronized`);
            return false;
        }
    } catch (error) {
        console.error(`  - ❌ Error syncing user ${userId}:`, error.message);
        return false;
    }
}

async function syncAllStudents() {
    try {
        console.log('🔄 Starting IPT Synchronization...\n');
        
        // Get all students
        const [students] = await db.query(
            "SELECT id, nama, nis, kelas, ipt_total FROM users WHERE role = 'siswa' AND (is_graduated = 0 OR is_graduated IS NULL)"
        );
        
        console.log(`Found ${students.length} students\n`);
        
        let updatedCount = 0;
        let alreadySyncedCount = 0;
        let errorCount = 0;
        
        for (const student of students) {
            console.log(`👤 ${student.nama} (${student.nis}) - ${student.kelas}`);
            
            const wasUpdated = await syncStudentIPT(student.id);
            
            if (wasUpdated) {
                updatedCount++;
            } else {
                alreadySyncedCount++;
            }
            
            console.log(''); // Empty line for readability
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Synchronization Summary:');
        console.log(`   Total students: ${students.length}`);
        console.log(`   ✅ Updated: ${updatedCount}`);
        console.log(`   ✓ Already synced: ${alreadySyncedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (updatedCount > 0) {
            console.log('\n✨ IPT synchronization completed successfully!');
        } else {
            console.log('\n✨ All IPTs are already synchronized!');
        }
        
    } catch (error) {
        console.error('❌ Fatal error during synchronization:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run the synchronization
syncAllStudents();