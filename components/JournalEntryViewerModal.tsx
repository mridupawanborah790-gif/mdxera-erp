import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { RegisteredPharmacy } from '../types';
import { supabase } from '../services/supabaseClient';

interface JournalEntryViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId?: string;
    invoiceNumber?: string;
    documentType: 'SALES' | 'PURCHASE';
    currentUser: RegisteredPharmacy | null;
    isPosted: boolean;
}

interface JournalLine {
    id: string;
    glCode: string;
    glName: string;
    debit: number;
    credit: number;
}

const normalizeNumber = (value: any): number => Number(value || 0);

const hasAccountingAccess = (user: RegisteredPharmacy | null): boolean => {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    if (['owner', 'admin', 'manager'].includes(role)) return true;

    const maybeAssignedRoles = ((user as any).assignedRoles || (user as any).assigned_roles || []) as string[];
    return maybeAssignedRoles.some((entry) => {
        const v = String(entry || '').toLowerCase();
        return v.includes('account') || v.includes('finance');
    });
};

const JournalEntryViewerModal: React.FC<JournalEntryViewerModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    invoiceNumber,
    documentType,
    currentUser,
    isPosted
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
    const [header, setHeader] = useState<any | null>(null);
    const [lines, setLines] = useState<JournalLine[]>([]);

    const canView = useMemo(() => hasAccountingAccess(currentUser), [currentUser]);

    useEffect(() => {
        if (!isOpen) return;
        if (!canView) {
            setError('You do not have permission to view journal entries.');
            setLines([]);
            setHeader(null);
            return;
        }
        if (!invoiceId) {
            setEmptyMessage('Accounting entry not generated yet.');
            setLines([]);
            setHeader(null);
            return;
        }
        if (!isPosted) {
            setEmptyMessage('Accounting entry not generated yet.');
            setLines([]);
            setHeader(null);
            return;
        }

        const load = async () => {
            setIsLoading(true);
            setError(null);
            setEmptyMessage(null);
            try {
                const { data: headerRows, error: headerError } = await supabase
                    .from('journal_entry_header')
                    .select('*')
                    .eq('reference_document_id', invoiceId)
                    .eq('document_type', documentType)
                    .order('posting_date', { ascending: false })
                    .limit(1);

                if (headerError) throw headerError;

                const headerRow = headerRows?.[0];
                if (!headerRow) {
                    setHeader(null);
                    setLines([]);
                    setEmptyMessage('Accounting entry not generated yet.');
                    return;
                }

                setHeader(headerRow);

                const headerId = headerRow.id;
                let lineRows: any[] = [];

                const byHeaderId = await supabase
                    .from('journal_entry_lines')
                    .select('*')
                    .eq('journal_entry_id', headerId)
                    .order('id', { ascending: true });

                if (!byHeaderId.error && byHeaderId.data?.length) {
                    lineRows = byHeaderId.data;
                } else {
                    const byReference = await supabase
                        .from('journal_entry_lines')
                        .select('*')
                        .eq('reference_document_id', invoiceId)
                        .eq('document_type', documentType)
                        .order('id', { ascending: true });
                    if (byReference.error) throw byReference.error;
                    lineRows = byReference.data || [];
                }

                const mapped: JournalLine[] = (lineRows || []).map((row: any, idx: number) => ({
                    id: String(row.id || idx),
                    glCode: String(row.gl_code || row.account_code || row.ledger_code || ''),
                    glName: String(row.gl_name || row.account_name || row.ledger_name || ''),
                    debit: normalizeNumber(row.debit || row.debit_amount),
                    credit: normalizeNumber(row.credit || row.credit_amount),
                }));

                setLines(mapped);
            } catch (e: any) {
                setError(e?.message || 'Unable to fetch journal entry.');
                setLines([]);
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [isOpen, invoiceId, documentType, canView, isPosted]);

    const totals = useMemo(() => {
        const totalDebit = lines.reduce((sum, row) => sum + row.debit, 0);
        const totalCredit = lines.reduce((sum, row) => sum + row.credit, 0);
        return {
            totalDebit,
            totalCredit,
            balanced: Math.abs(totalDebit - totalCredit) < 0.005,
        };
    }, [lines]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="View Journal Entry" widthClass="max-w-5xl">
            <div className="p-4 space-y-4 overflow-auto text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Journal Entry Number</p><p className="font-bold">{header?.journal_entry_number || header?.entry_number || '—'}</p></div>
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Posting Date</p><p className="font-bold">{header?.posting_date ? new Date(header.posting_date).toLocaleDateString() : '—'}</p></div>
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Company</p><p className="font-bold">{header?.company || header?.company_name || '—'}</p></div>
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Set of Books</p><p className="font-bold">{header?.set_of_books || header?.set_of_books_id || '—'}</p></div>
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Document Reference</p><p className="font-bold">{header?.document_reference || invoiceNumber || '—'}</p></div>
                    <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Status</p><p className="font-bold">{header?.status || (isPosted ? 'Posted' : 'Draft')}</p></div>
                </div>

                {isLoading && <div className="p-4 border border-blue-200 bg-blue-50 text-blue-700">Loading accounting entry...</div>}
                {!isLoading && error && <div className="p-4 border border-red-200 bg-red-50 text-red-700">{error}</div>}
                {!isLoading && !error && emptyMessage && <div className="p-4 border border-amber-200 bg-amber-50 text-amber-800">{emptyMessage}</div>}

                {!isLoading && !error && !emptyMessage && (
                    <>
                        <div className="overflow-x-auto border border-gray-200">
                            <table className="min-w-full text-xs">
                                <thead className="bg-gray-100 uppercase">
                                    <tr>
                                        <th className="p-2 text-left">GL Code</th>
                                        <th className="p-2 text-left">GL Name</th>
                                        <th className="p-2 text-right">Debit</th>
                                        <th className="p-2 text-right">Credit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line) => (
                                        <tr key={line.id} className="border-t">
                                            <td className="p-2 font-mono">{line.glCode || '—'}</td>
                                            <td className="p-2">{line.glName || '—'}</td>
                                            <td className="p-2 text-right font-mono">{line.debit.toFixed(2)}</td>
                                            <td className="p-2 text-right font-mono">{line.credit.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Total Debit</p><p className="font-bold">{totals.totalDebit.toFixed(2)}</p></div>
                            <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase">Total Credit</p><p className="font-bold">{totals.totalCredit.toFixed(2)}</p></div>
                            <div className={`border p-2 ${totals.balanced ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><p className="text-gray-500 uppercase">Must Balance</p><p className="font-bold">{totals.balanced ? 'Balanced' : 'Not Balanced'}</p></div>
                        </div>
                    </>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-200">
                    <button type="button" onClick={() => window.print()} className="px-3 py-1 border border-gray-300 font-bold uppercase">Print Journal</button>
                    <button type="button" disabled className="px-3 py-1 border border-gray-200 text-gray-400 font-bold uppercase cursor-not-allowed" title="Open full journal entry from accounting module">Open Full Journal Entry</button>
                    <button type="button" onClick={() => window.print()} className="px-3 py-1 border border-gray-300 font-bold uppercase">Export to PDF</button>
                </div>
            </div>
        </Modal>
    );
};

export default JournalEntryViewerModal;
