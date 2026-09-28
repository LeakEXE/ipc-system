const db = require('../config/database');

// Cache for IPC configurations to avoid frequent database queries
let configCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get IPC configuration from database with caching.
 * Shape matches what calculators expect:
 * - prestasi.byKey['tingkat|juara'] / prestasi.juara[juara] (legacy)
 * - organisasi.byKey['org|jabatan'] / organisasi.jabatan[jabatan] (legacy)
 * - kepanitiaan.jabatan[jabatan]
 * - event.tingkat[tingkat]
 * - pelanggaran.jenis[level]
 * - perilaku.byKey['character|rating'] / perilaku.karakter[rating] (legacy)
 */
async function getIPCConfig() {
  const now = Date.now();

  if (configCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return configCache;
  }

  try {
    const [configs] = await db.query(`
      SELECT category, field1, field2, point_value
      FROM ipc_config
      WHERE is_active = TRUE
      ORDER BY category, field1, field2
    `);

    const grouped = {
      prestasi: { juara: {}, byKey: {} },
      organisasi: { jabatan: {}, byKey: {} },
      kepanitiaan: { jabatan: {} },
      event: { tingkat: {} },
      pelanggaran: { jenis: {} },
      perilaku: { karakter: {}, byKey: {} }
    };

    configs.forEach((config) => {
      const { category, field1, field2, point_value } = config;
      if (!field1) return;

      if (category === 'prestasi') {
        const juara = field2 || field1;
        grouped.prestasi.juara[juara] = point_value;
        if (field2) {
          grouped.prestasi.byKey[`${field1}|${field2}`] = point_value;
        }
      } else if (category === 'organisasi') {
        if (field2) {
          grouped.organisasi.jabatan[field2] = point_value;
          grouped.organisasi.byKey[`${field1}|${field2}`] = point_value;
        } else {
          grouped.organisasi.jabatan[field1] = point_value;
        }
      } else if (category === 'kepanitiaan') {
        grouped.kepanitiaan.jabatan[field1] = point_value;
      } else if (category === 'event') {
        grouped.event.tingkat[field1] = point_value;
      } else if (category === 'pelanggaran') {
        grouped.pelanggaran.jenis[field1] = point_value;
      } else if (category === 'perilaku') {
        if (field2) {
          grouped.perilaku.karakter[field2] = point_value;
          grouped.perilaku.byKey[`${field1}|${field2}`] = point_value;
        } else {
          grouped.perilaku.karakter[field1] = point_value;
        }
      }
    });

    // Merge pelanggaran levels from dedicated table
    try {
      const [levels] = await db.query(
        `SELECT name, point_value FROM ipc_pelanggaran_level WHERE is_active = TRUE`
      );
      levels.forEach((level) => {
        grouped.pelanggaran.jenis[level.name] = level.point_value;
      });
    } catch (_) {
      // Table may not exist on older DBs
    }

    configCache = grouped;
    cacheTimestamp = now;
    return grouped;
  } catch (error) {
    console.error('Error fetching IPC configuration:', error);
    return getDefaultConfig();
  }
}

/**
 * Clear the configuration cache (call after updating config)
 */
function clearConfigCache() {
  configCache = null;
  cacheTimestamp = null;
}

// ---- IPC awal defaults per grade (X, XI, XII) ----
// Stored in ipc_config (category='pengaturan', field1='ipc_awal_X' | ...).
// Queried directly (uncached): values change rarely but must be fresh when
// creating students. Missing rows fall back to IPC_AWAL_DEFAULT.
const IPC_AWAL_DEFAULT = 80;
const IPC_AWAL_GRADES = ['X', 'XI', 'XII'];
const ipcAwalField = (grade) => `ipc_awal_${grade}`;

function gradePrefixFromKelas(kelas) {
  if (!kelas) return null;
  const prefix = String(kelas).split(' ')[0].toUpperCase();
  return IPC_AWAL_GRADES.includes(prefix) ? prefix : null;
}

async function getIpcAwalPerGrade() {
  const result = { X: IPC_AWAL_DEFAULT, XI: IPC_AWAL_DEFAULT, XII: IPC_AWAL_DEFAULT };
  try {
    const [rows] = await db.query(
      `SELECT field1, point_value FROM ipc_config
       WHERE category = 'pengaturan' AND field1 IN ('ipc_awal_X', 'ipc_awal_XI', 'ipc_awal_XII')`
    );
    for (const row of rows) {
      const grade = String(row.field1).replace('ipc_awal_', '');
      const value = parseInt(row.point_value, 10);
      if (IPC_AWAL_GRADES.includes(grade) && Number.isFinite(value) && value >= 0) {
        result[grade] = value;
      }
    }
  } catch (error) {
    console.error('Error fetching IPC awal per grade:', error.message);
  }
  return result;
}

async function getIpcAwalForGrade(gradePrefix) {
  if (!IPC_AWAL_GRADES.includes(gradePrefix)) return IPC_AWAL_DEFAULT;
  const all = await getIpcAwalPerGrade();
  return all[gradePrefix];
}

/**
 * Get default configuration (fallback) — aligned with ipc_config_schema.sql
 */
function getDefaultConfig() {
  return {
    prestasi: {
      juara: {
        'juara_i': 5,
        'juara_ii': 4,
        'juara_iii': 3,
        'harapan_i': 2,
        'harapan_ii': 2,
        'harapan_iii': 1,
        finalis: 1,
        peserta: 1
      },
      byKey: {}
    },
    organisasi: {
      jabatan: {
        ketua: 5,
        'wakil ketua': 4,
        sekretaris: 4,
        bendahara: 3,
        koordinator: 2,
        anggota: 1
      },
      byKey: {}
    },
    kepanitiaan: {
      jabatan: {
        ketua: 5,
        'wakil ketua': 4,
        sekretaris: 4,
        bendahara: 3,
        koordinator: 2,
        anggota: 1
      }
    },
    event: {
      tingkat: {
        sekolah: 2,
        kecamatan: 4,
        kabupaten: 6,
        provinsi: 8,
        nasional: 10,
        internasional: 12
      }
    },
    pelanggaran: {
      jenis: {
        ringan: -1,
        sedang: -5,
        berat: -25
      }
    },
    perilaku: {
      karakter: {
        'kurang baik': 1,
        'cukup baik': 2,
        baik: 3,
        'sangat baik': 4
      },
      byKey: {}
    }
  };
}

module.exports = {
  getIPCConfig,
  clearConfigCache,
  getDefaultConfig,
  getIpcAwalPerGrade,
  getIpcAwalForGrade,
  gradePrefixFromKelas,
  IPC_AWAL_DEFAULT,
  IPC_AWAL_GRADES
};
