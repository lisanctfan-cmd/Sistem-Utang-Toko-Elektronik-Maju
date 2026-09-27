-- 1. Tambah kolom bukti_url pada tabel invoices dan payments jika belum ada
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bukti_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- 2. Tabel attachments (opsional untuk riwayat lampiran)
DROP TABLE IF EXISTS attachments CASCADE;
CREATE TABLE attachments (
    id BIGSERIAL PRIMARY KEY,
    related_type VARCHAR(20) NOT NULL,
    related_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_attachments_related ON attachments(related_type, related_id);

-- 3. Matikan RLS semua tabel (biar simpel, tanpa login)
ALTER TABLE suppliers   DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices    DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments    DISABLE ROW LEVEL SECURITY;
ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;

-- 4. Buat bucket storage 'bukti'
INSERT INTO storage.buckets (id, name, public)
VALUES ('bukti', 'bukti', true)
ON CONFLICT (id) DO UPDATE SET public = true;