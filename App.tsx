
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatusBar from './components/StatusBar';
import NotificationSystem from './components/NotificationSystem';
import Dashboard from './pages/Dashboard';
import POS from './components/POS';
import SalesHistory from './pages/SalesHistory';
// Fix: Corrected named import for PurchaseForm to default import
import PurchaseForm from './components/PurchaseForm';
import PurchaseHistory from './pages/PurchaseHistory';
import Inventory from './pages/Inventory';
import PhysicalInventory from './pages/PhysicalInventory';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import MaterialMaster from './components/MaterialMaster';
import SubstituteFinder from './pages/SubstituteFinder';
import Promotions from './pages/Promotions';
import Reports from './pages/Reports';
import BalanceCarryforward from './pages/BalanceCarryforward';
import GstCenter from './pages/GstCenter';
import BusinessUserAssignment from './pages/BusinessUserAssignment';
import BusinessRoles from './pages/BusinessRoles';
import Configuration from './pages/Configuration';
import CompanyConfiguration from './pages/CompanyConfiguration';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import AccountReceivable from './pages/AccountReceivable';
import AccountPayable from './pages/AccountPayable';
import Returns from './pages/Returns';
import DeliveryChallans from './pages/DeliveryChallans';
import SalesChallans from './pages/SalesChallans';
import ManualSalesEntry from './pages/ManualSalesEntry';
import PurchaseOrders from './pages/PurchaseOrders';
import Classification from './pages/Classification';
import PrintBillModal from './components/PrintBillModal';
import TransactionDetailModal from './components/TransactionDetailModal';
import PurchaseDetailModal from './components/PurchaseDetailModal';
import PrintPurchaseOrderModal from './components/PrintPurchaseOrderModal';
import PrintableReportModal from './components/PrintableReportModal';
import MobileCaptureView from './components/MobileCaptureView';
import TallyPrompt from './components/TallyPrompt';
import * as storage from './services/storageService';
import { supabase } from './services/supabaseClient';
import { parseNetworkAndApiError } from './utils/error';
import {
    RegisteredPharmacy, InventoryItem, Transaction, BillItem, Purchase, PurchaseItem, Supplier,
    Customer, Medicine, SupplierProductMap, EWayBill, AppConfigurations,
    Notification, PhysicalInventorySession, DeliveryChallan, SalesChallan,
    PurchaseOrder, DetailedBill, PhysicalInventoryStatus, SalesReturn, PurchaseReturn, DeliveryChallanStatus, SalesChallanStatus,
    PurchaseOrderStatus, Category, SubCategory, Promotion, OrganizationMember, ModuleConfig
} from './types';
import { navigation } from './constants';
import { getInventoryPolicy } from './utils/materialType';
import { resolveUnitsPerStrip } from './utils/pack';
import { createSupplierQuick, formatSupplierApiError, SupplierQuickResult } from './services/supplierService';

const App: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<RegisteredPharmacy | null>(null);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [isReloading, setIsReloading] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [isRealtimeActive, setIsRealtimeActive] = useState(false);

    const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);
    const [showEscSavePrompt, setShowEscSavePrompt] = useState(false);

    // Refs to trigger child save methods remotely
    const posRef = useRef<any>(null);
    const purchaseFormRef = useRef<any>(null);

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [ewayBills, setEwayBills] = useState<EWayBill[]>([]);
    const [mappings, setMappings] = useState<SupplierProductMap[]>([]);
    const [physicalInventory, setPhysicalInventory] = useState<PhysicalInventorySession[]>([]);
    const [deliveryChallans, setDeliveryChallans] = useState<DeliveryChallan[]>([]);
    const [salesChallans, setSalesChallans] = useState<SalesChallan[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

    const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
    const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [teamMembers, setTeamMembers] = useState<OrganizationMember[]>([]);

    const [configurations, setConfigurations] = useState<AppConfigurations>({ organization_id: '' });
    const [defaultCustomerControlGlId, setDefaultCustomerControlGlId] = useState<string>('');
    const [defaultSupplierControlGlId, setDefaultSupplierControlGlId] = useState<string>('');

    const [sourceChallansForPurchase, setSourceChallansForPurchase] = useState<{ items: PurchaseItem[], supplier: string, ids: string[] } | null>(null);
    const [mobileSyncSessionId, setMobileSyncSessionId] = useState<string | null>(null);
    const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

    const [printBill, setPrintBill] = useState<(DetailedBill & { inventory: InventoryItem[]; configurations: AppConfigurations; }) | null>(null);
    const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);
    const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
    const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);
    const [viewReport, setViewReport] = useState<any>(null);

    const resolveAuthViewFromLocation = (): 'auth' | 'forgot' | 'reset' => {
        const path = window.location.pathname.toLowerCase();
        if (path === '/reset-password') return 'reset';
        if (path === '/forgot-password') return 'forgot';
        return 'auth';
    };

    const [authView, setAuthView] = useState<'auth' | 'forgot' | 'reset'>(resolveAuthViewFromLocation);

    // Robust recovery detection on initial load
    useEffect(() => {
        if (window.location.hash.includes('type=recovery') || window.location.href.includes('recovery')) {
            setAuthView('reset');
        }
    }, []);

    useEffect(() => {
        const onPopState = () => {
            setAuthView(resolveAuthViewFromLocation());
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setNotifications(prev => [...prev, { id: Date.now(), message, type }]);
    }, []);

    const removeNotification = useCallback((id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const loadData = useCallback(async (user: RegisteredPharmacy, mode: 'initial' | 'sync' | 'background' | 'targeted' = 'sync', specificTable?: string) => {
        if (!user) return;

        if (mode === 'initial') setIsAppLoading(true);
        else if (mode === 'sync') setIsReloading(true);

        const orgId = user.organization_id;

        try {
            if (mode === 'targeted' && specificTable) {
                switch (specificTable) {
                    case 'inventory': setInventory(await storage.fetchInventory(user)); break;
                    case 'material_master': setMedicines(await storage.fetchMedicineMaster(user)); break;
                    case 'sales_bill':
                    case 'transactions':
                        setTransactions(await storage.fetchTransactions(user));
                        break;
                    case 'purchases': setPurchases(await storage.fetchPurchases(user)); break;
                    case 'suppliers': setSuppliers(await storage.fetchSuppliers(user)); break;
                    case 'customers': setCustomers(await storage.fetchCustomers(user)); break;
                    case 'configurations':
                        const cfg = await storage.getData('configurations', [], user);
                        if (cfg && cfg.length > 0) setConfigurations(cfg[0]);
                        break;
                    case 'delivery_challans': setDeliveryChallans(await storage.getData('delivery_challans', [], user)); break;
                    case 'sales_challans': setSalesChallans(await storage.getData('sales_challans', [], user)); break;
                    case 'purchase_orders': setPurchaseOrders(await storage.fetchPurchaseOrders(user)); break;
                    case 'physical_inventory': setPhysicalInventory(await storage.fetchPhysicalInventory(user)); break;
                    case 'categories': setCategories(await storage.getData('categories', [], user)); break;
                    case 'sub_categories': setSubCategories(await storage.getData('sub_categories', [], user)); break;
                    case 'supplier_product_map': setMappings(await storage.fetchSupplierProductMaps(user)); break;
                    case 'profiles':
                        const freshProfile = await storage.fetchProfile(user.user_id);
                        if (freshProfile) setCurrentUser(freshProfile);
                        break;
                }
                setLastRefreshed(new Date());
                return;
            }

            const [
                freshProfile, inv, med, tx, pur, supp, cust, ewb, mapData, phy, dc, sc, po,
                sr, pr, cert, sub, promo, team, configData
            ] = await Promise.all([
                storage.fetchProfile(user.user_id),
                storage.fetchInventory(user),
                storage.fetchMedicineMaster(user),
                storage.fetchTransactions(user),
                storage.fetchPurchases(user),
                storage.fetchSuppliers(user),
                storage.fetchCustomers(user),
                storage.fetchEWayBills(user),
                storage.fetchSupplierProductMaps(user),
                storage.fetchPhysicalInventory(user),
                storage.getData('delivery_challans', [], user),
                storage.getData('sales_challans', [], user),
                storage.fetchPurchaseOrders(user),
                storage.getData('sales_returns', [], user),
                storage.getData('purchase_returns', [], user),
                storage.getData('categories', [], user),
                storage.getData('sub_categories', [], user),
                storage.getData('promotions', [], user),
                storage.fetchTeamMembers(user),
                storage.getData('configurations', [{ organization_id: orgId }], user)
            ]);

            if (freshProfile) setCurrentUser(freshProfile);
            setInventory(inv || []);
            setMedicines(med || []);
            setTransactions(tx || []);
            setPurchases(pur || []);
            setSuppliers(supp || []);
            setCustomers(cust || []);
            setEwayBills(ewb || []);
            setMappings(mapData || []);
            setPhysicalInventory(phy || []);
            setDeliveryChallans(dc || []);
            setSalesChallans(sc || []);
            setPurchaseOrders(po || []);
            setSalesReturns(sr || []);
            setPurchaseReturns(pr || []);
            setCategories(cert || []);
            setSubCategories(sub || []);
            setPromotions(promo || []);
            setTeamMembers(team || []);

            if (configData && configData.length > 0) {
                setConfigurations(configData[0]);
            } else {
                setConfigurations({ organization_id: orgId });
            }
            setLastRefreshed(new Date());
            if (mode === 'sync') addNotification("ERP synchronized with cloud master.", "success");
        } catch (error) {
            addNotification(parseNetworkAndApiError(error), 'error');
        } finally {
            setIsAppLoading(false);
            setIsReloading(false);
        }
    }, [addNotification]);

    // Global ESC Key Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // If a standard modal or dialog is open, let its own logic handle ESC
                if (document.querySelector('[role="dialog"]')) return;

                if (currentPage === 'dashboard') return;

                // Entry screens that require save/discard confirmation
                const entryScreens = [
                    'pos', 'nonGstPos', 'automatedPurchaseEntry', 'manualPurchaseEntry',
                    'physicalInventory', 'deliveryChallans', 'salesChallans'
                ];

                if (entryScreens.includes(currentPage)) {
                    setShowEscSavePrompt(true);
                } else {
                    // Navigation screens, just go home
                    setCurrentPage('dashboard');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentPage]);

    const handleEscSave = async () => {
        setShowEscSavePrompt(false);
        try {
            if (currentPage === 'pos' || currentPage === 'nonGstPos') {
                if (posRef.current) await posRef.current.handleSave();
            } else if (currentPage === 'automatedPurchaseEntry' || currentPage === 'manualPurchaseEntry') {
                if (purchaseFormRef.current) await purchaseFormRef.current.handleSubmit();
            }
            // Navigate after successful save
            setCurrentPage('dashboard');
        } catch (e) {
            addNotification("Failed to auto-save during exit.", "error");
        }
    };

    const handleEscDiscard = () => {
        setShowEscSavePrompt(false);
        // Clear any specific component states if needed
        if (currentPage === 'automatedPurchaseEntry' || currentPage === 'manualPurchaseEntry') {
            setEditingPurchase(null);
            setSourceChallansForPurchase(null);
        }
        setCurrentPage('dashboard');
    };

    // Handle Supabase Auth Session Changes
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                setCurrentUser(null);
                setInventory([]);
                setMedicines([]);
                setTransactions([]);
                setPurchases([]);
                setIsAppLoading(false);
                setAuthView('auth');
            } else if (event === 'PASSWORD_RECOVERY') {
                setAuthView('reset');
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session?.user) {
                    storage.getCurrentUser().then(async user => {
                        if (user) {
                            setCurrentUser(user);
                            loadData(user, 'background');
                        } else {
                            const profile = await storage.fetchProfile(session.user.id);
                            if (profile) {
                                setCurrentUser(profile);
                                loadData(profile, 'sync'); // Use sync mode to show progress
                            }
                        }
                    });
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [loadData]);

    useEffect(() => {
        if (!currentUser) return;
        const orgId = currentUser.organization_id;

        const channel = supabase
            .channel(`public_changes_${orgId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public' },
                (payload) => {
                    const table = payload.table;
                    const record = payload.new as any;

                    if (record && record.organization_id && record.organization_id !== orgId) {
                        return;
                    }
                    loadData(currentUser, 'targeted', table);
                }
            )
            .subscribe((status) => {
                setIsRealtimeActive(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, loadData]);

    useEffect(() => {
        storage.getCurrentUser().then(user => {
            if (user) {
                setCurrentUser(user);
                loadData(user, 'initial');
            }
            else setIsAppLoading(false);
        });
    }, [loadData]);

    const handleReload = useCallback(async () => {
        if (currentUser) await loadData(currentUser, 'sync');
    }, [currentUser, loadData]);

    const handleNavigate = useCallback((pageId: string) => {
        setCurrentPage(pageId);
        if (pageId !== 'manualPurchaseEntry' && pageId !== 'automatedPurchaseEntry') {
            setEditingPurchase(null);
        }
        if (pageId !== 'dashboard') {
            setConfigurations(prev => ({
                ...prev,
                sidebar: { ...prev.sidebar, isSidebarCollapsed: true }
            }));
        }
    }, []);

    const toggleSidebar = useCallback(async () => {
        const nextState = !configurations.sidebar?.isSidebarCollapsed;
        const updatedConfig = {
            ...configurations,
            sidebar: { ...configurations.sidebar, isSidebarCollapsed: nextState }
        };
        setConfigurations(updatedConfig);
        if (currentUser) {
            await storage.saveData('configurations', updatedConfig, currentUser);
        }
    }, [configurations, currentUser]);

    const handleLogin = (user: RegisteredPharmacy) => {
        setCurrentUser(user);
        loadData(user, 'initial');
    };

    const handleLogout = async () => {
        setShowLogoutPrompt(false);
        setIsAppLoading(true);
        try {
            await storage.clearCurrentUser();
            setCurrentUser(null);
            setCurrentPage('dashboard');
            setAuthView('auth');
            window.history.replaceState({}, '', '/');
        } catch (e) {
            setCurrentUser(null);
            setCurrentPage('dashboard');
            setAuthView('auth');
            window.history.replaceState({}, '', '/');
        } finally {
            setIsAppLoading(false);
        }
    };

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullScreen(true);
        } else {
            document.exitFullscreen();
            setIsFullScreen(false);
        }
    };
    const [isFullScreen, setIsFullScreen] = useState(false);

    const handleSaveOrUpdateTransaction = async (tx: Transaction, isUpdate: boolean, nextCounter?: number) => {
        if (!currentUser) {
            throw new Error("Unauthorized: please log in again.");
        }

        const strictStock = configurations.displayOptions?.strictStock ?? false;
        const enableNegativeStock = configurations.displayOptions?.enableNegativeStock ?? false;
        const shouldPreventNegativeStock = strictStock && !enableNegativeStock;

        if (shouldPreventNegativeStock) {
            const requiredUnitsByInventoryId = new Map<string, number>();
            for (const item of tx.items || []) {
                if (!item.inventoryItemId) continue;
                const requiredUnits = ((item.quantity || 0) * (item.unitsPerPack || 1)) + (item.looseQuantity || 0);
                requiredUnitsByInventoryId.set(
                    item.inventoryItemId,
                    (requiredUnitsByInventoryId.get(item.inventoryItemId) || 0) + requiredUnits
                );
            }

            for (const [inventoryItemId, requiredUnits] of requiredUnitsByInventoryId.entries()) {
                const invItem = inventory.find(i => i.id === inventoryItemId);
                if (!invItem) continue;
                const policy = getInventoryPolicy(invItem, medicines);
                if (!policy.inventorised) continue;
                if (Number(invItem.stock || 0) <= 0 || Number(invItem.stock || 0) < requiredUnits) {
                    throw new Error(`Insufficient stock for ${invItem.name}. Available: ${Number(invItem.stock || 0)}`);
                }
            }
        }

        try {
            const savedTx = await storage.addTransaction(tx, currentUser);

            if (!isUpdate && typeof nextCounter === 'number' && Number.isFinite(nextCounter) && nextCounter > 0) {
                const configKey = tx.billType === 'non-gst' ? 'nonGstInvoiceConfig' : 'invoiceConfig';
                const existingConfig = (configurations[configKey] || {}) as any;
                const startingNumber = Number(existingConfig.startingNumber || 1);
                const safeNextNumber = Math.max(nextCounter, startingNumber);

                setConfigurations(prev => ({
                    ...prev,
                    [configKey]: {
                        ...(prev[configKey] || {}),
                        currentNumber: safeNextNumber,
                    }
                }));
            }

            // Immediate local state update to ensure data shows in history without waiting for background reload.
            if (isUpdate) {
                setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t));
            } else {
                setTransactions(prev => [savedTx, ...prev]);
            }

            // Do not block UI success state on background refresh.
            loadData(currentUser, 'background').catch((err) => {
                console.warn('Background reload after sales save failed:', err);
            });
        } catch (e) {
            throw new Error(parseNetworkAndApiError(e));
        }
    };

    const handleUpdatePurchase = async (p: Purchase, supplierGst?: string) => {
        if (!currentUser) return;
        try {
            const savedPurchase = await storage.updatePurchase(p, currentUser);
            // Immediate local state update
            setPurchases(prev => prev.map(pur => pur.id === savedPurchase.id ? savedPurchase : pur));

            loadData(currentUser, 'background');
            addNotification("Purchase voucher updated.", "success");
        } catch (e) {
            addNotification(parseNetworkAndApiError(e), "error");
        }
    };

    const handleAddPurchase = async (p: any, supplierGst: string, nextCounter?: number) => {
        if (!currentUser) return;
        try {
            const savedPurchase = await storage.addPurchase(p, currentUser);
            // Immediate local state update
            setPurchases(prev => [savedPurchase, ...prev]);

            loadData(currentUser, 'background');
            addNotification("Purchase entry posted.", "success");
        } catch (e) {
            addNotification(parseNetworkAndApiError(e), "error");
        }
    };

    const handleCancelPurchase = async (purchaseId: string) => {
        if (!currentUser) return;
        const purchase = purchases.find(p => p.id === purchaseId);
        if (!purchase) return;

        try {
            // 1. Mark status as cancelled
            const cancelledPurchase = { ...purchase, status: 'cancelled' as const };
            await storage.saveData('purchases', cancelledPurchase, currentUser);
            await storage.syncPurchaseLedger(cancelledPurchase, currentUser);
            await storage.markVoucherCancelled('purchase-entry', currentUser, cancelledPurchase.purchaseSerialId, cancelledPurchase.id);

            // 2. Reverse inventory (decrement stock that was added by this purchase)
            for (const item of purchase.items) {
                // Find matching inventory item
                const inventoryMatch = inventory.find(i =>
                    (i.name || '').toLowerCase().trim() === (item.name || '').toLowerCase().trim() &&
                    (i.batch || 'UNSET').toLowerCase().trim() === (item.batch || 'UNSET').toLowerCase().trim()
                );

                if (inventoryMatch) {
                    const uPP = resolveUnitsPerStrip(inventoryMatch.unitsPerPack, inventoryMatch.packType);
                    const unitsToRemove = (item.quantity * uPP) + (item.looseQuantity || 0) + (item.freeQuantity || 0);

                    const updatedInv = {
                        ...inventoryMatch,
                        stock: Math.max(0, Number(inventoryMatch.stock || 0) - unitsToRemove)
                    };
                    await storage.saveData('inventory', updatedInv, currentUser);
                }
            }

            loadData(currentUser, 'background');
            addNotification("Purchase voucher cancelled and stock reversed.", "warning");
        } catch (e) {
            addNotification(parseNetworkAndApiError(e), "error");
        }
    };

    const handleAddInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
        if (!currentUser) throw new Error("Unauthorized");
        const saved = await storage.saveData('inventory', item, currentUser);
        loadData(currentUser, 'background');
        return saved;
    };

    const handleAddMedicineMaster = async (med: Omit<Medicine, 'id'>) => {
        if (!currentUser) throw new Error("Unauthorized");
        const saved = await storage.saveData('material_master', med, currentUser);
        loadData(currentUser, 'background');
        return saved;
    };

    const handleUpdateMedicineMaster = useCallback(async (updatedMedicine: Medicine) => {
        if (!currentUser) throw new Error("Unauthorized");

        const normalize = (value?: string) => (value || '').trim().toLowerCase();
        const updatedPack = (updatedMedicine.pack || '').trim();
        const inferredUnitsPerPack = resolveUnitsPerStrip(parseInt(updatedPack.match(/\d+/)?.[0] || '1', 10), updatedPack);

        const isLinkedInventoryItem = (item: InventoryItem) => {
            const itemCode = normalize(item.code);
            const materialCode = normalize(updatedMedicine.materialCode);
            if (itemCode && materialCode && itemCode === materialCode) return true;

            const sameName = normalize(item.name) === normalize(updatedMedicine.name);
            if (!sameName) return false;

            const masterBrand = normalize(updatedMedicine.brand);
            const inventoryBrand = normalize(item.brand);
            return !masterBrand || !inventoryBrand || masterBrand === inventoryBrand;
        };

        await storage.saveData('material_master', updatedMedicine, currentUser);

        const linkedInventoryItems = inventory.filter(isLinkedInventoryItem);
        if (linkedInventoryItems.length > 0) {
            await Promise.all(
                linkedInventoryItems.map(item =>
                    storage.saveData('inventory', {
                        ...item,
                        packType: updatedPack,
                        unitsPerPack: inferredUnitsPerPack,
                    }, currentUser)
                )
            );

            setInventory(prev => prev.map(item =>
                isLinkedInventoryItem(item)
                    ? { ...item, packType: updatedPack, unitsPerPack: inferredUnitsPerPack }
                    : item
            ));
        }

        setMedicines(prev => prev.map(m => (m.id === updatedMedicine.id ? updatedMedicine : m)));
        await loadData(currentUser, 'background');
    }, [currentUser, inventory, loadData]);

    const resolveControlGlByCode = useCallback(async (organizationId: string, glCode: string): Promise<string | undefined> => {
        const { data: bookRows, error: bookErr } = await supabase
            .from('set_of_books')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('active_status', 'Active')
            .order('created_at', { ascending: true })
            .limit(1);

        if (bookErr) throw bookErr;
        const activeBookId = bookRows?.[0]?.id;
        if (!activeBookId) return undefined;

        const { data: glRows, error: glErr } = await supabase
            .from('gl_master')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('set_of_books_id', activeBookId)
            .eq('gl_code', glCode)
            .eq('active_status', 'Active')
            .limit(1);

        if (glErr) throw glErr;
        return glRows?.[0]?.id;
    }, []);

    const refreshDefaultControlGls = useCallback(async () => {
        if (!currentUser) return;
        try {
            const [customerGl, supplierGl] = await Promise.all([
                resolveControlGlByCode(currentUser.organization_id, '120000'),
                resolveControlGlByCode(currentUser.organization_id, '210000'),
            ]);
            setDefaultCustomerControlGlId(customerGl || '');
            setDefaultSupplierControlGlId(supplierGl || '');
        } catch {
            setDefaultCustomerControlGlId('');
            setDefaultSupplierControlGlId('');
        }
    }, [currentUser, resolveControlGlByCode]);

    useEffect(() => {
        refreshDefaultControlGls();
    }, [refreshDefaultControlGls]);

    const handleAddDistributor = async (data: Omit<Supplier, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string): Promise<SupplierQuickResult> => {
        if (!currentUser) throw new Error("Unauthorized");
        addNotification('Saving…', 'warning');
        try {
            const mappedControlGlId = await resolveControlGlByCode(currentUser.organization_id, '210000');
            if (!mappedControlGlId) throw new Error('Supplier Control GL (210000) not found in active Set of Books.');

            const result = await createSupplierQuick(currentUser.organization_id, {
                ...data,
                supplier_group: data.supplier_group || 'Sundry Creditors',
                control_gl_id: mappedControlGlId,
            }, {
                currentUser,
                existingSuppliers: suppliers,
                defaultControlGlId: mappedControlGlId,
            });

            if (result.status !== 'duplicate' && balance !== 0) {
                await storage.addLedgerEntry({
                    id: storage.generateUUID(),
                    date,
                    type: 'openingBalance',
                    description: 'Opening Balance',
                    debit: balance < 0 ? Math.abs(balance) : 0,
                    credit: balance > 0 ? balance : 0,
                    balance: 0,
                }, { type: 'supplier', id: result.supplier.id }, currentUser);
            }

            await loadData(currentUser, 'background');
            addNotification(result.message, result.status === 'duplicate' ? 'warning' : 'success');
            return result;
        } catch (e) {
            const message = formatSupplierApiError(e);
            addNotification(message, 'error');
            throw new Error(message);
        }
    };

    const handleAddCustomer = async (data: Omit<Customer, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string) => {
        if (!currentUser) return;
        try {
            const mappedControlGlId = await resolveControlGlByCode(currentUser.organization_id, '120000');
            if (!mappedControlGlId) throw new Error('Customer Control GL (120000) not found in active Set of Books.');
            const customerPayload = { ...data, customerGroup: data.customerGroup || 'Sundry Debtors', controlGlId: mappedControlGlId, opening_balance: balance };
            const newCust = await storage.saveData('customers', customerPayload, currentUser);
            if (balance !== 0) {
                await storage.addLedgerEntry({
                    id: storage.generateUUID(),
                    date,
                    type: 'openingBalance',
                    description: 'Opening Balance',
                    debit: balance > 0 ? balance : 0,
                    credit: balance < 0 ? Math.abs(balance) : 0,
                    balance: 0,
                }, { type: 'customer', id: newCust.id }, currentUser);
            }
            await loadData(currentUser, 'background');
            addNotification(`Customer ${data.name} saved successfully.`, "success");
        } catch (e) {
            addNotification(parseNetworkAndApiError(e), "error");
        }
    };



    const handleUpdateSupplier = async (supplier: Supplier) => {
        if (!currentUser) return;
        addNotification('Saving…', 'warning');
        try {
            const result = await createSupplierQuick(currentUser.organization_id, supplier, {
                currentUser,
                existingSuppliers: suppliers,
                defaultControlGlId: defaultSupplierControlGlId,
            });
            await loadData(currentUser, 'background');
            addNotification(result.message, result.status === 'duplicate' ? 'warning' : 'success');
        } catch (e) {
            addNotification(formatSupplierApiError(e), 'error');
        }
    };

    const handleUpdateCustomer = async (customer: Customer) => {
        if (!currentUser) return;
        try {
            const customerPayload = {
                ...customer,
                customerGroup: customer.customerGroup || 'Sundry Debtors',
                controlGlId: undefined,
            };
            await storage.saveData('customers', customerPayload, currentUser);
            await loadData(currentUser, 'background');
            addNotification(`Customer ${customer.name} updated successfully.`, "success");
        } catch (e) {
            addNotification(parseNetworkAndApiError(e), "error");
        }
    };

    const handleRecordPayment = async (id: string, amount: number, date: string, desc: string, type: 'customer' | 'supplier') => {
        if (!currentUser) return;
        await storage.addLedgerEntry({
            id: storage.generateUUID(),
            date,
            type: 'payment',
            description: desc,
            debit: type === 'customer' ? 0 : amount,
            credit: type === 'customer' ? amount : 0,
            balance: 0,
        }, { type, id }, currentUser);
        loadData(currentUser, 'background');
    };

    const handleCancelTransaction = async (id: string) => {
        if (!currentUser) return;
        const tx = transactions.find(t => t.id === id);
        if (tx) {
            const cancelledTx = { ...tx, status: 'cancelled' as const };
            await storage.saveData('sales_bill', cancelledTx, currentUser);
            await storage.syncSalesLedger(cancelledTx, currentUser);
            await storage.markVoucherCancelled(cancelledTx.billType === 'non-gst' ? 'sales-non-gst' : 'sales-gst', currentUser, cancelledTx.id, cancelledTx.id);
            for (const item of tx.items) {
                const inv = inventory.find(i => i.id === item.inventoryItemId);
                if (inv) {
                    const policy = getInventoryPolicy(inv, medicines);
                    if (!policy.inventorised) continue;
                    await storage.saveData('inventory', { ...inv, stock: inv.stock + (item.quantity * resolveUnitsPerStrip(inv.unitsPerPack, inv.packType) + (item.looseQuantity || 0)) }, currentUser);
                }
            }
            loadData(currentUser, 'background');
            addNotification("Voucher cancelled and stock reversed.", "warning");
        }
    };

    const handleConvertToPurchase = (items: PurchaseItem[], supplier: string, ids: string[]) => {
        setSourceChallansForPurchase({ items, supplier, ids });
        handleNavigate('manualPurchaseEntry');
    };

    const handleConvertToInvoice = (items: BillItem[], customer: Customer, ids: string[]) => {
        handleNavigate('pos');
    };

    const handleUpdateModuleConfig = useCallback(async (moduleId: string, nextConfig: ModuleConfig) => {
        if (!currentUser) return;
        const updated = {
            ...configurations,
            modules: {
                ...(configurations.modules || {}),
                [moduleId]: nextConfig
            }
        };
        setConfigurations(updated);
        await storage.saveData('configurations', updated, currentUser);
    }, [configurations, currentUser]);

    const renderPage = () => {
        const config: ModuleConfig = { visible: true, fields: configurations.modules?.[currentPage]?.fields || {} };

        switch (currentPage) {
            case 'dashboard':
                return <Dashboard
                    currentUser={currentUser} configurations={configurations} inventory={inventory}
                    transactions={transactions} purchases={purchases} medicines={medicines}
                    customers={customers} distributors={suppliers} onKpiClick={handleNavigate}
                    brandName="MDXERA" lastRefreshed={lastRefreshed} onReload={handleReload} isReloading={isReloading}
                />;
            case 'pos':
            case 'nonGstPos':
                return <POS
                    ref={posRef}
                    inventory={inventory} purchases={purchases} medicines={medicines} customers={customers}
                    onSaveOrUpdateTransaction={handleSaveOrUpdateTransaction}
                    onPrintBill={(tx) => setPrintBill({ ...tx, pharmacy: currentUser!, inventory, configurations } as any)}
                    currentUser={currentUser} config={config} configurations={configurations}
                    billType={currentPage === 'nonGstPos' ? 'non-gst' : 'regular'}
                    addNotification={addNotification} onAddMedicineMaster={handleAddMedicineMaster}
                    onCancel={() => handleNavigate('dashboard')}
                />;
            case 'salesHistory':
                return <SalesHistory
                    transactions={transactions} inventory={inventory}
                    onViewDetails={setViewTransaction}
                    onPrintBill={(tx) => setPrintBill({ ...tx, pharmacy: currentUser!, inventory, configurations } as any)}
                    onCancelTransaction={handleCancelTransaction}
                    currentUser={currentUser} onViewSale={setViewTransaction} onEditSale={() => { }}
                />;
            case 'manualSalesEntry':
                return <ManualSalesEntry
                    currentUser={currentUser}
                    customers={customers}
                    addNotification={addNotification}
                    onSaved={() => loadData(currentUser!, 'background')}
                />;
            case 'automatedPurchaseEntry':
            case 'manualPurchaseEntry':
                return <PurchaseForm
                    ref={purchaseFormRef}
                    onAddPurchase={handleAddPurchase} onUpdatePurchase={handleUpdatePurchase}
                    inventory={inventory} suppliers={suppliers} medicines={medicines}
                    mappings={mappings} purchases={purchases} purchaseToEdit={editingPurchase}
                    draftItems={sourceChallansForPurchase?.items || null}
                    draftSupplier={sourceChallansForPurchase?.supplier}
                    onClearDraft={() => setSourceChallansForPurchase(null)}
                    currentUser={currentUser} onAddMedicineMaster={handleAddMedicineMaster}
                    onAddsupplier={handleAddDistributor} onSaveMapping={(map) => storage.saveData('supplier_product_map', map, currentUser).then(() => loadData(currentUser!, 'background'))}
                    setIsDirty={() => { }} addNotification={addNotification}
                    title={currentPage === 'automatedPurchaseEntry' ? "AI-Powered Automated Purchase" : "Manual Purchase Bill Entry"}
                    isManualEntry={currentPage === 'manualPurchaseEntry'}
                    configurations={configurations}
                    mobileSyncSessionId={mobileSyncSessionId} setMobileSyncSessionId={setMobileSyncSessionId}
                    organizationId={currentUser?.organization_id || ''} onCancel={() => handleNavigate('purchaseHistory')}
                />;
            case 'purchaseHistory':
                return <PurchaseHistory
                    purchases={purchases} distributors={suppliers} onViewDetails={setViewPurchase}
                    onCancelPurchase={handleCancelPurchase} inventory={inventory} medicines={medicines}
                    onUpdatePurchase={handleUpdatePurchase} onEditPurchase={(p) => { setEditingPurchase(p); handleNavigate('manualPurchaseEntry'); }}
                    onAddInventoryItem={handleAddInventoryItem}
                    currentUser={currentUser} onSaveMapping={(map) => storage.saveData('supplier_product_map', map, currentUser).then(() => loadData(currentUser!, 'background'))}
                />;
            case 'inventory':
                return <Inventory
                    inventory={inventory} medicines={medicines} currentUser={currentUser}
                    onCreatePurchaseOrder={() => { }} config={config} onUpdateConfig={(newConfig) => handleUpdateModuleConfig('inventory', newConfig)}
                    onBulkAddInventory={(list) => storage.saveBulkData('inventory', list, currentUser)}
                    onAddProduct={handleAddInventoryItem} onUpdateProduct={(item) => storage.saveData('inventory', item, currentUser).then(() => loadData(currentUser!, 'background'))}
                />;
            case 'physicalInventory':
                return <PhysicalInventory
                    inventory={inventory} medicines={medicines} physicalInventorySessions={physicalInventory}
                    onStartNewCount={async () => {
                        if (!currentUser) return;

                        const hasOpenSession = physicalInventory.some(s => s.status === PhysicalInventoryStatus.IN_PROGRESS);
                        if (hasOpenSession) {
                            addNotification('An audit session is already in progress.', 'warning');
                            return;
                        }

                        const reserved = await storage.reserveVoucherNumber('physical-inventory', currentUser);
                        const session: PhysicalInventorySession = {
                            id: reserved.documentNumber,
                            organization_id: currentUser.organization_id,
                            status: PhysicalInventoryStatus.IN_PROGRESS,
                            startDate: new Date().toISOString(),
                            reason: '',
                            items: [],
                            totalVarianceValue: 0,
                            performedById: currentUser.id,
                            performedByName: currentUser.full_name,
                        };

                        await storage.saveData('physical_inventory', session, currentUser);
                        await loadData(currentUser, 'background');
                    }} onUpdateCount={(s) => storage.saveData('physical_inventory', s, currentUser)}
                    onFinalizeCount={(s) => storage.finalizePhysicalInventorySession(s, currentUser!).then(() => loadData(currentUser!, 'background'))}
                    onCancelCount={(session) => {
                        const cancelledSession: PhysicalInventorySession = {
                            ...session,
                            status: PhysicalInventoryStatus.CANCELLED,
                            endDate: new Date().toISOString(),
                        };
                        return storage.saveData('physical_inventory', cancelledSession, currentUser)
                            .then(() => storage.markVoucherCancelled('physical-inventory', currentUser!, cancelledSession.id, cancelledSession.id))
                            .then(() => loadData(currentUser!, 'background'));
                    }}
                />;
            case 'suppliers':
                return <Suppliers
                    suppliers={suppliers} onAddSupplier={handleAddDistributor}
                    onBulkAddSuppliers={(list) => storage.saveBulkData('suppliers', list, currentUser)}
                    onRecordPayment={(id, amt, dt, desc) => handleRecordPayment(id, amt, dt, desc, 'supplier')}
                    onUpdateSupplier={handleUpdateSupplier}
                    config={config} currentUser={currentUser} defaultSupplierControlGlId={defaultSupplierControlGlId}
                />;
            case 'customers':
                return <Customers
                    customers={customers} teamMembers={teamMembers} onAddCustomer={handleAddCustomer}
                    onBulkAddCustomers={(list) => storage.saveBulkData('customers', list, currentUser)}
                    onRecordPayment={(id, amt, dt, desc) => handleRecordPayment(id, amt, dt, desc, 'customer')}
                    onUpdateCustomer={handleUpdateCustomer}
                    currentUser={currentUser} config={config} inventory={inventory} defaultCustomerControlGlId={defaultCustomerControlGlId}
                />;
            case 'medicineMasterList':
            case 'vendorNomenclature':
            case 'bulkUtility':
                return <MaterialMaster
                    medicines={medicines} onAddMedicine={handleAddMedicineMaster}
                    onUpdateMedicine={handleUpdateMedicineMaster} currentUser={currentUser}
                    suppliers={suppliers} onAddPurchase={handleAddPurchase as any}
                    onBulkAddMedicines={(list) => storage.saveBulkData('material_master', list, currentUser)}
                    onSearchMedicines={() => { }} onMassUpdateClick={() => { }}
                    onSaveMapping={(map) => storage.saveData('supplier_product_map', map, currentUser).then(() => loadData(currentUser!, 'background'))} onDeleteMapping={(id) => storage.deleteData('supplier_product_map', id).then(() => loadData(currentUser!, 'background'))}
                    mappings={mappings}
                    initialSubModule={currentPage === 'vendorNomenclature' ? 'sync' : currentPage === 'bulkUtility' ? 'bulk' : 'master'}
                />;
            case 'substituteFinder':
                return <SubstituteFinder inventory={inventory} />;
            case 'promotions':
                return <Promotions currentUser={currentUser} addNotification={addNotification} />;
            case 'reports':
                return <Reports
                    inventory={inventory} transactions={transactions} purchases={purchases}
                    distributors={suppliers} customers={customers} salesReturns={salesReturns}
                    purchaseReturns={purchaseReturns} onPrintReport={setViewReport} config={config}
                />;
            case 'balanceCarryforward':
                return <BalanceCarryforward />;
            case 'gst':
                return <GstCenter
                    transactions={transactions} purchases={purchases} customers={customers}
                    currentUser={currentUser} configurations={configurations}
                    onUpdateConfigurations={(cfg) => storage.saveData('configurations', cfg, currentUser).then(() => setConfigurations(cfg))}
                />;
            case 'businessUsers':
                return <BusinessUserAssignment
                    currentUser={currentUser!} addNotification={addNotification}
                    members={teamMembers} onRefresh={() => loadData(currentUser!, 'sync')}
                />;
            case 'businessRoles':
                return <BusinessRoles currentUser={currentUser!} addNotification={addNotification} />;
            case 'companyConfiguration':
                return <CompanyConfiguration currentUser={currentUser} />;
            case 'configuration':
                return <Configuration
                    configurations={configurations}
                    onUpdateConfigurations={(cfg: any) => storage.saveData('configurations', cfg, currentUser).then(() => setConfigurations(cfg))}
                    addNotification={addNotification} currentUser={currentUser} inventory={inventory}
                    transactions={transactions} purchases={purchases} distributors={suppliers} customers={customers} medicines={medicines}
                    onBulkAddInventory={(l: any) => storage.saveBulkData('inventory', l, currentUser)}
                    onBulkAddDistributors={(l: any) => storage.saveBulkData('suppliers', l, currentUser)}
                    onBulkAddCustomers={(l: any) => storage.saveBulkData('customers', l, currentUser)}
                    onBulkAddPurchases={(l: any) => storage.saveBulkData('purchases', l, currentUser)}
                    onBulkAddSales={(l: any) => storage.saveBulkData('sales_bill', l, currentUser)}
                    onBulkAddMedicines={(l: any) => storage.saveBulkData('material_master', l, currentUser)}
                    onBulkAddMappings={(l: any) => storage.saveBulkData('supplier_product_map', l, currentUser)}
                    mappings={mappings}
                />;
            case 'settings':
                return <Settings
                    currentUser={currentUser}
                    onUpdateProfile={(p) => storage.updateProfile(p).then((updated) => {
                        setCurrentUser(updated);
                        loadData(updated, 'background');
                    })}
                    addNotification={addNotification}
                />;
            case 'classification':
                return <Classification
                    categories={categories} subCategories={subCategories}
                    onAddCategory={(d) => storage.saveData('categories', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onUpdateCategory={(d) => storage.saveData('categories', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onDeleteCategory={(id) => storage.deleteData('categories', id).then(() => loadData(currentUser!, 'background'))}
                    onAddSubCategory={(d) => storage.saveData('sub_categories', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onUpdateSubCategory={(d) => storage.saveData('sub_categories', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onDeleteSubCategory={(id) => storage.deleteData('sub_categories', id).then(() => loadData(currentUser!, 'background'))}
                />;
            case 'deliveryChallans':
                return <DeliveryChallans
                    deliveryChallans={deliveryChallans} inventory={inventory} distributors={suppliers}
                    medicines={medicines} currentUser={currentUser} configurations={configurations}
                    onAddChallan={(d) => storage.saveData('delivery_challans', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onUpdateChallan={(d) => storage.saveData('delivery_challans', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onCancelChallan={(id) => storage.updateChallanStatus(id, DeliveryChallanStatus.CANCELLED, currentUser!).then(() => loadData(currentUser!, 'background'))}
                    onConvertToPurchase={handleConvertToPurchase} onAddInventoryItem={handleAddInventoryItem}
                    onAddMedicineMaster={handleAddMedicineMaster} onAddDistributor={handleAddDistributor}
                    onSaveMapping={(map) => storage.saveData('supplier_product_map', map, currentUser).then(() => loadData(currentUser!, 'background'))} addNotification={addNotification} mappings={mappings}
                />;
            case 'salesChallans':
                return <SalesChallans
                    salesChallans={salesChallans} inventory={inventory} medicines={medicines}
                    purchases={purchases} customers={customers} currentUser={currentUser} configurations={configurations}
                    onAddChallan={(d) => storage.saveData('sales_challans', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onUpdateChallan={(d) => storage.saveData('sales_challans', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onCancelChallan={(id) => storage.updateSalesChallanStatus(id, SalesChallanStatus.CANCELLED, currentUser!).then(() => loadData(currentUser!, 'background'))}
                    onConvertToInvoice={handleConvertToInvoice} addNotification={addNotification} onAddMedicineMaster={handleAddMedicineMaster}
                />;
            case 'purchaseOrders':
                return <PurchaseOrders
                    distributors={suppliers} inventory={inventory} purchaseOrders={purchaseOrders}
                    onAddPurchaseOrder={async (d) => {
                        const reserved = await storage.reserveVoucherNumber('purchase-order', currentUser!);
                        const payload = { ...d, serialId: reserved.documentNumber };
                        await storage.saveData('purchase_orders', payload, currentUser);
                        await loadData(currentUser!, 'background');
                    }}
                    onUpdatePurchaseOrder={(d) => storage.saveData('purchase_orders', d, currentUser).then(() => loadData(currentUser!, 'background'))}
                    onCreatePurchaseEntry={() => { }} onPrintPurchaseOrder={setPrintPO as any}
                    onCancelPurchaseOrder={(id) => storage.deleteData('purchase_orders', id).then(() => loadData(currentUser!, 'background'))}
                    draftItems={null} onClearDraft={() => { }} setIsDirty={() => { }}
                    currentUserPharmacyName={currentUser?.pharmacy_name || ''} currentUserEmail={currentUser?.email || ''}
                    currentUserOrgId={currentUser?.organization_id}
                />;
            case 'accountReceivable':
                return <AccountReceivable customers={customers} onRecordPayment={(id, amt, dt, d) => handleRecordPayment(id, amt, dt, d, 'customer')} currentUser={currentUser} />;
            case 'accountPayable':
                return <AccountPayable distributors={suppliers} onRecordPayment={(id, amt, dt, d) => handleRecordPayment(id, amt, dt, d, 'supplier')} currentUser={currentUser} />;
            case 'salesReturns':
            case 'purchaseReturn':
                return <Returns
                    currentUser={currentUser} transactions={transactions} inventory={inventory}
                    salesReturns={salesReturns} purchaseReturns={purchaseReturns} purchases={purchases}
                    onAddSalesReturn={(r) => storage.saveData('sales_returns', r, currentUser).then(async () => { await storage.syncSalesReturnLedger(r, currentUser!); return loadData(currentUser!, 'background'); })}
                    onAddPurchaseReturn={(r) => storage.saveData('purchase_returns', r, currentUser).then(async () => { await storage.syncPurchaseReturnLedger(r, currentUser!); return loadData(currentUser!, 'background'); })}
                    addNotification={addNotification} defaultTab={currentPage === 'salesReturns' ? 'sales' : 'purchase'} isFixedMode={true}
                />;
            default:
                return <Dashboard
                    currentUser={currentUser} configurations={configurations} inventory={inventory}
                    transactions={transactions} purchases={purchases} medicines={medicines}
                    customers={customers} distributors={suppliers} onKpiClick={handleNavigate}
                    brandName="MDXERA" lastRefreshed={lastRefreshed} onReload={handleReload} isReloading={isReloading}
                />;
        }
    };

    const queryParams = new URLSearchParams(window.location.search);
    const mobileSyncSession = queryParams.get('sync_session');
    const mobileSyncOrgId = queryParams.get('org_id');

    if (mobileSyncSession && mobileSyncOrgId) {
        return <MobileCaptureView sessionId={mobileSyncSession} orgId={mobileSyncOrgId} />;
    }

    // Keep URL aligned with auth/app state for direct links like /login.
    useEffect(() => {
        if (isAppLoading) return;

        const currentPath = window.location.pathname;
        if (!currentUser || authView === 'reset') {
            const target = authView === 'forgot' ? '/forgot-password' : authView === 'reset' ? '/reset-password' : '/login';
            if (currentPath !== target) {
                window.history.replaceState({}, '', target);
            }
            return;
        }

        if (currentPath !== '/') {
            window.history.replaceState({}, '', '/');
        }
    }, [authView, currentUser, isAppLoading]);

    // Show Auth page if no user is logged in OR if we are in the middle of a password reset
    if ((!currentUser || authView === 'reset') && !isAppLoading) {
        return <Auth onLogin={handleLogin} initialView={authView} />;
    }

    if (isAppLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-app-bg">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-black uppercase text-primary tracking-widest animate-pulse">Initializing ERP Modules...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-app-bg overflow-hidden text-app-text-primary">
            <Header
                currentUser={currentUser}
                onNavigate={handleNavigate}
                onLogout={() => setShowLogoutPrompt(true)}
                onNewBillClick={() => handleNavigate('pos')}
                isFullScreen={isFullScreen}
                onToggleFullScreen={toggleFullScreen}
                brandName="MDXERA ERP"
                currentPage={currentPage}
                onReload={handleReload}
                isReloading={isReloading}
            />
            <div className="flex-1 flex overflow-hidden">
                <Sidebar
                    currentPage={currentPage}
                    onNavigate={handleNavigate}
                    currentUser={currentUser}
                    navigationItems={navigation}
                    configurations={configurations}
                    onToggleMasterExplorer={toggleSidebar}
                    brandName="MDXERA"
                />
                <div className="flex-1 relative overflow-hidden flex flex-col">
                    {renderPage()}
                </div>
            </div>
            <div className="no-print">
                <StatusBar
                    userName={currentUser?.full_name || 'Admin'}
                    isOnline={navigator.onLine}
                    pharmacyName={currentUser?.pharmacy_name || 'MDXERA'}
                    isSyncing={isReloading || !isRealtimeActive}
                    appEdition={isRealtimeActive ? "Enterprise Edition [Live]" : "Enterprise Edition"}
                />
            </div>
            <NotificationSystem notifications={notifications} removeNotification={removeNotification} />

            {printBill && <PrintBillModal isOpen={!!printBill} onClose={() => setPrintBill(null)} bill={printBill} medicines={medicines} />}
            {viewTransaction && <TransactionDetailModal isOpen={!!viewTransaction} onClose={() => setViewTransaction(null)} transaction={viewTransaction} customer={customers.find(c => c.id === viewTransaction.customerId)} onPrintBill={setPrintBill as any} onProcessReturn={() => { }} currentUser={currentUser} />}
            {viewPurchase && <PurchaseDetailModal isOpen={!!viewPurchase} onClose={() => setViewPurchase(null)} purchase={viewPurchase} currentUser={currentUser} />}
            {printPO && <PrintPurchaseOrderModal isOpen={!!printPO} onClose={() => setPrintPO(null)} purchaseOrder={printPO as any} pharmacy={currentUser} />}
            {viewReport && <PrintableReportModal isOpen={!!viewReport} onClose={() => setViewReport(null)} {...viewReport} pharmacyDetails={currentUser} />}
            {showLogoutPrompt && <TallyPrompt isOpen={showLogoutPrompt} title="Quit Application" message="Are you sure you want to exit Medimart ERP?" onAccept={handleLogout} onDiscard={() => setShowLogoutPrompt(false)} onCancel={() => setShowLogoutPrompt(false)} />}

            {showEscSavePrompt && (
                <TallyPrompt
                    isOpen={showEscSavePrompt}
                    title="Quit and Save"
                    message="Do you want to save the entry?"
                    acceptLabel="Yes (Y)"
                    discardLabel="No (N)"
                    onAccept={handleEscSave}
                    onDiscard={handleEscDiscard}
                    onCancel={() => setShowEscSavePrompt(false)}
                />
            )}
        </div>
    );
};

export default App;
