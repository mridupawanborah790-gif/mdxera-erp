
import { db } from '../database/databaseService';
import { authService } from '../../modules/auth/services/authService';
import { getFinancialYearLabel } from '../utils/invoice';
import {
    RegisteredPharmacy, InventoryItem, Transaction, BillItem, Purchase, PurchaseItem, Supplier,
    Customer, PurchaseOrder, TransactionLedgerItem, UserRole, OrganizationMember,
    Medicine, SupplierProductMap, EWayBill, DoctorMaster,
    DeliveryChallan, DeliveryChallanStatus, PhysicalInventorySession, PhysicalInventoryStatus,
    CustomerPriceListEntry, SalesChallanStatus, SalesChallan, AppConfigurations,
    SalesReturn, PurchaseReturn, InvoiceNumberConfig
} from '../types/types';

export const generateUUID = () => crypto.randomUUID();

const memoryCache: Record<string, any[]> = {};
const memoryCacheOrgScope: Record<string, string> = {};

const clearTableMemoryCache = (tableName: string) => {
    const key = tableName.toUpperCase();
    delete memoryCache[key];
    delete memoryCacheOrgScope[key];
};

export const toSnake = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toSnake);
    return Object.keys(obj).reduce((acc, key) => {
        if (key.startsWith('_')) return acc;
        
        // These specific keys MUST remain snake_case for database interaction and UI consistency
        const preservedKeys = [
            'organization_id', 'user_id', 'created_by_id', 'assigned_staff_id', 'performed_by_id',
            'supplier_id', 'master_medicine_id', 'full_name', 'pharmacy_name',
            'gst_number', 'pan_number', 'drug_license', 'food_license', 'is_active', 'is_blocked',
            'supplier_group', 'customer_group', 'control_gl_id', 'opening_balance', 'contact_person',
            'address_line1', 'address_line2', 'created_at', 'updated_at',
            'credit_limit', 'credit_days', 'credit_status', 'credit_control_mode',
            'customer_type', 'as_of_date', 'default_discount', 'default_rate_tier',
            'assigned_staff_name', 'allow_override', 'override_approval_required'
        ];
        
        if (preservedKeys.includes(key)) {
            acc[key] = toSnake(obj[key]);
            return acc;
        }

        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        acc[snakeKey] = toSnake(obj[key]);
        return acc;
    }, {} as any);
};

export const toCamel = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toCamel);
    return Object.keys(obj).reduce((acc, key) => {
        // These specific keys MUST remain snake_case to match database structure and component expectations
        const preservedKeys = [
            'organization_id', 'user_id', 'created_by_id', 'assigned_staff_id', 'performed_by_id',
            'supplier_id', 'master_medicine_id', 'full_name', 'pharmacy_name',
            'gst_number', 'pan_number', 'drug_license', 'food_license', 'is_active', 'is_blocked',
            'supplier_group', 'control_gl_id', 'opening_balance', 'contact_person',
            'address_line1', 'address_line2', 'created_at', 'updated_at',
            // Customer specific fields often used in UI in snake_case or specific camelCase
            'gstNumber', 'panNumber', 'drugLicense', 'customerGroup', 'controlGlId',
            'creditLimit', 'creditDays', 'creditStatus', 'creditControlMode',
            'assignedStaffId', 'assignedStaffName', 'customerType'
        ];
        
        if (preservedKeys.includes(key)) {
            acc[key] = toCamel(obj[key]);
            return acc;
        }

        const camelKey = key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
        acc[camelKey] = toCamel(obj[key]);
        return acc;
    }, {} as any);
};

export const fromDb = (tableName: string, payload: Record<string, any>): any => {
    if (!payload) return payload;
    const jsonColumns = [
        'items', 'ledger', 'payment_details', 'invoice_config', 'non_gst_invoice_config', 
        'purchase_config', 'purchase_order_config', 'medicine_master_config', 
        'physical_inventory_config', 'delivery_challan_config', 'sales_challan_config', 
        'master_shortcuts', 'display_options', 'modules', 'sidebar',
        'master_price_maintains', 'linked_challans', 'prescription_images', 
        'receive_links', 'source_purchase_bill_ids',
        // Configurations extras
        'discount_rules', 'gst_settings', 'eway_login_setup', 'master_shortcut_order'
    ];
    const processed = { ...payload };
    for (const col of jsonColumns) {
        if (typeof processed[col] === 'string') {
            try { processed[col] = JSON.parse(processed[col]); } catch (e) {}
        }
    }
    const result = toCamel(processed);

    // Customer-specific: The Customer interface uses camelCase for these fields,
    // but toCamel preserves them as snake_case (because Supplier still needs snake_case).
    // Remap them here for customers only.
    if (tableName === 'customers') {
        const customerRemaps: Record<string, string> = {
            'gst_number': 'gstNumber',
            'pan_number': 'panNumber',
            'drug_license': 'drugLicense',
            'customer_group': 'customerGroup',
            'control_gl_id': 'controlGlId',
            'credit_limit': 'creditLimit',
            'credit_days': 'creditDays',
            'credit_status': 'creditStatus',
            'credit_control_mode': 'creditControlMode',
            'customer_type': 'customerType',
            'default_discount': 'defaultDiscount',
            'default_rate_tier': 'defaultRateTier',
            'assigned_staff_id': 'assignedStaffId',
            'assigned_staff_name': 'assignedStaffName',
            'enable_credit_limit': 'enableCreditLimit',
            'allow_override': 'allowOverride',
            'override_approval_required': 'overrideApprovalRequired',
        };
        for (const [snakeKey, camelKey] of Object.entries(customerRemaps)) {
            if (snakeKey in result && !(camelKey in result)) {
                result[camelKey] = result[snakeKey];
                delete result[snakeKey];
            }
        }
    }

    return result;
};

export const saveData = async (tableName: string, data: any, user: RegisteredPharmacy | null, isUpdate: boolean = false): Promise<any> => {
    if (!user?.organization_id) throw new Error("Organizational identity not verified.");
    const dbPayload: any = { ...data, organization_id: user.organization_id };
    
    if (tableName === 'configurations') {
        delete dbPayload.id; // configurations table does not use an id column
    } else if (!isUpdate && !dbPayload.id) {
        dbPayload.id = generateUUID();
    }

    // Auto-generate codes if missing and not an update
    if (!isUpdate && dbPayload.id) {
        const shortId = dbPayload.id.substring(0, 8).toUpperCase();
        
        if (tableName === 'material_master' && (!dbPayload.materialCode || dbPayload.materialCode === 'Auto-generated on save')) {
            dbPayload.materialCode = `MM-${shortId}`;
        }
        
        if (tableName === 'doctor_master' && !dbPayload.doctorCode) {
            dbPayload.doctorCode = `DOC-${shortId}`;
        }

        if (tableName === 'mbc_card_types' && !dbPayload.typeCode) {
            dbPayload.typeCode = `MCT-${shortId}`;
        }

        if (tableName === 'sales_challans' && !dbPayload.challanSerialId) {
            dbPayload.challanSerialId = `SC-${shortId}`;
        }

        if (tableName === 'delivery_challans' && !dbPayload.challanSerialId) {
            dbPayload.challanSerialId = `DC-${shortId}`;
        }
    }

    const snakeData = toSnake(dbPayload);
    const columns = Object.keys(snakeData);
    const values = columns.map(k => (typeof snakeData[k] === 'object' && snakeData[k] !== null) ? JSON.stringify(snakeData[k]) : snakeData[k]);

    if (tableName === 'configurations') {
        const placeholders = columns.map(() => '?').join(', ');
        await db.exec(`INSERT OR REPLACE INTO configurations (${columns.join(', ')}) VALUES (${placeholders})`, values);
    } else if (isUpdate) {
        const setClause = columns.map(k => `${k} = ?`).join(', ');
        await db.exec(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [...values, snakeData.id]);
    } else {
        const placeholders = columns.map(() => '?').join(', ');
        // Use INSERT OR REPLACE for upsert behavior when id is provided
        await db.exec(`INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`, values);
    }
    clearTableMemoryCache(tableName);
    return dbPayload;
};

export const upsertData = async (tableName: string, data: any, user: RegisteredPharmacy | null): Promise<any> => {
    return await saveData(tableName, data, user, false);
};

export const upsertBulkData = async (tableName: string, dataArray: any[], user: RegisteredPharmacy | null): Promise<void> => {
    if (!user) return;
    for (const item of dataArray) {
        await upsertData(tableName, item, user);
    }
};

export const getData = async (tableName: string, defaultValue: any[] = [], user: RegisteredPharmacy | null): Promise<any[]> => {
    if (!user) return defaultValue;
    try {
        const rows = await db.exec(`SELECT * FROM ${tableName} WHERE organization_id = ?`, [user.organization_id]);
        return rows.map((r: any) => fromDb(tableName, r));
    } catch (e) {
        console.error(`Local fetch failed for ${tableName}:`, e);
        return defaultValue;
    }
};

export const getDataById = async <T = any>(tableName: string, id: string, user: RegisteredPharmacy | null): Promise<T | null> => {
    if (!user || !id) return null;
    try {
        const rows = await db.exec(`SELECT * FROM ${tableName} WHERE organization_id = ? AND id = ? LIMIT 1`, [user.organization_id, id]);
        return rows.length > 0 ? fromDb(tableName, rows[0]) : null;
    } catch (e) { return null; }
};

export const deleteData = async (tableName: string, id: string): Promise<void> => {
    await db.exec(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    clearTableMemoryCache(tableName);
};

export const saveBulkData = async (tableName: string, dataArray: any[], user: RegisteredPharmacy | null): Promise<void> => {
    if (!user) return;
    for (const item of dataArray) {
        await saveData(tableName, item, user);
    }
};

// Simplified core business functions for offline mode
export const login = async (email: string, pass: string) => authService.login(email, pass);
export const signup = async (email: string, pass: string, fullName: string, pharmacyName: string) => authService.register(email, pass, fullName, pharmacyName);
export const getCurrentUser = async () => authService.getCurrentUser();
export const clearCurrentUser = async () => authService.logout();

export const fetchInventory = (user: RegisteredPharmacy) => getData('inventory', [], user);
export const fetchMedicineMaster = (user: RegisteredPharmacy) => getData('material_master', [], user);
export const fetchTransactions = (user: RegisteredPharmacy) => getData('sales_bill', [], user);
export const fetchPurchases = (user: RegisteredPharmacy) => getData('purchases', [], user);
export const fetchSuppliers = (user: RegisteredPharmacy) => getData('suppliers', [], user);
export const fetchCustomers = (user: RegisteredPharmacy) => getData('customers', [], user);

export const addTransaction = async (tx: Transaction, user: RegisteredPharmacy, isUpdate: boolean = false) => {
    return await saveData('sales_bill', tx, user, isUpdate);
};

export const addPurchase = async (p: Purchase, user: RegisteredPharmacy) => {
    return await saveData('purchases', p, user);
};

export const updatePurchase = async (p: Purchase, user: RegisteredPharmacy) => {
    return await saveData('purchases', p, user, true);
};

export const reserveVoucherNumber = async (docType: string, user: RegisteredPharmacy, isPreview: boolean = false): Promise<any> => {
    if (!user?.organization_id) throw new Error("Unauthorized");

    try {
        // 1. Fetch current configuration
        const rows = await db.exec('SELECT * FROM configurations WHERE organization_id = ? LIMIT 1', [user.organization_id]);
        if (rows.length === 0) {
            // Fallback if no config exists
            return { documentNumber: `V-${Date.now()}`, usedNumber: 0, nextNumber: 1, remainingCount: null };
        }

        const config = fromDb('configurations', rows[0]);
        
        // 2. Map docType to config key
        const docTypeToConfigKey: Record<string, keyof AppConfigurations> = {
            'sales-gst': 'invoiceConfig',
            'sales-non-gst': 'nonGstInvoiceConfig',
            'purchase-entry': 'purchaseConfig',
            'purchase-order': 'purchaseOrderConfig',
            'delivery-challan': 'deliveryChallanConfig',
            'sales-challan': 'salesChallanConfig',
            'physical-inventory': 'physicalInventoryConfig'
        };

        const configKey = docTypeToConfigKey[docType];
        if (!configKey || !config[configKey]) {
            return { documentNumber: `${docType.toUpperCase()}-${Date.now()}`, usedNumber: 0, nextNumber: 1, remainingCount: null };
        }

        const vConfig: InvoiceNumberConfig = config[configKey] as any;
        const currentNum = vConfig.currentNumber || vConfig.startingNumber || 1;
        
        // 3. Format document number
        const prefix = vConfig.prefix || '';
        const padding = vConfig.paddingLength || 0;
        const formattedNumber = currentNum.toString().padStart(padding, '0');
        
        const fiscalYear = vConfig.useFiscalYear ? getFinancialYearLabel() : '';
        const documentNumber = `${prefix}${formattedNumber}${fiscalYear}`;

        // 4. Update config if not a preview
        if (!isPreview) {
            vConfig.currentNumber = currentNum + 1;
            config[configKey] = vConfig as any;
            await saveData('configurations', config, user, true);
        }

        return {
            documentNumber,
            usedNumber: currentNum,
            nextNumber: currentNum + 1,
            remainingCount: null
        };
    } catch (error) {
        console.error('Failed to reserve voucher number:', error);
        return { documentNumber: `ERR-${Date.now()}`, usedNumber: 0, nextNumber: 1, remainingCount: null };
    }
};

export const fetchBankMasters = async (user: RegisteredPharmacy) => getData('bank_master', [], user);

export const recordCustomerPaymentWithAccounting = async (args: any, user: RegisteredPharmacy) => {
    const id = generateUUID();
    return { journalEntryId: id, journalEntryNumber: `RCPT-${id}`, ledgerEntryId: id };
};

export const recordSupplierPaymentWithAccounting = async (args: any, user: RegisteredPharmacy) => {
    const id = generateUUID();
    return { journalEntryId: id, journalEntryNumber: `PMT-${id}`, ledgerEntryId: id };
};

export const recordCustomerDownPaymentAdjustment = async (args: any, user: RegisteredPharmacy) => {};
export const recordSupplierDownPaymentAdjustment = async (args: any, user: RegisteredPharmacy) => {};
export const recordCustomerInvoicePaymentAdjustment = async (args: any, user: RegisteredPharmacy) => {};
export const recordSupplierInvoicePaymentAdjustment = async (args: any, user: RegisteredPharmacy) => {};
export const cancelPartyPaymentEntry = async (args: any, user: any) => {};

export const syncSalesLedger = async (tx: any, user: any) => { /* Placeholder */ };
export const syncPurchaseLedger = async (p: any, user: any) => { /* Placeholder */ };

export const addLedgerEntry = async (entry: any, owner: any, user: any) => {
    const tableName = owner.type === 'customer' ? 'customers' : 'suppliers';
    const entity = await getDataById(tableName, owner.id, user);
    if (entity) {
        entity.ledger = [...(entity.ledger || []), entry];
        await saveData(tableName, entity, user, true);
    }
};

export const updateProfile = (profile: any) => saveData('profiles', profile, profile, true);
export const fetchProfile = (userId: string) => getDataById('profiles', userId, { organization_id: '' } as any);

export const fetchPurchaseOrders = (user: any) => getData('purchase_orders', [], user);
export const fetchTeamMembers = (user: any) => getData('team_members', [], user);
export const fetchSupplierProductMaps = (user: any) => getData('supplier_product_map', [], user);
export const fetchCustomerPriceList = (user: any) => getData('customer_price_list', [], user);
export const saveCustomerPriceList = async (list: any, user: any) => saveData('customer_price_list', list, user);
export const fetchDoctors = (user: any) => getData('doctor_master', [], user);
export const fetchPhysicalInventory = (user: any) => getData('physical_inventory', [], user);
export const fetchEWayBills = (user: any) => getData('ewaybills', [], user);

export const markVoucherCancelled = async (type: string, user: any, serialId: string, id: string) => {};
export const postAutomatedJournal = async (
    params: {
        documentId: string;
        documentNumber: string;
        documentType: 'SALES' | 'PURCHASE';
        date: string;
        grandTotal: number;
        subTotal: number;
        cgstTotal: number;
        sgstTotal: number;
        igstTotal: number;
        discountTotal: number;
        companyId?: string;
    },
    user: RegisteredPharmacy
) => {
    if (!user?.organization_id) throw new Error("Unauthorized");

    try {
        const orgId = user.organization_id;
        const bookRows = await db.sql`
            SELECT id FROM set_of_books 
            WHERE organization_id = ${orgId} AND active_status = 'Active' 
            ORDER BY created_at ASC LIMIT 1
        `;
        const activeBookId = bookRows?.[0]?.id;
        if (!activeBookId) return { success: false, reason: 'No active Set of Books' };

        const resolveGl = async (codeMatch: string, defaultName: string) => {
            const rows = await db.sql`
                SELECT gl_code, gl_name FROM gl_master 
                WHERE organization_id = ${orgId} AND set_of_books_id = ${activeBookId} AND gl_code = ${codeMatch} AND active_status = 'Active' LIMIT 1
            `;
            if (rows && rows.length > 0) return { code: rows[0].gl_code, name: rows[0].gl_name };
            return { code: codeMatch, name: defaultName };
        };

        const jvId = generateUUID();
        let jvNumber = '';
        let referenceType = '';
        const lines: any[] = [];
        let lineNo = 1;

        const addLine = (glCode: string, glName: string, debit: number, credit: number) => {
            if (debit <= 0 && credit <= 0) return;
            lines.push({
                id: generateUUID(),
                organization_id: orgId,
                journal_entry_id: jvId,
                line_number: lineNo++,
                gl_code: glCode,
                gl_name: glName,
                debit: Number(debit.toFixed(2)),
                credit: Number(credit.toFixed(2)),
                reference_document_id: params.documentId,
                document_type: params.documentType,
                line_memo: `Auto-generated for ${params.documentType}`
            });
        };

        if (params.documentType === 'SALES') {
            jvNumber = `JV-S-${params.documentId.substring(0, 8).toUpperCase()}`;
            referenceType = 'SALES_BILL';

            const arGl = await resolveGl('120000', 'Accounts Receivable');
            const salesGl = await resolveGl('410000', 'Sales Revenue');
            const cgstGl = await resolveGl('221000', 'Output CGST');
            const sgstGl = await resolveGl('221001', 'Output SGST');
            const igstGl = await resolveGl('221002', 'Output IGST');
            const discGl = await resolveGl('510000', 'Discount Allowed');

            addLine(arGl.code, arGl.name, params.grandTotal, 0);
            if (params.discountTotal > 0) addLine(discGl.code, discGl.name, params.discountTotal, 0);
            addLine(salesGl.code, salesGl.name, 0, params.subTotal);
            if (params.cgstTotal > 0) addLine(cgstGl.code, cgstGl.name, 0, params.cgstTotal);
            if (params.sgstTotal > 0) addLine(sgstGl.code, sgstGl.name, 0, params.sgstTotal);
            if (params.igstTotal > 0) addLine(igstGl.code, igstGl.name, 0, params.igstTotal);

        } else if (params.documentType === 'PURCHASE') {
            jvNumber = `JV-P-${params.documentId.substring(0, 8).toUpperCase()}`;
            referenceType = 'PURCHASE_BILL';

            const apGl = await resolveGl('210000', 'Accounts Payable');
            const purGl = await resolveGl('500000', 'Purchases');
            const cgstGl = await resolveGl('121000', 'Input CGST');
            const sgstGl = await resolveGl('121001', 'Input SGST');
            const igstGl = await resolveGl('121002', 'Input IGST');
            const discGl = await resolveGl('420000', 'Discount Received');

            addLine(apGl.code, apGl.name, 0, params.grandTotal);
            addLine(purGl.code, purGl.name, params.subTotal, 0);
            if (params.cgstTotal > 0) addLine(cgstGl.code, cgstGl.name, params.cgstTotal, 0);
            if (params.sgstTotal > 0) addLine(sgstGl.code, sgstGl.name, params.sgstTotal, 0);
            if (params.igstTotal > 0) addLine(igstGl.code, igstGl.name, params.igstTotal, 0);
            if (params.discountTotal > 0) addLine(discGl.code, discGl.name, 0, params.discountTotal);
        }

        const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

        await db.sql`DELETE FROM journal_entry_header WHERE reference_id = ${params.documentId} AND reference_type = ${referenceType}`;
        await db.sql`DELETE FROM journal_entry_lines WHERE reference_document_id = ${params.documentId} AND document_type = ${params.documentType}`;

        const header = {
            id: jvId,
            organization_id: orgId,
            journal_entry_number: jvNumber,
            posting_date: params.date,
            status: 'Posted',
            reference_type: referenceType,
            reference_id: params.documentId,
            reference_document_id: params.documentId,
            document_type: params.documentType,
            document_reference: params.documentNumber,
            company_code_id: params.companyId || null,
            set_of_books_id: activeBookId,
            narration: `Automated Journal for ${params.documentType} ${params.documentNumber}`,
            total_debit: totalDebit,
            total_credit: totalCredit,
            created_by: user.user_id
        };

        await saveData('journal_entry_header', header, user, false);
        for (const l of lines) {
            await saveData('journal_entry_lines', l, user, false);
        }

        return { success: true, journalNumber: jvNumber };
    } catch (error: any) {
        console.error('postAutomatedJournal error:', error);
        throw error;
    }
};

export const postManualSalesVoucher = async (
    params: {
        voucherId: string;
        voucherDate: string;
        paymentMode: string;
        grandTotal: number;
        taxableValue: number;
        taxAmount: number;
        discountAmount: number;
        salesGlId: string;
        taxGlId: string;
        discountGlId: string;
        customerControlGlId: string;
        narration: string;
    },
    user: RegisteredPharmacy
) => {
    if (!user?.organization_id) throw new Error("Unauthorized");

    try {
        const orgId = user.organization_id;
        const bookRows = await db.sql`
            SELECT id FROM set_of_books 
            WHERE organization_id = ${orgId} AND active_status = 'Active' 
            ORDER BY created_at ASC LIMIT 1
        `;
        const activeBookId = bookRows?.[0]?.id;
        if (!activeBookId) throw new Error('No active Set of Books found');

        const resolveGlInfo = async (id: string) => {
            if (!id) return null;
            const rows = await db.sql`SELECT gl_code, gl_name FROM gl_master WHERE id = ${id} LIMIT 1`;
            return rows?.[0] || null;
        };

        const jvId = generateUUID();
        const jvNumber = `JV-MS-${params.voucherId.substring(0, 8).toUpperCase()}`;
        const lines: any[] = [];
        let lineNo = 1;

        const addLine = (glCode: string, glName: string, debit: number, credit: number) => {
            if (debit <= 0 && credit <= 0) return;
            lines.push({
                id: generateUUID(),
                organization_id: orgId,
                journal_entry_id: jvId,
                line_number: lineNo++,
                gl_code: glCode,
                gl_name: glName,
                debit: Number(debit.toFixed(2)),
                credit: Number(credit.toFixed(2)),
                reference_document_id: params.voucherId,
                document_type: 'SALES',
                line_memo: params.narration || 'Manual Sales Voucher'
            });
        };

        // 1. Debit Accounts Receivable (Customer)
        const arGl = await resolveGlInfo(params.customerControlGlId);
        if (arGl) addLine(arGl.gl_code, arGl.gl_name, params.grandTotal, 0);

        // 2. Debit Discount Allowed (if any)
        if (params.discountAmount > 0) {
            const discGl = await resolveGlInfo(params.discountGlId);
            if (discGl) addLine(discGl.gl_code, discGl.gl_name, params.discountAmount, 0);
        }

        // 3. Credit Sales Revenue
        const salesGl = await resolveGlInfo(params.salesGlId);
        if (salesGl) addLine(salesGl.gl_code, salesGl.gl_name, 0, params.taxableValue + params.discountAmount); 

        // 4. Credit Output GST
        if (params.taxAmount > 0) {
            const taxGl = await resolveGlInfo(params.taxGlId);
            if (taxGl) addLine(taxGl.gl_code, taxGl.gl_name, 0, params.taxAmount);
        }

        const header = {
            id: jvId,
            organization_id: orgId,
            journal_entry_number: jvNumber,
            posting_date: params.voucherDate,
            status: 'Posted',
            reference_type: 'SALES_BILL',
            reference_id: params.voucherId,
            reference_document_id: params.voucherId,
            document_type: 'SALES',
            document_reference: params.voucherId,
            set_of_books_id: activeBookId,
            narration: params.narration || `Manual Sales Voucher ${params.voucherId}`,
            total_debit: lines.reduce((s, l) => s + l.debit, 0),
            total_credit: lines.reduce((s, l) => s + l.credit, 0),
            created_by: user.user_id
        };

        await saveData('journal_entry_header', header, user, false);
        for (const l of lines) {
            await saveData('journal_entry_lines', l, user, false);
        }

        return { success: true, journalNumber: jvNumber };
    } catch (error: any) {
        console.error('postManualSalesVoucher error:', error);
        throw error;
    }
};

export const pushPartnerOrder = async (orgId: string, name: string, email: string, payload: any, poId: string) => {};
export const broadcastSyncMessage = async (sessionId: string, data: any) => {};
export const listenForSyncMessage = (sessionId: string, callback: any) => ({ unsubscribe: () => {} });
export const getLatestSyncMessage = (sessionId: string) => null;
export const updateSalesChallanStatus = async (id: string, status: any, user: any) => {};
export const updateChallanStatus = async (id: string, status: any, user: any) => {};
export const finalizePhysicalInventorySession = async (session: any, user: any) => {
    if (!user?.organization_id) throw new Error("Unauthorized");

    // 1. Update session status
    const finalizedSession = {
        ...session,
        status: 'completed',
        endDate: new Date().toISOString()
    };
    await saveData('physical_inventory', finalizedSession, user, true);

    let totalVarianceValue = 0;

    // 2. Update inventory stock for each item
    for (const item of (session.items || [])) {
        if (!item.inventoryItemId) continue;
        
        const invRows = await db.sql`
            SELECT * FROM inventory 
            WHERE id = ${item.inventoryItemId} AND organization_id = ${user.organization_id}
            LIMIT 1
        `;
        
        if (invRows && invRows.length > 0) {
            const invItem = fromDb('inventory', invRows[0]);
            const stockBefore = Number(invItem.stock || 0);
            const stockAfter = Number(item.physicalCount || 0);
            const variance = stockAfter - stockBefore;
            const varianceValue = variance * (item.cost || 0);

            if (variance !== 0) {
                // Update stock in DB
                await saveData('inventory', { ...invItem, stock: stockAfter }, user, true);
                
                totalVarianceValue += varianceValue;
            }
        }
    }

    // 3. Post Journal Entry for total variance if not zero
    if (totalVarianceValue !== 0) {
        try {
            const orgId = user.organization_id;
            const bookRows = await db.sql`
                SELECT id FROM set_of_books 
                WHERE organization_id = ${orgId} AND active_status = 'Active' 
                ORDER BY created_at ASC LIMIT 1
            `;
            if (bookRows && bookRows.length > 0) {
                const bookId = bookRows[0].id;
                const glRows = await db.sql`SELECT * FROM gl_master WHERE organization_id = ${orgId}`;
                const resolveGL = (rows: any[], code: string, name: string) => {
                    const found = rows.find(r => r.account_code === code || r.account_name === name);
                    return found ? found.id : null;
                };

                const inventoryGl = resolveGL(glRows, '130000', 'Inventory') || resolveGL(glRows, '130000', 'Stock');
                const varianceGl = resolveGL(glRows, '510000', 'Inventory Adjustment') || resolveGL(glRows, '510000', 'Cost of Goods Sold');

                if (inventoryGl && varianceGl) {
                    const jvId = generateUUID();
                    const header = {
                        id: jvId,
                        organization_id: orgId,
                        set_of_books_id: bookId,
                        journal_number: `JV-AUDIT-${session.id || generateUUID().slice(0, 8)}`,
                        date: finalizedSession.endDate,
                        type: 'Standard',
                        reference_type: 'STOCK_AUDIT',
                        reference_id: finalizedSession.id,
                        description: `Stock Audit Variance for ${finalizedSession.reason || 'Manual Audit'}`,
                        status: 'Draft',
                        created_by: user.user_id,
                        created_at: new Date().toISOString()
                    };
                    await saveData('journal_entry_header', header, user, true);

                    const lines = [];
                    const absVariance = Math.abs(totalVarianceValue);
                    
                    if (totalVarianceValue > 0) {
                        // Stock increased: Debit Inventory, Credit Variance
                        lines.push({
                            id: generateUUID(), organization_id: orgId, journal_header_id: jvId,
                            account_id: inventoryGl, line_description: 'Audit Stock Gain',
                            debit: absVariance, credit: 0, line_order: 1
                        });
                        lines.push({
                            id: generateUUID(), organization_id: orgId, journal_header_id: jvId,
                            account_id: varianceGl, line_description: 'Audit Stock Gain Offset',
                            debit: 0, credit: absVariance, line_order: 2
                        });
                    } else {
                        // Stock decreased: Debit Variance, Credit Inventory
                        lines.push({
                            id: generateUUID(), organization_id: orgId, journal_header_id: jvId,
                            account_id: varianceGl, line_description: 'Audit Stock Loss',
                            debit: absVariance, credit: 0, line_order: 1
                        });
                        lines.push({
                            id: generateUUID(), organization_id: orgId, journal_header_id: jvId,
                            account_id: inventoryGl, line_description: 'Audit Stock Loss Offset',
                            debit: 0, credit: absVariance, line_order: 2
                        });
                    }

                    for (const l of lines) {
                        await saveData('journal_entry_lines', l, user, false);
                    }
                    
                    await db.sql`UPDATE journal_entry_header SET status = 'Posted' WHERE id = ${jvId}`;
                }
            }
        } catch (err) {
            console.error("Failed to post audit variance journal:", err);
        }
    }
};

export const addSalesReturn = async (sr: any, user: any) => saveData('sales_returns', sr, user);
export const addPurchaseReturn = async (pr: any, user: any) => saveData('purchase_returns', pr, user);
export const syncSalesReturnLedger = async (sr: any, user: any) => {};

export const syncPendingData = async (user: any) => ({ success: 0, failed: 0 });

export const getOrCreateMobileDeviceId = (): string => {
    const key = 'mdxera.mobile.device_id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
};

export const createMobileSyncedBill = async (payload: any) => ({ id: generateUUID(), ...payload });
export const fetchPendingMobileBills = async (filters: any) => [];
export const markMobileBillImported = async (id: string, status: string, error?: string | null) => {};

export const addTeamMember = async (email: string, role: string, name: string, pass: string, orgId: string, extra: any) => {
    await saveData('team_members', { email, role, name, status: 'active', ...extra }, { organization_id: orgId } as any);
};
export const updateMemberRole = async (memberId: string, role: string, user: any) => {
    const m = await getDataById('team_members', memberId, user);
    if (m) await saveData('team_members', { ...m, role }, user, true);
};
export const removeTeamMember = async (memberId: string) => {
    await db.exec(`DELETE FROM team_members WHERE id = ?`, [memberId]);
};

export const requestPasswordReset = async (email: string) => { console.warn('Offline: requestPasswordReset not supported'); };
export const verifyRecoveryToken = async (email: string, token: string) => { console.warn('Offline: verifyRecoveryToken not supported'); };
export const updatePassword = async (pass: string) => { console.warn('Offline: updatePassword not supported'); };

export const generateNextSalesBillId = async (template: string) => template + '-1';
