import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
/* Fix: Corrected import paths from ../ to ./ for root level duplicate file */
import Card from './components/Card';
import AddToStockModal from './components/AddToStockModal';
import EditMedicineModal from './components/EditMedicineModal';
import AddMedicineModal from './components/AddMedicineModal';
import Modal from './components/Modal';
import DistributorSyncView from './components/DistributorSyncView';
import type { Medicine, RegisteredPharmacy, Distributor, Purchase, DistributorProductMap } from './types';
import { fuzzyMatch } from './utils/search';

type MedicineSortableKeys = keyof Medicine;

const MedicineSortableHeader: React.FC<{
  label: string; sortKey: MedicineSortableKeys; sortConfig: { key: MedicineSortableKeys; direction: 'ascending' | 'descending' }; requestSort: (key: MedicineSortableKeys) => void;
}> = ({ label, sortKey, sortConfig, requestSort }) => {
  const isSorted = sortConfig?.key === sortKey;
  const directionIcon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '';
  return (
    <th 
      scope="col" 
      className="p-3 border-r border-gray-400 text-left cursor-pointer hover:bg-gray-200 transition-colors" 
      onClick={() => requestSort(sortKey)}
    >
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-black text-primary">{directionIcon}</span>
      </div>
    </th>
  );
};

interface MaterialMasterProps {
    medicines: Medicine[];
    onAddMedicine: (med: Omit<Medicine, 'id'>) => Promise<Medicine>;
    onUpdateMedicine: (updated: Medicine) => void;
    currentUser: RegisteredPharmacy | null;
    distributors: Distributor[];
    onAddPurchase: (purchase: Omit<Purchase, 'id' | 'purchaseSerialId'>, supplierGstNumber?: string) => Promise<void>;
    onBulkAddMedicines: (medicines: Omit<Medicine, 'id'>[]) => void;
    onSearchMedicines: (searchTerm: string) => void;
    onMassUpdateClick: (selectedIds: string[]) => void;
    onSaveMapping: (map: DistributorProductMap) => Promise<void>;
    onDeleteMapping: (id: string) => Promise<void>;
    mappings: DistributorProductMap[];
    initialSubModule?: SubModule;
}

type SubModule = 'master' | 'sync' | 'bulk';

const MaterialMaster: React.FC<MaterialMasterProps> = ({ 
    medicines, onAddMedicine, onUpdateMedicine, currentUser, 
    distributors, onAddPurchase, onBulkAddMedicines, onSearchMedicines, 
    onMassUpdateClick, onSaveMapping, onDeleteMapping, mappings,
    initialSubModule = 'master'
}) => {
    const [activeSubModule, setActiveSubModule] = useState<SubModule>(initialSubModule);
    const [medSearchTerm, setMedSearchTerm] = useState('');
    const [medSortConfig, setMedSortConfig] = useState<{ key: MedicineSortableKeys; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });

    // Modal States
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [medicineToEdit, setMedicineToEdit] = useState<Medicine | null>(null);

    useEffect(() => {
        setActiveSubModule(initialSubModule);
    }, [initialSubModule]);

    const handleOpenEditModal = (med: Medicine) => {
        setMedicineToEdit(med);
        setIsEditModalOpen(true);
    };

    const handleAddMedicineSuccess = async (medData: Omit<Medicine, 'id'>) => {
        await onAddMedicine(medData);
        setIsAddModalOpen(false);
    };

    const filteredAndSortedMedicines = useMemo(() => {
        let filtered = [...medicines];
        if (medSearchTerm) {
            filtered = filtered.filter(m => fuzzyMatch(m.name, medSearchTerm) || fuzzyMatch(m.composition, medSearchTerm) || fuzzyMatch(m.brand, medSearchTerm));
        }
        filtered.sort((a: any, b: any) => {
            let aVal = a[medSortConfig.key] ?? '';
            let bVal = b[medSortConfig.key] ?? '';

            if (aVal < bVal) return medSortConfig.direction === 'ascending' ? -1 : 1;
            if (aVal > bVal) return medSortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
        return filtered;
    }, [medSortConfig, medicines, medSearchTerm]);

    const moduleTitles: Record<SubModule, string> = {
        master: 'Material Master Data',
        sync: 'Vendor Nomenclature',
        bulk: 'Bulk Utility'
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">{moduleTitles[activeSubModule]}</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Items: {medicines.length}</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                         <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">{moduleTitles[activeSubModule]}</h2>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {activeSubModule === 'master' ? 'Central SKU catalog management' : 
                             activeSubModule === 'sync' ? 'Supplier name mappings' : 
                             'Data migration tools'}
                         </p>
                    </div>
                    {activeSubModule === 'master' && (
                        <div className="flex gap-2">
                            <button onClick={() => setIsAddModalOpen(true)} className="px-10 py-2.5 tally-button-primary text-xs shadow-lg flex items-center gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Create Material (F2)
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeSubModule === 'master' && (
                        <Card className="h-full flex flex-col p-0 tally-border !rounded-none overflow-hidden bg-white shadow-inner">
                            <div className="p-4 border-b border-gray-400 bg-gray-50 flex-shrink-0 flex gap-4 items-center">
                                <div className="relative flex-1 max-w-lg">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                    <input type="text" placeholder="Search by SKU Name, Brand, Composition..." value={medSearchTerm} onChange={e => setMedSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-400 text-sm font-bold focus:bg-yellow-50 outline-none shadow-sm" />
                                </div>
                                <div className="ml-auto text-xs font-black uppercase text-gray-400 bg-white px-4 py-1.5 border border-gray-200">
                                    Displaying {filteredAndSortedMedicines.length} results
                                </div>
                            </div>
                            <div className="overflow-auto flex-1">
                                <table className="min-w-full border-collapse">
                                    <thead className="bg-[#e1e1e1] sticky top-0 z-10 border-b border-gray-400">
                                        <tr className="text-xs font-black uppercase text-gray-700">
                                            <th className="p-3 border-r border-gray-400 w-12 text-center">#</th>
                                            <MedicineSortableHeader label="Item Description" sortKey="name" sortConfig={medSortConfig} requestSort={(k) => setMedSortConfig({key: k, direction: medSortConfig.direction === 'ascending' ? 'descending' : 'ascending'})} />
                                            <th className="p-3 border-r border-gray-400 text-left">Brand / Marketer</th>
                                            <th className="p-3 border-r border-gray-400 text-center w-24">Pack</th>
                                            <th className="p-3 border-r border-gray-400 text-center w-28">HSN</th>
                                            <th className="p-3 border-r border-gray-400 text-center w-20">GST%</th>
                                            <th className="p-3 border-r border-gray-400 text-center w-12">Rx</th>
                                            <th className="p-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 text-base font-bold tally-font-data-mono">
                                        {filteredAndSortedMedicines.map((med, idx) => (
                                            <tr key={med.id} className="hover:bg-accent transition-colors cursor-pointer group" onClick={() => handleOpenEditModal(med)}>
                                                <td className="p-3 border-r border-gray-200 text-center text-gray-400">{idx + 1}</td>
                                                <td className="p-3 border-r border-gray-200 font-black text-gray-900 uppercase group-hover:text-black">
                                                    <div className="flex flex-col">
                                                        <span className="text-base tracking-tighter leading-none">{med.name}</span>
                                                        <span className="text-[11px] text-gray-400 normal-case italic font-bold mt-1 line-clamp-1">{med.composition}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 border-r border-gray-200">
                                                    <div className="flex flex-col">
                                                        <span className="uppercase text-xs font-black text-gray-600 group-hover:text-black">{med.brand}</span>
                                                        {med.marketer && <span className="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[150px] mt-0.5">Mkt: {med.marketer}</span>}
                                                    </div>
                                                </td>
                                                <td className="p-3 border-r border-gray-200 text-center uppercase font-black text-sm">{med.pack || '—'}</td>
                                                <td className="p-3 border-r border-gray-200 text-center font-mono text-sm text-gray-600">{med.hsnCode || '—'}</td>
                                                <td className="p-3 border-r border-gray-200 text-center font-black text-gray-600">{med.gstRate}%</td>
                                                <td className="p-3 border-r border-gray-200 text-center">
                                                    {med.isPrescriptionRequired && <span className="text-red-600 font-black text-xs px-2 py-0.5 bg-red-50 border border-red-100 rounded">H</span>}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button className="text-primary font-black uppercase text-[10px] px-3 py-1 bg-primary/5 border border-primary/20 hover:bg-primary hover:text-white transition-all">Alter</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {activeSubModule === 'sync' && (
                        <div className="h-full overflow-y-auto custom-scrollbar">
                            <DistributorSyncView 
                                distributors={distributors}
                                medicines={medicines}
                                mappings={mappings}
                                onSaveMapping={onSaveMapping}
                                onDeleteMapping={onDeleteMapping}
                            />
                        </div>
                    )}

                    {activeSubModule === 'bulk' && (
                        <Card className="p-16 tally-border bg-white text-center flex flex-col items-center justify-center h-full">
                             <div className="p-8 bg-primary/5 rounded-full mb-8">
                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary opacity-50"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                             </div>
                             <p className="font-black uppercase tracking-[0.4em] text-gray-900 text-2xl">Central Data Migration</p>
                             <p className="text-base mt-4 text-gray-500 max-w-md">Use the global configuration control room to import or export massive amounts of catalog data from standard formats.</p>
                             <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-config', { detail: 'dataManagement' }))} className="mt-10 px-12 py-4 tally-button-primary text-xs shadow-2xl tracking-[0.2em]">Open Data Management</button>
                        </Card>
                    )}
                </div>
            </div>

            {isAddModalOpen && (
                <AddMedicineModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onAddMedicine={handleAddMedicineSuccess}
                    organizationId={currentUser?.organization_id || ''}
                />
            )}

            {medicineToEdit && (
                <EditMedicineModal 
                    isOpen={isEditModalOpen}
                    onClose={() => { setIsEditModalOpen(false); setMedicineToEdit(null); }}
                    medicine={medicineToEdit}
                    onSave={onUpdateMedicine}
                />
            )}
        </main>
    );
};

export default MaterialMaster;