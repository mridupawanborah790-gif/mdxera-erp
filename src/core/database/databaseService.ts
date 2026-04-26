
import { SQLocal } from 'sqlocal';

class DatabaseService {
    private sqlocal: SQLocal;
    public sql: SQLocal['sql'];
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        // Reverting to original name to restore existing user data
        this.sqlocal = new SQLocal('medimart_local.sqlite3');
        this.sql = this.sqlocal.sql;
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            console.log('Initializing local database (medimart_local)...');
            try {
                // The SQLocal worker might take a moment to be ready
                await new Promise(r => setTimeout(r, 150));
                
                await this.createTables();
                await this.runMigrations();
                
                // Verify a simple query to ensure the DB is truly writable/readable
                await this.exec('SELECT 1');
                
                this.initialized = true;
                console.log('Local database initialized successfully.');
            } catch (error) {
                console.error('Failed to initialize local database:', error);
                this.initPromise = null;
                throw error;
            }
        })();

        return this.initPromise;
    }

    private async runMigrations() {
        const addColumnIfMissing = async (table: string, column: string, definition: string) => {
            try {
                await this.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`Migration: Added ${column} to ${table}`);
            } catch {
                // Column likely already exists or table doesn't exist yet
            }
        };

        // Ensure audit columns exist on core tables if they were created by previous partial scripts
        const coreTables = [
            'company_codes', 'set_of_books', 'gl_master', 'gl_assignments', 'bank_master', 
            'users', 'profiles', 'inventory', 'material_master', 'suppliers', 'customers', 
            'sales_bill', 'purchases', 'sales_challans', 'delivery_challans', 
            'sales_returns', 'purchase_returns', 'purchase_orders', 'doctor_master',
            'team_members', 'business_roles', 'mrp_change_log', 'mbc_cards', 'mbc_card_types',
            'mbc_card_templates', 'ewaybills', 'physical_inventory', 'customer_price_list'
        ];
        
        for (const table of coreTables) {
            await addColumnIfMissing(table, 'created_by', 'TEXT');
            await addColumnIfMissing(table, 'updated_by', 'TEXT');
            await addColumnIfMissing(table, 'user_id', 'TEXT');
            await addColumnIfMissing(table, 'organization_id', 'TEXT');
        }

        // Set of Books
        await addColumnIfMissing('set_of_books', 'name', 'TEXT');
        await addColumnIfMissing('set_of_books', 'description', 'TEXT');
        await addColumnIfMissing('set_of_books', 'default_currency', 'TEXT');
        await addColumnIfMissing('set_of_books', 'default_customer_gl_id', 'TEXT');
        await addColumnIfMissing('set_of_books', 'default_supplier_gl_id', 'TEXT');
        await addColumnIfMissing('set_of_books', 'default_demo_bank_gl_id', 'TEXT');
        await addColumnIfMissing('set_of_books', 'default_bank_gl_id', 'TEXT');
        await addColumnIfMissing('set_of_books', 'posting_count', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('set_of_books', 'active_status', 'TEXT DEFAULT \'Active\'');

        // Company Codes
        await addColumnIfMissing('company_codes', 'description', 'TEXT');
        await addColumnIfMissing('company_codes', 'status', 'TEXT DEFAULT \'Active\'');
        await addColumnIfMissing('company_codes', 'is_default', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('company_codes', 'default_set_of_books_id', 'TEXT');

        // GL Master
        await addColumnIfMissing('gl_master', 'gl_type', 'TEXT');
        await addColumnIfMissing('gl_master', 'account_group', 'TEXT');
        await addColumnIfMissing('gl_master', 'subgroup', 'TEXT');
        await addColumnIfMissing('gl_master', 'alias', 'TEXT');
        await addColumnIfMissing('gl_master', 'mapping_structure', 'TEXT');
        await addColumnIfMissing('gl_master', 'posting_allowed', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('gl_master', 'control_account', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('gl_master', 'active_status', 'TEXT DEFAULT \'Active\'');
        await addColumnIfMissing('gl_master', 'seeded_by_system', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('gl_master', 'template_version', 'TEXT');
        await addColumnIfMissing('gl_master', 'posting_count', 'INTEGER DEFAULT 0');

        // GL Assignments
        await addColumnIfMissing('gl_assignments', 'assignment_scope', 'TEXT NOT NULL DEFAULT \'MATERIAL\'');
        await addColumnIfMissing('gl_assignments', 'party_type', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'party_group', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'material_master_type', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'control_gl_id', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'inventory_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'purchase_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'cogs_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'sales_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'discount_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'tax_gl', 'TEXT');
        await addColumnIfMissing('gl_assignments', 'seeded_by_system', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('gl_assignments', 'active_status', 'TEXT DEFAULT \'Active\'');

        // Material Master
        await addColumnIfMissing('material_master', 'material_code', 'TEXT NOT NULL');
        await addColumnIfMissing('material_master', 'default_discount_percent', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'scheme_percent', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'scheme_type', 'TEXT');
        await addColumnIfMissing('material_master', 'scheme_calculation_basis', 'TEXT');
        await addColumnIfMissing('material_master', 'scheme_format', 'TEXT');
        await addColumnIfMissing('material_master', 'scheme_rate', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'master_price_maintains', 'TEXT');
        await addColumnIfMissing('material_master', 'country_of_origin', 'TEXT DEFAULT \'India\'');
        await addColumnIfMissing('material_master', 'material_master_type', 'TEXT');
        await addColumnIfMissing('material_master', 'is_inventorised', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('material_master', 'is_sales_enabled', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('material_master', 'is_purchase_enabled', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('material_master', 'is_production_enabled', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('material_master', 'is_internal_issue_enabled', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('material_master', 'directions', 'TEXT');
        await addColumnIfMissing('material_master', 'is_prescription_required', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('material_master', 'composition', 'TEXT');
        await addColumnIfMissing('material_master', 'pack', 'TEXT');
        await addColumnIfMissing('material_master', 'barcode', 'TEXT');
        await addColumnIfMissing('material_master', 'brand', 'TEXT');
        await addColumnIfMissing('material_master', 'manufacturer', 'TEXT');
        await addColumnIfMissing('material_master', 'marketer', 'TEXT');
        await addColumnIfMissing('material_master', 'description', 'TEXT');
        await addColumnIfMissing('material_master', 'gst_rate', 'REAL DEFAULT 12');
        await addColumnIfMissing('material_master', 'hsn_code', 'TEXT');
        await addColumnIfMissing('material_master', 'mrp', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'rate_a', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'rate_b', 'REAL DEFAULT 0');
        await addColumnIfMissing('material_master', 'rate_c', 'REAL DEFAULT 0');

        // Inventory
        await addColumnIfMissing('inventory', 'brand', 'TEXT');
        await addColumnIfMissing('inventory', 'category', 'TEXT DEFAULT \'General\'');
        await addColumnIfMissing('inventory', 'manufacturer', 'TEXT');
        await addColumnIfMissing('inventory', 'unit_of_measurement', 'TEXT');
        await addColumnIfMissing('inventory', 'pack_unit', 'TEXT');
        await addColumnIfMissing('inventory', 'base_unit', 'TEXT');
        await addColumnIfMissing('inventory', 'outer_pack', 'TEXT');
        await addColumnIfMissing('inventory', 'units_per_outer_pack', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('inventory', 'deal', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'free', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'code', 'TEXT');
        await addColumnIfMissing('inventory', 'description', 'TEXT');
        await addColumnIfMissing('inventory', 'purchase_deal', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'purchase_free', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'tax_basis', 'TEXT');
        await addColumnIfMissing('inventory', 'supplier_name', 'TEXT');
        await addColumnIfMissing('inventory', 'rack_number', 'TEXT');
        await addColumnIfMissing('inventory', 'cost', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'value', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'composition', 'TEXT');
        await addColumnIfMissing('inventory', 'barcode', 'TEXT');
        await addColumnIfMissing('inventory', 'ptr', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'pack_type', 'TEXT');
        await addColumnIfMissing('inventory', 'min_stock_limit', 'REAL DEFAULT 10');
        await addColumnIfMissing('inventory', 'units_per_pack', 'INTEGER DEFAULT 1');
        await addColumnIfMissing('inventory', 'purchase_price', 'REAL DEFAULT 0');
        await addColumnIfMissing('inventory', 'gst_percent', 'REAL DEFAULT 12');

        // Customers
        await addColumnIfMissing('customers', 'address_line1', 'TEXT');
        await addColumnIfMissing('customers', 'address_line2', 'TEXT');
        await addColumnIfMissing('customers', 'area', 'TEXT');
        await addColumnIfMissing('customers', 'city', 'TEXT');
        await addColumnIfMissing('customers', 'pincode', 'TEXT');
        await addColumnIfMissing('customers', 'district', 'TEXT');
        await addColumnIfMissing('customers', 'state', 'TEXT');
        await addColumnIfMissing('customers', 'country', 'TEXT');
        await addColumnIfMissing('customers', 'drug_license', 'TEXT');
        await addColumnIfMissing('customers', 'pan_number', 'TEXT');
        await addColumnIfMissing('customers', 'default_rate_tier', 'TEXT');
        await addColumnIfMissing('customers', 'assigned_staff_id', 'TEXT');
        await addColumnIfMissing('customers', 'assigned_staff_name', 'TEXT');
        await addColumnIfMissing('customers', 'customer_group', 'TEXT');
        await addColumnIfMissing('customers', 'control_gl_id', 'TEXT');
        await addColumnIfMissing('customers', 'enable_credit_limit', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('customers', 'credit_limit', 'REAL DEFAULT 0');
        await addColumnIfMissing('customers', 'credit_days', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('customers', 'credit_status', 'TEXT DEFAULT \'active\'');
        await addColumnIfMissing('customers', 'credit_control_mode', 'TEXT DEFAULT \'warning_only\'');
        await addColumnIfMissing('customers', 'allow_override', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('customers', 'override_approval_required', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('customers', 'is_blocked', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('customers', 'customer_type', 'TEXT DEFAULT \'regular\'');
        await addColumnIfMissing('customers', 'default_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('customers', 'gst_number', 'TEXT');

        // Suppliers
        await addColumnIfMissing('suppliers', 'contact_person', 'TEXT');
        await addColumnIfMissing('suppliers', 'mobile', 'TEXT');
        await addColumnIfMissing('suppliers', 'website', 'TEXT');
        await addColumnIfMissing('suppliers', 'address_line1', 'TEXT');
        await addColumnIfMissing('suppliers', 'address_line2', 'TEXT');
        await addColumnIfMissing('suppliers', 'area', 'TEXT');
        await addColumnIfMissing('suppliers', 'pincode', 'TEXT');
        await addColumnIfMissing('suppliers', 'country', 'TEXT');
        await addColumnIfMissing('suppliers', 'pan_number', 'TEXT');
        await addColumnIfMissing('suppliers', 'drug_license', 'TEXT');
        await addColumnIfMissing('suppliers', 'food_license', 'TEXT');
        await addColumnIfMissing('suppliers', 'remarks', 'TEXT');
        await addColumnIfMissing('suppliers', 'is_blocked', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('suppliers', 'city', 'TEXT');
        await addColumnIfMissing('suppliers', 'supplier_group', 'TEXT DEFAULT \'Sundry Creditors\'');
        await addColumnIfMissing('suppliers', 'control_gl_id', 'TEXT');
        await addColumnIfMissing('suppliers', 'district', 'TEXT');
        await addColumnIfMissing('suppliers', 'state', 'TEXT');

        // Bank Master
        await addColumnIfMissing('bank_master', 'linked_bank_gl_id', 'TEXT');
        await addColumnIfMissing('bank_master', 'account_type', 'TEXT');
        await addColumnIfMissing('bank_master', 'active_status', 'TEXT DEFAULT \'Active\'');
        await addColumnIfMissing('bank_master', 'is_default', 'INTEGER DEFAULT 0');

        // Sales Bill
        await addColumnIfMissing('sales_bill', 'invoice_number', 'TEXT');
        await addColumnIfMissing('sales_bill', 'referred_by', 'TEXT');
        await addColumnIfMissing('sales_bill', 'doctor_id', 'TEXT');
        await addColumnIfMissing('sales_bill', 'adjustment', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_bill', 'narration', 'TEXT');
        await addColumnIfMissing('sales_bill', 'amount_received', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_bill', 'prescription_images', 'TEXT');
        await addColumnIfMissing('sales_bill', 'hide_retailer_on_bill', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('sales_bill', 'prescription_url', 'TEXT');
        await addColumnIfMissing('sales_bill', 'e_way_bill_no', 'TEXT');
        await addColumnIfMissing('sales_bill', 'e_way_bill_date', 'TEXT');
        await addColumnIfMissing('sales_bill', 'billed_by_id', 'TEXT');
        await addColumnIfMissing('sales_bill', 'billed_by_name', 'TEXT');
        await addColumnIfMissing('sales_bill', 'tax_calculation_type', 'TEXT');
        await addColumnIfMissing('sales_bill', 'linked_challans', 'TEXT');
        await addColumnIfMissing('sales_bill', 'company_code_id', 'TEXT');
        await addColumnIfMissing('sales_bill', 'set_of_books_id', 'TEXT');
        await addColumnIfMissing('sales_bill', 'sync_status', 'TEXT DEFAULT \'pending\'');
        await addColumnIfMissing('sales_bill', 'item_count', 'TEXT');
        await addColumnIfMissing('sales_bill', 'bill_type', 'TEXT DEFAULT \'regular\'');
        await addColumnIfMissing('sales_bill', 'payment_mode', 'TEXT DEFAULT \'Cash\'');
        await addColumnIfMissing('sales_bill', 'pricing_mode', 'TEXT DEFAULT \'mrp\'');
        await addColumnIfMissing('sales_bill', 'total_item_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_bill', 'scheme_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_bill', 'round_off', 'REAL DEFAULT 0');

        // Purchases
        await addColumnIfMissing('purchases', 'total_item_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchases', 'total_item_scheme_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchases', 'scheme_discount', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchases', 'round_off', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchases', 'reference_doc_number', 'TEXT');
        await addColumnIfMissing('purchases', 'idempotency_key', 'TEXT');
        await addColumnIfMissing('purchases', 'e_way_bill_no', 'TEXT');
        await addColumnIfMissing('purchases', 'e_way_bill_date', 'TEXT');
        await addColumnIfMissing('purchases', 'linked_challans', 'TEXT');
        await addColumnIfMissing('purchases', 'source_purchase_order_id', 'TEXT');
        await addColumnIfMissing('purchases', 'source_receive_mode', 'TEXT');
        await addColumnIfMissing('purchases', 'company_code_id', 'TEXT');
        await addColumnIfMissing('purchases', 'set_of_books_id', 'TEXT');
        await addColumnIfMissing('purchases', 'pricing_mode', 'TEXT DEFAULT \'rate\'');
        await addColumnIfMissing('purchases', 'purchase_serial_id', 'TEXT');

        // Sales Challans
        await addColumnIfMissing('sales_challans', 'challan_serial_id', 'TEXT');
        await addColumnIfMissing('sales_challans', 'customer_name', 'TEXT');
        await addColumnIfMissing('sales_challans', 'customer_phone', 'TEXT');
        await addColumnIfMissing('sales_challans', 'subtotal', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_challans', 'total_gst', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_challans', 'narration', 'TEXT');
        await addColumnIfMissing('sales_challans', 'remarks', 'TEXT');
        await addColumnIfMissing('sales_challans', 'total_amount', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_challans', 'total_items', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('sales_challans', 'total_item_discount', 'REAL DEFAULT 0');

        // Delivery Challans
        await addColumnIfMissing('delivery_challans', 'challan_serial_id', 'TEXT');
        await addColumnIfMissing('delivery_challans', 'supplier', 'TEXT');
        await addColumnIfMissing('delivery_challans', 'challan_number', 'TEXT');
        await addColumnIfMissing('delivery_challans', 'subtotal', 'REAL DEFAULT 0');
        await addColumnIfMissing('delivery_challans', 'total_gst', 'REAL DEFAULT 0');
        await addColumnIfMissing('delivery_challans', 'remarks', 'TEXT');
        await addColumnIfMissing('delivery_challans', 'total_amount', 'REAL DEFAULT 0');

        // Returns
        await addColumnIfMissing('sales_returns', 'subtotal', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_returns', 'total_gst', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_returns', 'round_off', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_returns', 'original_invoice_id', 'TEXT');
        await addColumnIfMissing('sales_returns', 'original_invoice_number', 'TEXT');
        await addColumnIfMissing('sales_returns', 'customer_name', 'TEXT');
        await addColumnIfMissing('sales_returns', 'customer_id', 'TEXT');
        await addColumnIfMissing('sales_returns', 'total_refund', 'REAL DEFAULT 0');
        await addColumnIfMissing('sales_returns', 'remarks', 'TEXT');
        await addColumnIfMissing('purchase_returns', 'subtotal', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchase_returns', 'total_gst', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchase_returns', 'round_off', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchase_returns', 'original_purchase_invoice_id', 'TEXT');
        await addColumnIfMissing('purchase_returns', 'supplier', 'TEXT');
        await addColumnIfMissing('purchase_returns', 'total_value', 'REAL DEFAULT 0');
        await addColumnIfMissing('purchase_returns', 'remarks', 'TEXT');

        // Supplier Product Map
        await addColumnIfMissing('supplier_product_map', 'master_medicine_id', 'TEXT');
        await addColumnIfMissing('supplier_product_map', 'supplier_product_name', 'TEXT');
        await addColumnIfMissing('supplier_product_map', 'auto_apply', 'INTEGER DEFAULT 0');

        // Configurations
        await addColumnIfMissing('configurations', 'discount_rules', 'TEXT');
        await addColumnIfMissing('configurations', 'gst_settings', 'TEXT');
        await addColumnIfMissing('configurations', 'eway_login_setup', 'TEXT');
        await addColumnIfMissing('configurations', 'invoice_config', 'TEXT');
        await addColumnIfMissing('configurations', 'non_gst_invoice_config', 'TEXT');
        await addColumnIfMissing('configurations', 'purchase_config', 'TEXT');
        await addColumnIfMissing('configurations', 'purchase_order_config', 'TEXT');
        await addColumnIfMissing('configurations', 'medicine_master_config', 'TEXT');
        await addColumnIfMissing('configurations', 'physical_inventory_config', 'TEXT');
        await addColumnIfMissing('configurations', 'delivery_challan_config', 'TEXT');
        await addColumnIfMissing('configurations', 'sales_challan_config', 'TEXT');
        await addColumnIfMissing('configurations', 'master_shortcuts', 'TEXT');
        await addColumnIfMissing('configurations', 'master_shortcut_order', 'TEXT');
        await addColumnIfMissing('configurations', 'display_options', 'TEXT');
        await addColumnIfMissing('configurations', 'modules', 'TEXT');
        await addColumnIfMissing('configurations', 'sidebar', 'TEXT');

        // Purchase Orders
        await addColumnIfMissing('purchase_orders', 'serial_id', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'supplier_id', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'distributor_id', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'distributor_name', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'sender_email', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'total_items', 'INTEGER');
        await addColumnIfMissing('purchase_orders', 'total_amount', 'REAL');
        await addColumnIfMissing('purchase_orders', 'sync_status', 'TEXT DEFAULT \'pending\'');
        await addColumnIfMissing('purchase_orders', 'remarks', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'receive_links', 'TEXT');
        await addColumnIfMissing('purchase_orders', 'source_purchase_bill_ids', 'TEXT');

        // Doctor Master
        await addColumnIfMissing('doctor_master', 'doctor_code', 'TEXT');
        await addColumnIfMissing('doctor_master', 'qualification', 'TEXT');
        await addColumnIfMissing('doctor_master', 'specialization', 'TEXT');
        await addColumnIfMissing('doctor_master', 'registration_no', 'TEXT');
        await addColumnIfMissing('doctor_master', 'mobile', 'TEXT');
        await addColumnIfMissing('doctor_master', 'alternate_contact', 'TEXT');
        await addColumnIfMissing('doctor_master', 'clinic_name', 'TEXT');
        await addColumnIfMissing('doctor_master', 'area', 'TEXT');
        await addColumnIfMissing('doctor_master', 'city', 'TEXT');
        await addColumnIfMissing('doctor_master', 'state', 'TEXT');
        await addColumnIfMissing('doctor_master', 'pincode', 'TEXT');
        await addColumnIfMissing('doctor_master', 'commission_percent', 'REAL DEFAULT 0');
        await addColumnIfMissing('doctor_master', 'notes', 'TEXT');
        await addColumnIfMissing('doctor_master', 'is_active', 'INTEGER DEFAULT 1');

        // Profiles
        await addColumnIfMissing('profiles', 'dashboard_logo_url', 'TEXT');
        await addColumnIfMissing('profiles', 'organization_type', 'TEXT DEFAULT \'Retail\'');

        // Journal Entry Header
        await addColumnIfMissing('journal_entry_header', 'narration', 'TEXT');

        // Team Members
        await addColumnIfMissing('team_members', 'department', 'TEXT');
        await addColumnIfMissing('team_members', 'employee_id', 'TEXT');
        await addColumnIfMissing('team_members', 'company', 'TEXT');
        await addColumnIfMissing('team_members', 'assigned_roles', 'TEXT DEFAULT \'[]\'');
        await addColumnIfMissing('team_members', 'work_centers', 'TEXT DEFAULT \'[]\'');
        await addColumnIfMissing('team_members', 'technical_id', 'TEXT');

        // Business Roles
        await addColumnIfMissing('business_roles', 'work_centers', 'TEXT NOT NULL DEFAULT \'[]\'');
        await addColumnIfMissing('business_roles', 'is_system_role', 'INTEGER DEFAULT 0');

        // MBC Cards
        await addColumnIfMissing('mbc_cards', 'photo_url', 'TEXT');
        await addColumnIfMissing('mbc_cards', 'whatsapp_number', 'TEXT');
        await addColumnIfMissing('mbc_cards', 'website_link', 'TEXT');
        await addColumnIfMissing('mbc_cards', 'office_location_text', 'TEXT');
    }

    private async createTables() {
        // --- SYSTEM & AUTH ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'clerk',
                is_active INTEGER DEFAULT 1,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS profiles (
                user_id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                email TEXT NOT NULL,
                full_name TEXT,
                pharmacy_name TEXT,
                manager_name TEXT,
                role TEXT DEFAULT 'clerk',
                is_active INTEGER DEFAULT 1,
                address TEXT,
                address_line2 TEXT,
                pincode TEXT,
                district TEXT,
                state TEXT,
                mobile TEXT,
                gstin TEXT,
                retailer_gstin TEXT,
                drug_license TEXT,
                dl_valid_to TEXT,
                food_license TEXT,
                pan_number TEXT,
                bank_account_name TEXT,
                bank_account_number TEXT,
                bank_ifsc_code TEXT,
                bank_upi_id TEXT,
                authorized_signatory TEXT,
                pharmacy_logo_url TEXT,
                dashboard_logo_url TEXT,
                organization_type TEXT DEFAULT 'Retail',
                terms_and_conditions TEXT,
                purchase_order_terms TEXT,
                subscription_plan TEXT DEFAULT 'starter',
                subscription_status TEXT DEFAULT 'active',
                subscription_id TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // --- CONFIGURATION ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS configurations (
                organization_id TEXT PRIMARY KEY,
                invoice_config TEXT, -- JSON
                non_gst_invoice_config TEXT, -- JSON
                purchase_config TEXT, -- JSON
                purchase_order_config TEXT, -- JSON
                medicine_master_config TEXT, -- JSON
                physical_inventory_config TEXT, -- JSON
                delivery_challan_config TEXT, -- JSON
                sales_challan_config TEXT, -- JSON
                master_shortcuts TEXT, -- JSON array
                master_shortcut_order TEXT, -- JSON array
                display_options TEXT, -- JSON
                modules TEXT, -- JSON
                sidebar TEXT, -- JSON
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS company_codes (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                code TEXT NOT NULL,
                name TEXT,
                description TEXT,
                status TEXT DEFAULT 'Active',
                is_default INTEGER DEFAULT 0,
                default_set_of_books_id TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // --- INVENTORY & MATERIAL ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS sub_categories (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS material_master (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                name TEXT NOT NULL,
                material_code TEXT NOT NULL,
                barcode TEXT,
                brand TEXT,
                manufacturer TEXT,
                marketer TEXT,
                composition TEXT,
                pack TEXT,
                description TEXT,
                directions TEXT,
                gst_rate REAL DEFAULT 12,
                hsn_code TEXT,
                mrp REAL DEFAULT 0,
                rate_a REAL DEFAULT 0,
                rate_b REAL DEFAULT 0,
                rate_c REAL DEFAULT 0,
                default_discount_percent REAL DEFAULT 0,
                scheme_percent REAL DEFAULT 0,
                scheme_type TEXT,
                scheme_calculation_basis TEXT,
                scheme_format TEXT,
                scheme_rate REAL DEFAULT 0,
                master_price_maintains TEXT,
                is_prescription_required INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                country_of_origin TEXT DEFAULT 'India',
                material_master_type TEXT,
                is_inventorised INTEGER DEFAULT 1,
                is_sales_enabled INTEGER DEFAULT 1,
                is_purchase_enabled INTEGER DEFAULT 1,
                is_production_enabled INTEGER DEFAULT 0,
                is_internal_issue_enabled INTEGER DEFAULT 0,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(organization_id, material_code)
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS inventory (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                name TEXT NOT NULL,
                brand TEXT,
                category TEXT DEFAULT 'General',
                manufacturer TEXT,
                batch TEXT NOT NULL,
                expiry TEXT,
                stock REAL NOT NULL DEFAULT 0,
                min_stock_limit REAL DEFAULT 10,
                units_per_pack INTEGER DEFAULT 1,
                pack_type TEXT,
                unit_of_measurement TEXT,
                pack_unit TEXT,
                base_unit TEXT,
                outer_pack TEXT,
                units_per_outer_pack INTEGER DEFAULT 1,
                purchase_price REAL DEFAULT 0,
                ptr REAL DEFAULT 0,
                mrp REAL NOT NULL DEFAULT 0,
                rate_a REAL DEFAULT 0,
                rate_b REAL DEFAULT 0,
                rate_c REAL DEFAULT 0,
                gst_percent REAL DEFAULT 12,
                hsn_code TEXT,
                barcode TEXT,
                composition TEXT,
                deal REAL DEFAULT 0,
                free REAL DEFAULT 0,
                supplier_name TEXT,
                rack_number TEXT,
                cost REAL DEFAULT 0,
                value REAL DEFAULT 0,
                code TEXT,
                description TEXT,
                purchase_deal REAL DEFAULT 0,
                purchase_free REAL DEFAULT 0,
                tax_basis TEXT,
                is_active INTEGER DEFAULT 1,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS promotions (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT, -- discount, bogo, etc
                description TEXT,
                start_date TEXT,
                end_date TEXT,
                is_active INTEGER DEFAULT 1,
                payload TEXT, -- JSON
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // --- SALES & CUSTOMERS ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                address_line1 TEXT,
                address_line2 TEXT,
                area TEXT,
                city TEXT,
                pincode TEXT,
                district TEXT,
                state TEXT,
                country TEXT,
                gst_number TEXT,
                drug_license TEXT,
                pan_number TEXT,
                ledger TEXT, -- JSON
                opening_balance REAL DEFAULT 0,
                default_discount REAL DEFAULT 0,
                default_rate_tier TEXT,
                customer_type TEXT DEFAULT 'regular',
                assigned_staff_id TEXT,
                assigned_staff_name TEXT,
                customer_group TEXT,
                control_gl_id TEXT,
                enable_credit_limit INTEGER DEFAULT 0,
                credit_limit REAL DEFAULT 0,
                credit_days INTEGER DEFAULT 0,
                credit_status TEXT DEFAULT 'active',
                credit_control_mode TEXT DEFAULT 'warning_only',
                allow_override INTEGER DEFAULT 0,
                override_approval_required INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS sales_bill (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                created_by_id TEXT,
                date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                customer_name TEXT NOT NULL,
                customer_id TEXT,
                customer_phone TEXT,
                invoice_number TEXT,
                referred_by TEXT,
                doctor_id TEXT,
                items TEXT NOT NULL DEFAULT '[]', -- JSON
                subtotal REAL DEFAULT 0,
                total_item_discount REAL DEFAULT 0,
                total_gst REAL DEFAULT 0,
                scheme_discount REAL DEFAULT 0,
                adjustment REAL DEFAULT 0,
                narration TEXT,
                round_off REAL DEFAULT 0,
                total REAL DEFAULT 0,
                amount_received REAL DEFAULT 0,
                status TEXT DEFAULT 'completed',
                payment_mode TEXT DEFAULT 'Cash',
                pricing_mode TEXT DEFAULT 'mrp',
                bill_type TEXT DEFAULT 'regular',
                prescription_images TEXT,
                hide_retailer_on_bill INTEGER DEFAULT 0,
                prescription_url TEXT,
                e_way_bill_no TEXT,
                e_way_bill_date TEXT,
                billed_by_id TEXT,
                billed_by_name TEXT,
                tax_calculation_type TEXT,
                linked_challans TEXT,
                company_code_id TEXT,
                set_of_books_id TEXT,
                sync_status TEXT DEFAULT 'pending',
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS sales_returns (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                sale_id TEXT,
                date TEXT,
                items TEXT, -- JSON
                total REAL,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS sales_challans (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                challan_serial_id TEXT,
                customer_id TEXT,
                customer_name TEXT,
                customer_phone TEXT,
                date TEXT,
                items TEXT, -- JSON
                subtotal REAL DEFAULT 0,
                total_gst REAL DEFAULT 0,
                total REAL,
                status TEXT,
                narration TEXT,
                remarks TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS delivery_challans (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                challan_serial_id TEXT,
                supplier TEXT,
                challan_number TEXT,
                customer_id TEXT,
                date TEXT,
                items TEXT, -- JSON
                subtotal REAL DEFAULT 0,
                total_gst REAL DEFAULT 0,
                total REAL,
                status TEXT,
                remarks TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // --- PURCHASES & SUPPLIERS ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS suppliers (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                name TEXT NOT NULL,
                contact_person TEXT,
                category TEXT DEFAULT 'Wholesaler',
                supplier_group TEXT DEFAULT 'Sundry Creditors',
                control_gl_id TEXT,
                gst_number TEXT,
                pan_number TEXT,
                drug_license TEXT,
                food_license TEXT,
                phone TEXT,
                mobile TEXT,
                email TEXT,
                website TEXT,
                address TEXT,
                address_line1 TEXT,
                address_line2 TEXT,
                area TEXT,
                pincode TEXT,
                city TEXT,
                state TEXT,
                district TEXT,
                country TEXT,
                payment_details TEXT, -- JSON
                ledger TEXT, -- JSON
                opening_balance REAL DEFAULT 0,
                remarks TEXT,
                is_active INTEGER DEFAULT 1,
                is_blocked INTEGER DEFAULT 0,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS supplier_product_map (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                supplier_id TEXT NOT NULL,
                material_id TEXT NOT NULL,
                supplier_product_code TEXT,
                last_purchase_price REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS purchases (
                id TEXT PRIMARY KEY,
                purchase_serial_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                supplier TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                date TEXT NOT NULL DEFAULT CURRENT_DATE,
                items TEXT NOT NULL DEFAULT '[]', -- JSON
                total_amount REAL DEFAULT 0,
                subtotal REAL DEFAULT 0,
                total_gst REAL DEFAULT 0,
                total_item_discount REAL DEFAULT 0,
                total_item_scheme_discount REAL DEFAULT 0,
                scheme_discount REAL DEFAULT 0,
                round_off REAL DEFAULT 0,
                status TEXT DEFAULT 'completed',
                pricing_mode TEXT DEFAULT 'rate',
                reference_doc_number TEXT,
                idempotency_key TEXT,
                e_way_bill_no TEXT,
                e_way_bill_date TEXT,
                linked_challans TEXT,
                source_purchase_order_id TEXT,
                source_receive_mode TEXT,
                company_code_id TEXT,
                set_of_books_id TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                serial_id TEXT,
                supplier_id TEXT,
                distributor_id TEXT,
                distributor_name TEXT,
                sender_email TEXT,
                date TEXT,
                items TEXT, -- JSON
                total REAL,
                total_items INTEGER,
                total_amount REAL,
                status TEXT,
                sync_status TEXT DEFAULT 'pending',
                remarks TEXT,
                receive_links TEXT,
                source_purchase_bill_ids TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS purchase_returns (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                purchase_id TEXT,
                date TEXT,
                items TEXT, -- JSON
                total REAL,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // --- ACCOUNTING & GL ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS set_of_books (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                company_code_id TEXT NOT NULL,
                name TEXT,
                description TEXT,
                default_currency TEXT,
                active_status TEXT DEFAULT 'Active',
                default_customer_gl_id TEXT,
                default_supplier_gl_id TEXT,
                default_demo_bank_gl_id TEXT,
                default_bank_gl_id TEXT,
                posting_count INTEGER DEFAULT 0,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS gl_master (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                set_of_books_id TEXT NOT NULL,
                gl_code TEXT NOT NULL,
                gl_name TEXT NOT NULL,
                gl_type TEXT,
                gl_group TEXT,
                account_group TEXT,
                subgroup TEXT,
                alias TEXT,
                mapping_structure TEXT,
                posting_allowed INTEGER DEFAULT 1,
                control_account INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                active_status TEXT DEFAULT 'Active',
                seeded_by_system INTEGER DEFAULT 0,
                template_version TEXT,
                posting_count INTEGER DEFAULT 0,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS bank_master (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                bank_name TEXT NOT NULL,
                account_name TEXT NOT NULL,
                account_number TEXT NOT NULL,
                account_type TEXT,
                linked_bank_gl_id TEXT,
                is_default INTEGER DEFAULT 0,
                active_status TEXT DEFAULT 'Active',
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS journal_entry_header (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                journal_entry_number TEXT NOT NULL UNIQUE,
                posting_date TEXT NOT NULL,
                status TEXT DEFAULT 'Posted',
                reference_type TEXT,
                reference_id TEXT,
                reference_document_id TEXT,
                document_type TEXT,
                document_reference TEXT,
                company TEXT,
                company_code_id TEXT,
                set_of_books TEXT,
                set_of_books_id TEXT,
                narration TEXT,
                total_debit REAL DEFAULT 0,
                total_credit REAL DEFAULT 0,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS journal_entry_lines (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                journal_entry_id TEXT NOT NULL REFERENCES journal_entry_header(id) ON DELETE CASCADE,
                line_number INTEGER NOT NULL,
                gl_code TEXT NOT NULL,
                gl_name TEXT NOT NULL,
                debit REAL DEFAULT 0,
                credit REAL DEFAULT 0,
                line_memo TEXT,
                reference_document_id TEXT,
                document_type TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS gl_assignments (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                set_of_books_id TEXT NOT NULL,
                assignment_scope TEXT NOT NULL,
                party_type TEXT,
                party_group TEXT,
                material_master_type TEXT,
                control_gl_id TEXT,
                active_status TEXT DEFAULT 'Active',
                inventory_gl TEXT,
                purchase_gl TEXT,
                cogs_gl TEXT,
                sales_gl TEXT,
                discount_gl TEXT,
                tax_gl TEXT,
                seeded_by_system INTEGER DEFAULT 0,
                template_version TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS gl_assignment_history (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                assignment_id TEXT,
                set_of_books_id TEXT NOT NULL,
                material_master_type TEXT NOT NULL,
                changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                changed_by TEXT DEFAULT 'system',
                effective_from TEXT DEFAULT CURRENT_TIMESTAMP,
                previous_payload TEXT DEFAULT '{}',
                next_payload TEXT DEFAULT '{}'
            )
        `;

        // --- MISC MASTERS ---
        await this.sql`
            CREATE TABLE IF NOT EXISTS doctor_master (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                doctor_code TEXT,
                name TEXT NOT NULL,
                qualification TEXT,
                specialization TEXT,
                registration_no TEXT,
                phone TEXT,
                mobile TEXT,
                alternate_contact TEXT,
                email TEXT,
                clinic_name TEXT,
                area TEXT,
                city TEXT,
                state TEXT,
                pincode TEXT,
                commission_percent REAL DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS ewaybills (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                linked_transaction_id TEXT,
                linked_purchase_id TEXT,
                eway_bill_no TEXT,
                eway_bill_no_str TEXT,
                eway_bill_date TEXT,
                valid_until TEXT,
                supply_type TEXT,
                sub_supply_type TEXT,
                document_type TEXT,
                document_no TEXT,
                document_date TEXT,
                from_gstin TEXT,
                from_trd_name TEXT,
                from_addr1 TEXT,
                from_addr2 TEXT,
                from_place TEXT,
                from_pincode INTEGER,
                from_state_code INTEGER,
                to_gstin TEXT,
                to_trd_name TEXT,
                to_addr1 TEXT,
                to_addr2 TEXT,
                to_place TEXT,
                to_pincode INTEGER,
                to_state_code INTEGER,
                transaction_type TEXT,
                other_value REAL,
                total_value REAL,
                cgst_value REAL,
                sgst_value REAL,
                igst_value REAL,
                cess_value REAL,
                non_gst_value REAL,
                estimation_duration INTEGER,
                transporter_id TEXT,
                transporter_name TEXT,
                transport_mode TEXT,
                vehicle_no TEXT,
                vehicle_type TEXT,
                distance REAL,
                status TEXT,
                payload TEXT, -- JSON
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS physical_inventory (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                voucher_no TEXT,
                status TEXT DEFAULT 'in_progress',
                start_date TEXT,
                end_date TEXT,
                reason TEXT,
                items TEXT, -- JSON
                total_variance_value REAL DEFAULT 0,
                performed_by_id TEXT,
                performed_by_name TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'viewer',
                status TEXT DEFAULT 'active',
                is_locked INTEGER DEFAULT 0,
                password_locked INTEGER DEFAULT 0,
                department TEXT,
                employee_id TEXT,
                company TEXT,
                assigned_roles TEXT DEFAULT '[]',
                work_centers TEXT DEFAULT '[]',
                technical_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS business_roles (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                work_centers TEXT NOT NULL DEFAULT '[]',
                is_system_role INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS mrp_change_log (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                material_code TEXT,
                product_name TEXT,
                old_mrp REAL,
                new_mrp REAL,
                changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                changed_by_id TEXT,
                changed_by_name TEXT,
                source_screen TEXT
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS mbc_card_types (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                type_name TEXT NOT NULL,
                type_code TEXT NOT NULL,
                description TEXT,
                default_validity_value INTEGER,
                default_validity_unit TEXT,
                default_card_value REAL,
                template_id TEXT,
                color_theme TEXT,
                prefix TEXT,
                auto_numbering INTEGER DEFAULT 0,
                allow_manual_value_edit INTEGER DEFAULT 0,
                allow_renewal INTEGER DEFAULT 0,
                allow_upgrade INTEGER DEFAULT 0,
                benefits TEXT,
                terms_conditions TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS mbc_card_templates (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                template_name TEXT NOT NULL,
                template_code TEXT NOT NULL,
                card_type_id TEXT,
                width REAL,
                height REAL,
                orientation TEXT,
                background_image TEXT,
                logo_image TEXT,
                template_json TEXT, -- JSON
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS mbc_cards (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                card_number TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                guardian_name TEXT,
                date_of_birth TEXT,
                gender TEXT,
                address_line_1 TEXT,
                address_line_2 TEXT,
                city TEXT,
                district TEXT,
                state TEXT,
                pin_code TEXT,
                phone_number TEXT NOT NULL,
                alternate_phone TEXT,
                email TEXT,
                card_type_id TEXT NOT NULL,
                template_id TEXT,
                issue_date TEXT,
                validity_from TEXT,
                validity_to TEXT,
                validity_period_text TEXT,
                card_value REAL,
                qr_value TEXT,
                barcode_value TEXT,
                remarks TEXT,
                status TEXT DEFAULT 'active',
                photo_url TEXT,
                whatsapp_number TEXT,
                website_link TEXT,
                office_location_text TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS mbc_card_history (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                mbc_card_id TEXT NOT NULL,
                action_type TEXT,
                old_card_type_id TEXT,
                new_card_type_id TEXT,
                old_validity_to TEXT,
                new_validity_to TEXT,
                old_card_value REAL,
                new_card_value REAL,
                remarks TEXT,
                action_by TEXT,
                action_date TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS customer_price_list (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                inventory_item_id TEXT NOT NULL,
                price REAL,
                discount_percent REAL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS setup_wizard_defaults_log (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                set_of_books_id TEXT NOT NULL,
                action TEXT NOT NULL,
                message TEXT NOT NULL,
                created_by TEXT DEFAULT 'system',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;
    }

    async exec(query: string, params: any[] = []) {
        return await (this.sqlocal.sql as any)([query], ...params);
    }
}

export const db = new DatabaseService();
