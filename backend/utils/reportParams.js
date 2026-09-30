// Query-param parsing for individual IPT printouts (dipakai PDF & Excel).
// Selalu jatuh kembali ke default yang aman bila input tidak valid.
const getRequestedSemester = (req) => {
    const s = String(req?.query?.semester || '').trim();
    return s === 'Genap' ? 'Genap' : 'Ganjil';
};

const getRequestedTahunPelajaran = (req) => {
    const tp = String(req?.query?.tahun_pelajaran || '').trim();
    if (/^\d{4}\/\d{4}$/.test(tp)) return tp;
    const y = new Date().getFullYear();
    return `${y}/${y + 1}`;
};

// Batas waktu inklusi point untuk cetakan: hanya record dengan
// created_at SEBELUM tanggal ini yang dihitung.
// Semester ganjil berakhir Des/Jan -> cutoff 1 Jan tahun kedua.
// Semester genap berakhir Jun/Jul -> cutoff 1 Jul tahun kedua.
// Mengembalikan string 'YYYY-MM-DD' (kompatibel dengan filter created_at < ?).
const getCutoffDate = (req) => {
    const semester = getRequestedSemester(req);
    const tp = getRequestedTahunPelajaran(req);
    const secondYear = Number(tp.split('/')[1]);
    if (!Number.isInteger(secondYear)) return null;
    return semester === 'Genap' ? `${secondYear}-07-01` : `${secondYear}-01-01`;
};

module.exports = { getRequestedSemester, getRequestedTahunPelajaran, getCutoffDate };
