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
import { supabase } from './services/supabaseClient';
import { normalizeStockHandlingConfig } from './utils/stockHandling';

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
type MigrationStatus = 'Pending' | 'Processing' | 'Completed' | 'Cancelled' | 'Failed';
type MigrationType = 'master' | 'inventory' | 'suppliers' | 'customers' | 'nomenclature' | 'sales' | 'purchases';
type RowErrorEntry = { rowNumber: number; itemName: string; reason: string; rawValue: string; suggestedFix: string; };
type MigrationRunLogRow = {
    timestamp: string;
    organization: string;
    user: string;
    migrationType: string;
    fileName: string;
    found: number;
    imported: number;
    skipped: number;
    updated: number;
    failed: number;
    status: MigrationStatus;
};
type MigrationProgressState = {
    migrationType: string;
    fileName: string;
    startedAt: string;
    startedBy: string;
    organization: string;
    status: MigrationStatus;
    totalRows: number;
    processedRows: number;
    importedRows: number;
    updatedRows: number;
    skippedRows: number;
    failedRows: number;
    currentActivity: string;
    logs: string[];
    reason?: string;
    errorRows: RowErrorEntry[];
    cancellationRequested: boolean;
};

type MigrationDemoMaterial = {
    id: string;
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
    job_type: 'DEMO_MATERIAL_MASTER';
    source_table: 'material_master_all';
    target_table: 'material_master';
    target_org_id: string;
    created_by: string;
    created_at: string;
    total_count: number;
    inserted_count: number;
    skipped_count: number;
    failed_count: number;
    status: 'COMPLETED' | 'ROLLED_BACK';
    row_mappings: Array<{ source_row_id: string; target_material_id?: string; action: DemoMigrationAction }>;
    inserted_rows: string[];
};

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
    const [importFileName, setImportFileName] = useState('');
    const [previewData, setPreviewData] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [migrationProgress, setMigrationProgress] = useState<MigrationProgressState | null>(null);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [migrationRunLog, setMigrationRunLog] = useState<MigrationRunLogRow[]>([]);
    const cancelRequestedRef = useRef(false);

    const [demoTargetOrg, setDemoTargetOrg] = useState(currentUser?.organization_id || 'MDXERA');
    const [demoPreviewRows, setDemoPreviewRows] = useState<MigrationDemoMaterial[]>([]);
    const [demoMigrationJobs, setDemoMigrationJobs] = useState<DemoMigrationJob[]>([]);
    const [rollbackJobId, setRollbackJobId] = useState('');
    const [rollbackConfirmText, setRollbackConfirmText] = useState('');

    const duplicateMatcher = (row: MigrationDemoMaterial, mat: Medicine) => {
        const nameA = (row.material_name || '').trim().toLowerCase();
        const nameB = (mat.name || '').trim().toLowerCase();
        const packA = (row.pack || '').trim().toLowerCase();
        const packB = (mat.pack || '').trim().toLowerCase();
        const hsnA = (row.hsn || '').trim().toLowerCase();
        const hsnB = (mat.hsnCode || '').trim().toLowerCase();
        return nameA === nameB && packA === packB && hsnA === hsnB;
    };

    const scopedTargetMaterials = useMemo(() => medicines.filter(m => m.organization_id === demoTargetOrg), [medicines, demoTargetOrg]);
    const duplicateCount = useMemo(() => demoPreviewRows.filter(row => scopedTargetMaterials.some(mat => duplicateMatcher(row, mat))).length, [demoPreviewRows, scopedTargetMaterials]);
    const itemsToImport = demoPreviewRows.length - duplicateCount;
    const orgOptions = useMemo(() => Array.from(new Set([currentUser?.organization_id || 'MDXERA', ...medicines.map(m => m.organization_id).filter(Boolean)])), [currentUser?.organization_id, medicines]);

    const makeDemoJobId = () => `DEMO-MAT-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

    const mapDemoToMedicine = (sourceRow: MigrationDemoMaterial, jobId: string): Medicine => ({
        id: crypto.randomUUID(),
        organization_id: demoTargetOrg,
        user_id: currentUser?.user_id,
        name: sourceRow.material_name,
        materialCode: sourceRow.item_code || sourceRow.sku || sourceRow.id,
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

    const previewDemoMigration = async () => {
        const { data, error } = await supabase
            .from('material_master_all')
            .select('id, material_name, item_code, sku, barcode, pack, uom, hsn, gst_rate, category, manufacturer, mrp, purchase_rate, sale_rate')
            .order('material_name', { ascending: true });

        if (error) {
            addNotification(`Failed to load demo data: ${error.message}`, 'error');
            return;
        }

        const rows = (data || []) as MigrationDemoMaterial[];
        setDemoPreviewRows(rows);
        addNotification(`Preview ready: ${rows.length} rows loaded from material_master_all.`, 'success');
    };

    const importDemoMigration = () => {
        const rows = demoPreviewRows;
        if (rows.length === 0) {
            addNotification('Run Preview first to load source data from material_master_all.', 'warning');
            return;
        }

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
            job_type: 'DEMO_MATERIAL_MASTER',
            source_table: 'material_master_all',
            target_table: 'material_master',
            target_org_id: demoTargetOrg,
            created_by: currentUser?.full_name || 'System',
            created_at: new Date().toISOString(),
            total_count: rows.length,
            inserted_count: mappedRows.length,
            skipped_count: rowMappings.filter(r => r.action === 'skipped').length,
            failed_count: 0,
            status: 'COMPLETED',
            row_mappings: rowMappings,
            inserted_rows: mappedRows.map(m => m.id)
        };
        setDemoMigrationJobs(prev => [job, ...prev]);
        addNotification(`Migration complete. Total ${job.total_count} | Inserted ${job.inserted_count} | Skipped ${job.skipped_count} | Failed ${job.failed_count}.`, 'success');
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

    useEffect(() => { if (configurations) setLocalConfigs(normalizeStockHandlingConfig(configurations)); }, [configurations]);

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

            if (section === 'displayOptions') {
                const isStrictStock = field === 'strictStock';
                const isEnableNegativeStock = field === 'enableNegativeStock';
                if (isStrictStock) updatedSectionData.enableNegativeStock = !value;
                if (isEnableNegativeStock) updatedSectionData.strictStock = !value;
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
        if (migrationProgress?.status === 'Processing') {
            addNotification('Another migration is already in progress. Please wait until it completes or cancel the running migration.', 'warning');
            e.target.value = '';
            return;
        }
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFileName(file.name);
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

    const startMigration = async (type: MigrationType, rows: any[], commitChunk: (chunk: any[]) => void) => {
        if (migrationProgress?.status === 'Processing') {
            addNotification('Another migration is already in progress. Please wait until it completes or cancel the running migration.', 'warning');
            return;
        }
        cancelRequestedRef.current = false;
        const startedAt = new Date().toISOString();
        const base: MigrationProgressState = {
            migrationType: type === 'master' ? 'Material Master' :
                type === 'inventory' ? 'Inventory (Stock)' :
                type === 'suppliers' ? 'Supplier Master' :
                type === 'customers' ? 'Customer Master' :
                type === 'nomenclature' ? 'Vendor Sync' :
                type === 'sales' ? 'Sales Import' : 'Purchase Import',
            fileName: importFileName || `${type}.csv`,
            startedAt,
            startedBy: currentUser?.full_name || 'System',
            organization: currentUser?.organization_id || 'MDXERA',
            status: 'Processing',
            totalRows: rows.length,
            processedRows: 0,
            importedRows: 0,
            updatedRows: 0,
            skippedRows: 0,
            failedRows: 0,
            currentActivity: 'Reading file...',
            logs: ['Reading file...'],
            errorRows: [],
            cancellationRequested: false
        };
        setMigrationProgress(base);

        const pushLog = (message: string) => {
            setMigrationProgress(prev => prev ? {
                ...prev,
                currentActivity: message,
                logs: [...prev.logs.slice(-5), message]
            } : prev);
        };

        const chunkSize = 100;
        try {
            for (let i = 0; i < rows.length; i += chunkSize) {
                if (cancelRequestedRef.current) break;
                const chunk = rows.slice(i, i + chunkSize);
                const lastRow = Math.min(i + chunk.length, rows.length);
                pushLog(`Saving row ${lastRow} of ${rows.length}...`);
                let committableRows = chunk;
                let skipped = 0;
                let failed = 0;
                let updated = 0;
                const rowErrors: RowErrorEntry[] = [];

                if (type === 'nomenclature') {
                    const mapped = chunk.map((d: any, idx: number) => {
                        const dist = distributors.find((s: any) => fuzzyMatch(s.name, d.supplier_id));
                        const med = medicines.find((m: any) => fuzzyMatch(m.name, d.master_medicine_id));
                        if (!dist || !med) {
                            rowErrors.push({
                                rowNumber: i + idx + 1,
                                itemName: d?.supplier_product_name || 'Unknown item',
                                reason: !dist ? 'Supplier not matched' : 'Material not matched',
                                rawValue: !dist ? String(d?.supplier_id ?? '') : String(d?.master_medicine_id ?? ''),
                                suggestedFix: !dist ? 'Use a valid Supplier Master name/ID.' : 'Use a valid Material Master name/ID.'
                            });
                            return null;
                        }
                        const existing = (mappings || []).find((em: any) =>
                            em.supplier_id === dist.id &&
                            em.supplier_product_name.toLowerCase().trim() === d.supplier_product_name.toLowerCase().trim()
                        );
                        if (existing) {
                            updated += 1;
                        }
                        return { ...d, supplier_id: dist.id, master_medicine_id: med.id, id: existing ? existing.id : crypto.randomUUID() } as SupplierProductMap;
                    }).filter(Boolean);
                    failed = rowErrors.length;
                    committableRows = mapped;
                }

                if (committableRows.length > 0) commitChunk(committableRows);
                skipped += 0;
                await new Promise(resolve => setTimeout(resolve, 120));
                setMigrationProgress(prev => prev ? ({
                    ...prev,
                    processedRows: prev.processedRows + chunk.length,
                    importedRows: prev.importedRows + (committableRows.length - updated),
                    updatedRows: prev.updatedRows + updated,
                    skippedRows: prev.skippedRows + skipped,
                    failedRows: prev.failedRows + failed,
                    errorRows: [...prev.errorRows, ...rowErrors]
                }) : prev);
            }

            setMigrationProgress(prev => {
                if (!prev) return prev;
                const cancelled = cancelRequestedRef.current;
                const status: MigrationStatus = cancelled ? 'Cancelled' : 'Completed';
                const reason = cancelled ? 'Migration cancelled by user.' : undefined;
                setMigrationRunLog(logs => [{
                    timestamp: new Date().toISOString(),
                    organization: prev.organization,
                    user: prev.startedBy,
                    migrationType: prev.migrationType,
                    fileName: prev.fileName,
                    found: prev.totalRows,
                    imported: prev.importedRows,
                    skipped: prev.skippedRows,
                    updated: prev.updatedRows,
                    failed: prev.failedRows,
                    status
                }, ...logs]);
                return {
                    ...prev,
                    status,
                    reason,
                    cancellationRequested: cancelled,
                    currentActivity: cancelled ? 'Migration cancelled by user.' : 'Migration completed successfully.'
                };
            });
            if (cancelRequestedRef.current) {
                addNotification('Migration cancelled by user.', 'warning');
            } else {
                addNotification('Migration completed successfully.', 'success');
            }
        } catch (error: any) {
            setMigrationProgress(prev => {
                if (!prev) return prev;
                const message = error?.message || 'Server exception';
                setMigrationRunLog(logs => [{
                    timestamp: new Date().toISOString(),
                    organization: prev.organization,
                    user: prev.startedBy,
                    migrationType: prev.migrationType,
                    fileName: prev.fileName,
                    found: prev.totalRows,
                    imported: prev.importedRows,
                    skipped: prev.skippedRows,
                    updated: prev.updatedRows,
                    failed: prev.failedRows,
                    status: 'Failed'
                }, ...logs]);
                return { ...prev, status: 'Failed', reason: message, currentActivity: `Migration failed: ${message}` };
            });
            addNotification(`Migration failed: ${error?.message || 'Unknown error'}`, 'error');
        }
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
                <button disabled={migrationProgress?.status === 'Processing'} onClick={() => {
                    if (migrationProgress?.status === 'Processing') return addNotification('Data migration is currently running. Please wait until it completes or cancel the migration.', 'warning');
                    setImportType(type);
                    fileInputRef.current?.click();
                }} className="flex-1 py-2 text-[9px] font-black uppercase bg-primary text-white shadow-lg hover:bg-primary-dark tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed">Import</button>
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
                                className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase border-b border-gray-50 transition-colors ${activeSection === item.id ? 'bg-primary text-white shadow-[inset_4px_0_0_0_#ffcc00]' : 'text-gray-800 hover:bg-primary hover:text-white'}`}
                            >
                                <span className={`mr-3 ${activeSection === item.id ? 'opacity-100' : 'opacity-60'}`}>{item.icon}</span>{item.name}
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
                                            enabled={localConfigs.displayOptions?.strictStock ?? true}
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
                                    <h3 className="text-sm font-black uppercase tracking-widest">Default Migration – Material Master (Demo)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Target Organization</label>
                                            <select className="w-full tally-input" value={demoTargetOrg} onChange={e => setDemoTargetOrg(e.target.value)}>
                                                {orgOptions.map((org: string) => <option key={org} value={org}>{org}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase">Source Dataset</label>
                                            <div className="w-full tally-input bg-gray-50">material_master_all (migration/demo dataset)</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-black uppercase">
                                        <div>Total preview rows: {demoPreviewRows.length}</div>
                                        <div>Inserted candidate rows: {itemsToImport}</div>
                                        <div>Duplicates detected (org + name + pack + hsn): {duplicateCount}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={previewDemoMigration} className="px-3 py-2 border text-[10px] font-black uppercase">Preview</button>
                                        <button onClick={importDemoMigration} className="px-3 py-2 bg-green-700 text-white text-[10px] font-black uppercase">Default Migration – Material Master (Demo)</button>
                                        <button onClick={rollbackDemoMigration} className="px-3 py-2 bg-red-700 text-white text-[10px] font-black uppercase">Rollback (Undo Last Demo Import)</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="border bg-white p-2 max-h-48 overflow-auto">
                                            <div className="text-[10px] font-black uppercase mb-1">Preview Rows (sample)</div>
                                            <table className="w-full text-[10px]">
                                                <thead className="bg-gray-100 uppercase font-black"><tr><th className="p-1 text-left">Name</th><th className="p-1 text-left">Code</th><th className="p-1 text-left">Pack</th><th className="p-1 text-left">UOM</th></tr></thead>
                                                <tbody>
                                                    {demoPreviewRows.slice(0, 10).map(r => <tr key={r.id} className="border-t"><td className="p-1">{r.material_name}</td><td className="p-1">{r.item_code || r.sku}</td><td className="p-1">{r.pack || '—'}</td><td className="p-1">{r.uom || '—'}</td></tr>)}
                                                    {demoPreviewRows.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={4}>Run preview to fetch source rows from material_master_all.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="border bg-white p-2 max-h-48 overflow-auto">
                                            <div className="text-[10px] font-black uppercase mb-1">Demo Migration Job Logs</div>
                                            <table className="w-full text-[10px]">
                                                <thead className="bg-gray-100 uppercase font-black"><tr><th className="p-1 text-left">Job</th><th className="p-1 text-left">Org</th><th className="p-1 text-right">Total</th><th className="p-1 text-right">Inserted</th><th className="p-1 text-right">Skipped</th><th className="p-1 text-right">Failed</th><th className="p-1 text-left">Status</th></tr></thead>
                                                <tbody>
                                                    {demoMigrationJobs.map(j => <tr key={j.job_id} className="border-t"><td className="p-1">{j.job_id}</td><td className="p-1">{j.target_org_id}</td><td className="p-1 text-right">{j.total_count}</td><td className="p-1 text-right">{j.inserted_count}</td><td className="p-1 text-right">{j.skipped_count}</td><td className="p-1 text-right">{j.failed_count}</td><td className="p-1">{j.status}</td></tr>)}
                                                    {demoMigrationJobs.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={7}>No demo job executed yet.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="border bg-white p-2 max-h-48 overflow-auto">
                                        <div className="text-[10px] font-black uppercase mb-1">Migration Run Log</div>
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-gray-100 uppercase font-black">
                                                <tr><th className="p-1 text-left">Time</th><th className="p-1 text-left">Type</th><th className="p-1 text-left">File</th><th className="p-1 text-right">Found</th><th className="p-1 text-right">Imported</th><th className="p-1 text-right">Updated</th><th className="p-1 text-right">Skipped</th><th className="p-1 text-right">Failed</th><th className="p-1 text-left">Status</th></tr>
                                            </thead>
                                            <tbody>
                                                {migrationRunLog.map((j, idx) => <tr key={`${j.timestamp}-${idx}`} className="border-t"><td className="p-1">{new Date(j.timestamp).toLocaleString()}</td><td className="p-1">{j.migrationType}</td><td className="p-1">{j.fileName}</td><td className="p-1 text-right">{j.found}</td><td className="p-1 text-right">{j.imported}</td><td className="p-1 text-right">{j.updated}</td><td className="p-1 text-right">{j.skipped}</td><td className="p-1 text-right">{j.failed}</td><td className="p-1">{j.status}</td></tr>)}
                                                {migrationRunLog.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={9}>No migration run yet.</td></tr>}
                                            </tbody>
                                        </table>
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
                            <button disabled={migrationProgress?.status === 'Processing'} onClick={() => { onUpdateConfigurations(localConfigs); addNotification('Accepted Changes.', 'success'); }} className="px-16 py-4 tally-button-primary shadow-2xl uppercase text-[11px] font-black tracking-[0.3em] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">Accept (Enter)</button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Import Previews */}
            {importType === 'inventory' && previewData.length > 0 && <ImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={() => { startMigration('inventory', previewData, (chunk) => onBulkAddInventory(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} />}
            {importType === 'suppliers' && previewData.length > 0 && <DistributorImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('suppliers', d, (chunk) => onBulkAddDistributors(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} />}
            {importType === 'customers' && previewData.length > 0 && <CustomerImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('customers', d, (chunk) => onBulkAddCustomers(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} />}
            {importType === 'purchases' && previewData.length > 0 && <PurchaseBillImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('purchases', d, (chunk) => onBulkAddPurchases(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} inventory={inventory} distributors={distributors} />}
            {importType === 'sales' && previewData.length > 0 && <SalesBillImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('sales', d, (chunk) => onBulkAddSales(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} inventory={inventory} customers={customers} />}
            {importType === 'master' && previewData.length > 0 && <MedicineMasterImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('master', d, (chunk) => onBulkAddMedicines(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} />}
            {importType === 'nomenclature' && previewData.length > 0 && <MappingImportPreviewModal isOpen={!!importType} onClose={() => { setImportType(null); setPreviewData([]); }} onSave={(d: any) => { startMigration('nomenclature', d, (chunk) => onBulkAddMappings(chunk)); setImportType(null); setPreviewData([]); }} data={previewData} distributors={distributors} medicines={medicines} mappings={mappings} />}

            {migrationProgress && (
                <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4" onKeyDown={(e) => { if (migrationProgress.status === 'Processing' && e.key === 'Escape') e.preventDefault(); }}>
                    <div className="w-full max-w-5xl bg-white border-4 border-primary shadow-2xl">
                        <div className="bg-primary text-white px-4 py-3 font-black uppercase tracking-widest text-sm">Data Migration In Progress</div>
                        <div className="p-4 space-y-3 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 uppercase font-bold">
                                <div>Migration Type: <span className="text-gray-700">{migrationProgress.migrationType}</span></div>
                                <div>File Name: <span className="text-gray-700">{migrationProgress.fileName}</span></div>
                                <div>Started At: <span className="text-gray-700">{new Date(migrationProgress.startedAt).toLocaleString()}</span></div>
                                <div>Started By: <span className="text-gray-700">{migrationProgress.startedBy}</span></div>
                                <div>Organization: <span className="text-gray-700">{migrationProgress.organization}</span></div>
                                <div>Status: <span className={`${migrationProgress.status === 'Processing' ? 'text-blue-700' : migrationProgress.status === 'Completed' ? 'text-green-700' : migrationProgress.status === 'Cancelled' ? 'text-orange-600' : 'text-red-700'}`}>{migrationProgress.status}</span></div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 uppercase font-bold">
                                <div>Total Rows Found: {migrationProgress.totalRows}</div><div>Processed Rows: {migrationProgress.processedRows}</div><div>Imported Rows: {migrationProgress.importedRows}</div><div>Updated Rows: {migrationProgress.updatedRows}</div><div>Skipped Rows: {migrationProgress.skippedRows}</div><div>Failed Rows: {migrationProgress.failedRows}</div><div>Remaining Rows: {Math.max(migrationProgress.totalRows - migrationProgress.processedRows, 0)}</div>
                                <div>{migrationProgress.totalRows > 0 ? Math.round((migrationProgress.processedRows / migrationProgress.totalRows) * 100) : 0}% Completed</div>
                            </div>
                            <div className="h-4 bg-gray-200 border border-gray-300">
                                <div className="h-full bg-primary transition-all" style={{ width: `${migrationProgress.totalRows > 0 ? (migrationProgress.processedRows / migrationProgress.totalRows) * 100 : 0}%` }} />
                            </div>
                            <div className="uppercase font-bold text-primary">Current Activity: {migrationProgress.currentActivity}</div>
                            <div className="border p-2 bg-gray-50 max-h-32 overflow-auto text-[11px]">
                                {migrationProgress.logs.map((line, idx) => <div key={`${line}-${idx}`}>• {line}</div>)}
                            </div>
                            {migrationProgress.reason && <div className="text-red-700 font-bold uppercase">Reason: {migrationProgress.reason}</div>}
                            {migrationProgress.errorRows.length > 0 && (
                                <div className="border p-2">
                                    <div className="font-black uppercase mb-2">Row-Level Error Report</div>
                                    <div className="max-h-36 overflow-auto">
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-gray-100 font-black uppercase"><tr><th className="p-1 text-left">Row</th><th className="p-1 text-left">Item</th><th className="p-1 text-left">Reason</th><th className="p-1 text-left">Raw</th><th className="p-1 text-left">Suggested Fix</th></tr></thead>
                                            <tbody>{migrationProgress.errorRows.map((er, idx) => <tr key={`${er.rowNumber}-${idx}`} className="border-t"><td className="p-1">{er.rowNumber}</td><td className="p-1">{er.itemName}</td><td className="p-1">{er.reason}</td><td className="p-1">{er.rawValue}</td><td className="p-1">{er.suggestedFix}</td></tr>)}</tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            <div className="p-2 bg-gray-100 font-bold uppercase">Data migration is currently running. Please wait until it completes or cancel the migration.</div>
                            <div className="flex justify-end gap-2">
                                {migrationProgress.status === 'Processing' ? (
                                    <button onClick={() => setShowCancelConfirm(true)} className="px-4 py-2 bg-red-700 text-white font-black uppercase text-[11px]">Cancel Migration</button>
                                ) : (
                                    <>
                                        <button onClick={() => setMigrationProgress(null)} className="px-4 py-2 border font-black uppercase text-[11px]">Close</button>
                                        <button onClick={() => setMigrationRunLog(prev => [...prev])} className="px-4 py-2 bg-primary text-white font-black uppercase text-[11px]">Refresh Migration Run Log</button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    {showCancelConfirm && (
                        <div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center">
                            <div className="bg-white border-2 border-primary p-4 w-full max-w-md">
                                <div className="font-black uppercase mb-2">Do you want to cancel this migration?</div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setShowCancelConfirm(false)} className="px-4 py-2 border text-xs font-black uppercase">No</button>
                                    <button onClick={() => { cancelRequestedRef.current = true; setShowCancelConfirm(false); }} className="px-4 py-2 bg-red-700 text-white text-xs font-black uppercase">Yes</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
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
            <button onClick={() => onSave(data)} className="px-6 py-2 bg-primary text-white font-black uppercase text-xs">Import Rules</button>
        </div>
    </Modal>
);

export default ConfigurationPage;
