// Client-side mirror of backend/utils/evidenceUpload.js policy.
// Keep both in sync: images + PDF, 10MB max.
export const EVIDENCE_MAX_SIZE = 10 * 1024 * 1024; // 10MB

const EVIDENCE_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
];

const EVIDENCE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];

// Returns an Indonesian error message, or null when the file is acceptable.
export function validateEvidenceFile(file) {
    if (!file) return null;
    const ext = '.' + (String(file.name).split('.').pop() || '').toLowerCase();
    if (!EVIDENCE_MIMETYPES.includes(file.type) || !EVIDENCE_EXTENSIONS.includes(ext)) {
        return 'File harus berupa gambar (JPG, PNG, GIF, WebP) atau PDF.';
    }
    if (file.size > EVIDENCE_MAX_SIZE) {
        return 'Ukuran file maksimal 10MB.';
    }
    return null;
}
