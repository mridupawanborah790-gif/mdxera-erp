import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import { RegisteredPharmacy } from '../types';
import { supabase } from '../services/supabaseClient';

interface NewJournalEntryVoucherProps {
  currentUser: RegisteredPharmacy | null;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

type VoucherStatus = 'Draft' | 'Posted' | 'Cancelled' | 'Reversed';

interface JournalLine {
  id: string;
  glId: string;
  glCode: string;
  glName: string;
  debit: string;
  credit: string;
  costCenter: string;
  projectTask: string;
  remarks: string;
  reference: string;
}

interface GlOption {
  id: string;
  code: string;
  name: string;
}

interface VoucherHeader {
  id: string;
  journal_entry_number: string;
  posting_date: string;
  status: VoucherStatus;
  narration?: string;
  reference_id?: string;
  created_at?: string;
  created_by?: string;
}

const mkLine = (): JournalLine => ({
  id: crypto.randomUUID(),
  glId: '',
  glCode: '',
  glName: '',
  debit: '',
  credit: '',
  costCenter: '',
  projectTask: '',
  remarks: '',
  reference: '',
});

const round2 = (n: number) => Number((n || 0).toFixed(2));

const getFinancialYearLabel = (inputDate: string) => {
  const d = inputDate ? new Date(`${inputDate}T00:00:00`) : new Date();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYear = (startYear + 1).toString().slice(-2);
  return `${startYear}-${endYear}`;
};

const parseAmount = (v: string) => {
  const parsed = Number(v || 0);
  return Number.isFinite(parsed) ? round2(Math.max(0, parsed)) : 0;
};

const NewJournalEntryVoucher: React.FC<NewJournalEntryVoucherProps> = ({ currentUser, addNotification }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherNo, setVoucherNo] = useState('AUTO');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [setOfBooksId, setSetOfBooksId] = useState('');
  const [status, setStatus] = useState<VoucherStatus>('Draft');
  const [createdByName, setCreatedByName] = useState('');
  const [createdAt, setCreatedAt] = useState('');

  const [companies, setCompanies] = useState<Array<{ id: string; company_name: string }>>([]);
  const [setOfBooks, setSetOfBooks] = useState<Array<{ id: string; book_name: string; company_code_id: string }>>([]);
  const [glOptions, setGlOptions] = useState<GlOption[]>([]);
  const [glSearch, setGlSearch] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<JournalLine[]>([mkLine(), mkLine()]);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [recentVouchers, setRecentVouchers] = useState<VoucherHeader[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const filteredBooks = useMemo(() => setOfBooks.filter((b) => !companyId || b.company_code_id === companyId), [setOfBooks, companyId]);

  const totals = useMemo(() => {
    const totalDebit = round2(lines.reduce((sum, line) => sum + parseAmount(line.debit), 0));
    const totalCredit = round2(lines.reduce((sum, line) => sum + parseAmount(line.credit), 0));
    const difference = round2(totalDebit - totalCredit);
    return { totalDebit, totalCredit, difference, balanced: Math.abs(difference) < 0.005 };
  }, [lines]);

  const loadMasters = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [{ data: companyRows, error: companyErr }, { data: bookRows, error: booksErr }] = await Promise.all([
        supabase.from('company_codes').select('id, company_name').eq('organization_id', currentUser.organization_id).eq('active_status', 'Active').order('created_at', { ascending: true }),
        supabase.from('set_of_books').select('id, book_name, company_code_id').eq('organization_id', currentUser.organization_id).eq('active_status', 'Active').order('created_at', { ascending: true }),
      ]);
      if (companyErr) throw companyErr;
      if (booksErr) throw booksErr;
      setCompanies((companyRows || []) as any);
      setSetOfBooks((bookRows || []) as any);

      const defaultCompanyId = (companyRows || [])[0]?.id || '';
      const defaultBookId = (bookRows || [])[0]?.id || '';
      setCompanyId((prev) => prev || defaultCompanyId);
      setSetOfBooksId((prev) => prev || defaultBookId);

      const { data: glRows, error: glErr } = await supabase
        .from('gl_master')
        .select('id, gl_code, gl_name, posting_allowed, active_status, blocked_for_posting, set_of_books_id')
        .eq('organization_id', currentUser.organization_id)
        .eq('active_status', 'Active')
        .order('gl_code', { ascending: true });
      if (glErr) throw glErr;
      const allowed = (glRows || [])
        .filter((g: any) => g.posting_allowed !== false)
        .filter((g: any) => g.blocked_for_posting !== true)
        .filter((g: any) => !setOfBooksId || g.set_of_books_id === setOfBooksId)
        .map((g: any) => ({ id: String(g.id), code: String(g.gl_code || ''), name: String(g.gl_name || '') }));
      setGlOptions(allowed);
    } catch (error: any) {
      addNotification(error?.message || 'Unable to load voucher setup.', 'error');
    }
  }, [addNotification, currentUser, setOfBooksId]);

  const loadRecent = useCallback(async () => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from('journal_entry_header')
      .select('id, journal_entry_number, posting_date, status, narration, reference_id, created_at, created_by, document_type')
      .eq('organization_id', currentUser.organization_id)
      .eq('document_type', 'MANUAL_JV')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      addNotification(error.message, 'error');
      return;
    }
    setRecentVouchers((data || []) as VoucherHeader[]);
  }, [addNotification, currentUser]);

  useEffect(() => {
    loadMasters();
    loadRecent();
  }, [loadMasters, loadRecent]);

  useEffect(() => {
    if (!currentUser || !setOfBooksId) return;
    supabase
      .from('gl_master')
      .select('id, gl_code, gl_name, posting_allowed, active_status, blocked_for_posting, set_of_books_id')
      .eq('organization_id', currentUser.organization_id)
      .eq('active_status', 'Active')
      .eq('set_of_books_id', setOfBooksId)
      .order('gl_code', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          addNotification(error.message, 'error');
          return;
        }
        const allowed = (data || [])
          .filter((g: any) => g.posting_allowed !== false)
          .filter((g: any) => g.blocked_for_posting !== true)
          .map((g: any) => ({ id: String(g.id), code: String(g.gl_code || ''), name: String(g.gl_name || '') }));
        setGlOptions(allowed);
      });
  }, [addNotification, currentUser, setOfBooksId]);

  const generateVoucherNumber = useCallback(async (inputDate: string) => {
    if (!currentUser) throw new Error('User context missing');
    const fy = getFinancialYearLabel(inputDate);
    const { data, error } = await supabase
      .from('journal_entry_header')
      .select('journal_entry_number')
      .eq('organization_id', currentUser.organization_id)
      .eq('document_type', 'MANUAL_JV')
      .ilike('journal_entry_number', `JV%-${fy}`)
      .limit(5000);

    if (error) throw error;

    let maxSeq = 0;
    for (const row of data || []) {
      const value = String((row as any).journal_entry_number || '');
      const match = value.match(/^JV(\d+)-(\d{4}-\d{2})$/);
      if (!match) continue;
      if (match[2] !== fy) continue;
      maxSeq = Math.max(maxSeq, parseInt(match[1], 10) || 0);
    }

    return `JV${String(maxSeq + 1).padStart(6, '0')}-${fy}`;
  }, [currentUser]);

  const resetForm = () => {
    setCurrentVoucherId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setVoucherNo('AUTO');
    setReferenceNo('');
    setNarration('');
    setStatus('Draft');
    setCreatedByName('');
    setCreatedAt('');
    setLines([mkLine(), mkLine()]);
    setGlSearch({});
  };

  const validateLines = (enforceBalance: boolean): string | null => {
    const meaningful = lines.filter((line) => line.glId || line.debit || line.credit || line.remarks || line.reference);
    if (meaningful.length < 2) return 'At least 2 journal lines are required (one debit and one credit).';

    let hasDebit = false;
    let hasCredit = false;

    for (let i = 0; i < meaningful.length; i += 1) {
      const line = meaningful[i];
      const dr = parseAmount(line.debit);
      const cr = parseAmount(line.credit);
      if (!line.glId) return `GL Account is required in line ${i + 1}.`;
      if (dr > 0 && cr > 0) return `Line ${i + 1}: either Debit OR Credit is allowed, not both.`;
      if (dr <= 0 && cr <= 0) return `Line ${i + 1}: Debit or Credit amount is required.`;
      if (dr > 0) hasDebit = true;
      if (cr > 0) hasCredit = true;
    }

    if (!hasDebit || !hasCredit) return 'Voucher requires at least one debit line and one credit line.';
    if (enforceBalance && !totals.balanced) {
      return 'Journal entry is not balanced. Total Debit must equal Total Credit.';
    }
    return null;
  };

  const persistVoucher = async (nextStatus: VoucherStatus) => {
    if (!currentUser) throw new Error('User context missing.');
    if (!date) throw new Error('Date is required.');
    if (!companyId) throw new Error('Company is required.');
    if (!setOfBooksId) throw new Error('Set of Books is required.');

    const lineError = validateLines(nextStatus === 'Posted');
    if (lineError) throw new Error(lineError);

    const cleanLines = lines
      .filter((line) => line.glId || line.debit || line.credit || line.remarks || line.reference)
      .map((line, idx) => ({
        ...line,
        line_number: idx + 1,
        debit_value: parseAmount(line.debit),
        credit_value: parseAmount(line.credit),
      }));

    const totalDebit = round2(cleanLines.reduce((sum, line) => sum + line.debit_value, 0));
    const totalCredit = round2(cleanLines.reduce((sum, line) => sum + line.credit_value, 0));

    const resolvedVoucherNo = voucherNo === 'AUTO' || !voucherNo ? await generateVoucherNumber(date) : voucherNo;
    setVoucherNo(resolvedVoucherNo);

    const baseHeader: any = {
      organization_id: currentUser.organization_id,
      journal_entry_number: resolvedVoucherNo,
      posting_date: date,
      status: nextStatus,
      reference_type: 'MANUAL_JOURNAL_ENTRY_VOUCHER',
      reference_id: referenceNo || null,
      reference_document_id: currentVoucherId || resolvedVoucherNo,
      document_type: 'MANUAL_JV',
      document_reference: referenceNo || resolvedVoucherNo,
      company: companyId,
      company_code_id: companyId,
      set_of_books: setOfBooksId,
      set_of_books_id: setOfBooksId,
      narration: narration || null,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: currentUser.user_id,
    };

    let headerId = currentVoucherId;

    if (headerId) {
      const { error } = await supabase.from('journal_entry_header').update(baseHeader).eq('id', headerId);
      if (error) throw error;
      const { error: delErr } = await supabase.from('journal_entry_lines').delete().eq('organization_id', currentUser.organization_id).eq('journal_entry_id', headerId);
      if (delErr) throw delErr;
    } else {
      const { data, error } = await supabase.from('journal_entry_header').insert(baseHeader).select('id, created_at, created_by').single();
      if (error) {
        if (String(error.message || '').toLowerCase().includes('duplicate')) {
          setVoucherNo('AUTO');
        }
        throw error;
      }
      headerId = String(data.id);
      setCurrentVoucherId(headerId);
      setCreatedAt(String(data.created_at || ''));
      setCreatedByName(currentUser.full_name || currentUser.email || '');
    }

    const payloadLines = cleanLines.map((line) => ({
      organization_id: currentUser.organization_id,
      journal_entry_id: headerId,
      reference_document_id: headerId,
      document_type: 'MANUAL_JV',
      line_number: line.line_number,
      gl_code: line.glCode,
      gl_name: line.glName,
      account_code: line.glCode,
      account_name: line.glName,
      debit: line.debit_value,
      credit: line.credit_value,
      line_memo: [line.remarks, line.costCenter && `CC:${line.costCenter}`, line.projectTask && `PRJ:${line.projectTask}`, line.reference && `REF:${line.reference}`].filter(Boolean).join(' | ') || null,
    }));

    const { error: lineErr } = await supabase.from('journal_entry_lines').insert(payloadLines as any);
    if (lineErr) throw lineErr;

    setStatus(nextStatus);
    await loadRecent();
    return { headerId, resolvedVoucherNo };
  };

  const onSaveDraft = async () => {
    setIsSaving(true);
    try {
      await persistVoucher('Draft');
      addNotification('Journal voucher saved as Draft.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'Unable to save draft.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const onPost = async (andNew = false) => {
    setIsSaving(true);
    try {
      await persistVoucher('Posted');
      addNotification('Journal voucher posted successfully.', 'success');
      if (andNew) resetForm();
    } catch (error: any) {
      addNotification(error?.message || 'Unable to post journal voucher.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const selectGl = (lineId: string, glId: string) => {
    const selected = glOptions.find((gl) => gl.id === glId);
    setLines((prev) => prev.map((line) => line.id === lineId ? {
      ...line,
      glId,
      glCode: selected?.code || '',
      glName: selected?.name || '',
    } : line));
  };

  const loadVoucher = async (voucherId: string) => {
    if (!currentUser) return;
    const { data: header, error: hErr } = await supabase
      .from('journal_entry_header')
      .select('*')
      .eq('organization_id', currentUser.organization_id)
      .eq('id', voucherId)
      .single();
    if (hErr) {
      addNotification(hErr.message, 'error');
      return;
    }

    const { data: lineRows, error: lErr } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('organization_id', currentUser.organization_id)
      .eq('journal_entry_id', voucherId)
      .order('line_number', { ascending: true });
    if (lErr) {
      addNotification(lErr.message, 'error');
      return;
    }

    setCurrentVoucherId(String(header.id));
    setDate(String(header.posting_date || '').slice(0, 10));
    setVoucherNo(String(header.journal_entry_number || 'AUTO'));
    setReferenceNo(String(header.reference_id || ''));
    setNarration(String(header.narration || ''));
    setCompanyId(String(header.company_code_id || header.company || ''));
    setSetOfBooksId(String(header.set_of_books_id || header.set_of_books || ''));
    setStatus(String(header.status || 'Draft') as VoucherStatus);
    setCreatedAt(String(header.created_at || ''));
    setCreatedByName(currentUser.full_name || currentUser.email || '');

    const mapped = (lineRows || []).map((row: any) => ({
      id: crypto.randomUUID(),
      glId: '',
      glCode: String(row.gl_code || row.account_code || ''),
      glName: String(row.gl_name || row.account_name || ''),
      debit: Number(row.debit || 0) ? String(row.debit) : '',
      credit: Number(row.credit || 0) ? String(row.credit) : '',
      costCenter: String(row.cost_center || ''),
      projectTask: String(row.project_task || ''),
      remarks: String(row.line_memo || ''),
      reference: String(row.reference_line || ''),
    }));
    setLines(mapped.length ? mapped : [mkLine(), mkLine()]);
  };

  const printVoucher = () => {
    const html = `<!doctype html><html><head><title>Journal Entry Voucher ${voucherNo}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{text-align:left;background:#f5f5f5}.right{text-align:right}</style>
      </head><body>
      <h2>${currentUser?.pharmacy_name || 'Company Name'}</h2>
      <h3>Journal Entry Voucher</h3>
      <p><strong>Voucher No:</strong> ${voucherNo}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Narration:</strong> ${narration || '-'}</p>
      <p><strong>Status:</strong> ${status}</p>
      <table><thead><tr><th>SL</th><th>GL</th><th>GL Name</th><th>Remarks</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
      <tbody>${lines.map((l, idx) => `<tr><td>${idx + 1}</td><td>${l.glCode || '-'}</td><td>${l.glName || '-'}</td><td>${l.remarks || ''}</td><td class="right">${parseAmount(l.debit).toFixed(2)}</td><td class="right">${parseAmount(l.credit).toFixed(2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="4" class="right">Total</th><th class="right">${totals.totalDebit.toFixed(2)}</th><th class="right">${totals.totalCredit.toFixed(2)}</th></tr></tfoot>
      </table><p style="margin-top:36px">Authorized Signature: ____________________</p></body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      addNotification('Popup blocked. Please allow popups for printing.', 'warning');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  if (!currentUser) {
    return <div className="p-4 text-sm text-red-600">Login required.</div>;
  }

  return (
    <div className="p-4 space-y-4 text-xs">
      <Card title="Financial Statement / New Journal Entry Voucher">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <label className="font-bold uppercase">Date
            <input type="date" className="w-full border p-2 mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="font-bold uppercase">Voucher No
            <input className="w-full border p-2 mt-1 bg-gray-100" value={voucherNo} readOnly />
          </label>
          <label className="font-bold uppercase">Reference No
            <input className="w-full border p-2 mt-1" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          </label>
          <label className="font-bold uppercase">Status
            <input className="w-full border p-2 mt-1 bg-gray-100" value={status} readOnly />
          </label>
          <label className="font-bold uppercase md:col-span-2">Narration
            <input className="w-full border p-2 mt-1" value={narration} onChange={(e) => setNarration(e.target.value)} />
          </label>
          <label className="font-bold uppercase">Company
            <select className="w-full border p-2 mt-1" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Select Company</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </label>
          <label className="font-bold uppercase">Set of Books
            <select className="w-full border p-2 mt-1" value={setOfBooksId} onChange={(e) => setSetOfBooksId(e.target.value)}>
              <option value="">Select Set of Books</option>
              {filteredBooks.map((book) => <option key={book.id} value={book.id}>{book.book_name}</option>)}
            </select>
          </label>
          <label className="font-bold uppercase">Posting Type
            <input className="w-full border p-2 mt-1 bg-gray-100" value="Manual Journal Entry Voucher" readOnly />
          </label>
          <label className="font-bold uppercase">Created By
            <input className="w-full border p-2 mt-1 bg-gray-100" value={createdByName || currentUser.full_name || currentUser.email} readOnly />
          </label>
          <label className="font-bold uppercase">Created At
            <input className="w-full border p-2 mt-1 bg-gray-100" value={createdAt ? new Date(createdAt).toLocaleString() : '-'} readOnly />
          </label>
        </div>

        <div className="overflow-x-auto border">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 uppercase">
              <tr>
                <th className="p-2">SL</th><th className="p-2">GL Account</th><th className="p-2">GL Name</th><th className="p-2">Debit</th><th className="p-2">Credit</th><th className="p-2">Cost Center</th><th className="p-2">Project / Task</th><th className="p-2">Item Text / Remarks</th><th className="p-2">Reference</th><th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const searchTerm = (glSearch[line.id] || '').trim().toLowerCase();
                const options = !searchTerm
                  ? glOptions
                  : glOptions.filter((gl) => (`${gl.code} ${gl.name}`).toLowerCase().includes(searchTerm));
                return (
                  <tr key={line.id} className="border-t">
                    <td className="p-1 text-center">{idx + 1}</td>
                    <td className="p-1 min-w-[200px]">
                      <input className="w-full border p-1 mb-1" placeholder="Search GL code/name" value={glSearch[line.id] || ''} onChange={(e) => setGlSearch((prev) => ({ ...prev, [line.id]: e.target.value }))} />
                      <select className="w-full border p-1" value={line.glId || ''} onChange={(e) => selectGl(line.id, e.target.value)}>
                        <option value="">Select GL</option>
                        {options.map((gl) => <option key={gl.id} value={gl.id}>{gl.code} - {gl.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1 min-w-[180px]">{line.glName || '-'}</td>
                    <td className="p-1"><input type="number" min="0" className="w-28 border p-1 text-right" value={line.debit} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, debit: e.target.value, credit: e.target.value ? '' : r.credit } : r))} /></td>
                    <td className="p-1"><input type="number" min="0" className="w-28 border p-1 text-right" value={line.credit} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, credit: e.target.value, debit: e.target.value ? '' : r.debit } : r))} /></td>
                    <td className="p-1"><input className="w-28 border p-1" value={line.costCenter} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, costCenter: e.target.value } : r))} /></td>
                    <td className="p-1"><input className="w-28 border p-1" value={line.projectTask} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, projectTask: e.target.value } : r))} /></td>
                    <td className="p-1"><input className="w-40 border p-1" value={line.remarks} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, remarks: e.target.value } : r))} /></td>
                    <td className="p-1"><input className="w-28 border p-1" value={line.reference} onChange={(e) => setLines((prev) => prev.map((r) => r.id === line.id ? { ...r, reference: e.target.value } : r))} /></td>
                    <td className="p-1 text-center"><button className="border px-2 py-1" onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((r) => r.id !== line.id) : prev)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4 border p-3 bg-gray-50 font-bold uppercase">
          <div>Total Debit: ₹{totals.totalDebit.toFixed(2)}</div>
          <div>Total Credit: ₹{totals.totalCredit.toFixed(2)}</div>
          <div>Difference: ₹{totals.difference.toFixed(2)}</div>
          <div>Status: {status}</div>
          <div className={totals.balanced ? 'text-green-700' : 'text-red-700'}>{totals.balanced ? 'Balanced' : 'Unbalanced'}</div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button className="border px-3 py-2 font-bold" onClick={() => setLines((prev) => [...prev, mkLine()])}>Add Row</button>
          <button className="border px-3 py-2 font-bold" onClick={() => setLines((prev) => prev.length > 2 ? prev.slice(0, -1) : prev)}>Remove Row</button>
          <button className="border px-3 py-2 font-bold" disabled={isSaving} onClick={onSaveDraft}>Save Draft</button>
          <button className="border px-3 py-2 font-bold bg-primary text-white" disabled={isSaving} onClick={() => onPost(false)}>Post</button>
          <button className="border px-3 py-2 font-bold" disabled={isSaving} onClick={() => onPost(true)}>Post and New</button>
          <button className="border px-3 py-2 font-bold text-gray-400 cursor-not-allowed" disabled title="Coming soon">Reverse</button>
          <button className="border px-3 py-2 font-bold" onClick={resetForm}>Close</button>
          <button className="border px-3 py-2 font-bold" onClick={printVoucher}>Print Voucher</button>
          <button className="border px-3 py-2 font-bold" onClick={loadRecent}>View Journal History</button>
        </div>
      </Card>

      <Card title="Journal Voucher History (latest 20)">
        <div className="overflow-x-auto border">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 uppercase"><tr><th className="p-2">Voucher No</th><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2">Reference</th><th className="p-2">Narration</th><th className="p-2">Action</th></tr></thead>
            <tbody>
              {recentVouchers.map((voucher) => (
                <tr key={voucher.id} className="border-t">
                  <td className="p-2 font-mono">{voucher.journal_entry_number}</td>
                  <td className="p-2">{voucher.posting_date}</td>
                  <td className="p-2">{voucher.status}</td>
                  <td className="p-2">{voucher.reference_id || '-'}</td>
                  <td className="p-2">{voucher.narration || '-'}</td>
                  <td className="p-2"><button className="border px-2 py-1" onClick={() => loadVoucher(voucher.id)}>Open</button></td>
                </tr>
              ))}
              {!recentVouchers.length && <tr><td className="p-4 text-center text-gray-500" colSpan={6}>No manual journal vouchers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default NewJournalEntryVoucher;
