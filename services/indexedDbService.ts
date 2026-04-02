const DB_NAME = 'MedimartDB';
const DB_VERSION = 16; 
const ENABLE_INDEXED_DB = false;

export const STORES = {
    PROFILES: 'profiles',
    INVENTORY: 'inventory',
    SALES_BILL: 'sales_bill', 
    PURCHASES: 'purchases',
    SUPPLIERS: 'suppliers', 
    CUSTOMERS: 'customers',
    PURCHASE_ORDERS: 'purchase_orders',
    CONFIGURATIONS: 'configurations',
    MATERIAL_MASTER: 'material_master', 
    CATEGORIES: 'categories',
    SUB_CATEGORIES: 'sub_categories',
    PROMOTIONS: 'promotions',
    SALES_RETURNS: 'sales_returns',
    PURCHASE_RETURNS: 'purchase_returns',
    CUSTOMER_PRICE_LIST: 'customer_price_list',
    PHYSICAL_INVENTORY: 'physical_inventory',
    SUPPLIER_PRODUCT_MAP: 'supplier_product_map',
    EWAYBILLS: 'ewaybills',
    DELIVERY_CHALLANS: 'delivery_challans',
    SALES_CHALLANS: 'sales_challans',
    TEAM_MEMBERS: 'team_members',
    BUSINESS_ROLES: 'business_roles',
    MRP_CHANGE_LOG: 'mrp_change_log',
    DOCTOR_MASTER: 'doctor_master',
};

export const openDB = (): Promise<IDBDatabase> => {
    if (!ENABLE_INDEXED_DB) {
        return Promise.reject(new Error('IndexedDB persistence is disabled.'));
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            Object.values(STORES).forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const idb = {
    async put(storeName: string, data: any) {
        if (!ENABLE_INDEXED_DB) return null;
        if (!data || typeof data.id === 'undefined') {
            console.error(`IDB Error: Data missing primary key 'id' for store ${storeName}`, data);
            throw new Error(`Data missing primary key 'id' for store ${storeName}`);
        }
        
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async putBulk(storeName: string, dataArray: any[]) {
        if (!ENABLE_INDEXED_DB) return true;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            dataArray.forEach(item => {
                if (item && typeof item.id !== 'undefined') {
                    store.put(item);
                }
            });
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    },

    async get(storeName: string, id: string) {
        if (!ENABLE_INDEXED_DB) return null;
        if (!id) return null;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll(storeName: string) {
        if (!ENABLE_INDEXED_DB) return [];
        const db = await openDB();
        return new Promise<any[]>((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName: string, id: string) {
        if (!ENABLE_INDEXED_DB) return;
        if (!id) return;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    async clearAllStores() {
        if (!ENABLE_INDEXED_DB) return [];
        const db = await openDB();
        const allStores = Object.values(STORES);
        const promises = allStores.map(storeName => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        });
        return Promise.all(promises);
    }
};
