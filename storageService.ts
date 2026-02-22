
import { supabase } from './supabaseClient';
import { idb, STORES } from './indexedDbService';
import { db as psDb } from './powersync'; // Import PowerSync instance
import { 
    RegisteredPharmacy, InventoryItem, Transaction, BillItem, Purchase, PurchaseItem, Supplier, 
    Customer, PurchaseOrder, TransactionLedgerItem, UserRole, OrganizationMember, 
    Medicine, SupplierProductMap, EWayBill, 
    DeliveryChallan, DeliveryChallanStatus, PhysicalInventorySession, PhysicalInventoryStatus,
    CustomerPriceListEntry, SalesChallanStatus, SalesChallan, AppConfigurations 
} from './types';
import { parseNetworkAndApiError } from './utils/error';

export const generateUUID = () => crypto.randomUUID();

/**
 * Utility to convert snake_case object keys to camelCase.
 */
const toCamel = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toCamel);
    return Object.keys(obj).reduce((acc, key) => {
        const preservedKeys = [
            'organization_id', 
            'user_id', 
            'created_by_id', 
            'assigned_staff_id', 
            'supplier_id', 
            'master_medicine_id', 
            'supplier_product_name',
            'auto_apply',
            'full_name',
            'pharmacy_name',
            'manager_name',
            'address_line2',
            'retailer_gstin',
            'drug_license',
            'dl_valid_to',
            'food_license',
            'pan_number',
            'bank_account_name',
            'bank_account_number',
            'bank_ifsc_code',
            'bank_upi_id',
            'authorized_signatory',
            'pharmacy_logo_url',
            'terms_and_conditions',
            'purchase_order_terms',
            'subscription_plan',
            'subscription_status',
            'subscription_id',
            'is_active',
            'is_blocked',
            'gst_number',
            'pan_number'
        ];
        
        const isPreserved = preservedKeys.includes(key);
        
        let camelKey = isPreserved 
            ? key 
            : key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
        
        const val = obj[key];
        acc[camelKey] = isPreserved ? val : toCamel(val);
        return acc;
    }, {} as any);
};

/**
 * Utility to convert camelCase object keys to snake_case.
 */
const toSnake = (obj: any): any => {
    if (obj === '') return null;
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toSnake);
    return Object.keys(obj).reduce((acc, key) => {
        if (key.startsWith('_')) return acc;

        const preservedKeys = [
            'organization_id', 
            'user_id', 
            'created_by_id', 
            'assigned_staff_id', 
            'supplier_id', 
            'master_medicine_id', 
            'supplier_product_name',
            'auto_apply',
            'full_name',
            'pharmacy_name',
            'manager_name',
            'address_line2',
            'retailer_gstin',
            'drug_license',
            'dl_valid_to',
            'food_license',
            'pan_number',
            'bank_account_name',
            'bank_account_number',
            'bank_ifsc_code',
            'bank_upi_id',
            'authorized_signatory',
            'pharmacy_logo_url',
            'terms_and_conditions',
            'purchase_order_terms',
            'subscription_plan',
            'subscription_status',
            'subscription_id',
            'is_active',
            'is_blocked',
            'gst_number',
            'pan_number'
        ];
        
        const isPreserved = preservedKeys.includes(key);
        
        let snakeKey = (isPreserved || key.includes('_'))
            ? key
            : key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        
        const val = obj[key];
        acc[snakeKey] = isPreserved ? val : toSnake(val);
        return acc;
    }, {} as any);
};

/**
 * Enhanced Save Logic for Offline-First.
 */
export const saveData = async (tableName: string, data: any, user: RegisteredPharmacy | null): Promise<any> => {
    if (!user?.organization_id) throw new Error("Organizational identity not verified.");
    
    // Normalize naming for database
    const dbPayload: any = { ...data, organization_id: user.organization_id };
    
    // Resolve Identity
    const currentUserId = user?.user_id || user?.id;

    // Table-specific logic: Inject user_id for tracking creation/ownership
    const ownershipTrackingTables = [
        'inventory', 
        'sales_bill', 
        'purchases', 
        'suppliers', 
        'customers', 
        'material_master', 
        'purchase_orders', 
        'sales_challans', 
        'delivery_challans', 
        'physical_inventory'
    ];

    if (ownershipTrackingTables.includes(tableName)) {
        // Ensure user_id is set to the current authenticated user for audit
        if ((!dbPayload.user_id || dbPayload.user_id === '') && currentUserId) {
            dbPayload.user_id = currentUserId;
        }
    }

    if (!dbPayload.id) {
        dbPayload.id = generateUUID();
    }

    // 1. Always save to local cache (IndexedDB) immediately for zero-latency
    await idb.put(STORES[tableName.toUpperCase() as keyof typeof STORES], dbPayload);

    // 2. Background sync to Supabase if online
    if (navigator.onLine) {
        try {
            const snakeData = toSnake(dbPayload);
            const { data: saved, error } = await supabase.from(tableName).upsert(snakeData).select().single();
            if (error) {
                console.warn(`Supabase background sync deferred for ${tableName}:`, error.message);
                throw error;
            }
            return saved ? toCamel(saved) : dbPayload;
        } catch (e) {
            console.warn("Supabase sync failed, local copy preserved.", e);
        }
    }
    return dbPayload;
};

export const addTransaction = async (tx: Transaction, user: RegisteredPharmacy) => {
    // Explicitly ensure user_id is present before calling saveData
    if (!tx.user_id) {
        tx.user_id = user.user_id;
    }
    
    const res = await saveData('sales_bill', tx, user);
    // Adjust inventory stock levels locally
    for (const item of tx.items) {
        const inv = await idb.get(STORES.INVENTORY, item.inventoryItemId) as InventoryItem;
        if (inv) {
            inv.stock -= (item.quantity * (inv.unitsPerPack || 1)) + (item.looseQuantity || 0);
            await saveData('inventory', inv, user);
        }
    }
    return res;
};

export const fetchInventory = (user: RegisteredPharmacy) => getData('inventory', [], user);
export const fetchMedicineMaster = (user: RegisteredPharmacy) => getData('material_master', [], user);
export const fetchTransactions = (user: RegisteredPharmacy) => getData('sales_bill', [], user);
export const fetchPurchases = (user: RegisteredPharmacy) => getData('purchases', [], user);
export const fetchSuppliers = (user: RegisteredPharmacy) => getData('suppliers', [], user);
export const fetchCustomers = (user: RegisteredPharmacy) => getData('customers', [], user);

/**
 * Fetches all organization records from Supabase by handling PostgREST pagination (default 1000 limit).
 */
const fetchAllPagesFromSupabase = async (tableName: string, orgId: string): Promise<any[]> => {
    let allData: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('organization_id', orgId)
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                from += PAGE_SIZE;
            }
        } else {
            hasMore = false;
        }
    }

    return allData;
};

export const getData = async (tableName: string, defaultValue: any[] = [], user: RegisteredPharmacy | null): Promise<any[]> => {
    if (!user) return defaultValue;
    
    const storeKey = tableName.toUpperCase() as keyof typeof STORES;
    // Priority 1: Local IndexedDB for instant UI
    const cached = await idb.getAll(STORES[storeKey]);
    
    // Priority 2: Fetch updates in background
    if (navigator.onLine) {
        setTimeout(async () => {
            try {
                const allData = await fetchAllPagesFromSupabase(tableName, user.organization_id);
                if (allData.length > 0) {
                    await idb.putBulk(STORES[storeKey], allData.map(d => toCamel(d)));
                }
            } catch (e) {
                console.error(`Background fetch failed for ${tableName}:`, e);
            }
        }, 0);
    }
    
    return cached.length > 0 ? cached : defaultValue;
};

export const updateProfile = async (profile: RegisteredPharmacy): Promise<RegisteredPharmacy> => {
    const dbPayload = toSnake(profile);
    const { data, error } = await supabase.from('profiles').upsert(dbPayload).select().single();
    if (error) throw error;
    const normalized = toCamel(data);
    if (!normalized.id) normalized.id = normalized.user_id;
    await idb.put(STORES.PROFILES, normalized);
    return normalized;
};

export const login = async (email: string, pass: string): Promise<RegisteredPharmacy> => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authError) throw authError;
    if (!authData.user) throw new Error("Authentication failed.");
    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', authData.user.id).single();
    if (!profile) throw new Error("Profile not found.");
    
    const normalizedProfile = toCamel(profile);
    if (!normalizedProfile.id) normalizedProfile.id = normalizedProfile.user_id;
    await idb.put(STORES.PROFILES, normalizedProfile);
    return normalizedProfile;
};

export const signup = async (email: string, pass: string, fullName: string, pharmacyName: string): Promise<RegisteredPharmacy> => {
    const orgId = generateUUID();
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email, 
        password: pass, 
        options: { data: { full_name: fullName, pharmacy_name: pharmacyName, role: 'owner', organization_id: orgId } }
    });
    if (authError) throw authError;
    const profile = { user_id: authData.user!.id, organization_id: orgId, email, full_name: fullName, pharmacy_name: pharmacyName, role: 'owner', is_active: true };
    await supabase.from('profiles').insert(toSnake(profile));
    const user = { ...profile, user_id: profile.user_id, is_active: true } as unknown as RegisteredPharmacy;
    if (!user.id) user.id = user.user_id;
    await idb.put(STORES.PROFILES, user);
    return user;
};

export const clearCurrentUser = async () => {
    await supabase.auth.signOut();
    const allStores = Object.values(STORES);
    for (const store of allStores) {
        const db = await openDB();
        const tx = db.transaction(store as string, 'readwrite');
        tx.objectStore(store as string).clear();
    }
};

export const getCurrentUser = async (): Promise<RegisteredPharmacy | null> => {
    const cached = await idb.getAll(STORES.PROFILES);
    return cached.length > 0 ? cached[0] : null;
};

const openDB = (): Promise<IDBDatabase> => {
    const DB_NAME = 'MedimartDB';
    const DB_VERSION = 16;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};
