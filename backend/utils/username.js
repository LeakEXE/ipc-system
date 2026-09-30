const db = require('../config/database');

// Username policy: 5-20 chars, letters + numbers + !@#_ only (no spaces possible).
const USERNAME_RE = /^[A-Za-z0-9!@#_]{5,20}$/;
const USERNAME_MIN = 5;
const USERNAME_MAX = 20;

// Returns null when valid, otherwise an Indonesian error message.
function validateUsernameFormat(username) {
    if (typeof username !== 'string' || username.length === 0) {
        return 'Username wajib diisi';
    }
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
        return `Username harus ${USERNAME_MIN}-${USERNAME_MAX} karakter`;
    }
    if (!USERNAME_RE.test(username)) {
        return 'Username hanya boleh berisi huruf, angka, dan !@#_ (tanpa spasi)';
    }
    return null;
}

// Case-insensitive availability check (optionally excluding one user id,
// so users can keep their own name).
async function isUsernameAvailable(username, excludeUserId = null) {
    const params = [username];
    let sql = 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)';
    if (excludeUserId !== null && excludeUserId !== undefined) {
        sql += ' AND id <> ?';
        params.push(excludeUserId);
    }
    const [rows] = await db.query(sql, params);
    return rows.length === 0;
}

// Auto-generate a unique username from a person's name.
// Long names are truncated so base + digits never exceed 20 chars;
// short/empty names fall back to 'user' + digits (always >= 5 chars).
async function generateUsername(nama) {
    const slug = String(nama || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    for (let attempt = 0; attempt < 25; attempt++) {
        const digitsLen = attempt < 15 ? 4 : 6;
        const rand = String(Math.floor(Math.random() * Math.pow(10, digitsLen))).padStart(digitsLen, '0');
        const base = slug.slice(0, USERNAME_MAX - digitsLen);
        const candidate = (base + rand).slice(0, USERNAME_MAX);
        if (candidate.length < USERNAME_MIN) continue;
        if (validateUsernameFormat(candidate)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await isUsernameAvailable(candidate)) {
            return candidate;
        }
    }
    // Practically unreachable: timestamp fallback guarantees uniqueness.
    const fallback = `user${Date.now().toString(36)}`.slice(0, USERNAME_MAX);
    if (await isUsernameAvailable(fallback)) {
        return fallback;
    }
    throw new Error('Gagal membuat username unik, coba lagi');
}

module.exports = {
    USERNAME_RE,
    USERNAME_MIN,
    USERNAME_MAX,
    validateUsernameFormat,
    isUsernameAvailable,
    generateUsername
};
