import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import type { InventoryItem, PhysicalInventorySession, PhysicalInventoryCountItem } from '../types';
import { PhysicalInventoryStatus } from '../types';
import { fuzzyMatch } from '../utils/search';

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
);

const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);

const PHYSICAL_COUNT_REASONS = [
    "Monthly Audit",
    "Damaged/Leakage Check",
    "Expiry Review",
    "Staff Handover",
    "Discrepancy Investigation",
    "Yearly Closing",
    "Other"
];

const formatStockDisplay = (totalUnits: number, unitsPerPack: number) => {
    const isNegative = totalUnits < 0;
    const absUnits = Math.abs(totalUnits);
    const packs = Math.floor(absUnits / unitsPerPack);
    const loose = absUnits % unitsPerPack;
    
    const sign = totalUnits === 0 ? '' : (isNegative ? '-' : '+');
    const mainPart = `${packs}:${String(loose).padStart(2, '0')}`;
    return `${sign}${mainPart} (${totalUnits})`;
};

const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>) => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), waitFor);
    };
    return debounced as (...args: Parameters<F>) => void;
};

interface PhysicalInventoryPageProps {
    inventory: InventoryItem[];
    physicalInventorySessions: PhysicalInventorySession[];
    onStartNewCount: () => void;
    onUpdateCount: (session: PhysicalInventorySession) => void;
    onFinalizeCount: (session: PhysicalInventorySession) => void;
    onCancelCount: (session: PhysicalInventorySession) => void;
}

const PhysicalInventoryPage: React.FC<PhysicalInventoryPageProps> = ({ inventory, physicalInventorySessions, onStartNewCount, onUpdateCount, onFinalizeCount, onCancelCount }) => {
    const [selectedSessionForView, setSelectedSessionForView] = useState<PhysicalInventorySession | null>(null);
    
    const sessions = useMemo(() => Array.isArray(physicalInventorySessions) ? physicalInventorySessions : [], [physicalInventorySessions]);

    const activeSession = useMemo(() => sessions.find(s => s.status === PhysicalInventoryStatus.IN_PROGRESS), [sessions]);

    if (activeSession) {
        return <CountingView key={activeSession.id} session={activeSession} inventory={inventory} onUpdate={onUpdateCount} onFinalize={onFinalizeCount} onCancel={onCancelCount} />;
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Stock Audit Journal</span>
                <span className="text-[10px] font-black uppercase text-accent">Sessions: {sessions.length}</span>
            </div>

            <HistoryView 
                sessions={sessions} 
                onStartNew={onStartNewCount} 
                onViewSession={setSelectedSessionForView}
            />
            {selectedSessionForView && (
                <PhysicalInventoryDetailModal 
                    isOpen={true} 
                    onClose={() => setSelectedSessionForView(null)} 
                    session={selectedSessionForView} 
                    inventory={inventory}
                />
            )}
        </div>
    );
};

const HistoryView: React.FC<{ 
    sessions: PhysicalInventorySession[]; 
    onStartNew: () => void; 
    onViewSession: (s: PhysicalInventorySession) => void;
}> = ({ sessions, onStartNew, onViewSession }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const completedSessions = useMemo(() => {
        let filtered = sessions.filter(s => s.status === PhysicalInventoryStatus.COMPLETED);

        if (searchTerm) {
            filtered = filtered.filter(s => 
                (s.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.performedByName || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (startDate) {
            const start = new Date(startDate).getTime();
            filtered = filtered.filter(s => new Date(s.startDate).getTime() >= start);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(s => new Date(s.endDate || s.startDate).getTime() <= end.getTime());
        }

        return filtered.sort((a, b) => {
            const dateB = new Date(b.startDate || b.endDate || 0).getTime();
            const dateA = new Date(a.startDate || a.endDate || 0).getTime();
            return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
        });
    }, [sessions, searchTerm, startDate, endDate]);

    return (
        <div className="flex-1 p-4 overflow-y-auto bg-app-bg">
            <div className="flex justify-end mb-4">
                <button onClick={onStartNew} className="px-6 py-2 tally-button-primary text-[10px] shadow-lg flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    F2: Create Audit
                </button>
            </div>

            <Card className="p-3 tally-border !rounded-none grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-white">
                <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Audits</label>
                    <input type="text" placeholder="Session ID, Reason..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">From Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">To Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                </div>
            </Card>

            <Card className="mt-4 p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="sticky top-0 bg-gray-100 border-b border-gray-400">
                            <tr className="text-[10px] font-black uppercase text-gray-600">
                                <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                <th className="p-2 border-r border-gray-400 text-left">Session ID</th>
                                <th className="p-2 border-r border-gray-400 text-left">Reason</th>
                                <th className="p-2 border-r border-gray-400 text-left">Staff</th>
                                <th className="p-2 border-r border-gray-400 text-right">Variance Impact</th>
                                <th className="p-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {completedSessions.map((s, idx) => (
                                <tr key={s.id} className="hover:bg-accent transition-colors cursor-pointer" onClick={() => onViewSession(s)}>
                                    <td className="p-2 border-r border-gray-200 font-bold text-gray-400 text-center">{idx + 1}</td>
                                    <td className="p-2 border-r border-gray-200 font-mono font-bold text-primary uppercase">{s.id}</td>
                                    <td className="p-2 border-r border-gray-200 uppercase font-bold text-gray-700">{s.reason || 'Manual Audit'}</td>
                                    <td className="p-2 border-r border-gray-200 uppercase text-[10px] font-black">{s.performedByName}</td>
                                    <td className={`p-2 border-r border-gray-200 text-right font-black ${s.totalVarianceValue > 0 ? 'text-green-700' : s.totalVarianceValue < 0 ? 'text-red-700' : ''}`}>
                                        ₹{(s.totalVarianceValue || 0).toFixed(2)}
                                    </td>
                                    <td className="p-2 text-right">
                                        <button className="text-primary font-black uppercase text-[10px] hover:underline">View Log</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

const CountingView: React.FC<{ 
    session: PhysicalInventorySession; 
    inventory: InventoryItem[]; 
    onUpdate: (s: PhysicalInventorySession) => void; 
    onFinalize: (s: PhysicalInventorySession) => void; 
    onCancel: (s: PhysicalInventorySession) => void;
}> = ({ session, inventory, onUpdate, onFinalize, onCancel }) => {
    
    const [countedItems, setCountedItems] = useState<PhysicalInventoryCountItem[]>(session.items || []);
    const [reason, setReason] = useState(session.reason || '');
    const [searchTerm, setSearchTerm] = useState('');
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    
    const isEndingRef = useRef(false);

    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

    const debouncedUpdate = useMemo(() => debounce((s: PhysicalInventorySession) => {
        if (!isEndingRef.current) {
            onUpdateRef.current(s);
        }
    }, 1500), []);

    useEffect(() => {
        if (!isEndingRef.current) {
            debouncedUpdate({ ...session, items: countedItems, reason: reason });
        }
    }, [countedItems, reason, session, debouncedUpdate]);

    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        return inventory.filter(i => 
            fuzzyMatch(i.name, searchTerm) ||
            (i.barcode && fuzzyMatch(i.barcode, searchTerm))
        ).slice(0, 10);
    }, [searchTerm, inventory]);

    const addItemToCount = (item: InventoryItem, increment = false) => {
        setCountedItems(prev => {
            const existingIndex = prev.findIndex(ci => ci.inventoryItemId === item.id);
            if (existingIndex >= 0) {
                if (increment) {
                    const existing = prev[existingIndex];
                    const newPhysicalCount = existing.physicalCount + 1;
                    const updatedItems = [...prev];
                    updatedItems[existingIndex] = {
                        ...existing,
                        physicalCount: newPhysicalCount,
                        variance: newPhysicalCount - existing.systemStock
                    };
                    return updatedItems;
                }
                setTimeout(() => document.getElementById(`count-packs-${item.id}`)?.focus(), 100);
                return prev;
            }
            
            const newItem: PhysicalInventoryCountItem = {
                inventoryItemId: item.id,
                name: item.name,
                brand: item.brand,
                batch: item.batch,
                expiry: item.expiry,
                systemStock: item.stock,
                physicalCount: increment ? 1 : 0, 
                variance: (increment ? 1 : 0) - item.stock, 
                cost: item.cost || (item.purchasePrice / (item.unitsPerPack || 1)),
            };
            return [newItem, ...prev];
        });
        setSearchTerm('');
    };
    
    const handleCountChange = (itemId: string, packs: number, loose: number) => {
        const inventoryItem = inventory.find(i => i.id === itemId);
        if (!inventoryItem) return;
        
        const unitsPerPack = inventoryItem.unitsPerPack || 1;
        const totalPhysical = (packs * unitsPerPack) + loose;

        setCountedItems(prev => prev.map(item => {
            if (item.inventoryItemId === itemId) {
                return {
                    ...item,
                    physicalCount: totalPhysical,
                    variance: totalPhysical - item.systemStock,
                };
            }
            return item;
        }));
    };

    const handleRemoveItem = (itemId: string) => {
        setCountedItems(prev => prev.filter(item => item.inventoryItemId !== itemId));
    };
    
    const handleScanSuccess = (decodedText: string) => {
        setIsScannerOpen(false);
        const foundItem = inventory.find(item => item.barcode === decodedText.trim());
        if (foundItem) {
            addItemToCount(foundItem, true);
        } else {
            alert(`Product with barcode "${decodedText}" not found.`);
        }
    };

    const handleCancelClick = () => {
        if (window.confirm("Are you sure you want to cancel this session?")) {
            isEndingRef.current = true;
            onCancel(session);
        }
    };

    const handleFinalizeClick = () => {
        isEndingRef.current = true;
        onFinalize({...session, items: countedItems, reason: reason});
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Physical Count In Progress</span>
                <span className="text-[10px] font-black uppercase text-accent">Session: {session.id}</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-end gap-4 px-2">
                    <div className="flex gap-4 items-end flex-1">
                        <div className="flex-1 max-w-sm relative">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Item Discovery</label>
                            <input 
                                type="text" 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Type name or Scan..."
                                className="w-full p-2 border border-gray-400 rounded-none bg-input-bg text-sm font-bold focus:bg-yellow-50 outline-none"
                            />
                            {searchTerm && (
                                <ul className="absolute z-[100] w-full mt-1 bg-white border border-gray-400 shadow-2xl divide-y divide-gray-100">
                                    {searchResults.map(item => (
                                        <li key={item.id} onClick={() => addItemToCount(item)} className="p-2 hover:bg-primary hover:text-white cursor-pointer flex justify-between text-xs font-bold uppercase">
                                            <span>{item.name}</span>
                                            <span className="opacity-50">Batch: {item.batch}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="w-48">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Audit Goal</label>
                            <select 
                                value={reason} 
                                onChange={e => setReason(e.target.value)}
                                className="w-full border border-gray-400 p-2 text-sm font-bold outline-none"
                            >
                                <option value="">Select reason...</option>
                                {PHYSICAL_COUNT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <button onClick={() => setIsScannerOpen(true)} className="p-2 border border-gray-400 bg-white hover:bg-gray-100 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M16 7v10"/></svg>
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleCancelClick} className="px-6 py-2 tally-border bg-white text-red-600 font-bold uppercase text-[10px]">Discard</button>
                        <button onClick={() => setIsReviewOpen(true)} className="px-8 py-2 tally-button-primary shadow-lg uppercase text-[10px]">Post Adjustments</button>
                    </div>
                </div>

                <Card className="flex-1 p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white">
                    <div className="overflow-auto h-full">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="bg-gray-100 sticky top-0 z-10 border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-600">
                                    <th className="p-2 border-r border-gray-400 text-left">Particulars</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-24">System</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-48">Actual Count</th>
                                    <th className="p-2 border-r border-gray-400 text-right w-32">Variance</th>
                                    <th className="p-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {countedItems.map(item => {
                                    const invItem = inventory.find(i => i.id === item.inventoryItemId);
                                    if (!invItem) return null;
                                    const uPP = invItem.unitsPerPack || 1;
                                    const phyPacks = Math.floor(item.physicalCount / uPP);
                                    const phyLoose = item.physicalCount % uPP;
                                    return (
                                        <tr key={item.inventoryItemId} className="hover:bg-accent transition-colors">
                                            <td className="p-2 border-r border-gray-200">
                                                <p className="font-bold text-gray-900 uppercase">{item.name}</p>
                                                <p className="text-[9px] text-gray-400 font-bold uppercase">Batch: {item.batch}</p>
                                            </td>
                                            <td className="p-2 border-r border-gray-200 text-center font-bold text-gray-500">{item.systemStock}</td>
                                            <td className="p-2 border-r border-gray-200 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <input type="number" value={phyPacks} onChange={e => handleCountChange(item.inventoryItemId, parseInt(e.target.value) || 0, phyLoose)} className="w-16 p-1 border border-gray-400 text-center font-black no-spinner outline-none focus:bg-yellow-50" placeholder="Pkts"/>
                                                    <span className="font-black">:</span>
                                                    <input type="number" value={phyLoose} onChange={e => handleCountChange(item.inventoryItemId, phyPacks, parseInt(e.target.value) || 0)} className="w-12 p-1 border border-gray-400 text-center font-bold no-spinner outline-none focus:bg-yellow-50" placeholder="Lse"/>
                                                </div>
                                            </td>
                                            <td className={`p-2 border-r border-gray-200 text-right font-black ${item.variance > 0 ? 'text-green-700' : item.variance < 0 ? 'text-red-700' : ''}`}>
                                                {formatStockDisplay(item.variance, uPP)}
                                            </td>
                                            <td className="p-2 text-center">
                                                <button onClick={() => handleRemoveItem(item.inventoryItemId)} className="text-red-300 hover:text-red-600 transition-colors">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleScanSuccess} />
            <ReviewModal isOpen={isReviewOpen} onClose={() => setIsReviewOpen(false)} session={{...session, items: countedItems, reason: reason}} onConfirm={handleFinalizeClick} />
        </div>
    );
};

const ReviewModal = ({ isOpen, onClose, session, onConfirm }: any) => {
    if (!isOpen) return null;
    const totalVarianceValue = session.items.reduce((sum: number, item: any) => sum + (item.variance * item.cost), 0);
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Adjustment Confirmation" widthClass="max-w-2xl">
            <div className="p-6 space-y-4">
                <div className="bg-[var(--modal-header-bg-light)] dark:bg-[var(--modal-header-bg-dark)] p-4 text-white text-center rounded-none shadow-lg">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Net Valuation Impact</p>
                    <p className="text-3xl font-black tracking-tighter">₹{totalVarianceValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="tally-border max-h-60 overflow-auto">
                    <table className="min-w-full text-xs border-collapse">
                        <thead className="bg-gray-100 sticky top-0 border-b border-gray-400">
                            <tr className="uppercase font-bold">
                                <th className="p-2 text-left">Item</th>
                                <th className="p-2 text-center">Variance</th>
                                <th className="p-2 text-right">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {session.items.map((item: any) => (
                                <tr key={item.inventoryItemId} className="border-b border-gray-100">
                                    <td className="p-2 font-bold uppercase truncate max-w-[150px]">{item.name}</td>
                                    <td className={`p-2 text-center font-black ${item.variance > 0 ? 'text-green-600' : 'text-red-600'}`}>{item.variance > 0 ? '+' : ''}{item.variance}</td>
                                    <td className="p-2 text-right font-bold">₹{(item.variance * item.cost).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-6 py-2 tally-border bg-white font-bold uppercase text-[10px]">Back</button>
                    <button onClick={() => onConfirm(session)} className="px-8 py-2 tally-button-primary shadow-lg uppercase text-[10px]">Accept Changes</button>
                </div>
            </div>
        </Modal>
    );
};

const PhysicalInventoryDetailModal: React.FC<{ isOpen: boolean; onClose: () => void; session: PhysicalInventorySession; inventory: InventoryItem[]; }> = ({ isOpen, onClose, session, inventory }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={`Audit Details: ${session.id}`} widthClass="max-w-4xl">
        <div className="p-6 overflow-y-auto max-h-[80vh]">
            <table className="min-w-full erp-table border-collapse text-xs">
                <thead>
                    <tr className="bg-gray-100 font-bold uppercase border-b border-black">
                        <th className="p-2 text-left">Particulars</th>
                        <th className="p-2 text-center">System Qty</th>
                        <th className="p-2 text-center">Actual Qty</th>
                        <th className="p-2 text-right">Variance</th>
                    </tr>
                </thead>
                <tbody>
                    {session.items.map(item => (
                        <tr key={item.inventoryItemId} className="border-b border-gray-100">
                            <td className="p-2 font-bold uppercase">{item.name} <span className="block text-[9px] text-gray-400">Batch: {item.batch}</span></td>
                            <td className="p-2 text-center font-bold text-gray-500">{item.systemStock}</td>
                            <td className="p-2 text-center font-black text-primary">{item.physicalCount}</td>
                            <td className={`p-2 text-right font-black ${item.variance > 0 ? 'text-green-700' : item.variance < 0 ? 'text-red-700' : ''}`}>{item.variance > 0 ? '+' : ''}{item.variance}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Modal>
);

export default PhysicalInventoryPage;