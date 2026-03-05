import React, { useState, useEffect, useRef, useMemo } from 'react';
import Card from './components/Card';
/* Added missing Customer type to the import list */
import type { AppConfigurations, ModuleConfig, InvoiceNumberConfig, DiscountRule, SlabRule, InventoryItem, Transaction, Purchase, RegisteredPharmacy, Medicine, Distributor, SupplierProductMap, Customer } from './types';
import { configurableModules, MASTER_SHORTCUT_OPTIONS } from './constants';
import { 
    downloadMasterTemplate, downloadInventoryTemplate, downloadSupplierTemplate, 
    downloadCustomerTemplate, downloadNomenclatureTemplate, downloadSalesImportTemplate, 
    downloadPurchaseImportTemplate, parseInventoryCsv, parseDistributorCsv, 
    parseCustomerCsv, parsePurchaseCsv, parseSalesCsv, parseMedicineMasterCsv, parseNomenclatureCsv 
} from './utils/csv';
import ImportPreviewModal from './components/ImportPreviewModal';
import DistributorImportPreviewModal from './components/DistributorImportPreviewModal';
import CustomerImportPreviewModal from './components/CustomerImportPreviewModal';
import PurchaseBillImportPreviewModal from './components/PurchaseBillImportPreviewModal';
import SalesBillImportPreviewModal from './components/SalesBillImportPreviewModal';
import Modal from './components/Modal';
import { fuzzyMatch } from './utils/search';
import { deleteData } from './services/storageService';

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

type ConfigSection = 'general' | 'posConfig' | 'purchaseConfig' | 'invoiceNumbering' | 'dashboardShortcuts' | 'displayOptions' | 'discountMaster' | 'moduleVisibility' | 'dataManagement';

type DemoBusinessType = 'RETAIL' | 'DISTRIBUTOR';

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
    mrp?: number;
    purchase_rate?: number;
    sale_rate?: number;
};

type DemoMigrationAction = 'inserted' | 'skipped' | 'updated';

type DemoMigrationJob = {
    job_id: string;
    job_type: 'DEMO_PHARMACY_MATERIAL_MASTER';
    source_table: 'material_master_all';
    target_table: 'material_master';
    target_org_id: string;
    business_type: DemoBusinessType;
    created_by: string;
    created_at: string;
    inserted_count: number;
    skipped_count: number;
    updated_count: number;
    status: 'COMPLETED' | 'ROLLED_BACK';
    row_mappings: Array<{ source_row_id: string; target_material_id?: string; action: DemoMigrationAction }>;
    inserted_rows: string[];
};

const DEFAULT_PHARMACY_DEMO_MATERIALS: PharmacyDemoMaterial[] = [
    { id: 'DEMO-MAT-001', industry: 'PHARMACY', is_demo: true, business_type: 'RETAIL', material_name: 'Paracetamol 650 Tablet', item_code: 'PCM650-TAB', sku: 'PCM650-TAB', barcode: '8908001000011', pack: "10'S", uom: 'STRIP', hsn: '3004', gst_rate: 12, category: 'ANALGESIC', manufacturer: 'MediCare Labs', mrp: 32, purchase_rate: 24, sale_rate: 30 },
    { id: 'DEMO-MAT-002', industry: 'PHARMACY', is_demo: true, business_type: 'RETAIL', material_name: 'Azithromycin 500 Tablet', item_code: 'AZI500-TAB', sku: 'AZI500-TAB', barcode: '8908001000028', pack: "3'S", uom: 'STRIP', hsn: '3004', gst_rate: 12, category: 'ANTIBIOTIC', manufacturer: 'Healix Pharma', mrp: 98, purchase_rate: 80, sale_rate: 92 },
    { id: 'DEMO-MAT-003', industry: 'PHARMACY', is_demo: true, business_type: 'RETAIL', material_name: 'ORS Powder Orange', item_code: 'ORS-POW-01', sku: 'ORS-POW-01', barcode: '8908001000035', pack: "21G", uom: 'SACHET', hsn: '3004', gst_rate: 5, category: 'ELECTROLYTE', manufacturer: 'NutriSalts', mrp: 20, purchase_rate: 15, sale_rate: 18 },
    { id: 'DEMO-MAT-004', industry: 'PHARMACY', is_demo: true, business_type: 'DISTRIBUTOR', material_name: 'Amoxicillin 500 Capsule', item_code: 'AMX500-CAP', sku: 'AMX500-CAP', barcode: '8908001000042', pack: "10'S", uom: 'STRIP', hsn: '3004', gst_rate: 12, category: 'ANTIBIOTIC', manufacturer: 'BioCure Pharma', mrp: 85, purchase_rate: 68, sale_rate: 79 },
    { id: 'DEMO-MAT-005', industry: 'PHARMACY', is_demo: true, business_type: 'DISTRIBUTOR', material_name: 'Pantoprazole 40 Tablet', item_code: 'PAN40-TAB', sku: 'PAN40-TAB', barcode: '8908001000059', pack: "15'S", uom: 'STRIP', hsn: '3004', gst_rate: 12, category: 'GASTRO', manufacturer: 'AcidRelief Health', mrp: 120, purchase_rate: 92, sale_rate: 108 },
    { id: 'DEMO-MAT-006', industry: 'PHARMACY', is_demo: true, business_type: 'DISTRIBUTOR', material_name: 'Cough Syrup DX', item_code: 'COUGH-DX-100', sku: 'COUGH-DX-100', barcode: '8908001000066', pack: '100ML', uom: 'BOTTLE', hsn: '3004', gst_rate: 12, category: 'RESPIRATORY', manufacturer: 'Respira Therapeutics', mrp: 115, purchase_rate: 88, sale_rate: 106 }
];

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

    const [demoTargetOrg, setDemoTargetOrg] = useState(currentUser?.organization_id || 'MDXERA');
    const [demoBusinessType, setDemoBusinessType] = useState<DemoBusinessType>('RETAIL');
    const [demoPreviewRows, setDemoPreviewRows] = useState<PharmacyDemoMaterial[]>([]);
    const [demoMigrationJobs, setDemoMigrationJobs] = useState<DemoMigrationJob[]>([]);
    const [rollbackJobId, setRollbackJobId] = useState('');
    const [rollbackConfirmText, setRollbackConfirmText] = useState('');

    const fetchDemoMaterials = (businessType: DemoBusinessType) => DEFAULT_PHARMACY_DEMO_MATERIALS.filter(
        row => row.industry === 'PHARMACY' && row.is_demo && ['RETAIL', 'DISTRIBUTOR'].includes(row.business_type) && row.business_type === businessType
    );

    const duplicateMatcher = (row: PharmacyDemoMaterial, mat: Medicine) => {
        const rowBarcode = (row.barcode || '').trim();
        const rowCode = (row.item_code || row.sku || '').trim().toLowerCase();
        const matBarcode = (mat.barcode || '').trim();
        const matCode = (mat.materialCode || '').trim().toLowerCase();
        if (rowBarcode && matBarcode && rowBarcode === matBarcode) return true;
        if (rowCode && matCode && rowCode === matCode) return true;
        const namePackUomA = `${(row.material_name || '').trim().toLowerCase()}|${(row.pack || '').trim().toLowerCase()}|${(row.uom || '').trim().toLowerCase()}`;
        const namePackUomB = `${(mat.name || '').trim().toLowerCase()}|${(mat.pack || '').trim().toLowerCase()}|${((mat as any).uom || '').trim().toLowerCase()}`;
        return namePackUomA === namePackUomB;
    };

    const scopedTargetMaterials = useMemo(() => medicines.filter(m => m.organization_id === demoTargetOrg), [medicines, demoTargetOrg]);
    const scopedDemoRows = useMemo(() => fetchDemoMaterials(demoBusinessType), [demoBusinessType]);
    const duplicateCount = useMemo(() => scopedDemoRows.filter(row => scopedTargetMaterials.some(mat => duplicateMatcher(row, mat))).length, [scopedDemoRows, scopedTargetMaterials]);
    const itemsToImport = scopedDemoRows.length - duplicateCount;
    const orgOptions = useMemo(() => Array.from(new Set([currentUser?.organization_id || 'MDXERA', ...medicines.map(m => m.organization_id).filter(Boolean)])), [currentUser?.organization_id, medicines]);

    const makeDemoJobId = () => `DEMO-MAT-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

    const mapDemoToMedicine = (sourceRow: PharmacyDemoMaterial, jobId: string): Medicine => ({
        id: crypto.randomUUID(),
        organization_id: demoTargetOrg,
        user_id: currentUser?.user_id,
        name: sourceRow.material_name,
        materialCode: sourceRow.item_code || sourceRow.sku,
        barcode: sourceRow.barcode,
        pack: sourceRow.pack,
        manufacturer: sourceRow.manufacturer,
        gstRate: sourceRow.gst_rate,
        hsnCode: sourceRow.hsn,
        mrp: String(sourceRow.mrp ?? 0),
        rateA: sourceRow.purchase_rate,
        rateB: sourceRow.sale_rate,
        description: sourceRow.category,
        brand: sourceRow.category,
        isPrescriptionRequired: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...( { data_source: 'DEMO_MIGRATION', migration_job_id: jobId, created_by: currentUser?.full_name || 'System', created_by_id: currentUser?.id, source_uom: sourceRow.uom } as any )
    });

    const previewDemoMigration = () => {
        const rows = fetchDemoMaterials(demoBusinessType);
        setDemoPreviewRows(rows);
        addNotification(`Preview ready: ${rows.length} demo rows loaded from material_master_all filters.`, 'success');
    };

    const importDemoMigration = () => {
        const rows = fetchDemoMaterials(demoBusinessType);
        const jobId = makeDemoJobId();
        const mappedRows: Medicine[] = [];
        const rowMappings: DemoMigrationJob['row_mappings'] = [];

        rows.forEach(row => {
            const existing = medicines.find(mat => mat.organization_id === demoTargetOrg && duplicateMatcher(row, mat));
            if (existing) {
                rowMappings.push({ source_row_id: row.id, target_material_id: existing.id, action: 'skipped' });
                return;
            }
            const next = mapDemoToMedicine(row, jobId);
            mappedRows.push(next);
            rowMappings.push({ source_row_id: row.id, target_material_id: next.id, action: 'inserted' });
        });

        if (mappedRows.length > 0) onBulkAddMedicines(mappedRows as any[]);

        const job: DemoMigrationJob = {
            job_id: jobId,
            job_type: 'DEMO_PHARMACY_MATERIAL_MASTER',
            source_table: 'material_master_all',
            target_table: 'material_master',
            target_org_id: demoTargetOrg,
            business_type: demoBusinessType,
            created_by: currentUser?.full_name || 'System',
            created_at: new Date().toISOString(),
            inserted_count: mappedRows.length,
            skipped_count: rowMappings.filter(r => r.action === 'skipped').length,
            updated_count: 0,
            status: 'COMPLETED',
            row_mappings: rowMappings,
            inserted_rows: mappedRows.map(m => m.id)
        };
        setDemoMigrationJobs(prev => [job, ...prev]);
        addNotification(`Imported ${job.inserted_count} items to material_master. Skipped ${job.skipped_count} duplicates.`, 'success');
    };

    const rollbackDemoMigration = async () => {
        const job = demoMigrationJobs.find(j => j.job_id === rollbackJobId);
        if (!job) return addNotification('Invalid Job ID selected for rollback.', 'error');
        if (rollbackConfirmText !== `ROLLBACK ${job.job_id}`) return addNotification('Type rollback confirmation exactly: ROLLBACK + JobID', 'error');
        if (job.status === 'ROLLED_BACK') return addNotification('Job already rolled back.', 'warning');

        for (const rowId of job.inserted_rows) {
            await deleteData('material_master', rowId);
        }
        setDemoMigrationJobs(prev => prev.map(j => j.job_id === job.job_id ? { ...j, status: 'ROLLED_BACK' } : j));
        addNotification(`Rollback complete for ${job.job_id}.`, 'success');
    };

    useEffect(() => {
        setDemoTargetOrg(currentUser?.organization_id || 'MDXERA');
    }, [currentUser?.organization_id]);

    useEffect(() => {
        if (!currentUser?.organization_id) return;
        const key = `demo-material-prompt-${currentUser.organization_id}`;
        if (localStorage.getItem(key)) return;
        const accepted = window.confirm('Load Default Pharmacy Material Master Demo Data?');
        localStorage.setItem(key, 'shown');
        if (accepted) importDemoMigration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.organization_id]);

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
                            <div className="space-y-8 animate-in fade-in duration-300 max-w-2xl">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Business Logic Settings</h2>
                                
                                <div className="space-y-4">
                                    <Toggle 
                                        label="Ask Calculation on Billing" 
                                        enabled={localConfigs.displayOptions?.askCalculationOnBilling ?? true}
                                        setEnabled={(v) => handleConfigChange('displayOptions', 'askCalculationOnBilling', v)}
                                        description="Prompt for tax calculation basis (Inc/Excl) during Sale entry."
                                    />
                                    
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

                        {activeSection === 'displayOptions' && (
                            <div className="space-y-8 animate-in fade-in duration-300 max-w-3xl">
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter border-b-2 border-primary pb-2">Printing & Display Defaults</h2>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
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

                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Invoice Preferences</h3>
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
                                        <Toggle 
                                            label="Show Bill Discount on Print" 
                                            enabled={localConfigs.displayOptions?.showBillDiscountOnPrint ?? true}
                                            setEnabled={(v) => handleConfigChange('displayOptions', 'showBillDiscountOnPrint', v)}
                                        />
                                    </div>
                                </div>
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
                                <div className="p-4 border-2 border-primary/20 bg-primary/5 space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest">Default Demo Migration – Pharmacy Material Master</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Target Organization</label>
                                            <select className="w-full tally-input" value={demoTargetOrg} onChange={e => setDemoTargetOrg(e.target.value)}>
                                                {orgOptions.map((org: string) => <option key={org} value={org}>{org}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Business Type</label>
                                            <select className="w-full tally-input" value={demoBusinessType} onChange={e => setDemoBusinessType(e.target.value as DemoBusinessType)}>
                                                <option value="RETAIL">Pharmacy Retail</option>
                                                <option value="DISTRIBUTOR">Medicine Distributor</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-black uppercase">
                                        <div>Total demo items in material_master_all: {scopedDemoRows.length}</div>
                                        <div>Items to import: {itemsToImport}</div>
                                        <div>Duplicates detected (will skip): {duplicateCount}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={previewDemoMigration} className="px-3 py-2 border text-[10px] font-black uppercase">Preview</button>
                                        <button onClick={importDemoMigration} className="px-3 py-2 bg-green-700 text-white text-[10px] font-black uppercase">Import & Save to Material Master</button>
                                        <button onClick={rollbackDemoMigration} className="px-3 py-2 bg-red-700 text-white text-[10px] font-black uppercase">Rollback (Undo Last Demo Import)</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="border bg-white p-2 max-h-48 overflow-auto">
                                            <div className="text-[10px] font-black uppercase mb-1">Preview Rows (sample)</div>
                                            <table className="w-full text-[10px]">
                                                <thead className="bg-gray-100 uppercase font-black"><tr><th className="p-1 text-left">Name</th><th className="p-1 text-left">Code</th><th className="p-1 text-left">Pack</th><th className="p-1 text-left">UOM</th></tr></thead>
                                                <tbody>
                                                    {demoPreviewRows.slice(0, 10).map(r => <tr key={r.id} className="border-t"><td className="p-1">{r.material_name}</td><td className="p-1">{r.item_code || r.sku}</td><td className="p-1">{r.pack || '—'}</td><td className="p-1">{r.uom || '—'}</td></tr>)}
                                                    {demoPreviewRows.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={4}>Run preview to list source rows.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="border bg-white p-2 max-h-48 overflow-auto">
                                            <div className="text-[10px] font-black uppercase mb-1">Demo Migration Job Logs</div>
                                            <table className="w-full text-[10px]">
                                                <thead className="bg-gray-100 uppercase font-black"><tr><th className="p-1 text-left">Job</th><th className="p-1 text-left">Org</th><th className="p-1 text-right">Inserted</th><th className="p-1 text-right">Skipped</th><th className="p-1 text-left">Status</th></tr></thead>
                                                <tbody>
                                                    {demoMigrationJobs.map(j => <tr key={j.job_id} className="border-t"><td className="p-1">{j.job_id}</td><td className="p-1">{j.target_org_id}</td><td className="p-1 text-right">{j.inserted_count}</td><td className="p-1 text-right">{j.skipped_count}</td><td className="p-1">{j.status}</td></tr>)}
                                                    {demoMigrationJobs.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={5}>No demo job executed yet.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-bold uppercase">
                                        <select className="tally-input" value={rollbackJobId} onChange={e => setRollbackJobId(e.target.value)}>
                                            <option value="">Select Job ID for rollback</option>
                                            {demoMigrationJobs.map(j => <option key={j.job_id} value={j.job_id}>{j.job_id}</option>)}
                                        </select>
                                        <input className="tally-input" value={rollbackConfirmText} onChange={e => setRollbackConfirmText(e.target.value)} placeholder="Type: ROLLBACK DEMO-MAT-2026-00001" />
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
                                {renderVoucherSeriesInput('Regular Sales Invoices', 'invoiceConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Non-GST (Estimate) Bills', 'nonGstInvoiceConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Purchase Inward Bills', 'purchaseConfig', localConfigs, handleConfigChange)}
                                {renderVoucherSeriesInput('Purchase Orders', 'purchaseOrderConfig', localConfigs, handleConfigChange)}
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
                            <button onClick={() => { onUpdateConfigurations(localConfigs); addNotification('Accepted Changes.', 'success'); }} className="px-16 py-4 tally-button-primary shadow-2xl uppercase text-[11px] font-black tracking-[0.3em] active:scale-95">Accept (Enter)</button>
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

function renderVoucherSeriesInput(label: string, key: keyof AppConfigurations, configs: any, onChange: any) {
    const cfg = configs[key] || { prefix: '', startingNumber: 1, paddingLength: 6, useFiscalYear: false };
    return (
        <div className="p-4 border border-gray-200 bg-gray-50 mb-4">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-3">{label}</h3>
            <div className="grid grid-cols-4 gap-4">
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Prefix</label><input type="text" value={cfg.prefix} onChange={e => onChange(key, 'prefix', e.target.value)} className="w-full tally-input uppercase"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Start #</label><input type="number" value={cfg.startingNumber} onChange={e => onChange(key, 'startingNumber', parseInt(e.target.value))} className="w-full tally-input"/></div>
                <div><label className="text-[9px] font-black text-gray-400 uppercase">Padding</label><input type="number" value={cfg.paddingLength} onChange={e => onChange(key, 'paddingLength', parseInt(e.target.value))} className="w-full tally-input"/></div>
                <div className="pt-4"><Toggle label="Fiscal Yr" enabled={cfg.useFiscalYear} setEnabled={v => onChange(key, 'useFiscalYear', v)} /></div>
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

export default ConfigurationPage;
