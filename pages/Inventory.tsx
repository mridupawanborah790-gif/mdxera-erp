
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Card from '../components/Card';
import AddProductModal from '../components/AddProductModal';
import EditProductModal from '../components/EditProductModal';
import ExportInventoryModal from '../components/ExportInventoryModal';
import type { InventoryItem, RegisteredPharmacy, ModuleConfig, AppConfigurations, Medicine } from '../types';
import { fuzzyMatch } from '../utils/search';
import { formatExpiryToMMYY } from '../utils/helpers';
import { configurableModules } from '../constants';
import { getInventoryPolicy } from '../utils/materialType';
import { resolveUnitsPerStrip } from '../utils/pack';
import { shouldHandleScreenShortcut } from '../utils/screenShortcuts';

// Standardized typography matching POS screen "Product Selection Matrix"
const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";
const ITEMS_PER_PAGE = 10;

// Icons
const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ColumnsIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>;
const ExportIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

interface InventoryProps {
    inventory: InventoryItem[];
    medicines: Medicine[];
    currentUser: RegisteredPharmacy | null;
    onCreatePurchaseOrder: (selectedIds: string[]) => void;
    initialFilters?: { lowStockOnly?: boolean } | null;
    onFiltersChange?: () => void;
    config: ModuleConfig;
    onUpdateConfig: (newConfig: ModuleConfig) => void;
    onBulkAddInventory: (items: Omit<InventoryItem, 'id'>[]) => void;
    onAddProduct: (item: Omit<InventoryItem, 'id'>) => void;
    onAddProductLocal?: (item: Omit<InventoryItem, 'id'>) => void;
    onUpdateProduct: (item: InventoryItem) => void;
}

const Inventory: React.FC<InventoryProps> = ({
    inventory,
    medicines,
    currentUser,
    onCreatePurchaseOrder,
    initialFilters,
    onFiltersChange,
    config,
    onUpdateConfig,
    onBulkAddInventory,
    onAddProduct,
    onUpdateProduct
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null);
    const [lowStockFilter, setLowStockFilter] = useState(false);
    const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const columnSelectorRef = useRef<HTMLDivElement>(null);
    const tableBodyRef = useRef<HTMLTableSectionElement>(null);

    const inventoryModuleFields = useMemo(() => 
        configurableModules.find(m => m.id === 'inventory')?.fields || [], 
    []);

    const filteredItems = useMemo(() => {
        let items = Array.isArray(inventory) ? [...inventory] : [];
        items = items.filter(i => getInventoryPolicy(i, medicines).inventorised);
        
        if (lowStockFilter) {
            items = items.filter(i => i.stock <= i.minStockLimit);
        }

        if (searchTerm) {
            items = items.filter(item => 
                fuzzyMatch(item.name, searchTerm) || 
                fuzzyMatch(item.brand, searchTerm) || 
                fuzzyMatch(item.batch, searchTerm) ||
                fuzzyMatch(item.composition, searchTerm) ||
                fuzzyMatch(item.supplierName, searchTerm) ||
                fuzzyMatch(item.barcode, searchTerm)
            );
        }
        
        return items.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [inventory, searchTerm, lowStockFilter, medicines]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    
    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    useEffect(() => {
        if (initialFilters?.lowStockOnly) {
            setLowStockFilter(true);
            setCurrentPage(1);
            if (onFiltersChange) onFiltersChange();
        }
    }, [initialFilters, onFiltersChange]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target as Node)) {
                setIsColumnSelectorOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll selected row into view
    useEffect(() => {
        if (tableBodyRef.current) {
            const selectedRow = tableBodyRef.current.querySelector(`[data-row-index="${selectedIndex}"]`);
            if (selectedRow) {
                selectedRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedIndex]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleScreenShortcut(e, 'inventory')) return;
            if (e.key === 'F7') {
                e.preventDefault();
                setIsColumnSelectorOpen(prev => !prev);
                return;
            }

            const isModalOpen = !!itemToEdit || isAddModalOpen || isExportModalOpen;
            if (isModalOpen || isColumnSelectorOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, paginatedItems.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
                e.preventDefault();
                setCurrentPage(p => p + 1);
                setSelectedIndex(0);
            } else if (e.key === 'ArrowLeft' && currentPage > 1) {
                e.preventDefault();
                setCurrentPage(p => p - 1);
                setSelectedIndex(0);
            } else if (e.key === 'F2') {
                e.preventDefault();
                setIsAddModalOpen(true);
            } else if (e.key === 'F3') {
                e.preventDefault();
                setIsExportModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [paginatedItems, selectedIndex, itemToEdit, isAddModalOpen, isExportModalOpen, isColumnSelectorOpen, currentPage, totalPages]);

    const isFieldVisible = (fieldId: string) => config?.fields?.[fieldId] !== false;

    const toggleField = (fieldId: string) => {
        const currentFields = config.fields || {};
        const newFields = {
            ...currentFields,
            [fieldId]: !isFieldVisible(fieldId)
        };
        onUpdateConfig({ ...config, fields: newFields });
    };

    const totalValuation = useMemo(() => 
        (inventory || []).reduce((sum, i) => sum + (i.stock * (i.cost || (i.purchasePrice / (i.unitsPerPack || 1)) || 0)), 0), 
    [inventory]);

    const handleNextProduct = () => {
        const nextIdxInPage = (selectedIndex + 1);
        if (nextIdxInPage < paginatedItems.length) {
            setSelectedIndex(nextIdxInPage);
            setItemToEdit(paginatedItems[nextIdxInPage]);
        } else if (currentPage < totalPages) {
            setCurrentPage(p => p + 1);
            setSelectedIndex(0);
            setItemToEdit(filteredItems[currentPage * ITEMS_PER_PAGE]);
        }
    };

    const handlePreviousProduct = () => {
        const prevIdxInPage = (selectedIndex - 1);
        if (prevIdxInPage >= 0) {
            setSelectedIndex(prevIdxInPage);
            setItemToEdit(paginatedItems[prevIdxInPage]);
        } else if (currentPage > 1) {
            setCurrentPage(p => p - 1);
            setSelectedIndex(ITEMS_PER_PAGE - 1);
            setItemToEdit(filteredItems[(currentPage - 2) * ITEMS_PER_PAGE + (ITEMS_PER_PAGE - 1)]);
        }
    };

    return (
        <main className="flex-1 page-fade-in bg-app-bg flex flex-col overflow-hidden">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Stock Summary (Inventory Master)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Items: {filteredItems.length}</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <Card className="flex flex-col flex-1 overflow-hidden p-0 tally-border shadow-md bg-white">
                    <div className="p-4 border-b border-gray-400 flex items-center bg-gray-50 gap-4 flex-shrink-0">
                        <div className="relative flex-1 max-w-sm">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Filter by Name, Brand, Batch..." 
                                value={searchTerm} 
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setSelectedIndex(0);
                                    setCurrentPage(1);
                                }} 
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-400 rounded-none bg-white text-base font-normal outline-none focus:bg-yellow-50"
                            />
                        </div>
                        <div className="flex items-center gap-4 ml-auto">
                            <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 border border-gray-400">
                                <input 
                                    type="checkbox" 
                                    checked={lowStockFilter} 
                                    onChange={e => {
                                        setLowStockFilter(e.target.checked);
                                        setSelectedIndex(0);
                                        setCurrentPage(1);
                                    }}
                                    className="w-4 h-4 text-primary"
                                />
                                <span className="text-xs font-bold uppercase text-gray-600">Low Stock</span>
                            </label>
                            
                            <div className="relative" ref={columnSelectorRef}>
                                <button 
                                    onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                                    className={`px-6 py-2 border border-gray-400 transition-all flex items-center gap-2 text-sm font-bold uppercase ${isColumnSelectorOpen ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                >
                                    <ColumnsIcon className={isColumnSelectorOpen ? 'text-white' : 'text-primary'} />
                                    F7: Columns
                                </button>
                                
                                {isColumnSelectorOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-64 bg-[#fdfdf5] border-2 border-primary shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-150">
                                        <div className="bg-primary p-2 text-white text-[10px] font-black uppercase tracking-widest text-center">Configure Display</div>
                                        <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                            {inventoryModuleFields.map(field => (
                                                <button
                                                    key={field.id}
                                                    onClick={() => toggleField(field.id)}
                                                    className="w-full flex items-center gap-3 p-2.5 hover:bg-yellow-50 transition-colors group"
                                                >
                                                    <div className={`w-4 h-4 border-2 flex items-center justify-center transition-colors ${isFieldVisible(field.id) ? 'bg-primary border-primary' : 'bg-white border-gray-400'}`}>
                                                        {isFieldVisible(field.id) && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold uppercase tracking-tight ${isFieldVisible(field.id) ? 'text-gray-900' : 'text-gray-400'}`}>{field.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="p-2 bg-gray-100 border-t border-gray-300 text-center">
                                            <button onClick={() => setIsColumnSelectorOpen(false)} className="text-[10px] font-black uppercase text-primary hover:underline">Close Selector</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={() => setIsExportModalOpen(true)}
                                className="px-6 py-2 border border-gray-400 bg-white text-primary font-black uppercase text-sm tracking-widest flex items-center gap-2 hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                            >
                                <ExportIcon />
                                Export (F3)
                            </button>

                            <button onClick={() => setIsAddModalOpen(true)} className="px-6 py-2 tally-button-accent text-sm font-black uppercase tracking-widest">F2: ADD INVENTORY</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-white">
                        <table className="min-w-full border-collapse whitespace-nowrap">
                            <thead className="bg-[#e1e1e1] sticky top-0 z-10">
                                <tr className={`${uniformTextStyle} text-gray-700 border-b border-gray-400`}>
                                    <th className="py-1.5 px-2 border-r border-gray-400 w-10 text-center">#</th>
                                    {isFieldVisible('colName') && <th className="py-1.5 px-2 border-r border-gray-400 text-left min-w-[360px]">Item Name</th>}
                                    {isFieldVisible('colCategory') && <th className="py-1.5 px-2 border-r border-gray-400 text-left w-20">Category</th>}
                                    {isFieldVisible('colManufacturer') && <th className="py-1.5 px-2 border-r border-gray-400 text-left w-28">Manufacturer</th>}
                                    {isFieldVisible('colHsn') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-12">HSN</th>}
                                    {isFieldVisible('colBarcode') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-24">Barcode</th>}
                                    {isFieldVisible('colBatch') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-20">Batch</th>}
                                    {isFieldVisible('colStrips') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-12">Strips</th>}
                                    {isFieldVisible('colLoose') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-12">Loose</th>}
                                    {isFieldVisible('colStock') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-20">Total Stock</th>}
                                    {isFieldVisible('colBaseUnit') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-16">B.Unit</th>}
                                    {isFieldVisible('colPtr') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">PTR</th>}
                                    {isFieldVisible('colMrp') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">MRP</th>}
                                    {isFieldVisible('colRateA') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">Rate A</th>}
                                    {isFieldVisible('colRateB') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">Rate B</th>}
                                    {isFieldVisible('colRateC') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">Rate C</th>}
                                    {isFieldVisible('colValue') && <th className="py-1.5 px-2 border-r border-gray-400 text-right w-24">Value</th>}
                                    {isFieldVisible('colExpiry') && <th className="py-1.5 px-2 border-r border-gray-400 text-center w-16">Expiry</th>}
                                    <th className="py-1.5 px-2 text-right w-16">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200" ref={tableBodyRef}>
                                {paginatedItems.map((item, idx) => {
                                    const uPP = resolveUnitsPerStrip(item.unitsPerPack, item.packType);
                                    const strips = Math.floor(item.stock / uPP);
                                    const loose = item.stock % uPP;
                                    const isLow = item.stock <= item.minStockLimit;
                                    const isSelected = idx === selectedIndex;

                                    return (
                                        <tr 
                                            key={item.id} 
                                            data-row-index={idx}
                                            className={`transition-all group cursor-pointer border-b border-gray-100 ${
                                                isSelected 
                                                ? 'bg-accent/60 shadow-inner ring-1 ring-primary/20' 
                                                : isLow 
                                                ? 'bg-red-50/20' 
                                                : 'hover:bg-accent/30'
                                            }`} 
                                            onClick={() => {
                                                setSelectedIndex(idx);
                                            }}
                                        >
                                            <td className={`py-1.5 px-2 border-r border-gray-200 text-center text-gray-400 ${uniformTextStyle}`}>{((currentPage - 1) * ITEMS_PER_PAGE) + idx + 1}</td>
                                            
                                            {isFieldVisible('colName') && (
                                                <td className="py-1 px-2 border-r border-gray-200">
                                                    <div className={`text-gray-900 leading-tight ${uniformTextStyle}`}>{item.name}</div>
                                                </td>
                                            )}

                                            {isFieldVisible('colCategory') && <td className={`py-1 px-2 border-r border-gray-200 text-gray-600 ${uniformTextStyle}`}>{item.category}</td>}
                                            {isFieldVisible('colManufacturer') && <td className={`py-1 px-2 border-r border-gray-200 text-gray-600 ${uniformTextStyle}`}>{item.manufacturer}</td>}
                                            {isFieldVisible('colHsn') && <td className={`py-1 px-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>{item.hsnCode}</td>}
                                            {isFieldVisible('colBarcode') && <td className={`py-1 px-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>{item.barcode}</td>}
                                            {isFieldVisible('colBatch') && <td className={`py-1 px-2 border-r border-gray-200 text-center font-mono ${uniformTextStyle} ${isSelected ? 'text-black' : 'text-primary'}`}>{item.batch}</td>}
                                            {isFieldVisible('colStrips') && <td className={`py-1 px-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>{strips}</td>}
                                            {isFieldVisible('colLoose') && <td className={`py-1 px-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>{loose}</td>}
                                            {isFieldVisible('colStock') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle} ${isLow ? 'text-red-700 font-bold' : 'text-emerald-700'}`}>{item.stock}</td>}
                                            {isFieldVisible('colBaseUnit') && <td className={`py-1 px-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>{item.baseUnit}</td>}
                                            {isFieldVisible('colPtr') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.ptr || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colMrp') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.mrp || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colRateA') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.rateA || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colRateB') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.rateB || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colRateC') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.rateC || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colValue') && <td className={`py-1 px-2 border-r border-gray-200 text-right ${uniformTextStyle}`}>₹{(item.value || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colExpiry') && (
                                                <td className={`py-1 px-2 border-r border-gray-200 text-center ${uniformTextStyle}`}>
                                                    {formatExpiryToMMYY(item.expiry)}
                                                </td>
                                            )}
                                            
                                            <td className="py-1 px-2 text-right">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setItemToEdit(item);
                                                    }}
                                                    className="text-primary font-black uppercase text-[10px] px-2 py-0.5 bg-primary/5 border border-primary/20 hover:bg-primary hover:text-white transition-all"
                                                >
                                                    Alter
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={25} className="p-20 text-center text-gray-300 font-black uppercase tracking-[0.4em] italic text-sm">
                                            No matching items found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {totalPages > 1 && (
                        <div className="p-2 bg-gray-100 border-t border-gray-400 flex justify-between items-center flex-shrink-0">
                            <div className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-2">
                                Showing {paginatedItems.length} of {filteredItems.length} items
                            </div>
                            <div className="flex items-center gap-1">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); setSelectedIndex(0); }}
                                    className="px-4 py-1 border border-gray-400 bg-white text-[10px] font-black uppercase disabled:opacity-30 hover:bg-gray-50 transition-colors"
                                >
                                    Prev
                                </button>
                                <div className="px-4 py-1 border border-gray-400 bg-primary text-white text-[10px] font-black uppercase">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <button 
                                    disabled={currentPage === totalPages}
                                    onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); setSelectedIndex(0); }}
                                    className="px-4 py-1 border border-gray-400 bg-white text-[10px] font-black uppercase disabled:opacity-30 hover:bg-gray-50 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase mr-2 italic">
                                Use ← → keys to flip pages
                            </div>
                        </div>
                    )}
                </Card>

                <div className="bg-[#e5f0f0] p-4 tally-border flex justify-between items-center text-base font-normal uppercase flex-shrink-0">
                    <div className="flex gap-12">
                        <span>Total Stock Valuation: <span className="text-blue-900">₹{totalValuation.toLocaleString()}</span></span>
                        <span>Low Stock Alert: <span className="text-red-600">{filteredItems.filter(i => i.stock <= i.minStockLimit).length}</span></span>
                    </div>
                    <div className="flex items-center gap-6">
                        <span className="opacity-40">Navigate with ↑ ↓ and Click Alter to modify</span>
                        <span className="opacity-40">ERP Engine v1.0.8</span>
                    </div>
                </div>
            </div>

            {isAddModalOpen && <AddProductModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddProduct={onAddProduct} organizationId={currentUser?.organization_id || ''} medicines={medicines} />}
            {itemToEdit && (
                <EditProductModal 
                    isOpen={!!itemToEdit} 
                    onClose={() => setItemToEdit(null)} 
                    onSave={onUpdateProduct} 
                    productToEdit={itemToEdit} 
                    onPrintBarcodeClick={() => {}} 
                    onNext={handleNextProduct}
                    onPrevious={handlePreviousProduct}
                    hasNext={selectedIndex < paginatedItems.length - 1 || currentPage < totalPages}
                    hasPrevious={selectedIndex > 0 || currentPage > 1}
                />
            )}
            {isExportModalOpen && (
                <ExportInventoryModal 
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    data={filteredItems}
                    pharmacyName={currentUser?.pharmacy_name || 'MDXERA ERP'}
                />
            )}
        </main>
    );
};

export default Inventory;
