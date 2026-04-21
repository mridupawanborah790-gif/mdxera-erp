
import { SQLocal } from 'sqlocal';

class DatabaseService {
    private sqlocal: SQLocal;
    public sql: SQLocal['sql'];
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.sqlocal = new SQLocal('medimart_local.sqlite3');
        this.sql = this.sqlocal.sql;
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            console.log('Initializing local database...');
            try {
                await this.createTables();
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

    private async createTables() {
        // Core tables from master_schema.sql and company_configuration_schema.sql
        // Adjusted for SQLite syntax
        
        await this.sql`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'clerk',
                is_active INTEGER DEFAULT 1,
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
                terms_and_conditions TEXT,
                purchase_order_terms TEXT,
                subscription_plan TEXT DEFAULT 'starter',
                subscription_status TEXT DEFAULT 'active',
                subscription_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS configurations (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL UNIQUE,
                invoice_config TEXT, -- JSON string
                non_gst_invoice_config TEXT, -- JSON string
                purchase_config TEXT, -- JSON string
                purchase_order_config TEXT, -- JSON string
                medicine_master_config TEXT, -- JSON string
                physical_inventory_config TEXT, -- JSON string
                delivery_challan_config TEXT, -- JSON string
                sales_challan_config TEXT, -- JSON string
                master_shortcuts TEXT, -- JSON string array
                display_options TEXT, -- JSON string
                modules TEXT, -- JSON string
                sidebar TEXT, -- JSON string
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS material_master (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
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
                is_prescription_required INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(organization_id, material_code)
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS inventory (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                brand TEXT,
                category TEXT DEFAULT 'General',
                batch TEXT NOT NULL,
                expiry TEXT,
                stock REAL NOT NULL DEFAULT 0,
                min_stock_limit REAL DEFAULT 10,
                units_per_pack INTEGER DEFAULT 1,
                pack_type TEXT,
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
                supplier_name TEXT,
                rack_number TEXT,
                cost REAL DEFAULT 0,
                value REAL DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS suppliers (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT DEFAULT 'Wholesaler',
                supplier_group TEXT DEFAULT 'Sundry Creditors',
                control_gl_id TEXT,
                gst_number TEXT,
                phone TEXT,
                email TEXT,
                address TEXT,
                state TEXT,
                district TEXT,
                payment_details TEXT, -- JSON
                ledger TEXT, -- JSON
                opening_balance REAL DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                gst_number TEXT,
                ledger TEXT, -- JSON
                opening_balance REAL DEFAULT 0,
                default_discount REAL DEFAULT 0,
                customer_type TEXT DEFAULT 'regular',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS sales_bill (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                created_by_id TEXT, -- local user id
                date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                customer_name TEXT NOT NULL,
                customer_id TEXT,
                customer_phone TEXT,
                items TEXT NOT NULL DEFAULT '[]', -- JSON
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
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS purchases (
                id TEXT PRIMARY KEY,
                purchase_serial_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                supplier TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                date TEXT NOT NULL DEFAULT CURRENT_DATE,
                items TEXT NOT NULL DEFAULT '[]', -- JSON
                total_amount REAL DEFAULT 0,
                subtotal REAL DEFAULT 0,
                total_gst REAL DEFAULT 0,
                status TEXT DEFAULT 'completed',
                pricing_mode TEXT DEFAULT 'rate',
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
                status TEXT DEFAULT 'Active',
                is_default INTEGER DEFAULT 0,
                default_set_of_books_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.sql`
            CREATE TABLE IF NOT EXISTS set_of_books (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                company_code_id TEXT NOT NULL,
                name TEXT,
                active_status TEXT DEFAULT 'Active',
                default_customer_gl_id TEXT,
                default_supplier_gl_id TEXT,
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
                gl_group TEXT,
                is_active INTEGER DEFAULT 1,
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
                total_debit REAL DEFAULT 0,
                total_credit REAL DEFAULT 0,
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
                control_gl_id TEXT NOT NULL,
                active_status TEXT DEFAULT 'Active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;
    }

    async exec(query: string, params: any[] = []) {
        // sqlocal doesn't directly support query strings with params in the same way,
        // it uses template literals. We can polyfill if needed or just use the tagged template.
        // For convenience:
        return await (this.sqlocal.sql as any)([query], ...params);
    }
}

export const db = new DatabaseService();
