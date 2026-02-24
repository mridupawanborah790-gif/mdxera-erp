
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from '../components/Card';
import { Transaction, Purchase, RegisteredPharmacy, Customer, AppConfigurations } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';
import Modal from '../components/Modal';
import { getAiInsights } from '../services/geminiService';
import { categorizeSalesForAnx1 } from '../utils/gstUtils';

// SheetJS is global from index.html
declare const XLSX: any;

interface GstCenterProps {
    transactions: Transaction[];
    purchases: Purchase[];
    customers: Customer[];
    currentUser: RegisteredPharmacy | null;
    configurations: AppConfigurations;
    onUpdateConfigurations: (configs: AppConfigurations) => Promise<void>;
}

interface GstReconRow {
    invoiceId: string;
    partyName: string;
    gstin: string;
    date: string;
    registerValue: number;
    returnValue: number;
    difference: number;
    status: 'matched' | 'mismatch' | 'missing_in_return' | 'missing_in_register';
    taxType: string;
    anxTable: string;
}

const GstCenter: React.FC<GstCenterProps> = ({ transactions, purchases, customers, currentUser, configurations, onUpdateConfigurations }) => {
    const [activeTab, setActiveTab] = useState<'summary' | 'anx1' | 'anx2' | 'recon' | 'profile'>('summary');
    const [reconTab, setReconTab] = useState<'sales' | 'purchase'>('sales');
    const [isExporting, setIsExporting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiInsights, setAiInsights] = useState<string[]>([]);
    
    // Periodicity State - Safe guards against undefined configurations
    const [periodicity, setPeriodicity] = useState(configurations?.gstSettings?.periodicity || 'monthly');
    const [returnType, setReturnType] = useState(configurations?.gstSettings?.returnType || 'Quarterly (Normal)');

    // Sync local state if configurations change externally
    useEffect(() => {
        if (configurations?.gstSettings) {
            setPeriodicity(configurations.gstSettings.periodicity);
            setReturnType(configurations.gstSettings.returnType);
        }
    }, [configurations]);

    // Uploaded Data States (Reference Data)
    const [anx1RefData, setAnx1RefData] = useState<any[]>([]);
    const [anx2RefData, setAnx2RefData] = useState<any[]>([]);

    // --- RECONCILIATION LOGIC ---

    const salesRecon = useMemo(() => {
        const results: GstReconRow[] = [];
        const returnMap = new Map(anx1RefData.map(r => [String(r.invoiceId).toLowerCase(), r]));

        transactions.forEach(tx => {
            if (tx.status === 'cancelled') return;
            const retMatch: any = returnMap.get(tx.id.toLowerCase());
            const table = categorizeSalesForAnx1(tx, customers);

            if (retMatch) {
                const diff = tx.total - (retMatch.total || 0);
                results.push({
                    invoiceId: tx.id,
                    partyName: tx.customerName,
                    gstin: customers.find(c => c.id === tx.customerId)?.gstNumber || '-',
                    date: tx.date.split('T')[0],
                    registerValue: tx.total,
                    returnValue: retMatch.total || 0,
                    difference: diff,
                    status: Math.abs(diff) < 1 ? 'matched' : 'mismatch',
                    taxType: tx.billType === 'regular' ? 'GST' : 'Exempt',
                    anxTable: table
                });
                returnMap.delete(tx.id.toLowerCase());
            } else {
                results.push({
                    invoiceId: tx.id,
                    partyName: tx.customerName,
                    gstin: customers.find(c => c.id === tx.customerId)?.gstNumber || '-',
                    date: tx.date.split('T')[0],
                    registerValue: tx.total,
                    returnValue: 0,
                    difference: tx.total,
                    status: 'missing_in_return',
                    taxType: tx.billType === 'regular' ? 'GST' : 'Exempt',
                    anxTable: table
                });
            }
        });

        returnMap.forEach((ret: any) => {
            results.push({
                invoiceId: ret.invoiceId,
                partyName: ret.customerName || 'Unknown',
                gstin: ret.gstin || '',
                date: ret.date || '',
                registerValue: 0,
                returnValue: ret.total || 0,
                difference: -(ret.total || 0),
                status: 'missing_in_register',
                taxType: 'GST',
                anxTable: 'Unknown'
            });
        });

        return results;
    }, [transactions, anx1RefData, customers]);

    const purchaseRecon = useMemo(() => {
        const results: GstReconRow[] = [];
        const returnMap = new Map(anx2RefData.map(r => [String(r.invoiceNumber).toLowerCase(), r]));

        purchases.forEach(p => {
            if (p.status === 'cancelled') return;
            const retMatch: any = returnMap.get(p.invoiceNumber.toLowerCase());
            if (retMatch) {
                const diff = p.totalAmount - (retMatch.total || 0);
                results.push({
                    invoiceId: p.invoiceNumber,
                    partyName: p.supplier,
                    gstin: '-',
                    date: p.date,
                    registerValue: p.totalAmount,
                    returnValue: retMatch.total || 0,
                    difference: diff,
                    status: Math.abs(diff) < 1 ? 'matched' : 'mismatch',
                    taxType: 'ITC',
                    anxTable: '3A'
                });
                returnMap.delete(p.invoiceNumber.toLowerCase());
            } else {
                results.push({
                    invoiceId: p.invoiceNumber,
                    partyName: p.supplier,
                    gstin: '-',
                    date: p.date,
                    registerValue: p.totalAmount,
                    returnValue: 0,
                    difference: p.totalAmount,
                    status: 'missing_in_return',
                    taxType: 'ITC',
                    anxTable: '3A'
                });
            }
        });

        returnMap.forEach((ret: any) => {
            results.push({
                invoiceId: ret.invoiceNumber,
                partyName: ret.supplier || 'Unknown',
                gstin: ret.gstin || '',
                date: ret.date || '',
                registerValue: 0,
                returnValue: ret.total || 0,
                difference: -(ret.total || 0),
                status: 'missing_in_register',
                taxType: 'ITC',
                anxTable: 'Unknown'
            });
        });

        return results;
    }, [purchases, anx2RefData]);

    // --- AI COMPLIANCE AUDIT ---
    const runAiAudit = async () => {
        setIsAnalyzing(true);
        try {
            const summary = {
                salesMismatches: salesRecon.filter(r => r.status !== 'matched').length,
                purchaseMismatches: purchaseRecon.filter(r => r.status !== 'matched').length,
                missingInReturn: salesRecon.filter(r => r.status === 'missing_in_return').length,
                missingInErp: purchaseRecon.filter(r => r.status === 'missing_in_register').length,
                totalLiability: transactions.reduce((s, t) => s + (t.status === 'completed' ? t.totalGst : 0), 0),
                itcClaimed: purchases.reduce((s, p) => s + (p.status === 'completed' ? p.totalGst : 0), 0)
            };

            const prompt = `Act as a statutory GST Auditor for a medical pharmacy.
            Data Snapshot: ${JSON.stringify(summary)}.
            Return periodicity: ${periodicity}.
            Return type: ${returnType}.
            Provide 3 professional statutory compliance tips to avoid penalties. Return as JSON array of strings.`;

            const insights = await getAiInsights({ prompt, periodicity, returnType, summary });
            setAiInsights(insights);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // --- EXPORT TO MULTI-SHEET EXCEL ---
    const handleExportExcel = () => {
        setIsExporting(true);
        try {
            const wb = XLSX.utils.book_new();

            // 1. Summary Sheet
            const summaryData = [
                ['MDXERA ERP - STATUTORY GST COMPLIANCE REPORT'],
                ['Pharmacy', currentUser?.pharmacy_name],
                ['GSTIN', currentUser?.gstin],
                ['Periodicity', periodicity.toUpperCase()],
                ['Type', returnType],
                [],
                ['Form', 'Records', 'Register Total', 'Govt Portal Total', 'Variance'],
                ['ANX-1 (Sales)', salesRecon.length, salesRecon.reduce((s, r) => s + r.registerValue, 0), salesRecon.reduce((s, r) => s + r.returnValue, 0), salesRecon.reduce((s, r) => s + r.difference, 0)],
                ['ANX-2 (Purchase)', purchaseRecon.length, purchaseRecon.reduce((s, r) => s + r.registerValue, 0), purchaseRecon.reduce((s, r) => s + r.returnValue, 0), purchaseRecon.reduce((s, r) => s + r.difference, 0)],
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

            // 2. Sales ANX-1 Grid
            const salesData = salesRecon.map(r => ({
                'ANX Table': r.anxTable,
                'Invoice ID': r.invoiceId,
                'Date': r.date,
                'Customer': r.partyName,
                'GSTIN/UIN': r.gstin,
                'Value (ERP)': r.registerValue,
                'Value (Portal)': r.returnValue,
                'Difference': r.difference,
                'Status': r.status.replace(/_/g, ' ').toUpperCase()
            }));
            const wsSales = XLSX.utils.json_to_sheet(salesData);
            XLSX.utils.book_append_sheet(wb, wsSales, 'FORM GST ANX-1');

            // 3. Purchase ANX-2 Grid
            const purData = purchaseRecon.map(r => ({
                'Invoice #': r.invoiceId,
                'Date': r.date,
                'Supplier': r.partyName,
                'GSTIN': r.gstin,
                'Value (ERP)': r.registerValue,
                'Value (Portal)': r.returnValue,
                'Difference': r.difference,
                'Status': r.status.replace(/_/g, ' ').toUpperCase()
            }));
            const wsPur = XLSX.utils.json_to_sheet(purData);
            XLSX.utils.book_append_sheet(wb, wsPur, 'FORM GST ANX-2');

            XLSX.writeFile(wb, `GST_Statutory_Recon_${new Date().toISOString().split('T')[0]}.xlsx`);
            addNotification("Statutory Excel workbook generated.", "success");
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSaveProfile = async () => {
        const updated = {
            ...configurations,
            gstSettings: { periodicity, returnType }
        };
        await onUpdateConfigurations(updated);
        addNotification("GST periodicity profile updated.", "success");
        setActiveTab('summary');
    };

    const loadMockData = () => {
        setAnx1RefData(transactions.slice(0, -1).map(t => ({ invoiceId: t.id, total: t.total })));
        setAnx2RefData(purchases.map((p, i) => ({ 
            invoiceNumber: p.invoiceNumber, 
            total: i === 0 ? p.totalAmount + 500 : p.totalAmount // Insert 1 mismatch
        })));
        addNotification("Statutory reference data loaded for matching.", "success");
    };

    const addNotification = (msg: string, type: any) => {
        window.dispatchEvent(new CustomEvent('add-notification', { detail: { message: msg, type } }));
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Statutory Module: FORM GST RET-1 ({returnType})</span>
                <div className="flex gap-4">
                    <button onClick={handleExportExcel} disabled={isExporting} className="text-[10px] font-black uppercase text-accent hover:underline flex items-center gap-1">
                        {isExporting ? <span className="animate-spin">⌛</span> : '⬇'} Export Statutory Sheets
                    </button>
                    <button onClick={runAiAudit} disabled={isAnalyzing} className="text-[10px] font-black uppercase text-white bg-white/10 px-2 rounded hover:bg-white/20 transition-all">
                        {isAnalyzing ? 'Auditing...' : 'AI Statutory Auditor'}
                    </button>
                </div>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                {/* AI Compliance Ticker */}
                {aiInsights.length > 0 && (
                    <div className="bg-[#004242] p-4 tally-border !rounded-none shadow-xl border-l-8 border-accent">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                            <span className="text-[10px] font-black text-accent uppercase tracking-widest">MDXERA Statutory Alerts</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {aiInsights.map((insight, i) => (
                                <div key={i} className="text-[11px] font-bold text-white/90 italic leading-snug border-l border-white/20 pl-3">
                                    "{insight}"
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center px-2">
                    <div className="flex bg-white p-1 tally-border shadow-sm">
                        <button onClick={() => setActiveTab('summary')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'summary' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}>Summary</button>
                        <button onClick={() => setActiveTab('anx1')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'anx1' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}>ANX-1 (Out)</button>
                        <button onClick={() => setActiveTab('anx2')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'anx2' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}>ANX-2 (In)</button>
                        <button onClick={() => setActiveTab('recon')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'recon' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}>Reconciliation</button>
                        <button onClick={() => setActiveTab('profile')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}>Periodicity</button>
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={loadMockData} className="px-4 py-2 bg-gray-100 border border-gray-400 text-[10px] font-black uppercase tracking-tighter hover:bg-gray-200">Sync Portal Data</button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            <StatCard label="Total Output Liability (ANX-1)" value={transactions.reduce((s, t) => s + (t.status === 'completed' ? t.totalGst : 0), 0)} color="border-primary" />
                            <StatCard label="ITC Eligible (ANX-2)" value={purchases.reduce((s, p) => s + (p.status === 'completed' ? p.totalGst : 0), 0)} color="border-emerald-600" />
                            <StatCard label="Net Tax Payable" value={transactions.reduce((s, t) => s + (t.status === 'completed' ? t.totalGst : 0), 0) - purchases.reduce((s, p) => s + (p.status === 'completed' ? p.totalGst : 0), 0)} color="border-red-600" />
                            
                            <Card className="md:col-span-3 p-0 tally-border !rounded-none overflow-hidden bg-white">
                                <div className="bg-gray-100 p-3 border-b border-gray-300 font-black text-[10px] uppercase tracking-widest text-gray-500">Document Matching Status</div>
                                <div className="p-12 flex justify-around">
                                    <ProgressCircle label="ANX-1 Sales Recon" total={salesRecon.length} matched={salesRecon.filter(r => r.status === 'matched').length} />
                                    <div className="w-px bg-gray-200"></div>
                                    <ProgressCircle label="ANX-2 Purchase Recon" total={purchaseRecon.length} matched={purchaseRecon.filter(r => r.status === 'matched').length} />
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'anx1' && <Anx1Grid transactions={transactions} customers={customers} />}
                    {activeTab === 'anx2' && <Anx2Grid purchases={purchases} />}

                    {activeTab === 'recon' && (
                        <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden bg-white shadow-xl">
                            <div className="p-2 border-b border-gray-400 bg-gray-50 flex gap-2">
                                <button onClick={() => setReconTab('sales')} className={`px-6 py-1.5 text-[9px] font-black uppercase border-b-4 transition-all ${reconTab === 'sales' ? 'border-primary text-primary' : 'border-transparent text-gray-400'}`}>Sales vs ANX-1</button>
                                <button onClick={() => setReconTab('purchase')} className={`px-6 py-1.5 text-[9px] font-black uppercase border-b-4 transition-all ${reconTab === 'purchase' ? 'border-primary text-primary' : 'border-transparent text-gray-400'}`}>Purchase vs ANX-2</button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full border-collapse">
                                    <thead className="bg-[#f1f1f1] sticky top-0 z-10 border-b border-gray-400 shadow-sm">
                                        <tr className="text-[10px] font-black uppercase text-gray-600 h-10">
                                            <th className="p-2 border-r border-gray-400 text-left w-12">SN.</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Document ID</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Party Name</th>
                                            <th className="p-2 border-r border-gray-400 text-right w-32">Value (ERP)</th>
                                            <th className="p-2 border-r border-gray-400 text-right w-32">Value (Portal)</th>
                                            <th className="p-2 border-r border-gray-400 text-right w-24">Diff.</th>
                                            <th className="p-2 text-center w-32">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(reconTab === 'sales' ? salesRecon : purchaseRecon).map((row, idx) => (
                                            <tr key={idx} className="hover:bg-accent transition-colors h-12">
                                                <td className="p-2 border-r border-gray-200 text-center text-gray-400 font-bold">{idx + 1}</td>
                                                <td className="p-2 border-r border-gray-200 font-mono font-bold text-primary uppercase">{row.invoiceId}</td>
                                                <td className="p-2 border-r border-gray-200 font-black uppercase truncate max-w-[200px]">{row.partyName}</td>
                                                <td className="p-2 border-r border-gray-200 text-right font-black">₹{row.registerValue.toFixed(2)}</td>
                                                <td className="p-2 border-r border-gray-200 text-right font-black">₹{row.returnValue.toFixed(2)}</td>
                                                <td className={`p-2 border-r border-gray-200 text-right font-black ${row.difference !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                    {row.difference !== 0 ? `₹${row.difference.toFixed(2)}` : '0.00'}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <StatusBadge status={row.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'profile' && (
                        <Card className="max-w-2xl mx-auto p-12 tally-border !rounded-none bg-white shadow-2xl mt-10">
                            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-8 border-b-2 border-primary pb-2">Profile Updation: Periodicity</h2>
                            <div className="space-y-10">
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">1. Was your aggregate turnover in preceding financial year up to Rs 5.00 Cr?</p>
                                    <div className="flex gap-8">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="radio" name="turnover" defaultChecked className="w-5 h-5 text-primary" />
                                            <span className="text-base font-black uppercase group-hover:text-primary transition-colors">Yes</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="radio" name="turnover" className="w-5 h-5 text-primary" />
                                            <span className="text-base font-black uppercase group-hover:text-primary transition-colors">No</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">2. Choose return periodicity:</p>
                                    <div className="flex gap-8">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="radio" checked={periodicity === 'monthly'} onChange={() => setPeriodicity('monthly')} className="w-5 h-5 text-primary" />
                                            <span className="text-base font-black uppercase group-hover:text-primary transition-colors">Monthly</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="radio" checked={periodicity === 'quarterly'} onChange={() => setPeriodicity('quarterly')} className="w-5 h-5 text-primary" />
                                            <span className="text-base font-black uppercase group-hover:text-primary transition-colors">Quarterly</span>
                                        </label>
                                    </div>
                                </div>

                                {periodicity === 'quarterly' && (
                                    <div className="animate-in slide-in-from-top-4 duration-300 bg-gray-50 p-6 border-2 border-dashed border-gray-300">
                                        <p className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">3. Choose return type:</p>
                                        <div className="space-y-4">
                                            {['Sahaj', 'Sugam', 'Quarterly (Normal)'].map(type => (
                                                <label key={type} className="flex items-center gap-3 cursor-pointer group">
                                                    <input type="radio" checked={returnType === type} onChange={() => setReturnType(type as any)} className="w-5 h-5 text-primary" />
                                                    <span className="text-base font-black uppercase group-hover:text-primary transition-colors">{type}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="mt-12 flex justify-end">
                                <button onClick={handleSaveProfile} className="px-16 py-4 tally-button-primary shadow-2xl uppercase text-[12px] font-black tracking-widest active:scale-95 transition-all">Accept Changes</button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </main>
    );
};

const StatCard = ({ label, value, color }: any) => (
    <Card className={`p-6 tally-border !rounded-none bg-white border-l-8 ${color} shadow-lg`}>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-black text-gray-900 tracking-tighter">₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
    </Card>
);

const ProgressCircle = ({ label, total, matched }: any) => {
    const percent = total > 0 ? (matched / total) * 100 : 0;
    return (
        <div className="text-center group">
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">{label}</p>
            <div className="relative w-24 h-24 mx-auto mb-4">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100"/>
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * percent) / 100} className="text-primary transition-all duration-1000"/>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-black text-primary">{Math.round(percent)}%</span>
                </div>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">{matched} / {total} Reconciled</p>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
        matched: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        mismatch: 'bg-red-100 text-red-700 border-red-300',
        missing_in_return: 'bg-amber-100 text-amber-700 border-amber-300',
        missing_in_register: 'bg-purple-100 text-purple-700 border-purple-300',
    };
    const labels: any = {
        matched: 'RECONCILED',
        mismatch: 'TAX DIFF',
        missing_in_return: 'NOT IN GOVT',
        missing_in_register: 'NOT IN ERP',
    };
    return (
        <span className={`px-3 py-1 text-[9px] font-black uppercase border rounded-none shadow-sm ${styles[status]}`}>
            {labels[status]}
        </span>
    );
};

const Anx1Grid = ({ transactions, customers }: { transactions: Transaction[], customers: Customer[] }) => (
    <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden bg-white shadow-xl">
        <div className="bg-primary text-white p-3 font-black text-[11px] uppercase tracking-widest">FORM GST ANX-1: Details of Outward Supplies</div>
        <div className="flex-1 overflow-auto">
            <table className="min-w-full border-collapse">
                <thead className="bg-gray-100 sticky top-0 border-b border-gray-400">
                    <tr className="text-[10px] font-black uppercase text-gray-600 h-10">
                        <th className="p-2 border-r border-gray-400 text-center w-12">Table</th>
                        <th className="p-2 border-r border-gray-400 text-left">GSTIN/UIN</th>
                        <th className="p-2 border-r border-gray-400 text-left">Document No</th>
                        <th className="p-2 border-r border-gray-400 text-center">Date</th>
                        <th className="p-2 border-r border-gray-400 text-right">Taxable Value</th>
                        <th className="p-2 border-r border-gray-400 text-right">Tax Amount</th>
                        <th className="p-2 text-right">Invoice Value</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {transactions.filter(t => t.status === 'completed').map(t => (
                        <tr key={t.id} className="hover:bg-accent transition-colors h-12">
                            <td className="p-2 border-r border-gray-200 text-center font-black text-gray-400">{categorizeSalesForAnx1(t, customers)}</td>
                            <td className="p-2 border-r border-gray-200 font-mono text-xs">{customers.find(c => c.id === t.customerId)?.gstNumber || 'B2C (UNREG)'}</td>
                            <td className="p-2 border-r border-gray-200 font-black uppercase">{t.id}</td>
                            <td className="p-2 border-r border-gray-200 text-center text-xs">{t.date.split('T')[0]}</td>
                            <td className="p-2 border-r border-gray-200 text-right">₹{t.subtotal.toFixed(2)}</td>
                            <td className="p-2 border-r border-gray-200 text-right">₹{t.totalGst.toFixed(2)}</td>
                            <td className="p-2 text-right font-black">₹{t.total.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Card>
);

const Anx2Grid = ({ purchases }: { purchases: Purchase[] }) => (
    <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden bg-white shadow-xl">
        <div className="bg-[#0F4C5C] text-white p-3 font-black text-[11px] uppercase tracking-widest">FORM GST ANX-2: Auto-drafted Inward Supplies</div>
        <div className="flex-1 overflow-auto">
            <table className="min-w-full border-collapse">
                <thead className="bg-gray-100 sticky top-0 border-b border-gray-400">
                    <tr className="text-[10px] font-black uppercase text-gray-600 h-10">
                        <th className="p-2 border-r border-gray-400 text-left">GSTIN of Supplier</th>
                        <th className="p-2 border-r border-gray-400 text-left">Trade Name</th>
                        <th className="p-2 border-r border-gray-400 text-left">Invoice No</th>
                        <th className="p-2 border-r border-gray-400 text-center">Date</th>
                        <th className="p-2 border-r border-gray-400 text-right">Taxable Value</th>
                        <th className="p-2 border-r border-gray-400 text-right">ITC Available</th>
                        <th className="p-2 text-center">Portal Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {purchases.filter(p => p.status === 'completed').map(p => (
                        <tr key={p.id} className="hover:bg-accent transition-colors h-12">
                            <td className="p-2 border-r border-gray-200 font-mono text-xs">27AAAAA0000A1Z5</td>
                            <td className="p-2 border-r border-gray-200 font-black uppercase">{p.supplier}</td>
                            <td className="p-2 border-r border-gray-200 font-mono text-xs">{p.invoiceNumber}</td>
                            <td className="p-2 border-r border-gray-200 text-center text-xs">{p.date}</td>
                            <td className="p-2 border-r border-gray-200 text-right">₹{p.subtotal.toFixed(2)}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-black text-emerald-700">₹{p.totalGst.toFixed(2)}</td>
                            <td className="p-2 text-center"><span className="px-2 py-0.5 bg-gray-100 border border-gray-300 text-[8px] font-black uppercase">Filed (F)</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Card>
);

export default GstCenter;
