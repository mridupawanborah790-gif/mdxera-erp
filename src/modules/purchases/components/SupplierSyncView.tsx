
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from '../../../core/components/Card';
import type { Medicine, Supplier, SupplierProductMap } from '../../../core/types/types';
import { fuzzyMatch } from '../../../core/utils/search';

// Standardized typography matching POS screen "Name of Item"
const uniformTextStyle = "text-sm font-bold tracking-tight uppercase";
const headerTextStyle = "text-[10px] font-black uppercase text-gray-500 tracking-[0.2em]";

interface SupplierSyncViewProps {
    suppliers: Supplier[];
    medicines: Medicine[];
    mappings: SupplierProductMap[];
    onSaveMapping: (map: SupplierProductMap) => Promise<void>;
    onDeleteMapping: (id: string) => Promise<void>;
}

const SupplierSyncView: React.FC<SupplierSyncViewProps> = ({ 
    suppliers = [], 
    medicines = [], 
    mappings = [], 
    onSaveMapping, 
    onDeleteMapping 
}) => {
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    const [isAddMode, setIsAddMode] = useState(false);
    const [newMapping, setNewMapping] = useState({
        supplier_id: '',
        supplier_product_name: '',
        master_medicine_id: '',
        auto_apply: true
    });

    const [masterSearch, setMasterSearch] = useState('');
    const [isMasterSearchOpen, setIsMasterSearchOpen] = useState(false);
    const [selectedMasterIndex, setSelectedMasterIndex] = useState(0);

    const masterSearchRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLUListElement>(null);

    const filteredMappings = useMemo(() => {
        let list = Array.isArray(mappings) ? [...mappings] : [];
        if (selectedSupplierId !== 'all') {
            list = list.filter(m => m.supplier_id === selectedSupplierId);
        }
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(m => {
                const supplierObj = suppliers.find(d => d.id === m.supplier_id);
                const supplierName = supplierObj?.name || '';
                const masterMed = medicines.find(med => med.id === m.master_medicine_id)?.name || '';
                return supplierName.toLowerCase().includes(lower) ||
                       m.supplier_product_name.toLowerCase().includes(lower) ||
                       masterMed.toLowerCase().includes(lower);
            });
        }
        return list.sort((a, b) => (b as any).created_at?.localeCompare((a as any).created_at || '') || 0);
    }, [mappings, selectedSupplierId, searchTerm, suppliers, medicines]);

    const masterSearchResults = useMemo(() => {
        if (!masterSearch.trim()) return [];
        return medicines.filter(m => 
            fuzzyMatch(m.name, masterSearch) || 
            fuzzyMatch(m.materialCode, masterSearch)
        ).slice(0, 10);
    }, [masterSearch, medicines]);

    const handleMasterKeyDown = (e: React.KeyboardEvent) => {
        if (!isMasterSearchOpen || masterSearchResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedMasterIndex(prev => (prev + 1) % masterSearchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedMasterIndex(prev => (prev - 1 + masterSearchResults.length) % masterSearchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const med = masterSearchResults[selectedMasterIndex];
            if (med) {
                setNewMapping({...newMapping, master_medicine_id: med.id});
                setMasterSearch(med.name);
                setIsMasterSearchOpen(false);
            }
        } else if (e.key === 'Escape') {
            setIsMasterSearchOpen(false);
        }
    };

    const handleAddMapping = async () => {
        if (!newMapping.supplier_id || !newMapping.supplier_product_name || !newMapping.master_medicine_id || isSaving) {
            alert("Mandatory: Select Supplier, Input Nomenclature and Link Master SKU.");
            return;
        }

        const normalizedName = newMapping.supplier_product_name.trim().toUpperCase();

        // Check if an existing mapping for this supplier + product string exists
        // If it does, we use its ID to perform an update instead of creating a new one
        const existingMap = mappings.find(m => 
            m.supplier_id === newMapping.supplier_id && 
            m.supplier_product_name.toUpperCase() === normalizedName
        );

        const map: SupplierProductMap = {
            id: existingMap ? existingMap.supplier_id : crypto.randomUUID(),
            organization_id: '', 
            supplier_id: newMapping.supplier_id,
            supplier_product_name: normalizedName,
            master_medicine_id: newMapping.master_medicine_id,
            auto_apply: newMapping.auto_apply
        };

        setIsSaving(true);
        try {
            await onSaveMapping(map);
            setIsAddMode(false);
            setNewMapping({ supplier_id: '', supplier_product_name: '', master_medicine_id: '', auto_apply: true });
            setMasterSearch('');
        } catch (e) {
            alert("Failed to synchronize nomenclature mapping.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300 h-full flex flex-col">
            <Card className="p-3 border-app-border shadow-md bg-white flex-shrink-0 !rounded-none">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Supplier Filter</label>
                            <select 
                                value={selectedSupplierId} 
                                onChange={e => setSelectedSupplierId(e.target.value)}
                                className="w-full h-9 border border-gray-400 rounded-none bg-input-bg text-xs font-black focus:bg-yellow-50 outline-none uppercase"
                            >
                                <option value="all">Display All Suppliers</option>
                                {suppliers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Search Nomenclature</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="Search by product name..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 h-9 text-xs border border-gray-400 rounded-none bg-input-bg focus:bg-yellow-50 outline-none font-black uppercase"
                                />
                                <svg className="absolute left-2.5 top-2.5 text-gray-400 w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsAddMode(true)}
                        className="px-8 h-9 text-[10px] font-black text-white bg-primary rounded-none shadow-lg hover:bg-primary-dark transition-all transform active:scale-95 uppercase tracking-widest flex-shrink-0"
                    >
                        + Define Mapping (F2)
                    </button>
                </div>
            </Card>

            {isAddMode && (
                <Card className="p-6 border-2 border-primary/30 bg-primary/5 animate-in slide-in-from-top-4 duration-300 flex-shrink-0 !rounded-none shadow-xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                        <div>
                            <label className="block text-[10px] font-black text-primary uppercase mb-2 ml-1">1. Select Supplier</label>
                            <select 
                                value={newMapping.supplier_id} 
                                onChange={e => setNewMapping({...newMapping, supplier_id: e.target.value})}
                                className="w-full h-11 border-2 border-gray-400 rounded-none bg-white text-sm font-black focus:border-primary outline-none uppercase"
                            >
                                <option value="">— Select Ledger —</option>
                                {suppliers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-primary uppercase mb-2 ml-1">2. Vendor nomenclature</label>
                            <input 
                                type="text" 
                                value={newMapping.supplier_product_name}
                                onChange={e => setNewMapping({...newMapping, supplier_product_name: e.target.value})}
                                placeholder="AS PRINTED ON BILL"
                                className="w-full h-11 border-2 border-gray-400 rounded-none bg-white text-sm font-black focus:border-primary outline-none uppercase shadow-inner"
                            />
                        </div>
                        <div className="relative">
                            <label className="block text-[10px] font-black text-primary uppercase mb-2 ml-1">3. medimart Master SKU</label>
                            <input 
                                ref={masterSearchRef}
                                type="text" 
                                value={masterSearch}
                                onChange={e => {
                                    setMasterSearch(e.target.value);
                                    setIsMasterSearchOpen(true);
                                    setSelectedMasterIndex(0);
                                }}
                                onFocus={() => setIsMasterSearchOpen(true)}
                                onKeyDown={handleMasterKeyDown}
                                placeholder="SEARCH INTERNAL CATALOG..."
                                className="w-full h-11 border-2 border-gray-400 rounded-none bg-white text-sm font-black focus:border-primary outline-none uppercase"
                            />
                            {isMasterSearchOpen && masterSearch.length > 0 && (
                                <ul ref={resultsRef} className="absolute top-full left-0 w-full mt-1 bg-white border-2 border-primary shadow-2xl z-[100] divide-y divide-gray-100 overflow-hidden rounded-none">
                                    {masterSearchResults.map((med, mIdx) => (
                                        <li 
                                            key={med.id} 
                                            onClick={() => {
                                                setNewMapping({...newMapping, master_medicine_id: med.id});
                                                setMasterSearch(med.name);
                                                setIsMasterSearchOpen(false);
                                            }}
                                            onMouseEnter={() => setSelectedMasterIndex(mIdx)}
                                            className={`p-3 cursor-pointer flex justify-between items-center transition-colors ${mIdx === selectedMasterIndex ? 'bg-primary text-white' : 'hover:bg-yellow-50'}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-black text-xs uppercase">{med.name}</span>
                                                <span className={`text-[9px] font-bold uppercase ${mIdx === selectedMasterIndex ? 'text-white/60' : 'text-gray-400'}`}>Code: {med.materialCode}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black">₹{parseFloat(med.mrp || '0').toFixed(2)}</span>
                                            </div>
                                        </li>
                                    ))}
                                    {masterSearchResults.length === 0 && (
                                        <li className="p-4 text-center text-xs text-gray-400 italic">No SKU match found</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-primary/20">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={newMapping.auto_apply}
                                onChange={e => setNewMapping({...newMapping, auto_apply: e.target.checked})}
                                className="w-5 h-5 text-primary rounded-none focus:ring-primary border-2 border-gray-400"
                            />
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-tight group-hover:text-primary transition-colors">Apply Rule Automatically in AI Scanning</span>
                        </label>
                        <div className="flex gap-3">
                            <button onClick={() => { setIsAddMode(false); setMasterSearch(''); }} className="px-6 py-2.5 text-[10px] font-black text-gray-400 hover:text-red-600 transition-colors uppercase tracking-widest">Discard</button>
                            <button 
                                onClick={handleAddMapping} 
                                disabled={isSaving}
                                className="px-10 py-3 text-[11px] font-black text-white bg-primary rounded-none shadow-xl hover:bg-primary-dark transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-2"
                            >
                                {isSaving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                                {isSaving ? 'Synchronizing...' : 'Synchronize Rule'}
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            <Card className="flex-1 border-app-border overflow-hidden bg-white shadow-lg flex flex-col min-h-0 !rounded-none">
                <div className="p-3 border-b border-gray-400 font-bold text-primary bg-[#f1f1f1] flex justify-between items-center flex-shrink-0">
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-70 ml-2">Nomenclature Mapping Matrix</span>
                    <span className="text-[9px] bg-white px-3 py-1 border border-gray-400 font-black text-gray-500 uppercase tracking-tighter shadow-sm">
                        {filteredMappings.length} Active Rules
                    </span>
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="min-w-full border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr className={`${headerTextStyle} border-b border-gray-400 bg-gray-50 h-10`}>
                                <th className="px-6 py-3 text-left border-r border-gray-200">Legal Supplier</th>
                                <th className="px-6 py-3 text-left border-r border-gray-200">Supplier Nomenclature</th>
                                <th className="px-6 py-3 text-center border-r border-gray-200 w-16">Status</th>
                                <th className="px-6 py-3 text-left">Internal Medimart SKU</th>
                                <th className="px-6 py-4 w-24">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredMappings.map(m => {
                                const supplierObj = suppliers.find(d => d.id === m.supplier_id);
                                const med = medicines.find(med => med.id === m.master_medicine_id);
                                return (
                                    <tr key={m.id} className="hover:bg-accent transition-colors group h-14">
                                        <td className="px-6 py-2 border-r border-gray-100">
                                            <span className={`text-gray-900 ${uniformTextStyle}`}>{supplierObj?.name || <span className="text-red-400 italic">Ledger Missing</span>}</span>
                                            {supplierObj?.gst_number && <p className="text-[8px] font-bold text-gray-400 mt-1">GST: {supplierObj.gst_number}</p>}
                                        </td>
                                        <td className="px-6 py-2 border-r border-gray-100 bg-blue-50/10">
                                            <span className={`text-blue-700 ${uniformTextStyle}`}>{m.supplier_product_name}</span>
                                        </td>
                                        <td className="px-6 py-2 border-r border-gray-100 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                                {m.auto_apply && <span className="text-[7px] font-black bg-primary text-white px-1 tracking-tighter">AUTO</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 border-r border-gray-100 bg-emerald-50/10">
                                            <span className={`text-emerald-700 ${uniformTextStyle}`}>{med?.name || <span className="text-red-400 italic">Master Record Missing</span>}</span>
                                            {med?.materialCode && <p className="text-[8px] font-bold text-gray-400 mt-1">Code: {med.materialCode}</p>}
                                        </td>
                                        <td className="px-6 py-2 text-right">
                                            <button 
                                                onClick={(e) => { 
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if(window.confirm("Permanently delete this nomenclature mapping?")) onDeleteMapping(m.id); 
                                                }}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-none border border-transparent hover:border-red-200 transition-all"
                                                title="Delete Rule"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredMappings.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-40 text-center">
                                        <div className="flex flex-col items-center opacity-20">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-6"><path d="m12 2 3.5 3.5"/><path d="M12 22v-6.5"/><path d="M12 2v6.5"/><path d="M4.93 4.93 7.4 7.4"/><path d="m16.6 16.6 2.47 2.47"/><path d="M2 12h6.5"/><path d="M15.5 12H22"/><path d="m4.93 19.07 2.47-2.47"/><path d="m16.6 7.4 2.47-2.47"/></svg>
                                            <p className="font-black uppercase tracking-[0.4em] text-lg">No Mapping Logic Defined</p>
                                            <p className="text-sm mt-3 normal-case max-w-sm font-bold text-gray-500 italic">Link supplier item names to your internal catalog to enable fully automated receipt scanning.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            
            <div className="p-3 bg-[#e5f0f0] tally-border flex justify-between items-center flex-shrink-0">
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Nomenclature Engine v4.3.0 — Enterprise Grade</p>
                <div className="flex items-center gap-4 text-[9px] font-black text-primary uppercase">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-primary"></div>Mapped</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-600"></div>Supplier</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-600"></div>Internal</span>
                </div>
            </div>
        </div>
    );
};

export default SupplierSyncView;
