
import React, { useMemo, useState, useEffect } from 'react';
import Card from './components/Card';
import type { InventoryItem, RegisteredPharmacy, Transaction, Purchase, Medicine, Customer, Distributor, AppConfigurations } from './types';
import Chatbot from './components/Chatbot';
import { MASTER_SHORTCUT_OPTIONS } from './constants';
// Import missing utility function for calculating outstanding balances
import { getOutstandingBalance } from './utils/helpers';

interface DashboardProps {
    currentUser: RegisteredPharmacy | null;
    configurations: AppConfigurations;
    transactions: Transaction[];
    inventory: InventoryItem[];
    purchases: Purchase[];
    medicines: Medicine[]; 
    customers: Customer[]; 
    distributors: Distributor[]; 
    onKpiClick: (id: string) => void;
    brandName: string;
    lastRefreshed?: Date;
    onReload?: () => void;
    isReloading?: boolean;
}

const KpiBox = ({ label, value, color, onClick }: { label: string, value: any, color: string, onClick: () => void }) => (
    <button 
        onClick={onClick}
        className={`bg-white dark:bg-zinc-800 p-4 border-l-8 ${color} tally-border tally-shadow text-left hover:bg-gray-50 transition-all w-full outline-none focus:ring-4 focus:ring-primary/20 active:scale-[0.98]`}
    >
        <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">{label}</p>
        <p className="text-2xl font-black text-gray-900 dark:text-white font-mono">{value}</p>
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
        return MASTER_SHORTCUT_OPTIONS.slice(0, 8); 
    }, [configurations.masterShortcuts]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;
            if (document.querySelector('[role="dialog"]')) return;

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setFocusedShortcutIndex(prev => (prev < activeShortcuts.length - 1 ? prev + 1 : 0));
            } else if (e.key === 'ArrowLeft') {
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
                <div className="flex justify-between items-center bg-primary text-white px-6 py-4 tally-shadow border-b-4 border-accent">
                    <div className="flex items-center gap-4">
                        <div className="bg-accent text-primary p-2 font-black rounded-none rotate-3 shadow-lg">ERP</div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-[0.2em] leading-none">MDXERA ERP Summary</h2>
                            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mt-1">Enterprise Pharmacy Intelligence</p>
                        </div>
                    </div>
                    <div className="flex gap-12 text-[14px] font-black uppercase">
                        {isVisible('statSales') && (
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] opacity-60">Daily Sales</span>
                                <span className="text-accent font-mono">₹{todaySales.toLocaleString()}</span>
                            </div>
                        )}
                        {isVisible('statProfit') && (
                            <div className="flex flex-col items-end border-l border-white/20 pl-12">
                                <span className="text-[9px] opacity-60">Daily Profit</span>
                                <span className="text-accent font-mono">₹{todayProfit.toLocaleString()}</span>
                            </div>
                        )}
                        {isVisible('statStockValue') && (
                            <div className="flex flex-col items-end border-l border-white/20 pl-12">
                                <span className="text-[9px] opacity-60">Stock Value</span>
                                <span className="text-accent font-mono">₹{(inventoryValue/100000).toFixed(2)}L</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Panel: Main View Content */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {isVisible('recentVouchers') && (
                                <Card className="p-0 tally-border !rounded-none overflow-hidden h-[360px] flex flex-col bg-white">
                                    <div className="bg-primary text-white p-3 font-black text-[12px] uppercase tracking-widest flex justify-between items-center shadow-md">
                                        <span>Recent Vouchers</span>
                                        <span className="text-accent text-[10px]">Real-time Updates</span>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-[13px] border-collapse">
                                            <tbody className="divide-y divide-gray-100">
                                                {transactions.slice(0, 15).map(tx => (
                                                    <tr key={tx.id} className="hover:bg-accent transition-colors cursor-pointer group">
                                                        <td className="p-4 font-black font-mono text-primary group-hover:text-black">{tx.id}</td>
                                                        <td className="p-4 truncate font-bold group-hover:text-black uppercase">{tx.customerName}</td>
                                                        <td className="p-4 text-right font-black group-hover:text-black font-mono">₹{tx.total}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}

                            <Card className="p-8 tally-border !rounded-none flex flex-col justify-between bg-primary text-white border-4 border-accent shadow-2xl">
                                <div>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-2 h-2 bg-accent rounded-full animate-ping"></div>
                                        <h4 className="text-accent font-black uppercase text-[11px] tracking-widest">Business Insights</h4>
                                    </div>
                                    <p className="text-lg font-black italic opacity-95 leading-relaxed">
                                        "Inventory turnover has increased significantly. Current trends suggest optimizing stock for top-selling medicines to maximize cash flow efficiency."
                                    </p>
                                </div>
                                <button className="mt-8 py-4 w-full bg-accent text-primary font-black uppercase text-[12px] tracking-[0.2em] hover:bg-white transition-all shadow-xl active:scale-95">
                                    Analyze Performance
                                </button>
                            </Card>
                        </div>
                    </div>

                    {/* Right Panel: Gateway Menu Style */}
                    <div className="lg:col-span-4 space-y-8">
                        <Card className="p-0 tally-border !rounded-none bg-white dark:bg-zinc-800 shadow-2xl overflow-hidden border-2 border-primary">
                            <div className="bg-primary p-4 text-white text-[13px] font-black text-center uppercase tracking-[0.3em] border-b-2 border-accent">
                                MDXERA ENTERPRISE ERP
                            </div>
                            <div className="p-4 space-y-2">
                                {activeShortcuts.map((shortcut, idx) => (
                                    <button 
                                        key={shortcut.id}
                                        onClick={() => onKpiClick(shortcut.id)}
                                        onMouseEnter={() => setFocusedShortcutIndex(idx)}
                                        className={`w-full flex justify-between items-center p-3.5 group transition-all text-[15px] font-black outline-none border-2 border-transparent ${
                                            focusedShortcutIndex === idx 
                                            ? 'bg-accent text-primary border-primary scale-[1.02] shadow-lg translate-x-1' 
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-accent/10'
                                        }`}
                                    >
                                        <span><span className={`font-black ${focusedShortcutIndex === idx ? 'text-primary' : 'text-red-700 group-hover:text-primary'}`}>{shortcut.label.charAt(0)}</span>{shortcut.label.substring(1)}</span>
                                        <span className={`text-[10px] uppercase font-black ${focusedShortcutIndex === idx ? 'opacity-100' : 'opacity-20 group-hover:opacity-100'}`}>GO TO ↵</span>
                                    </button>
                                ))}
                                
                                <button 
                                    onClick={() => onKpiClick('configuration')}
                                    onMouseEnter={() => setFocusedShortcutIndex(activeShortcuts.length)}
                                    className={`w-full flex justify-between items-center p-3.5 group transition-all text-[15px] font-black border-t-2 border-dashed border-gray-200 mt-4 pt-4 outline-none border-x-2 border-b-2 ${
                                        focusedShortcutIndex === activeShortcuts.length 
                                        ? 'bg-accent text-primary border-primary' 
                                        : 'text-gray-500 hover:text-primary'
                                    }`}
                                >
                                    <span><span className={`font-black ${focusedShortcutIndex === activeShortcuts.length ? 'text-primary' : 'text-red-700'}`}>F</span>ull Config [F10]</span>
                                </button>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-zinc-900 border-t border-gray-300 text-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Enterprise Command Center</span>
                            </div>
                        </Card>

                    </div>
                </div>
            </main>

            {/* Expiry Ticker */}
            {expiryAlerts.length > 0 && (
                <div className="fixed bottom-8 left-64 right-10 bg-red-800 text-white h-12 flex items-center overflow-hidden z-30 tally-shadow border-y-4 border-accent">
                    <div className="bg-black px-6 h-full flex items-center font-black text-[11px] uppercase tracking-[0.2em] shrink-0 border-r border-accent">
                        ALERT: BATCH EXPIRY
                    </div>
                    <div className="flex-1 h-full overflow-hidden whitespace-nowrap">
                        <div className="animate-marquee h-full flex items-center">
                            {[...expiryAlerts, ...expiryAlerts].map((item, idx) => (
                                <div key={`${item.id}-${idx}`} className="flex items-center px-12 shrink-0 text-[14px] font-black uppercase tracking-tight">
                                    <span className="text-accent mr-4 italic">Action Required:</span>
                                    {item.name} (B:{item.batch}) - EXP: {item.expiry}
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
