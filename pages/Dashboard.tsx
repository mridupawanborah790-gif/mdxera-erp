
import React, { useMemo, useState, useEffect } from 'react';
import Card from '../components/Card';
import type { InventoryItem, RegisteredPharmacy, Transaction, Purchase, Medicine, Customer, Distributor, AppConfigurations } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Chatbot from '../components/Chatbot'; // Import Chatbot here
import { MASTER_SHORTCUT_OPTIONS } from '../constants';

interface DashboardProps {
    currentUser: RegisteredPharmacy | null;
    configurations: AppConfigurations;
    transactions: Transaction[];
    inventory: InventoryItem[];
    purchases: Purchase[];
    medicines: Medicine[]; // Added for chatbot
    customers: Customer[]; // Added for chatbot
    distributors: Distributor[]; // Added for chatbot
    onKpiClick: (id: string) => void;
    brandName: string;
    lastRefreshed?: Date;
    onReload?: () => void;
    isReloading?: boolean;
}

const KpiBox = ({ label, value, color, onClick }: { label: string, value: any, color: string, onClick: () => void }) => (
    <button 
        onClick={onClick}
        className={`bg-white dark:bg-zinc-800 p-4 border-l-4 ${color} tally-border tally-shadow text-left hover:bg-gray-50 transition-all w-full outline-none focus:ring-2 focus:ring-primary`}
    >
        <p className="text-11px font-bold text-gray-400 uppercase mb-1">{label}</p>
        <p className="text-xl font-black text-gray-900 dark:text-white">{value}</p>
    </button>
);

const Dashboard: React.FC<DashboardProps> = ({ currentUser, configurations, transactions, inventory, purchases, medicines, customers, distributors, onKpiClick, brandName, lastRefreshed, onReload, isReloading }) => {
    const [focusedShortcutIndex, setFocusedShortcutIndex] = useState<number>(-1);

    const isVisible = (fieldId: string) => configurations.modules?.dashboard?.fields?.[fieldId] === true;

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    const todayTransactions = useMemo(() => {
        return transactions.filter(t => (t.date || '').startsWith(todayStr) && t.status !== 'cancelled');
    }, [transactions, todayStr]);

    const todaySales = useMemo(() => todayTransactions.reduce((sum, t) => sum + t.total, 0), [todayTransactions]);

    const todayPurchases = useMemo(() => {
        return purchases
            .filter(p => (p.date || '').startsWith(todayStr) && p.status !== 'cancelled')
            .reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    }, [purchases, todayStr]);

    const todayProfit = useMemo(() => {
        const netSales = todayTransactions.reduce((sum, t) => sum + (t.total - (t.totalGst || 0)), 0);
        const cogs = todayTransactions.reduce((acc, t) => {
            return acc + (t.items || []).reduce((itemAcc, item) => {
                const inv = inventory.find(i => i.id === item.inventoryItemId);
                if (!inv) return itemAcc;
                const unitsPerPack = inv.unitsPerPack || 1;
                const totalUnitsSold = (item.quantity * unitsPerPack) + (item.looseQuantity || 0);
                const unitCost = inv.cost || (inv.purchasePrice / unitsPerPack);
                return itemAcc + (totalUnitsSold * unitCost);
            }, 0);
        }, 0);
        return Math.round(netSales - cogs);
    }, [todayTransactions, inventory]);

    const lowStockCount = inventory.filter(i => i.stock <= i.minStockLimit).length;
    
    const inventoryValue = inventory.reduce((sum, i) => {
        const cost = i.cost || (i.purchasePrice / (i.unitsPerPack || 1));
        return sum + (i.stock * cost);
    }, 0);

    const expiryAlerts = useMemo(() => {
        const threshold = configurations.displayOptions?.expiryThreshold || 90;
        const alertDate = new Date();
        alertDate.setDate(alertDate.getDate() + threshold);
        return inventory.filter(item => {
            if (!item.expiry) return false;
            const expDate = new Date(item.expiry);
            return expDate <= alertDate;
        }).sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    }, [inventory, configurations.displayOptions]);

    const cleanAppData = useMemo(() => ({
        inventory, transactions, purchases, distributors, customers, medicines,
    }), [inventory, transactions, purchases, distributors, customers, medicines]);

    const activeShortcuts = useMemo(() => {
        if (configurations.masterShortcuts && configurations.masterShortcuts.length > 0) {
            return MASTER_SHORTCUT_OPTIONS.filter(opt => configurations.masterShortcuts?.includes(opt.id));
        }
        return MASTER_SHORTCUT_OPTIONS.slice(0, 8); // Fallback
    }, [configurations.masterShortcuts]);

    // Keyboard navigation for Gateway Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept if an input is focused or sidebar has focus
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;
            if (document.querySelector('[role="dialog"]')) return;

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setFocusedShortcutIndex(prev => (prev < activeShortcuts.length - 1 ? prev + 1 : 0));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusedShortcutIndex(prev => (prev > 0 ? prev - 1 : activeShortcuts.length - 1));
            } else if (e.key === 'Enter' && focusedShortcutIndex >= 0) {
                e.preventDefault();
                onKpiClick(activeShortcuts[focusedShortcutIndex].id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeShortcuts, focusedShortcutIndex, onKpiClick]);

    return (
        <div className="relative min-h-full flex flex-col overflow-hidden bg-app-bg dark:bg-zinc-950">
            <main className="p-6 space-y-6 view-enter flex-1 pb-16">
                
                {/* Header Strip */}
                <div className="flex justify-between items-center bg-primary text-white px-4 py-3 tally-shadow">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base font-bold uppercase tracking-widest">Dashboard Summary — {brandName}</h2>
                        {lastRefreshed && (
                            <span className="text-[10px] opacity-40 font-mono italic normal-case ml-2">Last Sync: {lastRefreshed.toLocaleTimeString()}</span>
                        )}
                    </div>
                    <div className="flex gap-8 text-[13px] font-bold uppercase">
                        {isVisible('statSales') && <span>Sales: <span className="text-accent">₹{todaySales.toLocaleString()}</span></span>}
                        {isVisible('statProfit') && <span>Profit: <span className="text-accent">₹{todayProfit.toLocaleString()}</span></span>}
                        {isVisible('statPurchases') && <span>Purchases: <span className="text-accent">₹{todayPurchases.toLocaleString()}</span></span>}
                        {isVisible('statStockValue') && <span>Inventory: <span className="text-accent">₹{(inventoryValue/100000).toFixed(2)}L</span></span>}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Panel: Main View Content */}
                    <div className="lg:col-span-8 space-y-6">
                        {isVisible('chartCashFlow') && (
                            <Card className="p-5 tally-border !rounded-none h-[300px]">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Cash Flow Performance (7 Days)</h3>
                                <div className="h-52 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={transactions.slice(0, 7).reverse().map(t => ({ date: (t.date || '').split('T')[0], amount: t.total }))}>
                                            <CartesianGrid strokeDasharray="1 1" stroke="#ddd" vertical={false} />
                                            <XAxis dataKey="date" hide />
                                            <YAxis tick={{fontSize: 10, fontStyle: 'bold'}} />
                                            <Tooltip contentStyle={{fontSize: '11px', borderRadius: '0px', border: '1px solid #004242'}} />
                                            <Area type="step" dataKey="amount" stroke="#004242" fill="#00424220" strokeWidth={3} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {isVisible('recentVouchers') && (
                                <Card className="p-0 tally-border !rounded-none overflow-hidden h-[340px] flex flex-col">
                                    <div className="bg-gray-100 p-3 border-b border-gray-300 font-bold text-[12px] uppercase tracking-wide flex justify-between items-center">
                                        <span>Recent Vouchers</span>
                                        <button onClick={onReload} disabled={isReloading} className={`p-1.5 rounded-full hover:bg-gray-200 transition-colors ${isReloading ? 'animate-spin opacity-50' : ''}`} title="Refresh Records">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto bg-white">
                                        <table className="w-full text-[13px] border-collapse">
                                            <tbody className="divide-y divide-gray-100">
                                                {transactions.slice(0, 15).map(tx => (
                                                    <tr key={tx.id} className="hover:bg-accent transition-colors cursor-pointer group">
                                                        <td className="p-3 font-bold font-mono text-primary group-hover:text-black">{tx.id}</td>
                                                        <td className="p-3 truncate font-medium group-hover:text-black uppercase">{tx.customerName}</td>
                                                        <td className="p-3 text-right font-black group-hover:text-black">₹{tx.total}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Gateway Menu Style */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="p-0 tally-border !rounded-none bg-white dark:bg-zinc-800 shadow-xl overflow-hidden">
                            <div className="bg-primary p-3 text-white text-[12px] font-bold text-center uppercase tracking-[0.2em]">MDXERA ENTERPRISE ERP</div>
                            <div className="p-4 space-y-1.5">
                                {activeShortcuts.map((shortcut, idx) => (
                                    <button 
                                        key={shortcut.id}
                                        onClick={() => onKpiClick(shortcut.id)}
                                        onMouseEnter={() => setFocusedShortcutIndex(idx)}
                                        className={`w-full flex justify-between items-center p-2.5 group transition-colors text-[15px] font-bold outline-none border-2 border-transparent ${
                                            focusedShortcutIndex === idx 
                                            ? 'bg-accent text-black border-primary' 
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-accent hover:text-black'
                                        }`}
                                    >
                                        <span><span className={`font-black ${focusedShortcutIndex === idx ? 'text-black' : 'text-red-700 group-hover:text-black'}`}>{shortcut.label.charAt(0)}</span>{shortcut.label.substring(1)}</span>
                                        <span className={`text-[11px] uppercase ${focusedShortcutIndex === idx ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>Go To</span>
                                    </button>
                                ))}
                                
                                {/* Always show Configuration if shortcuts are limited */}
                                {activeShortcuts.every(s => s.id !== 'configuration') && (
                                     <button 
                                        onClick={() => onKpiClick('configuration')}
                                        onMouseEnter={() => setFocusedShortcutIndex(activeShortcuts.length)}
                                        className={`w-full flex justify-between items-center p-2.5 group transition-colors text-[15px] font-bold border-t border-gray-100 mt-2 pt-2 outline-none border-x-2 border-b-2 ${
                                            focusedShortcutIndex === activeShortcuts.length 
                                            ? 'bg-accent text-black border-primary' 
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-accent hover:text-black'
                                        }`}
                                    >
                                        <span><span className={`font-black ${focusedShortcutIndex === activeShortcuts.length ? 'text-black' : 'text-red-700 group-hover:text-black'}`}>F</span>ull Configuration</span>
                                        <span className={`text-[11px] uppercase underline ${focusedShortcutIndex === activeShortcuts.length ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>F10</span>
                                    </button>
                                )}
                            </div>
                            <div className="p-3 bg-gray-100 dark:bg-zinc-900 border-t border-gray-300 text-center">
                                <span className="text-11px font-bold text-gray-400 uppercase tracking-tighter">Use Arrow keys to navigate & Enter to select</span>
                            </div>
                        </Card>

                        <div className="grid grid-cols-2 gap-3">
                            {isVisible('kpiLowStock') && <KpiBox label="Low Stock" value={lowStockCount} color="border-red-600" onClick={() => onKpiClick('lowStock')}/>}
                            {isVisible('kpiAudits') && <KpiBox label="Audits" value={0} color="border-indigo-600" onClick={() => onKpiClick('physicalInventory')}/>}
                            {isVisible('statPurchases') && <KpiBox label="Purchases" value={purchases.length} color="border-emerald-600" onClick={() => onKpiClick('purchaseHistory')}/>}
                            {isVisible('kpiReturns') && <KpiBox label="Returns" value={0} color="border-orange-600" onClick={() => onKpiClick('returns')}/>}
                        </div>
                    </div>
                </div>
            </main>

            {/* Expiry Ticker */}
            {expiryAlerts.length > 0 && (
                <div className="fixed bottom-8 left-64 right-10 bg-red-800 text-white h-10 flex items-center overflow-hidden z-30 tally-shadow border border-red-900">
                    <div className="bg-black px-5 h-full flex items-center font-black text-[11px] uppercase tracking-tighter shrink-0 border-r border-red-900">
                        ATTENTION REQUIRED: EXPIRY ALERTS
                    </div>
                    <div className="flex-1 h-full overflow-hidden whitespace-nowrap">
                        <div className="animate-marquee h-full flex items-center">
                            {[...expiryAlerts, ...expiryAlerts].map((item, idx) => (
                                <div key={`${item.id}-${idx}`} className="flex items-center px-10 shrink-0 text-[13px] font-bold uppercase">
                                    <span className="text-accent mr-3">•</span>
                                    {item.name} (EXP: {item.expiry})
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <Chatbot appData={cleanAppData} />
        </div>
    );
};

export default Dashboard;
