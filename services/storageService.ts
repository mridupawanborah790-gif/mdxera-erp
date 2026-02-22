

import { supabase } from './supabaseClient';
import { idb, STORES } from './indexedDbService';
import {
    RegisteredPharmacy, InventoryItem, Transaction, BillItem, Purchase, PurchaseItem, Supplier,
    Customer, PurchaseOrder, TransactionLedgerItem, UserRole, OrganizationMember,
    Medicine, SupplierProductMap, EWayBill,
    DeliveryChallan, DeliveryChallanStatus, PhysicalInventorySession, PhysicalInventoryStatus,
    CustomerPriceListEntry, SalesChallanStatus, SalesChallan, AppConfigurations
} from '../types';
import { parseNetworkAndApiError } from '../utils/error';
import { normalizeImportDate } from '../utils/helpers';

export const generateUUID = () => crypto.randomUUID();

const toCamel = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toCamel);
    return Object.keys(obj).reduce((acc, key) => {
        const preservedKeys = ['organization_id', 'user_id', 'created_by_id', 'assigned_staff_id', 'supplier_id', 'master_medicine_id', 'supplier_product_name', 'auto_apply', 'full_name', 'pharmacy_name', 'manager_name', 'address_line2', 'retailer_gstin', 'drug_license', 'dl_valid_to', 'food_license', 'pan_number', 'bank_account_name', 'bank_account_number', 'bank_ifsc_code', 'bank_upi_id', 'authorized_signatory', 'pharmacy_logo_url', 'terms_and_conditions', 'purchase_order_terms', 'subscription_plan', 'subscription_status', 'subscription_id', 'is_active', 'is_blocked', 'gst_number', 'pan_number'];
        let camelKey = preservedKeys.includes(key) ? key : key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
        acc[camelKey] = preservedKeys.includes(key) ? obj[key] : toCamel(obj[key]);
        return acc;
    }, {} as any);
};

const toSnake = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toSnake);
    return Object.keys(obj).reduce((acc, key) => {
        if (key.startsWith('_')) return acc;
        const preservedKeys = ['organization_id', 'user_id', 'created_by_id', 'assigned_staff_id', 'supplier_id', 'master_medicine_id', 'supplier_product_name', 'auto_apply', 'full_name', 'pharmacy_name', 'manager_name', 'address_line2', 'retailer_gstin', 'drug_license', 'dl_valid_to', 'food_license', 'pan_number', 'bank_account_name', 'bank_account_number', 'bank_ifsc_code', 'bank_upi_id', 'authorized_signatory', 'pharmacy_logo_url', 'terms_and_conditions', 'purchase_order_terms', 'subscription_plan', 'subscription_status', 'subscription_id', 'is_active', 'is_blocked', 'gst_number', 'pan_number'];
        let snakeKey = preservedKeys.includes(key) ? key : key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        acc[snakeKey] = preservedKeys.includes(key) ? obj[key] : toSnake(obj[key]);
        return acc;
    }, {} as any);
};

export const saveData = async (tableName: string, data: any, user: RegisteredPharmacy | null): Promise<any> => {
    if (!user?.organization_id) throw new Error("Organizational identity not verified.");
    const dbPayload: any = { ...data, organization_id: user.organization_id };
    const currentUserId = user?.user_id || user?.id;
    const ownershipTrackingTables = ['inventory', 'sales_bill', 'purchases', 'suppliers', 'customers', 'material_master', 'purchase_orders', 'sales_challans', 'delivery_challans', 'physical_inventory'];
    if (ownershipTrackingTables.includes(tableName) && currentUserId && !dbPayload.user_id) {
        dbPayload.user_id = currentUserId;
    }
    if (!dbPayload.id) dbPayload.id = generateUUID();
    await idb.put(STORES[tableName.toUpperCase() as keyof typeof STORES], dbPayload);
    if (navigator.onLine) {
        try {
            const snakeData = toSnake(dbPayload);
            const { data: saved, error } = await supabase.from(tableName).upsert(snakeData).select().single();
            if (error) throw error;
            return saved ? toCamel(saved) : dbPayload;
        } catch (e) {
            console.warn("Supabase sync failed, local copy preserved.");
        }
    }
    return dbPayload;
};

export const saveBulkData = async (tableName: string, dataArray: any[], user: RegisteredPharmacy | null): Promise<void> => {
    if (!user) return;
    for (const item of dataArray) {
        await saveData(tableName, item, user);
    }
};

export const deleteData = async (tableName: string, id: string): Promise<void> => {
    const storeKey = tableName.toUpperCase() as keyof typeof STORES;
    await idb.delete(STORES[storeKey], id);
    if (navigator.onLine) {
        await supabase.from(tableName).delete().eq('id', id);
    }
};

export const fetchInventory = (user: RegisteredPharmacy) => getData('inventory', [], user);
export const fetchMedicineMaster = (user: RegisteredPharmacy) => getData('material_master', [], user);
export const fetchTransactions = (user: RegisteredPharmacy) => getData('sales_bill', [], user);
export const fetchPurchases = (user: RegisteredPharmacy) => getData('purchases', [], user);
export const fetchSuppliers = (user: RegisteredPharmacy) => getData('suppliers', [], user);
export const fetchCustomers = (user: RegisteredPharmacy) => getData('customers', [], user);
export const fetchPurchaseOrders = (user: RegisteredPharmacy) => getData('purchase_orders', [], user);
export const fetchTeamMembers = (user: RegisteredPharmacy) => getData('team_members', [], user);
export const fetchDistributorProductMaps = (user: RegisteredPharmacy) => getData('supplier_product_map', [], user);
export const fetchCustomerPriceList = (user: RegisteredPharmacy) => getData('customer_price_list', [], user);

// Added missing fetchPhysicalInventory function
export const fetchPhysicalInventory = (user: RegisteredPharmacy) => getData('physical_inventory', [], user);

// Added missing fetchEWayBills function
export const fetchEWayBills = (user: RegisteredPharmacy) => getData('ewaybills', [], user);

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

    // Priority 2: Fetch updates in background if online
    if (navigator.onLine) {
        setTimeout(async () => {
            try {
                const allData = await fetchAllPagesFromSupabase(tableName, user.organization_id);
                if (allData.length > 0) {
                    const normalized = allData.map(d => toCamel(d));
                    await idb.putBulk(STORES[storeKey], normalized);
                }
            } catch (e) {
                console.error(`Background fetch failed for ${tableName}:`, e);
            }
        }, 0);
    }
    return cached.length > 0 ? cached : defaultValue;
};

export const addTransaction = async (tx: Transaction, user: RegisteredPharmacy) => {
    if (!tx.user_id) tx.user_id = user.user_id;
    const res = await saveData('sales_bill', tx, user);
    for (const item of tx.items) {
        const inv = await idb.get(STORES.INVENTORY, item.inventoryItemId) as InventoryItem;
        if (inv) {
            inv.stock -= (item.quantity * (inv.unitsPerPack || 1)) + (item.looseQuantity || 0);
            await saveData('inventory', inv, user);
        }
    }
    return res;
};

export const addPurchase = async (p: Purchase, user: RegisteredPharmacy) => {
    const res = await saveData('purchases', p, user);

    // Use a Map to accumulate stock changes for this purchase
    // Key is inventoryItemId or "name|batch" if not linked
    const stockChanges = new Map<string, { units: number, item: PurchaseItem }>();

    for (const item of p.items) {
        if (!item.name) continue;
        const key = item.inventoryItemId || `${(item.name || '').toLowerCase().trim()}|${(item.batch || 'UNSET').toLowerCase().trim()}`;
        const existing = stockChanges.get(key) || { units: 0, item };

        const uPP = item.unitsPerPack || 1;
        const units = (Number(item.quantity) * uPP) + Number(item.looseQuantity || 0) + Number(item.freeQuantity || 0);

        stockChanges.set(key, { units: existing.units + units, item });
    }

    const currentInventory = await fetchInventory(user);

    for (const [key, change] of stockChanges.entries()) {
        let existingInv: InventoryItem | undefined;

        if (change.item.inventoryItemId) {
            existingInv = currentInventory.find(i => i.id === change.item.inventoryItemId);
        }

        if (!existingInv) {
            const nameClean = (change.item.name || '').toLowerCase().trim();
            const batchClean = (change.item.batch || 'UNSET').toLowerCase().trim();
            existingInv = currentInventory.find(i =>
                (i.name || '').toLowerCase().trim() === nameClean &&
                (i.batch || 'UNSET').toLowerCase().trim() === batchClean
            );
        }

        if (existingInv) {
            existingInv.stock = Number(existingInv.stock || 0) + change.units;
            await saveData('inventory', existingInv, user);
        } else {
            const uPP = change.item.unitsPerPack || 1;
            const newInv: Omit<InventoryItem, 'id'> = {
                organization_id: user.organization_id,
                name: change.item.name,
                brand: change.item.brand || '',
                category: change.item.category || 'General',
                manufacturer: change.item.manufacturer || '',
                stock: change.units,
                unitsPerPack: uPP,
                batch: change.item.batch || 'UNSET',
                expiry: change.item.expiry,
                purchasePrice: change.item.purchasePrice,
                mrp: change.item.mrp,
                gstPercent: change.item.gstPercent || 0,
                hsnCode: change.item.hsnCode || '',
                minStockLimit: 10,
                is_active: true
            };
            await saveData('inventory', newInv, user);
        }
    }
    return res;
};

export const updatePurchase = async (p: Purchase, user: RegisteredPharmacy) => {
    const original = await idb.get(STORES.PURCHASES, p.id) as Purchase;
    const res = await saveData('purchases', p, user);
    if (!original) return res;

    // To properly adjust stock, we calculate the diff between original and new
    // We reverse the original stock added, then add the new stock
    const currentInventory = await fetchInventory(user);

    // map key: identification string
    const itemMap = new Map<string, { oldUnits: number, newUnits: number, item: PurchaseItem }>();

    // Process original items
    for (const item of original.items) {
        if (!item.name) continue;
        const key = item.inventoryItemId || `${item.name.toLowerCase().trim()}|${(item.batch || 'UNSET').toLowerCase().trim()}`;
        const uPP = item.unitsPerPack || 1;
        const units = (Number(item.quantity) * uPP) + Number(item.looseQuantity || 0) + Number(item.freeQuantity || 0);
        itemMap.set(key, { oldUnits: units, newUnits: 0, item });
    }

    // Process new items
    for (const item of p.items) {
        if (!item.name) continue;
        const key = item.inventoryItemId || `${item.name.toLowerCase().trim()}|${(item.batch || 'UNSET').toLowerCase().trim()}`;
        const existing = itemMap.get(key) || { oldUnits: 0, newUnits: 0, item };
        const uPP = item.unitsPerPack || 1;
        const units = (Number(item.quantity) * uPP) + Number(item.looseQuantity || 0) + Number(item.freeQuantity || 0);
        itemMap.set(key, { ...existing, newUnits: units, item });
    }

    // Apply changes
    for (const [key, data] of itemMap.entries()) {
        const diff = data.newUnits - data.oldUnits;
        if (diff === 0) continue;

        let invItem: InventoryItem | undefined;
        if (data.item.inventoryItemId) {
            invItem = currentInventory.find(i => i.id === data.item.inventoryItemId);
        }

        if (!invItem) {
            const nameClean = data.item.name.toLowerCase().trim();
            const batchClean = (data.item.batch || 'UNSET').toLowerCase().trim();
            invItem = currentInventory.find(i =>
                (i.name || '').toLowerCase().trim() === nameClean &&
                (i.batch || 'UNSET').toLowerCase().trim() === batchClean
            );
        }

        if (invItem) {
            invItem.stock = Number(invItem.stock || 0) + diff;
            await saveData('inventory', invItem, user);
        } else if (diff > 0) {
            // New inventory item created during update
            const uPP = data.item.unitsPerPack || 1;
            const newInv: Omit<InventoryItem, 'id'> = {
                organization_id: user.organization_id,
                name: data.item.name,
                brand: data.item.brand || '',
                category: data.item.category || 'General',
                manufacturer: data.item.manufacturer || '',
                stock: diff,
                unitsPerPack: uPP,
                batch: data.item.batch || 'UNSET',
                expiry: data.item.expiry,
                purchasePrice: data.item.purchasePrice,
                mrp: data.item.mrp,
                gstPercent: data.item.gstPercent || 0,
                hsnCode: data.item.hsnCode || '',
                minStockLimit: 10,
                is_active: true
            };
            await saveData('inventory', newInv, user);
        }
    }

    return res;
};
export const saveCustomerPriceList = (entry: CustomerPriceListEntry, user: RegisteredPharmacy) => saveData('customer_price_list', entry, user);

export const updateProfile = async (profile: RegisteredPharmacy): Promise<RegisteredPharmacy> => {
    const dbPayload = toSnake(profile);
    const { data, error } = await supabase.from('profiles').upsert(dbPayload).select().single();
    if (error) throw error;
    const normalized = toCamel(data);
    if (!normalized.id) normalized.id = normalized.user_id;
    await idb.put(STORES.PROFILES, normalized);
    return normalized;
};

export const fetchProfile = async (userId: string): Promise<RegisteredPharmacy | null> => {
    if (navigator.onLine) {
        try {
            const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
            if (data && !error) {
                const normalized = toCamel(data);
                if (!normalized.id) normalized.id = normalized.user_id;
                await idb.put(STORES.PROFILES, normalized);
                return normalized;
            }
        } catch (e) { }
    }
    return await idb.get(STORES.PROFILES, userId) as RegisteredPharmacy || null;
};

export const login = async (email: string, pass: string): Promise<RegisteredPharmacy> => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authError) throw authError;
    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', authData.user!.id).single();
    if (!profile) throw new Error("Profile not found.");
    const normalized = toCamel(profile);
    if (!normalized.id) normalized.id = normalized.user_id;
    await idb.put(STORES.PROFILES, normalized);
    return normalized;
};

export const signup = async (email: string, pass: string, fullName: string, pharmacyName: string): Promise<RegisteredPharmacy> => {
    const orgId = generateUUID();
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: fullName, pharmacy_name: pharmacyName, role: 'owner', organization_id: orgId } } });
    if (authError) throw authError;
    const profile = { user_id: authData.user!.id, organization_id: orgId, email, full_name: fullName, pharmacy_name: pharmacyName, role: 'owner', is_active: true };
    await supabase.from('profiles').insert(toSnake(profile));
    const user = { ...profile, id: profile.user_id } as unknown as RegisteredPharmacy;
    await idb.put(STORES.PROFILES, user);
    return user;
};

export const clearCurrentUser = async () => {
    await supabase.auth.signOut();
    await idb.clearAllStores();
};

export const getCurrentUser = async (): Promise<RegisteredPharmacy | null> => {
    const cached = await idb.getAll(STORES.PROFILES);
    return cached.length > 0 ? cached[0] : null;
};

export const addTeamMember = async (email: string, role: UserRole, name: string, pass: string, organization_id: string) => {
    const id = generateUUID();
    const newMember: OrganizationMember = { id, email, name, role, status: 'active', isLocked: false, passwordLocked: false };
    await idb.put(STORES.TEAM_MEMBERS, { ...newMember, organization_id });
    if (navigator.onLine) await supabase.from('team_members').upsert(toSnake({ ...newMember, organization_id }));
};

export const updateMemberRole = async (memberId: string, newRole: UserRole) => {
    const member = await idb.get(STORES.TEAM_MEMBERS, memberId) as OrganizationMember;
    if (member) {
        member.role = newRole;
        await idb.put(STORES.TEAM_MEMBERS, member);
    }
    if (navigator.onLine) await supabase.from('team_members').update({ role: newRole }).eq('id', memberId);
};

export const removeTeamMember = async (memberId: string) => {
    await idb.delete(STORES.TEAM_MEMBERS, memberId);
    if (navigator.onLine) await supabase.from('team_members').delete().eq('id', memberId);
};

export const addLedgerEntry = async (entry: TransactionLedgerItem, owner: { type: 'customer' | 'supplier' | 'distributor', id: string }, user: RegisteredPharmacy) => {
    const type = owner.type === 'distributor' ? 'supplier' : owner.type;
    const storeName = type === 'customer' ? STORES.CUSTOMERS : STORES.SUPPLIERS;
    const entity = await idb.get(storeName, owner.id) as (Customer | Supplier | undefined);
    if (!entity) throw new Error(`${type} not found`);
    const ledger = [...(entity.ledger || [])];
    const prevBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : (entity.opening_balance || 0);
    const newBalance = prevBalance + (entry.debit || 0) - (entry.credit || 0);
    entity.ledger = [...ledger, { ...entry, balance: newBalance }];
    return await saveData(type === 'customer' ? 'customers' : 'suppliers', entity, user);
};

export const pushPartnerOrder = async (senderOrgId: string, senderName: string, receiverEmail: string, payload: any, senderPoId: string) => {
    if (navigator.onLine) {
        const { error } = await supabase.from('partner_orders').insert({ sender_org_id: senderOrgId, sender_name: senderName, receiver_email: receiverEmail, payload, sender_po_id: senderPoId, status: 'pending' });
        if (error) throw error;
    }
};

export const broadcastSyncMessage = async (sessionId: string, data: any) => {
    const channel = supabase.channel(`sync:${sessionId}`);
    await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.send({ type: 'broadcast', event: 'capture', payload: data });
    });
};

export const listenForSyncMessage = (sessionId: string, callback: (data: any) => void) => {
    return supabase.channel(`sync:${sessionId}`).on('broadcast', { event: 'capture' }, ({ payload }) => callback(payload)).subscribe();
};

export const updateSalesChallanStatus = async (id: string, status: SalesChallanStatus, user: RegisteredPharmacy) => {
    const challan = await idb.get(STORES.SALES_CHALLANS, id) as SalesChallan;
    if (challan) await saveData('sales_challans', { ...challan, status }, user);
};

export const updateChallanStatus = async (id: string, status: DeliveryChallanStatus, user: RegisteredPharmacy) => {
    const challan = await idb.get(STORES.DELIVERY_CHALLANS, id) as DeliveryChallan;
    if (challan) await saveData('delivery_challans', { ...challan, status }, user);
};

export const finalizePhysicalInventorySession = async (session: PhysicalInventorySession, user: RegisteredPharmacy) => {
    const finalized = { ...session, status: PhysicalInventoryStatus.COMPLETED, endDate: new Date().toISOString() };
    await saveData('physical_inventory', finalized, user);
    for (const item of session.items) {
        const invItem = await idb.get(STORES.INVENTORY, item.inventoryItemId) as InventoryItem;
        if (invItem) {
            invItem.stock = item.physicalCount;
            await saveData('inventory', invItem, user);
        }
    }
};
