-- Migration: IPC -> IPT rebrand (Mandara Talenta)
-- Renames tables/columns/triggers/indexes from ipc_* to ipt_* and updates
-- config keys (min_ipc -> min_ipt, ipc_awal_* -> ipt_awal_*) plus the default
-- school description. Safe to run multiple times (each step checks existence).
--
-- Usage (existing database, e.g. ipc_school):
--   psql -U postgres -d ipc_school -f migrate_ipc_to_ipt.sql
--
-- NOTE: this does NOT rename the database itself. Fresh installs use `ipt_school`
-- (see backend/.env.example). To rename an existing DB after migrating tables:
--   ALTER DATABASE ipc_school RENAME TO ipt_school;
-- and update backend/.env DB_NAME accordingly. Alternatively keep the DB name
-- and only migrate tables/columns with this file.

-- ==================== TABLES ====================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_config')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_config') THEN
        ALTER TABLE ipc_config RENAME TO ipt_config;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_organisasi')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_organisasi') THEN
        ALTER TABLE ipc_organisasi RENAME TO ipt_organisasi;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_perilaku_karakter')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_perilaku_karakter') THEN
        ALTER TABLE ipc_perilaku_karakter RENAME TO ipt_perilaku_karakter;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_perilaku_tingkat')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_perilaku_tingkat') THEN
        ALTER TABLE ipc_perilaku_tingkat RENAME TO ipt_perilaku_tingkat;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_pelanggaran_level')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_pelanggaran_level') THEN
        ALTER TABLE ipc_pelanggaran_level RENAME TO ipt_pelanggaran_level;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_pelanggaran_detail')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_pelanggaran_detail') THEN
        ALTER TABLE ipc_pelanggaran_detail RENAME TO ipt_pelanggaran_detail;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipc_history')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_history') THEN
        ALTER TABLE ipc_history RENAME TO ipt_history;
    END IF;
END $$;

-- ==================== COLUMNS ====================
-- users.ipc_total -> users.ipt_total
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ipc_total')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ipt_total') THEN
        ALTER TABLE users RENAME COLUMN ipc_total TO ipt_total;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ipc_awal')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ipt_awal') THEN
        ALTER TABLE users RENAME COLUMN ipc_awal TO ipt_awal;
    END IF;
END $$;

-- siswa_approvals.ipc_awal -> siswa_approvals.ipt_awal
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'siswa_approvals')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'siswa_approvals' AND column_name = 'ipc_awal')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'siswa_approvals' AND column_name = 'ipt_awal') THEN
        ALTER TABLE siswa_approvals RENAME COLUMN ipc_awal TO ipt_awal;
    END IF;
END $$;

-- ipt_history.ipc_sebelum/ipc_sesudah -> ipt_sebelum/ipt_sesudah
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ipt_history') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ipt_history' AND column_name = 'ipc_sebelum')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ipt_history' AND column_name = 'ipt_sebelum') THEN
            ALTER TABLE ipt_history RENAME COLUMN ipc_sebelum TO ipt_sebelum;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ipt_history' AND column_name = 'ipc_sesudah')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ipt_history' AND column_name = 'ipt_sesudah') THEN
            ALTER TABLE ipt_history RENAME COLUMN ipc_sesudah TO ipt_sesudah;
        END IF;
    END IF;
END $$;

-- ==================== CONFIG KEYS ====================
-- min_ipc -> min_ipt, ipc_awal_X/XI/XII -> ipt_awal_X/XI/XII
UPDATE ipt_config SET field1 = 'min_ipt'
WHERE category = 'pengaturan' AND field1 = 'min_ipc';

UPDATE ipt_config SET field1 = REPLACE(field1, 'ipc_awal_', 'ipt_awal_')
WHERE category = 'pengaturan' AND field1 LIKE 'ipc_awal\_%' ESCAPE '\';

UPDATE ipt_config
SET description = REPLACE(description, 'IPC', 'IPT')
WHERE description LIKE '%IPC%';

UPDATE ipt_config
SET description = REPLACE(description, 'Total IPT - total', 'Total IPT - total')
WHERE category = 'pengaturan' AND field1 = 'min_ipt';

-- Default school description rebrand (only touches the shipped default text)
UPDATE school_config
SET school_description = 'Mandara Talenta (Manajemen dan Pengembangan Karakter Talenta) • Panel Admin'
WHERE school_description = 'Sistem Individual Point Card (IPC) • Panel Admin'
   OR school_description LIKE '%Individual Point Card%IPT%'
   OR school_description LIKE '%Sistem IPC%';

-- ==================== TRIGGERS ====================
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT trigger_name, event_object_table
             FROM information_schema.triggers
             WHERE trigger_name LIKE 'trg_ipc\_%' ESCAPE '\' LOOP
        BEGIN
            EXECUTE format('ALTER TRIGGER %I ON %I RENAME TO %I',
                r.trigger_name, r.event_object_table,
                REPLACE(r.trigger_name, 'trg_ipc_', 'trg_ipt_'));
        EXCEPTION WHEN others THEN NULL;
        END;
    END LOOP;
END $$;

-- ==================== INDEXES ====================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ipc_config_category') THEN
        ALTER INDEX idx_ipc_config_category RENAME TO idx_ipt_config_category;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ipc_config_field1') THEN
        ALTER INDEX idx_ipc_config_field1 RENAME TO idx_ipt_config_field1;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ipc_config_field2') THEN
        ALTER INDEX idx_ipc_config_field2 RENAME TO idx_ipt_config_field2;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ipc_config_active') THEN
        ALTER INDEX idx_ipc_config_active RENAME TO idx_ipt_config_active;
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;
