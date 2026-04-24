
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
        
        // These specific keys MUST remain snake_case for database interaction
        const preservedKeys = [
            'organization_id', 'user_id', 'created_by_id', 'assigned_staff_id', 'performed_by_id',
            'supplier_id', 'master_medicine_id', 'full_name', 'pharmacy_name'
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
            'supplier_id', 'master_medicine_id', 'full_name', 'pharmacy_name'
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
    return toCamel(processed);
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
export const postManualSalesVoucher = async (args: any, user: any) => {};
export const pushPartnerOrder = async (orgId: string, name: string, email: string, payload: any, poId: string) => {};
export const broadcastSyncMessage = async (sessionId: string, data: any) => {};
export const listenForSyncMessage = (sessionId: string, callback: any) => ({ unsubscribe: () => {} });
export const getLatestSyncMessage = (sessionId: string) => null;
export const updateSalesChallanStatus = async (id: string, status: any, user: any) => {};
export const updateChallanStatus = async (id: string, status: any, user: any) => {};
export const finalizePhysicalInventorySession = async (session: any, user: any) => {};

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
