-- ============================================================
-- ParkEase v2 — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor once after creating the project
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS (one per parking business / company)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  license_status TEXT NOT NULL DEFAULT 'TRIAL', -- TRIAL | ACTIVE | EXPIRED
  license_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (linked to Supabase Auth — one row per login)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'WATCHMAN', -- SUPER_ADMIN | MANAGER | WATCHMAN
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- ============================================================
-- SETTINGS (per tenant — UPI, rates, branding, zones)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT 'My Parking',
  address TEXT,
  phone TEXT,
  email TEXT,
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  total_slots INTEGER NOT NULL DEFAULT 50,
  grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  gst_percent REAL NOT NULL DEFAULT 0,
  receipt_footer TEXT DEFAULT 'Thank you for using our parking!',
  -- Payment config (editable by manager)
  upi_id TEXT,
  upi_phone TEXT,
  upi_qr_url TEXT,
  upi_payee_name TEXT,
  -- Rates per vehicle type
  rate_two_wheeler_first REAL NOT NULL DEFAULT 20,
  rate_two_wheeler_per_hour REAL NOT NULL DEFAULT 10,
  rate_four_wheeler_first REAL NOT NULL DEFAULT 40,
  rate_four_wheeler_per_hour REAL NOT NULL DEFAULT 20,
  rate_heavy_first REAL NOT NULL DEFAULT 80,
  rate_heavy_per_hour REAL NOT NULL DEFAULT 40,
  -- Zone parking (optional feature — Super Admin enables per tenant)
  zones_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARKING ZONES (optional — configured per tenant by Super Admin, then manager)
-- e.g. "Left Wing", "Row A", "Ground Floor", "B2 Level"
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  total_slots INTEGER NOT NULL DEFAULT 10,
  zone_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARKING RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_no TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT '2-Wheeler',
  driver_name TEXT,
  driver_phone TEXT,
  slot_no TEXT,
  zone_id UUID REFERENCES parking_zones(id),
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  amount_charged REAL DEFAULT 0,
  payment_mode TEXT,
  status TEXT NOT NULL DEFAULT 'PARKED', -- PARKED | EXITED
  operator_name TEXT,
  notes TEXT,
  plate_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, ticket_no)
);

-- ============================================================
-- PAYMENTS (ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_no TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  transaction_ref TEXT,
  collected_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- ============================================================
-- MONTHLY PASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_passes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_phone TEXT,
  slot_no TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount_paid REAL DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, vehicle_number)
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_records_tenant_status ON parking_records(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_records_vehicle ON parking_records(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_records_entry_time ON parking_records(entry_time);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_passes_tenant ON monthly_passes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zones_tenant ON parking_zones(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE parking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_zones ENABLE ROW LEVEL SECURITY;

-- Secure helper function (avoids recursive RLS loops)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- USERS: can read own row + same-tenant rows (managers see their staff)
CREATE POLICY "users_read" ON users
  USING (
    id = auth.uid()
    OR tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

CREATE POLICY "users_write" ON users FOR INSERT WITH CHECK (
  get_my_role() IN ('SUPER_ADMIN', 'MANAGER')
);

CREATE POLICY "users_update" ON users FOR UPDATE
  USING (id = auth.uid() OR get_my_role() IN ('SUPER_ADMIN', 'MANAGER'));

-- TENANTS: Super Admin sees all, others see their own
CREATE POLICY "tenants_read" ON tenants
  USING (
    get_my_role() = 'SUPER_ADMIN'
    OR id = get_my_tenant_id()
  );

CREATE POLICY "tenants_write" ON tenants FOR INSERT WITH CHECK (get_my_role() = 'SUPER_ADMIN');
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (get_my_role() = 'SUPER_ADMIN');

-- PARKING_RECORDS: tenant isolation
CREATE POLICY "records_tenant" ON parking_records
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

-- PAYMENTS: tenant isolation
CREATE POLICY "payments_tenant" ON payments
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

-- SETTINGS: tenant isolation
CREATE POLICY "settings_tenant" ON settings
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

-- PARKING_ZONES: tenant isolation
CREATE POLICY "zones_tenant" ON parking_zones
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

CREATE POLICY "zones_write" ON parking_zones FOR INSERT WITH CHECK (
  get_my_role() IN ('SUPER_ADMIN', 'MANAGER')
  AND (tenant_id = get_my_tenant_id() OR get_my_role() = 'SUPER_ADMIN')
);

CREATE POLICY "zones_update" ON parking_zones FOR UPDATE
  USING (get_my_role() IN ('SUPER_ADMIN', 'MANAGER'));

-- MONTHLY_PASSES: tenant isolation
CREATE POLICY "passes_tenant" ON monthly_passes
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

-- AUDIT_LOG
CREATE POLICY "audit_tenant" ON audit_log
  USING (
    tenant_id = get_my_tenant_id()
    OR get_my_role() = 'SUPER_ADMIN'
  );

-- ============================================================
-- STORAGE BUCKET for QR codes
-- ============================================================
-- Run separately in Supabase Dashboard > Storage > New Bucket:
-- Name: qr-codes, Public: true

-- ============================================================
-- REALTIME
-- ============================================================
-- Enable in: Database > Replication > parking_records, payments, parking_zones
