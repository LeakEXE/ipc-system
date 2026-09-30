const db = require('../config/database');

const DEFAULT_SCHOOL_CONFIG = {
    school_name: 'SMK Negeri Bali Mandara',
    school_description: 'Mandara Talenta (Manajemen dan Pengembangan Karakter Talenta) • Panel Admin',
    principal_name: 'Nama Kepala Sekolah',
    principal_nip: '',
    logo_url: null,
};

// Single-row school branding/identity used across report PDFs.
// Never throws: falls back to defaults so PDF generation keeps working
// even when the table is empty or unreachable.
async function getSchoolConfig() {
    try {
        const [rows] = await db.query(
            'SELECT school_name, school_description, principal_name, principal_nip, logo_url FROM school_config LIMIT 1'
        );
        if (!rows || rows.length === 0) {
            return { ...DEFAULT_SCHOOL_CONFIG };
        }
        const row = rows[0];
        return {
            school_name: row.school_name || DEFAULT_SCHOOL_CONFIG.school_name,
            school_description: row.school_description || DEFAULT_SCHOOL_CONFIG.school_description,
            principal_name: row.principal_name || DEFAULT_SCHOOL_CONFIG.principal_name,
            principal_nip: row.principal_nip || '',
            logo_url: row.logo_url || null,
        };
    } catch (e) {
        return { ...DEFAULT_SCHOOL_CONFIG };
    }
}

// Signature block for PDF templates (single await at the call site).
async function getSchoolSignature() {
    const cfg = await getSchoolConfig();
    return {
        school_name: cfg.school_name,
        nama_kepala_sekolah: cfg.principal_name,
        nip_kepala_sekolah: cfg.principal_nip,
    };
}

module.exports = { getSchoolConfig, getSchoolSignature, DEFAULT_SCHOOL_CONFIG };
