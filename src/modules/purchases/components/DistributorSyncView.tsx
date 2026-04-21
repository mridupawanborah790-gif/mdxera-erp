
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from '../../../core/components/Card';
import type { Medicine, Distributor, DistributorProductMap } from '../../../core/types/types';
import { fuzzyMatch } from '../../../core/utils/search';

// Standardized typography matching POS screen "Name of Item"
const uniformTextStyle = "text-base font-medium tracking-tight uppercase";

interface DistributorSyncViewProps {
    distributors: Distributor[];
    medicines?: Medicine[]; // Made optional
    mappings: DistributorProductMap[];
    onSaveMapping: (map: DistributorProductMap) => Promise<void>;
    onDeleteMapping: (id: string) => Promise<void>;
}

const DistributorSyncView: React.FC<DistributorSyncViewProps> = ({ distributors, medicines = [], mappings, onSaveMapping, onDeleteMapping }) => {
    const [selectedDistributorId, setSelectedDistributorId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // New Mapping State
    const [isAddMode, setIsAddMode] = useState(false);
    const [newMapping, setNewMapping] = useState({
        // Fix: Changed property names to snake_case to match SupplierProductMap interface
        supplier_id: '',
        supplier_product_name: '',
        master_medicine_id: '',
        auto_apply: true // Default to true
    });

    const [masterSearch, setMasterSearch] = useState('');
    const [isMasterSearchOpen, setIsMasterSearchOpen] = useState(false);

    const filteredMappings = useMemo(() => {
        let list = [...mappings];
        if (selectedDistributorId !== 'all') {
            // Fix: Map property name to supplier_id
            list = list.filter(m => m.supplier_id === selectedDistributorId);
        }
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(m => {
                // Fix: Map property names to supplier_id and master_medicine_id
                const distName = distributors.find(d => d.id === m.supplier_id)?.name || '';
                const masterMed = medicines.find(med => med.id === m.master_medicine_id)?.name || '';
                // Fix: supplier_product_name
                return distName.toLowerCase().includes(lower) ||
                       m.supplier_product_name.toLowerCase().includes(lower) ||
                       masterMed.toLowerCase().includes(lower);
            });
        }
        return list;
    }, [mappings, selectedDistributorId, searchTerm, distributors, medicines]);

    const masterSearchResults = useMemo(() => {
        if (!masterSearch) return [];
        return medicines.filter(m => fuzzyMatch(m.name, masterSearch)).slice(0, 10);
    }, [masterSearch, medicines]);

    const handleAddMapping = async () => {
        // Fix: Use snake_case keys from local state
        if (!newMapping.supplier_id || !newMapping.supplier_product_name || !newMapping.master_medicine_id) {
            alert("Please fill all fields to create a mapping.");
            return;
        }

        const map: DistributorProductMap = {
            id: crypto.randomUUID(),
            organization_id: '', // Set by service
            // Fix: Map properties correctly to snake_case names
            supplier_id: newMapping.supplier_id,
            supplier_product_name: newMapping.supplier_product_name,
            master_medicine_id: newMapping.master_medicine_id,
            auto_apply: newMapping.auto_apply
        };

        await onSaveMapping(map);
        setIsAddMode(false);
        // Fix: reset state with correct keys
        setNewMapping({ supplier_id: '', supplier_product_name: '', master_medicine_id: '', auto_apply: true });
        setMasterSearch('');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
            <Card className="p-6 border-app-border shadow-sm bg-white dark:bg-card-bg flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                        <div>
                            <label className="block text-[11px] font-black text-app-text-tertiary uppercase tracking-[0.2em] mb-2 ml-1">Filter by Supplier</label>
                            <select 
                                value={selectedDistributorId} 
                                onChange={e => setSelectedDistributorId(e.target.value)}
                                className="w-full p-2.5 border border-app-border rounded-xl bg-input-bg text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                                <option value="all">All Suppliers</option>
                                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-black text-app-text-tertiary uppercase tracking-[0.2em] mb-2 ml-1">Search Mappings</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="Search by product name..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-app-border rounded-xl bg-input-bg focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                />
                                <svg className="absolute left-3.5 top-3 text-app-text-tertiary w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsAddMode(true)}
                        className="px-6 py-2.5 text-sm font-black text-white bg-primary rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all transform active:scale-95 uppercase tracking-widest flex-shrink-0"
                    >
                        + Create Mapping
                    </button>
                </div>
            </Card>

            {isAddMode && (
                <Card className="p-6 border-2 border-primary/20 bg-primary-extralight/30 animate-in slide-in-from-top-4 duration-300 flex-shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                        <div>
                            <label className="block text-[10px] font-black text-primary uppercase mb-2">1. Supplier</label>
                            <select 
                                // Fix: use supplier_id from state
                                value={newMapping.supplier_id} 
                                onChange={e => setNewMapping({...newMapping, supplier_id: e.target.value})}
                                className="w-full p-2.5 border border-primary/20 rounded-xl bg-white text-sm font-bold focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Select Supplier</option>
                                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-primary uppercase mb-2">2. Supplier's Product Name</label>
                            <input 
                                type="text" 
                                // Fix: use supplier_product_name from state
                                value={newMapping.supplier_product_name}
                                onChange={e => setNewMapping({...newMapping, supplier_product_name: e.target.value.toUpperCase()})}
                                placeholder="Name as seen on their bill"
                                className="w-full p-2.5 border border-primary/20 rounded-xl bg-white text-sm font-bold focus:ring-2 focus:ring-primary/20 uppercase"
                            />
                        </div>
                        <div className="relative">
                            <label className="block text-[10px] font-black text-primary uppercase mb-2">3. Medimart Master SKU</label>
                            <input 
                                type="text" 
                                value={masterSearch}
                                onChange={e => {
                                    setMasterSearch(e.target.value);
                                    setIsMasterSearchOpen(true);
                                }}
                                onFocus={() => setIsMasterSearchOpen(true)}
                                placeholder="Search internal catalog..."
                                className="w-full p-2.5 border border-primary/20 rounded-xl bg-white text-sm font-bold focus:ring-2 focus:ring-primary/20"
                            />
                            {isMasterSearchOpen && masterSearch.length > 0 && (
                                <ul className="absolute top-full left-0 w-full mt-2 bg-white border border-app-border rounded-xl shadow-2xl z-[50] ring-1 ring-black/5 divide-y divide-app-border overflow-hidden">
                                    {masterSearchResults.map(med => (
                                        <li 
                                            key={med.id} 
                                            onClick={() => {
                                                setNewMapping({...newMapping, master_medicine_id: med.id});
                                                setMasterSearch(med.name);
                                                setIsMasterSearchOpen(false);
                                            }}
                                            className="p-3 cursor-pointer hover:bg-slate-50 transition-colors flex justify-between items-center"
                                        >
                                            <span className="font-bold text-sm text-app-text-primary">{med.name}</span>
                                            <span className="text-[10px] font-black text-app-text-tertiary uppercase">{med.brand}</span>
                                        </li>
                                    ))}
                                    {masterSearchResults.length === 0 && (
                                        <li className="p-4 text-center text-xs text-app-text-tertiary italic">No matching products in master</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-primary/10">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={newMapping.auto_apply}
                                onChange={e => setNewMapping({...newMapping, auto_apply: e.target.checked})}
                                className="w-4 h-4 text-primary rounded focus:ring-primary"
                            />
                            <span className="text-xs font-bold text-app-text-secondary uppercase tracking-tighter">Auto-apply mapping in AI scanning</span>
                        </label>
                        <div className="flex gap-3">
                            <button onClick={() => { setIsAddMode(false); setMasterSearch(''); }} className="px-4 py-2 text-xs font-bold text-app-text-tertiary hover:text-primary transition-colors">Discard</button>
                            <button onClick={handleAddMapping} className="px-6 py-2 text-xs font-black text-white bg-primary rounded-xl shadow-md shadow-primary/20 hover:bg-primary-dark transition-all uppercase tracking-widest">Link nomenclature</button>
                        </div>
                    </div>
                </Card>
            )}

            <Card className="flex-1 border-app-border overflow-hidden bg-white shadow-md flex flex-col min-h-0">
                <div className="p-4 border-b font-bold text-app-text-primary bg-slate-50 flex justify-between items-center flex-shrink-0">
                    <span className="text-sm font-bold uppercase tracking-wider opacity-60">Existing Nomenclature Mappings</span>
                    <span className="text-[11px] bg-white px-3 py-1 rounded-full border border-app-border font-bold text-app-text-tertiary">
                        {filteredMappings.length} Active Rules
                    </span>
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="min-w-full divide-y divide-app-border">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-app-text-tertiary uppercase tracking-widest border-b border-app-border">Supplier</th>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-app-text-tertiary uppercase tracking-widest border-b border-app-border">Supplier's Product Name</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-app-text-tertiary uppercase tracking-widest border-b border-app-border w-16">➔</th>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-app-text-tertiary uppercase tracking-widest border-b border-app-border">Medimart Master Product</th>
                                <th className="px-6 py-4 w-20 border-b border-app-border"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-app-border">
                            {filteredMappings.map(m => {
                                // Fix: use supplier_id and master_medicine_id
                                const dist = distributors.find(d => d.id === m.supplier_id);
                                const med = medicines.find(med => med.id === m.master_medicine_id);
                                return (
                                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                        <td className={`px-6 py-4 text-app-text-primary ${uniformTextStyle}`}>{dist?.name || <span className="text-gray-300 italic">Unknown Ledger</span>}</td>
                                        {/* Fix: use supplier_product_name */}
                                        <td className={`px-6 py-4 text-blue-600 bg-blue-50/20 ${uniformTextStyle}`}>{m.supplier_product_name}</td>
                                        <td className="px-6 py-4 text-center text-gray-400 opacity-40">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                        </td>
                                        <td className={`px-6 py-4 text-emerald-700 bg-emerald-50/20 ${uniformTextStyle}`}>{med?.name || <span className="text-red-400 italic">Master Record Missing</span>}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => onDeleteMapping(m.id)}
                                                className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                title="Delete Rule"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredMappings.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-32 text-center">
                                        <div className="flex flex-col items-center opacity-30">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><path d="m12 2 3.5 3.5"/><path d="M12 22v-6.5"/><path d="M12 2v6.5"/><path d="M4.93 4.93 7.4 7.4"/><path d="m16.6 16.6 2.47 2.47"/><path d="M2 12h6.5"/><path d="M15.5 12H22"/><path d="m4.93 19.07 2.47-2.47"/><path d="m16.6 7.4 2.47-2.47"/></svg>
                                            <p className="font-black uppercase tracking-[0.3em] text-sm">No mappings defined</p>
                                            <p className="text-xs mt-2 normal-case max-w-xs">Define mappings to automatically resolve different supplier product names to your internal catalog.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default DistributorSyncView;
