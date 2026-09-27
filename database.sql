-- ============================================================
-- SQL UNTUK SUPABASE (JALANKAN DI SQL EDITOR)
-- ============================================================

-- 1. Buat kolom syarat_pembayaran & diskon bersifat fleksibel / opsional (boleh NULL atau bernilai '-')
ALTER TABLE invoices ALTER COLUMN syarat_pembayaran DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN syarat_pembayaran SET DEFAULT '-';

ALTER TABLE invoices ALTER COLUMN net_hari DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN net_hari SET DEFAULT 0;

ALTER TABLE invoices ALTER COLUMN diskon_persen DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN diskon_persen SET DEFAULT 0;

ALTER TABLE invoices ALTER COLUMN diskon_hari DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN diskon_hari SET DEFAULT 0;

ALTER TABLE invoices ALTER COLUMN keterangan DROP NOT NULL;

-- 2. Pastikan tabel payments juga fleksibel
ALTER TABLE payments ALTER COLUMN diskon_didapat DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN diskon_didapat SET DEFAULT 0;

ALTER TABLE payments ALTER COLUMN denda_dikenakan DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN denda_dikenakan SET DEFAULT 0;

ALTER TABLE payments ALTER COLUMN keterangan DROP NOT NULL;

-- 3. Matikan Row Level Security (RLS) agar penyimpanan dari web tidak pernah diblokir
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices  DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments  DISABLE ROW LEVEL SECURITY;

-- 4. Berikan hak akses penuh ke role anon dan authenticated
GRANT ALL ON TABLE suppliers TO anon, authenticated, service_role;
GRANT ALL ON TABLE invoices  TO anon, authenticated, service_role;
GRANT ALL ON TABLE payments  TO anon, authenticated, service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;