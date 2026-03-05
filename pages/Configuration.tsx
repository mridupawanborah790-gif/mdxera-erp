import React, { useState, useEffect, useRef, useMemo } from 'react';
import Card from '../components/Card';
import type { AppConfigurations, ModuleConfig, InvoiceNumberConfig, DiscountRule, SlabRule, InventoryItem, Transaction, Purchase, RegisteredPharmacy, Medicine, Distributor, SupplierProductMap, Customer } from '../types';
import { configurableModules, MASTER_SHORTCUT_OPTIONS } from '../constants';
import { 
    downloadMasterTemplate, downloadInventoryTemplate, downloadSupplierTemplate, 
    downloadCustomerTemplate, downloadNomenclatureTemplate, downloadSalesImportTemplate, 
    downloadPurchaseImportTemplate, parseInventoryCsv, parseDistributorCsv, 
    parseCustomerCsv, parsePurchaseCsv, parseSalesCsv, parseMedicineMasterCsv, parseNomenclatureCsv 
} from '../utils/csv';
import ImportPreviewModal from '../components/ImportPreviewModal';
import DistributorImportPreviewModal from '../components/DistributorImportPreviewModal';
import CustomerImportPreviewModal from '../components/CustomerImportPreviewModal';
import PurchaseBillImportPreviewModal from '../components/PurchaseBillImportPreviewModal';
import SalesBillImportPreviewModal from '../components/SalesBillImportPreviewModal';
import Modal from '../components/Modal';
import MasterDataMigrationWizard from '../components/MasterDataMigrationWizard';
import { fuzzyMatch } from '../utils/search';
import { getFinancialYearLabel } from '../utils/invoice';
import { supabase } from '../services/supabaseClient';

type DemoBusinessType = 'RETAIL' | 'DISTRIBUTOR';
type DuplicateHandlingMode = 'SKIP' | 'UPDATE';

type PharmacyDemoMaterial = {
    id: string;
    industry: 'PHARMACY';
    is_demo: boolean;
    business_type: DemoBusinessType;
    material_name: string;
    item_code: string;
    sku: string;
    barcode?: string;
    pack?: string;
    uom?: string;
    hsn?: string;
    gst_rate?: number;
    category?: string;
    manufacturer?: string;
    brand?: string;
    mrp?: number;
    purchase_rate?: number;
    sale_rate?: number;
    duplicate_exists?: boolean;
};

type DemoMigrationAction = 'inserted' | 'skipped' | 'updated';

type DemoMigrationJob = {
    job_id: string;
    organization_id: string;
    user_id?: string;
    source_table: 'material_master_all(migration)';
    target_table: 'material_master';
    business_type: DemoBusinessType;
    duplicate_mode: DuplicateHandlingMode;
    timestamp: string;
    records_found: number;
    records_processed: number;
    imported_count: number;
    skipped_count: number;
    updated_count: number;
    status: 'COMPLETED' | 'FAILED';
    error_message?: string;
    row_mappings: Array<{ source_row_id: string; target_material_id?: string; action: DemoMigrationAction }>;
};


const Toggle: React.FC<{ label: string; enabled: boolean; setEnabled: (enabled: boolean) => void; description?: string }> = ({ label, enabled, setEnabled, description }) => (
    <div className="py-3 border-b border-gray-100 last:border-0 flex items-center justify-between group">
        <div className="flex flex-col">
             <span className="text-sm font-black text-gray-700 uppercase tracking-tight group-hover:text-primary transition-colors">{label}</span>
             {description && <p className="text-[10px] text-gray-400 mt-0.5 leading-none font-bold uppercase">{description}</p>}
        </div>
        <button 
            type="button" 
            onClick={() => setEnabled(!enabled)} 
            className={`${enabled ? 'bg-primary shadow-[0_0_10px_rgba(0,66,66,0.2)]' : 'bg-gray-300 dark:bg-gray-600'} relative inline-flex items-center h-6 rounded-none w-12 transition-all focus:outline-none ring-2 ring-transparent focus:ring-primary/20`}
        >
            <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white transition-transform shadow-sm`}/>
        </button>
    </div>
);

const getVoucherSchemeDefaults = (): InvoiceNumberConfig => ({
    fy: getFinancialYearLabel(),
    prefix: 'INV',
    startingNumber: 1,
    endNumber: undefined,
    paddingLength: 6,
    resetRule: 'financial-year',
    useFiscalYear: true,
    currentNumber: 1,
    activeMode: 'external'
});

const buildNumberPreview = (cfg: Partial<InvoiceNumberConfig>, number: number) => {
    const prefix = cfg.prefix || '';
    const fy = cfg.fy || getFinancialYearLabel();
    const padded = String(number).padStart(Math.max(1, Number(cfg.paddingLength) || 1), '0');
    return `${prefix}${padded}${cfg.useFiscalYear ? `-${fy}` : ''}`;
};

function renderVoucherSeriesInput(label: string, key: keyof AppConfigurations, configs: AppConfigurations, onChange: (section: keyof AppConfigurations, field: string, value: any) => void) {
    const merged = { ...getVoucherSchemeDefaults(), ...(configs[key] as InvoiceNumberConfig || {}) };
    const currentUsedNumber = Math.max(Number(merged.currentNumber || merged.startingNumber || 1), Number(merged.startingNumber || 1));
    const nextNumber = currentUsedNumber + 1;
    const remainingCount = merged.endNumber ? Math.max(0, Number(merged.endNumber) - currentUsedNumber) : null;

    return (
        <div className="p-4 border border-gray-200 bg-gray-50 mb-4">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-3">{label}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="text-[9px] font-black text-gray-400 uppercase">FY</label><input type="text" value={merged.fy || ''} onChange={e => onChange(key, 'fy', e.target.value)} className="w-full tally-input uppercase" placeholder="2025-26"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Prefix</label><input type="text" value={merged.prefix} onChange={e => onChange(key, 'prefix', e.target.value)} className="w-full tally-input uppercase"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Start No</label><input type="number" min={1} value={merged.startingNumber} onChange={e => onChange(key, 'startingNumber', parseInt(e.target.value || '1', 10))} className="w-full tally-input"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">End No (Optional)</label><input type="number" min={1} value={merged.endNumber ?? ''} onChange={e => onChange(key, 'endNumber', e.target.value ? parseInt(e.target.value, 10) : undefined)} className="w-full tally-input"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Padding</label><input type="number" min={1} value={merged.paddingLength} onChange={e => onChange(key, 'paddingLength', parseInt(e.target.value || '1', 10))} className="w-full tally-input"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Reset Rule</label><input type="text" value="FY-wise" disabled className="w-full tally-input bg-gray-100"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Current Running No</label><input type="number" min={1} value={merged.currentNumber} onChange={e => onChange(key, 'currentNumber', parseInt(e.target.value || '1', 10))} className="w-full tally-input"/></div>
                <div className="pt-4"><Toggle label="Use FY in Number" enabled={merged.useFiscalYear} setEnabled={v => onChange(key, 'useFiscalYear', v)} /></div>
            </div>
            <div className="mt-4 p-3 border border-dashed border-gray-300 bg-white text-[10px] uppercase font-black tracking-wide grid grid-cols-1 md:grid-cols-4 gap-2">
                <div><span className="text-gray-500">Current Used:</span> {buildNumberPreview(merged, currentUsedNumber)}</div>
                <div><span className="text-gray-500">Next Number:</span> {buildNumberPreview(merged, nextNumber)}</div>
                <div><span className="text-gray-500">Preview:</span> {buildNumberPreview(merged, nextNumber)}</div>
                <div><span className="text-gray-500">Remaining:</span> {remainingCount === null ? 'Unlimited' : remainingCount}</div>
            </div>
        </div>
    );
}

const MedicineMasterImportPreviewModal = ({ isOpen, onClose, onSave, data }: any) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Material Master Preview" widthClass="max-w-5xl">
        <div className="p-4 overflow-auto max-h-[70vh]">
            <table className="min-w-full text-xs">
                <thead className="bg-gray-100 font-black uppercase"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Brand</th><th className="p-2 text-center">GST%</th><th className="p-2 text-right">MRP</th></tr></thead>
                <tbody className="divide-y">
                    {data.map((m: any, i: number) => (<tr key={i}><td className="p-2 font-bold uppercase">{m.name}</td><td className="p-2">{m.brand}</td><td className="p-2 text-center">{m.gstRate}%</td><td className="p-2 text-right">₹{m.mrp}</td></tr>))}
                </tbody>
            </table>
        </div>
        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50"><button onClick={onClose} className="px-4 py-2 border">Cancel</button><button onClick={() => onSave(data)} className="px-6 py-2 bg-primary text-white font-black uppercase text-xs">Import {data.length} Materials</button></div>
    </Modal>
);

const MappingImportPreviewModal = ({ isOpen, onClose, onSave, data, distributors, medicines, mappings }: any) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Nomenclature Rule Preview" widthClass="max-w-4xl">
        <div className="p-4 overflow-auto max-h-[70vh]">
            <table className="min-w-full text-xs">
                <thead className="bg-gray-100 font-black uppercase"><tr><th className="p-2 text-left">Supplier</th><th className="p-2 text-left">Their Nomenclature</th><th className="p-2 text-left">Your SKU</th></tr></thead>
                <tbody className="divide-y">
                    {data.map((m: any, i: number) => (
                        <tr key={i}>
                            <td className="p-2 font-bold">{m.supplier_id}</td>
                            <td className="p-2 font-mono text-blue-600">{m.supplier_product_name}</td>
                            <td className="p-2 text-emerald-700">{m.master_medicine_id}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
            <button onClick={onClose} className="px-4 py-2 border">Cancel</button>
            <button onClick={() => {
                const resolved = data.map((d: any) => {
                    const dist = distributors.find((s: any) => fuzzyMatch(s.name, d.supplier_id));
                    const med = medicines.find((m: any) => fuzzyMatch(m.name, d.master_medicine_id));
                    
                    if (!dist || !med) return null;

                    const existing = (mappings || []).find((em: any) => 
                        em.supplier_id === dist.id && 
                        em.supplier_product_name.toLowerCase().trim() === d.supplier_product_name.toLowerCase().trim()
                    );

                    return { 
                        ...d, 
                        supplier_id: dist.id, 
                        master_medicine_id: med.id,
                        id: existing ? existing.id : crypto.randomUUID() 
                    } as SupplierProductMap;
                }).filter(Boolean);
                onSave(resolved);
            }} className="px-6 py-2 bg-primary text-white font-black uppercase text-xs">Import Rules</button>
        </div>
    </Modal>
);

type ConfigSection = 'general' | 'posConfig' | 'purchaseConfig' | 'invoiceNumbering' | 'dashboardShortcuts' | 'dashboardModuleConfig' | 'displayOptions' | 'discountMaster' | 'moduleVisibility' | 'dataManagement';

interface ConfigurationPageProps {
    configurations: AppConfigurations;
    onUpdateConfigurations: (configs: AppConfigurations) => Promise<void>;
    addNotification: (message: string, type: 'success' | 'error' | 'warning') => void;
    currentUser: RegisteredPharmacy | null;
    inventory: InventoryItem[];
    transactions: Transaction[];
    purchases: Purchase[];
    distributors: Distributor[];
    customers: Customer[];
    medicines: Medicine[];
    onBulkAddInventory: (list: any[]) => void;
    onBulkAddDistributors: (list: any[]) => void;
    onBulkAddCustomers: (list: any[]) => void;
    onBulkAddPurchases: (list: any[]) => void;
    onBulkAddSales: (list: any[]) => void;
    onBulkAddMedicines: (list: any[]) => void;
    onBulkAddMappings: (list: any[]) => void;
    mappings: SupplierProductMap[];
}

const ConfigurationPage: React.FC<ConfigurationPageProps> = ({ 
    configurations, onUpdateConfigurations, addNotification, currentUser,
    inventory, transactions, purchases, distributors, customers, medicines,
    onBulkAddInventory, onBulkAddDistributors, onBulkAddCustomers, onBulkAddPurchases, onBulkAddSales,
    onBulkAddMedicines, onBulkAddMappings, mappings
}) => {
    const [activeSection, setActiveSection] = useState<ConfigSection>('general');
    const [localConfigs, setLocalConfigs] = useState<AppConfigurations>(configurations || { organization_id: currentUser?.organization_id || 'MDXERA' });

    // Import State
    const [importType, setImportType] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [demoBusinessType, setDemoBusinessType] = useState<DemoBusinessType>('RETAIL');
    const [duplicateHandlingMode, setDuplicateHandlingMode] = useState<DuplicateHandlingMode>('SKIP');
    const [demoPreviewRows, setDemoPreviewRows] = useState<PharmacyDemoMaterial[]>([]);
    const [demoMigrationLogs, setDemoMigrationLogs] = useState<DemoMigrationJob[]>([]);
    const scopedDemoRows = useMemo(() => demoPreviewRows, [demoPreviewRows]);
    const duplicatesInPreview = useMemo(() => scopedDemoRows.filter(row => row.duplicate_exists).length, [scopedDemoRows]);

    const previewDefaultDemoMigration = async () => {
        const { data, error } = await supabase.rpc('preview_default_material_master_migration', {
            p_business_type: demoBusinessType,
            p_use_material_code: false,
        });

        if (error) {
            addNotification(`Failed to preview source data: ${error.message}`, 'error');
            return;
        }

        const rows = (data || []) as PharmacyDemoMaterial[];
        setDemoPreviewRows(rows);
        addNotification(`Preview ready. ${rows.length} records found in material_master_all(migration).`, 'success');
    };

    const runDefaultDemoMigration = async () => {
        if (!currentUser?.organization_id) {
            addNotification('Missing organization context for migration.', 'error');
            return;
        }

        const { data, error } = await supabase.rpc('run_default_material_master_migration', {
            p_business_type: demoBusinessType,
            p_duplicate_mode: duplicateHandlingMode,
            p_use_material_code: false,
        });

        if (error) {
            addNotification(`Demo migration failed: ${error.message}`, 'error');
            return;
        }

        const result = Array.isArray(data) ? data[0] : data;
        const timestamp = new Date().toISOString();

        try {
            const insertedRows = Number(result?.imported_count || 0);
            const updatedRows = Number(result?.updated_count || 0);
            const skippedRows = Number(result?.skipped_count || 0);
            const foundRows = Number(result?.found_count || 0);
            const duplicates = Number(result?.duplicates_count || 0);
            const readyRows = Number(result?.ready_count || 0);

            const job: DemoMigrationJob = {
                job_id: `DEMO-MAT-${Date.now()}`,
                organization_id: currentUser.organization_id,
                user_id: currentUser.id,
                source_table: 'material_master_all(migration)',
                target_table: 'material_master',
                business_type: demoBusinessType,
                duplicate_mode: duplicateHandlingMode,
                timestamp,
                records_found: foundRows,
                records_processed: readyRows,
                imported_count: insertedRows,
                skipped_count: skippedRows,
                updated_count: updatedRows,
                status: 'COMPLETED',
                row_mappings: []
            };

            setDemoMigrationLogs(prev => [job, ...prev]);
            addNotification(`Default demo migration complete. Found ${foundRows}, Duplicates ${duplicates}, Ready ${readyRows}, Imported ${insertedRows}, Updated ${updatedRows}, Skipped ${skippedRows}.`, 'success');
            await previewDefaultDemoMigration();
        } catch (error: any) {
            const failedJob: DemoMigrationJob = {
                job_id: `DEMO-MAT-${Date.now()}`,
                organization_id: currentUser.organization_id,
                user_id: currentUser.id,
                source_table: 'material_master_all(migration)',
                target_table: 'material_master',
                business_type: demoBusinessType,
                duplicate_mode: duplicateHandlingMode,
                timestamp,
                records_found: scopedDemoRows.length,
                records_processed: 0,
                imported_count: 0,
                skipped_count: 0,
                updated_count: 0,
                status: 'FAILED',
                error_message: error?.message || 'Unknown migration error.',
                row_mappings: []
            };
            setDemoMigrationLogs(prev => [failedJob, ...prev]);
            addNotification(`Demo migration failed: ${failedJob.error_message}`, 'error');
        }
    };

    useEffect(() => { if (configurations) setLocalConfigs(configurations); }, [configurations]);

    const handleConfigChange = (section: keyof AppConfigurations, field: string, value: any) => {
        setLocalConfigs(prev => {
            const currentSectionData = (prev[section] as any) || {};
            let updatedSectionData = { ...currentSectionData };
            
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                updatedSectionData[parent] = { ...(updatedSectionData[parent] || {}), [child]: value };
            } else {
                updatedSectionData[field] = value;
            }
            
            return { ...prev, [section]: updatedSectionData, _isDirty: true };
        });
    };

    const handleModuleFieldToggle = (moduleId: string, fieldId: string) => {
        setLocalConfigs(prev => {
            const modules = { ...(prev.modules || {}) };
            const moduleConfig = modules[moduleId] || { visible: true, fields: {} };
            const fields = { ...(moduleConfig.fields || {}) };
            
            fields[fieldId] = fields[fieldId] === false ? true : false;
            
            modules[moduleId] = { ...moduleConfig, fields };
            return { ...prev, modules, _isDirty: true };
        });
    };

    const handleShortcutToggle = (id: string) => {
        setLocalConfigs(prev => {
            const current = prev.masterShortcuts || [];
            const updated = current.includes(id) 
                ? current.filter(s => s !== id) 
                : [...current, id];
            return { ...prev, masterShortcuts: updated, _isDirty: true };
        });
    };

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) { addNotification("Empty file or header only", "error"); return; }

        setImportType(type);
        try {
            switch(type) {
                case 'master': setPreviewData(parseMedicineMasterCsv(lines)); break;
                case 'inventory': setPreviewData(parseInventoryCsv(lines)); break;
                case 'suppliers': setPreviewData(parseDistributorCsv(lines)); break;
                case 'customers': setPreviewData(parseCustomerCsv(lines)); break;
                case 'nomenclature': setPreviewData(parseNomenclatureCsv(lines)); break;
                case 'purchases': setPreviewData(parsePurchaseCsv(lines)); break;
                case 'sales': setPreviewData(parseSalesCsv(lines)); break;
            }
        } catch (err) { addNotification("Failed to parse CSV format", "error"); }
        e.target.value = '';
    };


    const validateVoucherSchemes = (): string | null => {
        const targets: Array<[keyof AppConfigurations, string]> = [
            ['invoiceConfig', 'Sales Bill (GST)'],
            ['nonGstInvoiceConfig', 'Sales Bill (Non-GST)'],
            ['purchaseConfig', 'Purchase Entry / Supplier Invoice'],
            ['purchaseOrderConfig', 'Purchase Order']
        ];

        const seen = new Set<string>();
        for (const [key, label] of targets) {
            const cfg = { ...getVoucherSchemeDefaults(), ...(localConfigs[key] as InvoiceNumberConfig || {}) };
            if (cfg.endNumber && cfg.endNumber < cfg.startingNumber) return `${label}: End No cannot be less than Start No.`;
            if (cfg.currentNumber < cfg.startingNumber) return `${label}: Current Running No cannot be less than Start No.`;
            if (cfg.endNumber && cfg.currentNumber > cfg.endNumber) return `${label}: Number range exhausted. Increase End No before saving.`;
            const overlapKey = `${cfg.fy || ''}|${cfg.prefix || ''}`.toUpperCase();
            if (seen.has(overlapKey)) return `${label}: Overlapping configuration detected (same FY + Prefix).`;
            seen.add(overlapKey);
        }

        return null;
    };

    const MigrationCard = ({ title, desc, onTemplate, type }: { title: string, desc: string, onTemplate: () => void, type: string }) => (
        <Card className="p-4 border-2 border-gray-200 hover:border-primary/40 transition-all group rounded-none bg-white">
            <div className="flex justify-between items-start mb-3">
                <h3 className="font-black uppercase text-sm text-gray-900 leading-none">{title}</h3>
                <div className="p-2 bg-gray-50 rounded-none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight mb-6 h-8 overflow-hidden">{desc}</p>
            <div className="flex gap-2">
                <button onClick={onTemplate} className="flex-1 py-2 text-[9px] font-black uppercase border-2 border-gray-300 hover:bg-gray-50 tracking-widest transition-colors">Template</button>
                <button onClick={() => { setImportType(type); fileInputRef.current?.click(); }} className="flex-1 py-2 text-[9px] font-black uppercase bg-primary text-white shadow-lg hover:bg-primary-dark tracking-widest transition-all">Import</button>
            </div>
        </Card>
    );

    const posModule = configurableModules.find(m => m.id === 'pos');
    const purchaseModule = configurableModules.find(m => m.id === 'purchase');

    return (
        <div className="flex flex-col h-full bg-app-bg overflow-hidden font-sans">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Global ERP Configuration (Control Room)</span>
                <span className="text-[10px] font-black uppercase text-accent">Org: {currentUser?.pharmacy_name}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 overflow-hidden">
                <Card className="w-64 flex flex-col p-0 tally-border bg-white !rounded-none shadow-lg">
                    <div className="bg-primary p-2 text-white text-[10px] font-black uppercase text-center tracking-widest">Settings Menu</div>
                    <nav className="flex-1 overflow-y-auto py-2">
                        {[
                            { id: 'general', name: 'General Settings', icon: '⚙️' },
                            { id: 'posConfig', name: 'POS Sales', icon: '🛒' },
                            { id: 'purchaseConfig', name: 'Purchase Entry', icon: '📦' },
                            { id: 'dataManagement', name: 'Data Migration', icon: '💾' },
                            { id: 'discountMaster', name: 'Discount Master', icon: '🏷️' },
                            { id: 'invoiceNumbering', name: 'Voucher Series', icon: '🔢' },
                            { id: 'dashboardShortcuts', name: 'Gateway Shortcuts', icon: '🚀' },
                            { id: 'dashboardModuleConfig', name: 'Dashboard Module Configuration', icon: '📈' },
                            { id: 'displayOptions', name: 'Printing & Display', icon: '🖥️' },
                            { id: 'moduleVisibility', name: 'Module Columns', icon: '📊' },
                        ].map(item => (
                            <button 
                                key={item.id} 
                                onClick={() => setActiveSection(item.id as ConfigSection)} 
                                className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase border-b border-gray-50 transition-colors ${activeSection === item.id ? 'bg-accent text-black shadow-[inset_4px_0_0_0_#004242]' : 'text-gray-800 hover:bg-gray-100'}`}
                            >
                                <span className="mr-3 opacity-60">{item.icon}</span>{item.name}
                            </button>
                        ))}
                    </nav>
                </Card>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <Card className="p-8 tally-border bg-white !rounded-none shadow-xl min-h-full flex flex-col">
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={e => importType && handleFileImport(e, importType)} />
                        
                        {activeSection === 'general' && (
                            <div className="space-y-8 animate-in fade-in duration-300 max-w-3xl">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Business Logic Settings</h2>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">General Settings</h3>
                                        <Toggle 
                                            label="Ask Calculation on Billing" 
                                            enabled={localConfigs.displayOptions?.askCalculationOnBilling ?? true}
                                            setEnabled={(v) => handleConfigChange('displayOptions', 'askCalculationOnBilling', v)}
                                            description="Prompt for tax calculation basis (Inc/Excl) during Sale entry."
                                        />

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Scheme Discount Calculation Base</label>
                                            <select 
                                                value={localConfigs.displayOptions?.schemeDiscountCalculationBase || 'after_trade_discount'}
                                                onChange={e => handleConfigChange('displayOptions', 'schemeDiscountCalculationBase', e.target.value)}
                                                className="w-full tally-input !text-sm"
                                            >
                                                <option value="subtotal">Subtotal (Scheme Discount calculated on Subtotal)</option>
                                                <option value="after_trade_discount">After Trade Discount (Scheme Discount on Subtotal − Trade Discount)</option>
                                            </select>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tax Calculation Base</label>
                                            <select 
                                                value={localConfigs.displayOptions?.taxCalculationBase || 'after_all_discounts'}
                                                onChange={e => handleConfigChange('displayOptions', 'taxCalculationBase', e.target.value)}
                                                className="w-full tally-input !text-sm"
                                            >
                                                <option value="subtotal">Subtotal</option>
                                                <option value="after_trade_discount">After Trade Discount</option>
                                                <option value="after_all_discounts">After All Discounts (Recommended Default)</option>
                                            </select>
                                        </div>
                                        
                                        <div className="py-4 border-b border-gray-100 flex items-center justify-between">
                                            <div>
                                                <span className="text-sm font-black text-gray-700 uppercase tracking-tight">Calculation Mode</span>
                                                <p className="text-[10px] text-gray-400 mt-0.5 font-bold uppercase">Switch between Standard and Rounded (Mode 8) logic.</p>
                                            </div>
                                            <select 
                                                value={localConfigs.displayOptions?.calculationMode || 'standard'}
                                                onChange={e => handleConfigChange('displayOptions', 'calculationMode', e.target.value)}
                                                className="p-2 border-2 border-gray-400 font-black text-xs uppercase focus:border-primary outline-none"
                                            >
                                                <option value="standard">Standard Accounting</option>
                                                <option value="8">Mode 8 (Auto-Rounding)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Stock Handling</h3>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Near Expiry Threshold (Days)</label>
                                            <input 
                                                type="number" 
                                                value={localConfigs.displayOptions?.expiryThreshold ?? 90}
                                                onChange={e => handleConfigChange('displayOptions', 'expiryThreshold', parseInt(e.target.value) || 0)}
                                                className="w-full tally-input !text-lg"
                                            />
                                        </div>
                                        <Toggle 
                                            label="Strict Stock Enforcement" 
                                            enabled={localConfigs.displayOptions?.strictStock ?? false}
                                            setEnabled={(v) => handleConfigChange('displayOptions', 'strictStock', v)}
                                            description="Prevent billing of items with zero/negative stock."
                                        />
                                        <Toggle 
                                            label="Enable Negative Stock" 
                                            enabled={localConfigs.displayOptions?.enableNegativeStock ?? false}
                                            setEnabled={(v) => handleConfigChange('displayOptions', 'enableNegativeStock', v)}
                                            description="Allow inventory to drop below zero if needed."
                                        />
                                    </div>

                                    <div className="space-y-4 md:col-span-2">
                                        <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Invoice Preferences</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Default Rate Tier</label>
                                                <select 
                                                    value={localConfigs.displayOptions?.defaultRateTier || 'mrp'}
                                                    onChange={e => handleConfigChange('displayOptions', 'defaultRateTier', e.target.value)}
                                                    className="w-full tally-input !text-sm"
                                                >
                                                    <option value="mrp">Maximum Retail Price (MRP)</option>
                                                    <option value="ptr">Price to Retailer (PTR)</option>
                                                    <option value="rateA">Tier A Rate</option>
                                                    <option value="rateB">Tier B Rate</option>
                                                    <option value="rateC">Tier C Rate</option>
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Default Print Copies</label>
                                                <input 
                                                    type="number" 
                                                    value={localConfigs.displayOptions?.printCopies ?? 1}
                                                    onChange={e => handleConfigChange('displayOptions', 'printCopies', parseInt(e.target.value) || 1)}
                                                    className="w-full tally-input !text-lg"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <Toggle 
                                                    label="Show Bill Discount on Print" 
                                                    enabled={localConfigs.displayOptions?.showBillDiscountOnPrint ?? true}
                                                    setEnabled={(v) => handleConfigChange('displayOptions', 'showBillDiscountOnPrint', v)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'posConfig' && posModule && (
                             <div className="space-y-8 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">POS Module Configuration</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-6">Enable or disable specific UI components and table columns for the Point of Sale screen.</p>
                                <div className="bg-gray-50/50 p-6 border border-gray-100 max-w-2xl">
                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Billing Grid Columns</h3>
                                    {(posModule.fields || []).filter(f => f.id.startsWith('col')).map(field => (
                                        <Toggle 
                                            key={field.id}
                                            label={field.name}
                                            enabled={(localConfigs.modules?.['pos']?.fields?.[field.id]) !== false}
                                            setEnabled={() => handleModuleFieldToggle('pos', field.id)}
                                        />
                                    ))}

                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-8 mb-4">Intelligence & Utility Panels</h3>
                                    {(posModule.fields || []).filter(f => !f.id.startsWith('col')).map(field => (
                                        <Toggle 
                                            key={field.id}
                                            label={field.name}
                                            enabled={(localConfigs.modules?.['pos']?.fields?.[field.id]) !== false}
                                            setEnabled={() => handleModuleFieldToggle('pos', field.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeSection === 'purchaseConfig' && purchaseModule && (
                             <div className="space-y-8 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Purchase Entry Configuration</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-6">Manage field visibility for manual and automated purchase inward bills.</p>
                                <div className="bg-gray-50/50 p-6 border border-gray-100 max-w-2xl">
                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Voucher Header & Grid Fields</h3>
                                    {(purchaseModule.fields || []).filter(f => !f.id.startsWith('sum')).map(field => (
                                        <Toggle 
                                            key={field.id}
                                            label={field.name}
                                            enabled={(localConfigs.modules?.['purchase']?.fields?.[field.id]) !== false}
                                            setEnabled={() => handleModuleFieldToggle('purchase', field.id)}
                                        />
                                    ))}

                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-8 mb-4">Summary Section Totals</h3>
                                    {(purchaseModule.fields || []).filter(f => f.id.startsWith('sum')).map(field => (
                                        <Toggle 
                                            key={field.id}
                                            label={field.name}
                                            enabled={(localConfigs.modules?.['purchase']?.fields?.[field.id]) !== false}
                                            setEnabled={() => handleModuleFieldToggle('purchase', field.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeSection === 'dashboardShortcuts' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2 mb-6">Configure Gateway Shortcuts</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-6">Select up to 8 modules to display on your dashboard 'Go To' menu.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {MASTER_SHORTCUT_OPTIONS.map(opt => {
                                        const isSelected = (localConfigs.masterShortcuts || []).includes(opt.id);
                                        return (
                                            <button 
                                                key={opt.id}
                                                onClick={() => handleShortcutToggle(opt.id)}
                                                className={`p-4 border-2 text-left transition-all flex items-center gap-4 ${isSelected ? 'bg-primary border-primary text-white shadow-lg' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-primary/40'}`}
                                            >
                                                <div className={`p-2 rounded-none ${isSelected ? 'bg-white/10' : 'bg-white border border-gray-200'}`}>
                                                    {opt.icon}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-black uppercase tracking-tight leading-none">{opt.label}</p>
                                                    <p className={`text-[9px] mt-1 font-bold ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                                                        {isSelected ? 'ENABLED' : 'DISABLED'}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeSection === 'dashboardModuleConfig' && (
                            <div className="space-y-8 animate-in fade-in duration-300 max-w-3xl">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Dashboard Module Configuration</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Enable or disable dashboard summary components from the main dashboard view.</p>

                                <div className="bg-gray-50/60 border border-gray-200 p-5 space-y-1">
                                    <Toggle
                                        label="Sales (with amount display)"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.statSales) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'statSales')}
                                    />
                                    <Toggle
                                        label="Profit (with amount display)"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.statProfit) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'statProfit')}
                                    />
                                    <Toggle
                                        label="Purchases"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.statPurchases) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'statPurchases')}
                                    />
                                    <Toggle
                                        label="Inventory"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.statStockValue) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'statStockValue')}
                                    />
                                    <Toggle
                                        label="Recent Vouchers"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.recentVouchers) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'recentVouchers')}
                                    />
                                    <Toggle
                                        label="Low Stock"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.kpiLowStock) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'kpiLowStock')}
                                    />
                                    <Toggle
                                        label="Audit"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.kpiAudits) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'kpiAudits')}
                                    />
                                    <Toggle
                                        label="Purchase Return"
                                        enabled={(localConfigs.modules?.dashboard?.fields?.kpiReturns) !== false}
                                        setEnabled={() => handleModuleFieldToggle('dashboard', 'kpiReturns')}
                                    />
                                </div>
                            </div>
                        )}

                        {activeSection === 'displayOptions' && (
                            <div className="space-y-8 animate-in fade-in duration-300 max-w-3xl">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Printing & Display Defaults</h2>
                                
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest max-w-xl">
                                    Print layout and output presets remain available in this section.
                                </p>
                            </div>
                        )}

                        {activeSection === 'moduleVisibility' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Column Visibility Controller</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-6">Hide or show specific data points across the main registers.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    {configurableModules.map(module => (
                                        <div key={module.id} className="space-y-4">
                                            <h3 className="text-sm font-black text-primary uppercase tracking-[0.2em] border-b border-gray-100 pb-2">{module.name} Module</h3>
                                            <div className="bg-gray-50/50 p-4 border border-gray-100 h-96 overflow-y-auto custom-scrollbar">
                                                {(module.fields || []).map(field => (
                                                    <Toggle 
                                                        key={field.id}
                                                        label={field.name}
                                                        enabled={(localConfigs.modules?.[module.id]?.fields?.[field.id]) !== false}
                                                        setEnabled={() => handleModuleFieldToggle(module.id, field.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeSection === 'dataManagement' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2 mb-6">Central Data Migration Center</h2>
                                <MasterDataMigrationWizard
                                    currentUser={currentUser}
                                    suppliers={distributors}
                                    customers={customers}
                                    medicines={medicines}
                                    inventory={inventory}
                                    addNotification={addNotification}
                                />
                                <div className="p-4 border-2 border-primary/20 bg-primary/5 space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest">Master data Migartion deafult</h3>
                                    <p className="text-[11px] text-gray-600 font-bold uppercase">Default demo migration for Pharmacy Retail & Medicine Distributor (Material Master only).</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-black uppercase">
                                        <div>Total records found: {scopedDemoRows.length}</div>
                                        <div>Duplicates detected: {duplicatesInPreview}</div>
                                        <div>Ready to import/update: {scopedDemoRows.length - (duplicateHandlingMode === 'SKIP' ? duplicatesInPreview : 0)}</div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Business Type</label>
                                            <select className="w-full tally-input" value={demoBusinessType} onChange={e => setDemoBusinessType(e.target.value as DemoBusinessType)}>
                                                <option value="RETAIL">Pharmacy Retail</option>
                                                <option value="DISTRIBUTOR">Medicine Distributor</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Duplicate Handling</label>
                                            <select className="w-full tally-input" value={duplicateHandlingMode} onChange={e => setDuplicateHandlingMode(e.target.value as DuplicateHandlingMode)}>
                                                <option value="SKIP">Skip duplicates (Default)</option>
                                                <option value="UPDATE">Update duplicates</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={previewDefaultDemoMigration} className="px-3 py-2 border text-[10px] font-black uppercase">Preview</button>
                                        <button onClick={runDefaultDemoMigration} className="px-3 py-2 bg-green-700 text-white text-[10px] font-black uppercase">Run Default Demo Migration (Material Master)</button>
                                    </div>
                                    <div className="border bg-white p-2 max-h-48 overflow-auto">
                                        <div className="text-[10px] font-black uppercase mb-1">Preview Grid (material_master_all(migration) → material_master)</div>
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-gray-100 font-black uppercase">
                                                <tr>
                                                    <th className="p-1 text-left">Name</th>
                                                    <th className="p-1 text-left">Pack</th>
                                                    <th className="p-1 text-left">HSN</th>
                                                    <th className="p-1 text-left">GST</th>
                                                    <th className="p-1 text-left">Manufacturer / Brand</th>
                                                    <th className="p-1 text-left">Unit</th>
                                                    <th className="p-1 text-left">Category</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {demoPreviewRows.slice(0, 100).map(row => (
                                                    <tr key={row.id} className="border-t">
                                                        <td className="p-1">{row.material_name}</td>
                                                        <td className="p-1">{row.pack}</td>
                                                        <td className="p-1">{row.hsn}</td>
                                                        <td className="p-1">{row.gst_rate}</td>
                                                        <td className="p-1">{row.manufacturer || row.brand}</td>
                                                        <td className="p-1">{row.uom}</td>
                                                        <td className="p-1">{row.category}</td>
                                                    </tr>
                                                ))}
                                                {demoPreviewRows.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={7}>Click Preview to load demo records from material_master_all(migration) dataset.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="border bg-white p-2 max-h-48 overflow-auto">
                                        <div className="text-[10px] font-black uppercase mb-1">Migration Run Log</div>
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-gray-100 font-black uppercase">
                                                <tr>
                                                    <th className="p-1 text-left">Timestamp</th>
                                                    <th className="p-1 text-left">Organization</th>
                                                    <th className="p-1 text-left">User</th>
                                                    <th className="p-1 text-right">Found</th>
                                                    <th className="p-1 text-right">Imported</th>
                                                    <th className="p-1 text-right">Skipped</th>
                                                    <th className="p-1 text-right">Updated</th>
                                                    <th className="p-1 text-left">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {demoMigrationLogs.map(log => (
                                                    <tr key={log.job_id} className="border-t">
                                                        <td className="p-1">{new Date(log.timestamp).toLocaleString()}</td>
                                                        <td className="p-1">{log.organization_id}</td>
                                                        <td className="p-1">{log.user_id || '-'}</td>
                                                        <td className="p-1 text-right">{log.records_found}</td>
                                                        <td className="p-1 text-right">{log.imported_count}</td>
                                                        <td className="p-1 text-right">{log.skipped_count}</td>
                                                        <td className="p-1 text-right">{log.updated_count}</td>
                                                        <td className="p-1">{log.status}{log.error_message ? `: ${log.error_message}` : ''}</td>
                                                    </tr>
                                                ))}
                                                {demoMigrationLogs.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={8}>No migration run yet.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <MigrationCard title="Material Master" desc="Global SKU catalog including composition, HSN, and Tax details." onTemplate={downloadMasterTemplate} type="master" />
                                    <MigrationCard title="Inventory (Stock)" desc="Batch-wise physical stock data with expiry and purchase rates." onTemplate={downloadInventoryTemplate} type="inventory" />
                                    <MigrationCard title="Supplier Master" desc="Ledger accounts for pharmaceutical distributors and vendors." onTemplate={downloadSupplierTemplate} type="suppliers" />
                                    <MigrationCard title="Customer Master" desc="Patient and Retailer accounts for sales and receivables." onTemplate={downloadCustomerTemplate} type="customers" />
                                    <MigrationCard title="Vendor Sync" desc="Nomenclature rules mapping vendor names to your master SKUs." onTemplate={downloadNomenclatureTemplate} type="nomenclature" />
                                    <MigrationCard title="Sales Import" desc="Bulk import historical sales vouchers or external billing data." onTemplate={downloadSalesImportTemplate} type="sales" />
                                    <MigrationCard title="Purchase Import" desc="Bulk import supplier inward bills and historical purchases." onTemplate={downloadPurchaseImportTemplate} type="purchases" />
                                </div>
                            </div>
                        )}

                        {activeSection === 'invoiceNumbering' && (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2 mb-6">Voucher Numbering Schemes</h2>
                                {renderVoucherSeriesInput('Sales Bill (GST)', 'invoiceConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Sales Bill (Non-GST)', 'nonGstInvoiceConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Purchase Entry / Supplier Invoice', 'purchaseConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Purchase Order', 'purchaseOrderConfig', localConfigs, handleConfigChange)}
                            </div>
                        )}

                        {activeSection === 'discountMaster' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-6">
                                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Discount Strategy Matrix</h2>
                                    <button onClick={() => setLocalConfigs(p => ({ ...p!, discountRules: [...(p?.discountRules || []), { id: crypto.randomUUID(), name: 'New Rule', type: 'flat', level: 'line', value: 0, calculationBase: 'mrp', enabled: true, shortcutKey: 'F', allowManualOverride: true, applyBeforeTax: true }], _isDirty: true }))} className="px-6 py-2 tally-button-primary text-[10px]">Add Rule</button>
                                </div>
                                <div className="space-y-4">
                                    {(localConfigs.discountRules || []).map(rule => (
                                        <div key={rule.id} className="p-4 border-2 border-gray-200 bg-gray-50 rounded-none relative">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="md:col-span-1"><label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Rule Name</label><input type="text" value={rule.name} onChange={e => setLocalConfigs(p => ({ ...p!, discountRules: (p?.discountRules || []).map(r => r.id === rule.id ? { ...r, name: e.target.value } : r), _isDirty: true }))} className="w-full tally-input uppercase"/></div>
                                                <div><label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Type</label><select value={rule.type} onChange={e => setLocalConfigs(p => ({ ...p!, discountRules: (p?.discountRules || []).map(r => r.id === rule.id ? { ...r, type: e.target.value as any } : r), _isDirty: true }))} className="w-full tally-input uppercase"><option value="flat">Flat ₹</option><option value="percentage">Percent %</option></select></div>
                                                <div><label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Level</label><select value={rule.level} onChange={e => setLocalConfigs(p => ({ ...p!, discountRules: (p?.discountRules || []).map(r => r.id === rule.id ? { ...r, level: e.target.value as any } : r), _isDirty: true }))} className="w-full tally-input uppercase"><option value="line">Line</option><option value="invoice">Invoice</option></select></div>
                                                <div><label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Key</label><input type="text" value={rule.shortcutKey} onChange={e => setLocalConfigs(p => ({ ...p!, discountRules: (p?.discountRules || []).map(r => r.id === rule.id ? { ...r, shortcutKey: e.target.value } : r), _isDirty: true }))} className="w-full tally-input uppercase text-center font-black"/></div>
                                            </div>
                                            <button onClick={() => setLocalConfigs(p => ({ ...p!, discountRules: p?.discountRules?.filter(r => r.id !== rule.id), _isDirty: true }))} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full font-black text-xs">✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-auto pt-10 border-t border-gray-200 flex justify-end gap-4">
                            <button onClick={() => setLocalConfigs(configurations)} className="px-10 py-3 tally-border bg-white text-gray-500 font-black uppercase text-[11px] hover:bg-red-50 transition-colors">Discard</button>
                            <button onClick={() => { const error = validateVoucherSchemes(); if (error) { addNotification(error, 'error'); return; } onUpdateConfigurations(localConfigs); addNotification('Accepted Changes.', 'success'); }} className="px-16 py-4 tally-button-primary shadow-2xl uppercase text-[11px] font-black tracking-[0.3em] active:scale-95">Accept (Enter)</button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Import Previews */}
            {importType === 'inventory' && previewData.length > 0 && <ImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={() => { onBulkAddInventory(previewData); setImportType(null); setPreviewData([]); addNotification(`Imported ${previewData.length} records`, 'success'); }} data={previewData} />}
            {importType === 'suppliers' && previewData.length > 0 && <DistributorImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddDistributors(d); setImportType(null); setPreviewData([]); addNotification("Suppliers imported", 'success'); }} data={previewData} />}
            {importType === 'customers' && previewData.length > 0 && <CustomerImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddCustomers(d); setImportType(null); setPreviewData([]); addNotification("Customers imported", 'success'); }} data={previewData} />}
            {importType === 'purchases' && previewData.length > 0 && <PurchaseBillImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddPurchases(d); setImportType(null); setPreviewData([]); addNotification("Purchases imported", 'success'); }} data={previewData} inventory={inventory} distributors={distributors} />}
            {importType === 'sales' && previewData.length > 0 && <SalesBillImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddSales(d); setImportType(null); setPreviewData([]); addNotification("Sales data imported", 'success'); }} data={previewData} inventory={inventory} customers={customers} />}
            {importType === 'master' && previewData.length > 0 && <MedicineMasterImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddMedicines(d); setImportType(null); setPreviewData([]); addNotification("Master Data Updated", 'success'); }} data={previewData} />}
            {importType === 'nomenclature' && previewData.length > 0 && <MappingImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { onBulkAddMappings(d); setImportType(null); setPreviewData([]); addNotification("Nomenclature Rules Updated", 'success'); }} data={previewData} distributors={distributors} medicines={medicines} mappings={mappings} />}
        </div>
    );
};

export default ConfigurationPage;
