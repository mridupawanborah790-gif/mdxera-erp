// SQLite schema — mirrors the Supabase PostgreSQL schema.
// All UUIDs → TEXT, timestamptz → TEXT, jsonb → TEXT (JSON string), boolean → INTEGER (0/1)
// Every table includes _sync_status and _local_only for the sync engine.
export const SQL_001_INITIAL = `
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  pharmacy_name TEXT,
  manager_name TEXT,
  role TEXT DEFAULT 'clerk',
  is_active INTEGER DEFAULT 1,
  address TEXT, address_line2 TEXT, pincode TEXT, district TEXT, state TEXT,
  mobile TEXT, gstin TEXT, retailer_gstin TEXT, drug_license TEXT,
  dl_valid_to TEXT, food_license TEXT, pan_number TEXT,
  bank_account_name TEXT, bank_account_number TEXT, bank_ifsc_code TEXT,
  bank_upi_id TEXT, authorized_signatory TEXT, pharmacy_logo_url TEXT,
  terms_and_conditions TEXT, purchase_order_terms TEXT,
  subscription_plan TEXT DEFAULT 'starter',
  subscription_status TEXT DEFAULT 'active',
  subscription_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS configurations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  invoice_config TEXT, non_gst_invoice_config TEXT, purchase_config TEXT,
  purchase_order_config TEXT, medicine_master_config TEXT,
  physical_inventory_config TEXT, delivery_challan_config TEXT,
  sales_challan_config TEXT, master_shortcuts TEXT, display_options TEXT,
  modules TEXT, sidebar TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS business_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  work_centers TEXT DEFAULT '[]',
  permissions_matrix TEXT DEFAULT '{}',
  is_system_role INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  technical_id TEXT,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'clerk',
  status TEXT DEFAULT 'active',
  employee_id TEXT,
  department TEXT,
  is_locked INTEGER DEFAULT 0,
  assigned_roles TEXT DEFAULT '[]',
  work_centers TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS material_master (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  material_code TEXT NOT NULL,
  barcode TEXT, brand TEXT, manufacturer TEXT, marketer TEXT,
  composition TEXT, pack TEXT, description TEXT, directions TEXT,
  gst_rate REAL DEFAULT 12,
  hsn_code TEXT,
  mrp REAL DEFAULT 0,
  rate_a REAL DEFAULT 0, rate_b REAL DEFAULT 0, rate_c REAL DEFAULT 0,
  valuation_method TEXT DEFAULT 'standard',
  standard_price_rate REAL DEFAULT 0,
  moving_average_rate REAL DEFAULT 0,
  is_prescription_required INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0,
  UNIQUE(organization_id, material_code)
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT DEFAULT 'General',
  batch TEXT NOT NULL,
  expiry TEXT,
  stock REAL DEFAULT 0,
  min_stock_limit REAL DEFAULT 10,
  units_per_pack INTEGER DEFAULT 1,
  pack_type TEXT,
  purchase_price REAL DEFAULT 0,
  ptr REAL DEFAULT 0,
  mrp REAL DEFAULT 0,
  rate_a REAL DEFAULT 0, rate_b REAL DEFAULT 0, rate_c REAL DEFAULT 0,
  gst_percent REAL DEFAULT 12,
  hsn_code TEXT, barcode TEXT, composition TEXT,
  supplier_name TEXT, rack_number TEXT,
  cost REAL DEFAULT 0, value REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  material_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inventory_org ON inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Wholesaler',
  supplier_group TEXT DEFAULT 'Sundry Creditors',
  control_gl_id TEXT,
  gst_number TEXT, phone TEXT, email TEXT, address TEXT, state TEXT, district TEXT,
  payment_details TEXT DEFAULT '{}',
  ledger TEXT DEFAULT '[]',
  opening_balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT, gst_number TEXT,
  ledger TEXT DEFAULT '[]',
  opening_balance REAL DEFAULT 0,
  default_discount REAL DEFAULT 0,
  customer_type TEXT DEFAULT 'regular',
  credit_limit REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);

CREATE TABLE IF NOT EXISTS sales_bill (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_id TEXT, customer_phone TEXT,
  items TEXT DEFAULT '[]',
  subtotal REAL DEFAULT 0,
  total_item_discount REAL DEFAULT 0,
  total_gst REAL DEFAULT 0,
  scheme_discount REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  payment_mode TEXT DEFAULT 'Cash',
  pricing_mode TEXT DEFAULT 'mrp',
  bill_type TEXT DEFAULT 'regular',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sales_bill_org ON sales_bill(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_bill_date ON sales_bill(date);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  purchase_serial_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  total_gst REAL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  pricing_mode TEXT DEFAULT 'rate',
  supplier_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_purchases_org ON purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  po_serial_id TEXT, supplier_id TEXT,
  supplier TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_challans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  challan_serial_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  pricing_mode TEXT DEFAULT 'rate',
  created_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_challans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  challan_serial_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  pricing_mode TEXT DEFAULT 'mrp',
  created_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  original_bill_id TEXT, customer_name TEXT,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  original_purchase_id TEXT, supplier TEXT,
  date TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS physical_inventory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  start_date TEXT NOT NULL,
  end_date TEXT,
  items TEXT DEFAULT '[]',
  total_variance_value REAL DEFAULT 0,
  performed_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_product_map (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_product_name TEXT NOT NULL,
  master_medicine_id TEXT NOT NULL,
  auto_apply INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS doctor_master (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  doctor_code TEXT,
  specialization TEXT, qualification TEXT, phone TEXT, address TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ewaybills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  ewb_number TEXT, invoice_id TEXT,
  status TEXT DEFAULT 'active',
  data TEXT DEFAULT '{}',
  generated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  rules TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  valid_from TEXT, valid_to TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mrp_change_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  inventory_id TEXT,
  old_mrp REAL, new_mrp REAL,
  changed_by TEXT, reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_price_list (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  material_id TEXT,
  discount_percent REAL DEFAULT 0,
  special_price REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mbc_cards (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  card_number TEXT UNIQUE,
  holder_name TEXT, phone TEXT,
  card_type TEXT DEFAULT 'gift',
  balance REAL DEFAULT 0,
  total_loaded REAL DEFAULT 0,
  total_used REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  transactions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gl_master (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  set_of_books_id TEXT,
  gl_code TEXT, gl_name TEXT NOT NULL,
  gl_type TEXT, parent_gl_id TEXT,
  is_control_account INTEGER DEFAULT 0,
  active_status INTEGER DEFAULT 1,
  opening_balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gl_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  set_of_books_id TEXT,
  assignment_type TEXT, gl_id TEXT, description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS company_codes (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  code TEXT, description TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS set_of_books (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  company_code_id TEXT,
  set_of_books_id TEXT, description TEXT,
  active_status INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sub_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  category_id TEXT, name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS distributors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
`;
