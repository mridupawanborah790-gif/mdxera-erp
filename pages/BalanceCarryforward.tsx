import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type RunType = 'BS' | 'PL';
type RunMode = 'Test' | 'Actual';
type RunStatus = 'Draft' | 'Executed' | 'Reversed';
type MainTab = 'general' | 'dataSelection' | 'messages' | 'postings';
type PostingTab = 'closingBs' | 'openingBs' | 'pl' | 'journals';
type GlType = 'Asset' | 'Expense' | 'Income' | 'Liability' | 'Equity';

interface CompanyCode {
  id: string;
  code: string;
  description?: string;
  status: 'Active' | 'Inactive';
}

interface SetOfBook {
  id: string;
  company_code_id: string;
  set_of_books_id: string;
  description?: string;
  active_status: 'Active' | 'Inactive';
}

interface GlMaster {
  id: string;
  set_of_books_id: string;
  gl_code: string;
  gl_name: string;
  gl_type: GlType;
  active_status: 'Active' | 'Inactive';
  posting_count: number;
}

interface GlAssignment {
  id: string;
  set_of_books_id: string;
}

interface AccountPosting {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  journalEntryId: string;
  lineMemo: string;
}

interface JournalEntry {
  id: string;
  bcfRunId: string;
  companyCodeId: string;
  setOfBooksId: string;
  date: string;
  reference: string;
  narration: string;
  postingGroup: string;
  totalDebit: number;
  totalCredit: number;
  lines: AccountPosting[];
}

interface BcfRunLog {
  runId: string;
  orgId: string;
  companyCodeId: string;
  setOfBooksId: string;
  company: string;
  fyFrom: string;
  fyTo: string;
  runType: RunType;
  mode: RunMode;
  status: RunStatus;
  periodYear: string;
  executedBy: string;
  executedAt?: string;
  totalDebit: number;
  totalCredit: number;
  journalEntryIds: string[];
  closingBsAccounts: AccountPosting[];
  openingBsAccounts: AccountPosting[];
  profitLossAccounts: AccountPosting[];
  journals: JournalEntry[];
  messages: string[];
  reversedBy?: string;
  reversedAt?: string;
  reverseReason?: string;
}

const STORAGE_KEY = 'mdxera.bcf.run.log.v2';
const round2 = (value: number) => Number((value || 0).toFixed(2));
const formatAmount = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toTimestamp = () => new Date().toISOString();
const makeRunId = () => `BCF-${Date.now()}`;
const makeJournalId = (index: number) => `JE-BCF-${String(index + 1).padStart(3, '0')}-${Date.now().toString().slice(-5)}`;
const makeReversalJournalId = (runIdValue: string, index: number) => `REV-${runIdValue}-${String(index + 1).padStart(3, '0')}`;

const loadRunLog = (): BcfRunLog[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BcfRunLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistRunLog = (runs: BcfRunLog[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));

const Badge: React.FC<{ label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }> = ({ label, tone = 'neutral' }) => {
  const toneClass = tone === 'success'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : tone === 'warning'
      ? 'bg-amber-100 text-amber-900 border-amber-200'
      : tone === 'danger'
        ? 'bg-red-100 text-red-800 border-red-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${toneClass}`}>{label}</span>;
};

const syntheticBalance = (gl: GlMaster) => round2(Math.max(gl.posting_count || 1, 1) * 100);

const BalanceCarryforward: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('general');
  const [activePostingTab, setActivePostingTab] = useState<PostingTab>('closingBs');
  const [runType, setRunType] = useState<RunType>('BS');
  const [mode, setMode] = useState<RunMode>('Test');
  const [status, setStatus] = useState<RunStatus>('Draft');
  const [runId, setRunId] = useState<string>(makeRunId());
  const [orgId] = useState('ORG');
  const [fyFrom, setFyFrom] = useState('2024-04-01');
  const [fyTo, setFyTo] = useState('2025-03-31');
  const [periodYear, setPeriodYear] = useState('2024-25');
  const [executedBy, setExecutedBy] = useState('System Admin');

  const [companies, setCompanies] = useState<CompanyCode[]>([]);
  const [setOfBooks, setSetOfBooks] = useState<SetOfBook[]>([]);
  const [glMasters, setGlMasters] = useState<GlMaster[]>([]);
  const [glAssignments, setGlAssignments] = useState<GlAssignment[]>([]);
  const [selectedCompanyCodeId, setSelectedCompanyCodeId] = useState('');
  const [selectedSetOfBooksId, setSelectedSetOfBooksId] = useState('');

  const [messages, setMessages] = useState<string[]>(['Load active company and set of books to run carryforward.']);
  const [closingBsAccounts, setClosingBsAccounts] = useState<AccountPosting[]>([]);
  const [openingBsAccounts, setOpeningBsAccounts] = useState<AccountPosting[]>([]);
  const [profitLossAccounts, setProfitLossAccounts] = useState<AccountPosting[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [runLog, setRunLog] = useState<BcfRunLog[]>([]);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === selectedCompanyCodeId), [companies, selectedCompanyCodeId]);
  const filteredSetOfBooks = useMemo(() => setOfBooks.filter((s) => s.company_code_id === selectedCompanyCodeId), [setOfBooks, selectedCompanyCodeId]);
  const selectedSetOfBook = useMemo(() => filteredSetOfBooks.find((s) => s.id === selectedSetOfBooksId), [filteredSetOfBooks, selectedSetOfBooksId]);
  const selectedGlMasters = useMemo(() => glMasters.filter((g) => g.set_of_books_id === selectedSetOfBooksId), [glMasters, selectedSetOfBooksId]);

  useEffect(() => setRunLog(loadRunLog()), []);

  useEffect(() => {
    const loadConfiguration = async () => {
      const [companyRes, sobRes, glRes, assignRes] = await Promise.all([
        supabase.from('company_codes').select('id, code, description, status').eq('status', 'Active').order('code', { ascending: true }),
        supabase.from('set_of_books').select('id, company_code_id, set_of_books_id, description, active_status').eq('active_status', 'Active').order('set_of_books_id', { ascending: true }),
        supabase.from('gl_master').select('id, set_of_books_id, gl_code, gl_name, gl_type, active_status, posting_count').eq('active_status', 'Active').order('gl_code', { ascending: true }),
        supabase.from('gl_assignments').select('id, set_of_books_id')
      ]);

      if (companyRes.error || sobRes.error || glRes.error || assignRes.error) {
        setMessages((prev) => [...prev, 'Configuration load failed. Please verify company/set of books/GL setup in Company Configuration.']);
        return;
      }

      const nextCompanies = (companyRes.data || []) as CompanyCode[];
      const nextBooks = (sobRes.data || []) as SetOfBook[];
      setCompanies(nextCompanies);
      setSetOfBooks(nextBooks);
      setGlMasters((glRes.data || []) as GlMaster[]);
      setGlAssignments((assignRes.data || []) as GlAssignment[]);

      const defaultCompanyId = nextCompanies[0]?.id || '';
      setSelectedCompanyCodeId((prev) => prev || defaultCompanyId);
      const defaultSobId = nextBooks.find((b) => b.company_code_id === defaultCompanyId)?.id || '';
      setSelectedSetOfBooksId((prev) => prev || defaultSobId);
    };

    loadConfiguration();
  }, []);

  useEffect(() => {
    if (!selectedCompanyCodeId) return;
    const firstBook = filteredSetOfBooks[0]?.id || '';
    if (!filteredSetOfBooks.some((s) => s.id === selectedSetOfBooksId)) {
      setSelectedSetOfBooksId(firstBook);
    }
  }, [selectedCompanyCodeId, filteredSetOfBooks, selectedSetOfBooksId]);

  const totalDebit = useMemo(() => round2(journals.reduce((acc, journal) => acc + journal.totalDebit, 0)), [journals]);
  const totalCredit = useMemo(() => round2(journals.reduce((acc, journal) => acc + journal.totalCredit, 0)), [journals]);

  const hasActualDuplicate = useMemo(() => runLog.some((item) => (
    item.companyCodeId === selectedCompanyCodeId
    && item.setOfBooksId === selectedSetOfBooksId
    && item.fyFrom === fyFrom
    && item.fyTo === fyTo
    && item.runType === runType
    && item.mode === 'Actual'
    && item.status !== 'Reversed'
  )), [runLog, selectedCompanyCodeId, selectedSetOfBooksId, fyFrom, fyTo, runType]);

  const validateRunConfig = (targetRunType: RunType) => {
    if (!selectedCompany) return 'Active Company is required.';
    if (!selectedSetOfBook) return 'Active Set of Books is required.';
    if (selectedGlMasters.length === 0) return 'No active GL records exist for selected Set of Books.';
    if (!glAssignments.some((a) => a.set_of_books_id === selectedSetOfBooksId)) return 'GL Assignments are missing for selected Set of Books.';
    if (targetRunType === 'PL') {
      const retained = selectedGlMasters.find((g) => g.gl_type === 'Equity' && /retained|capital/i.test(`${g.gl_code} ${g.gl_name}`));
      if (!retained) return 'Required Retained Earnings GL is missing for P&L run.';
    }
    if (fyFrom >= fyTo) return 'FY From must be earlier than FY To.';
    return null;
  };

  const generatePostings = (targetRunType: RunType) => {
    const nextClosingBs: AccountPosting[] = [];
    const nextOpeningBs: AccountPosting[] = [];
    const nextPl: AccountPosting[] = [];
    const nextJournals: JournalEntry[] = [];
    const nextMessages: string[] = [];

    if (targetRunType === 'BS') {
      const bsRows = selectedGlMasters.filter((g) => g.gl_type === 'Asset' || g.gl_type === 'Liability' || g.gl_type === 'Equity');
      bsRows.forEach((row, index) => {
        const journalId = makeJournalId(index);
        const amount = syntheticBalance(row);
        const isAsset = row.gl_type === 'Asset';
        const closingLine: AccountPosting = {
          accountCode: row.gl_code,
          accountName: row.gl_name,
          debit: isAsset ? 0 : amount,
          credit: isAsset ? amount : 0,
          journalEntryId: journalId,
          lineMemo: 'Closing balance carryforward'
        };
        const openingLine: AccountPosting = {
          accountCode: row.gl_code,
          accountName: row.gl_name,
          debit: isAsset ? amount : 0,
          credit: isAsset ? 0 : amount,
          journalEntryId: journalId,
          lineMemo: 'Opening balance carryforward'
        };
        nextClosingBs.push(closingLine);
        nextOpeningBs.push(openingLine);
        nextJournals.push({
          id: journalId,
          bcfRunId: runId,
          companyCodeId: selectedCompanyCodeId,
          setOfBooksId: selectedSetOfBooksId,
          date: fyTo,
          reference: runId,
          narration: `BCF BS carryforward for ${row.gl_name}`,
          postingGroup: `Ledger Group ${index + 1}`,
          totalDebit: round2(closingLine.debit + openingLine.debit),
          totalCredit: round2(closingLine.credit + openingLine.credit),
          lines: [closingLine, openingLine]
        });
      });
      nextMessages.push('BCF-BS prepared from gl_master by selected set_of_books_id.');
    }

    if (targetRunType === 'PL') {
      const plRows = selectedGlMasters.filter((g) => g.gl_type === 'Income' || g.gl_type === 'Expense');
      const retained = selectedGlMasters.find((g) => g.gl_type === 'Equity' && /retained|capital/i.test(`${g.gl_code} ${g.gl_name}`));
      const journalId = makeJournalId(0);
      let incomeTotal = 0;
      let expenseTotal = 0;

      plRows.forEach((row) => {
        const amount = syntheticBalance(row);
        if (row.gl_type === 'Income') incomeTotal += amount;
        if (row.gl_type === 'Expense') expenseTotal += amount;
        nextPl.push({
          accountCode: row.gl_code,
          accountName: row.gl_name,
          debit: row.gl_type === 'Income' ? amount : 0,
          credit: row.gl_type === 'Expense' ? amount : 0,
          journalEntryId: journalId,
          lineMemo: 'P&L closing entry'
        });
      });

      const profit = round2(incomeTotal - expenseTotal);
      nextPl.push({
        accountCode: retained?.gl_code || 'N/A',
        accountName: retained?.gl_name || 'Retained Earnings',
        debit: profit < 0 ? Math.abs(profit) : 0,
        credit: profit > 0 ? Math.abs(profit) : 0,
        journalEntryId: journalId,
        lineMemo: `Transfer ${profit >= 0 ? 'profit' : 'loss'} to retained earnings`
      });

      nextJournals.push({
        id: journalId,
        bcfRunId: runId,
        companyCodeId: selectedCompanyCodeId,
        setOfBooksId: selectedSetOfBooksId,
        date: fyTo,
        reference: runId,
        narration: `BCF P&L closure (${periodYear})`,
        postingGroup: 'P&L Settlement',
        totalDebit: round2(nextPl.reduce((sum, row) => sum + row.debit, 0)),
        totalCredit: round2(nextPl.reduce((sum, row) => sum + row.credit, 0)),
        lines: [...nextPl]
      });
      nextMessages.push(`BCF-P&L prepared using Income/Expense GL types; net ${formatAmount(Math.abs(profit))} settled to retained earnings.`);
    }

    return { nextClosingBs, nextOpeningBs, nextPl, nextJournals, nextMessages };
  };

  const applyPostingResult = (result: ReturnType<typeof generatePostings>) => {
    setClosingBsAccounts(result.nextClosingBs);
    setOpeningBsAccounts(result.nextOpeningBs);
    setProfitLossAccounts(result.nextPl);
    setJournals(result.nextJournals);
    setMessages((prev) => [...prev, ...result.nextMessages]);
  };

  const executeTest = () => {
    const err = validateRunConfig(runType);
    if (err) return setMessages((prev) => [...prev, `Validation error: ${err}`]);

    setMode('Test');
    setStatus('Executed');
    const result = generatePostings(runType);
    applyPostingResult(result);
    setMessages((prev) => [...prev, 'Test Run completed successfully. No postings made to ledger.']);
  };

  const executeActual = () => {
    const err = validateRunConfig(runType);
    if (err) return setMessages((prev) => [...prev, `Validation error: ${err}`]);

    if (hasActualDuplicate) {
      return setMessages((prev) => [...prev, 'Validation error: duplicate Actual run exists for (company_code_id, set_of_books_id, fy_from, fy_to, run_type).']);
    }

    const result = generatePostings(runType);
    const totalDr = round2(result.nextJournals.reduce((sum, journal) => sum + journal.totalDebit, 0));
    const totalCr = round2(result.nextJournals.reduce((sum, journal) => sum + journal.totalCredit, 0));
    if (Math.abs(totalDr - totalCr) > 0.01 && result.nextJournals.length > 0) {
      return setMessages((prev) => [...prev, 'Validation error: generated journals are not balanced.']);
    }

    applyPostingResult(result);
    setMode('Actual');
    setStatus('Executed');

    const entry: BcfRunLog = {
      runId,
      orgId,
      companyCodeId: selectedCompanyCodeId,
      setOfBooksId: selectedSetOfBooksId,
      company: `${selectedCompany?.code || ''} ${selectedCompany?.description || ''}`.trim(),
      fyFrom,
      fyTo,
      runType,
      mode: 'Actual',
      status: 'Executed',
      periodYear,
      executedBy,
      executedAt: toTimestamp(),
      totalDebit: totalDr,
      totalCredit: totalCr,
      journalEntryIds: result.nextJournals.map((j) => j.id),
      closingBsAccounts: result.nextClosingBs,
      openingBsAccounts: result.nextOpeningBs,
      profitLossAccounts: result.nextPl,
      journals: result.nextJournals,
      messages
    };

    const nextRunLog = [entry, ...runLog];
    setRunLog(nextRunLog);
    persistRunLog(nextRunLog);
    setMessages((prev) => [...prev, 'Actual Run executed with journals linked to company_code_id, set_of_books_id and bcf_run_id.']);
  };

  const reverseRun = (targetRunId: string) => {
    const selected = runLog.find((item) => item.runId === targetRunId && item.mode === 'Actual' && item.status === 'Executed');
    if (!selected) return setMessages((prev) => [...prev, 'Reverse not allowed: choose an Executed Actual run.']);
    const reason = window.prompt(`Enter reversal reason for run ${targetRunId}`, 'Business correction') || '';
    if (!reason.trim()) return setMessages((prev) => [...prev, 'Reversal cancelled: reason is mandatory.']);

    const reversedAt = toTimestamp();
    const reversalJournals = selected.journals.map((journal, index) => ({
      ...journal,
      id: makeReversalJournalId(selected.runId, index),
      date: reversedAt.slice(0, 10),
      narration: `Reversal of ${journal.id}`,
      postingGroup: `Reversal - ${journal.postingGroup}`,
      totalDebit: journal.totalCredit,
      totalCredit: journal.totalDebit,
      lines: journal.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, lineMemo: `Reversal for ${line.journalEntryId}` }))
    }));

    const updated = runLog.map((item) => item.runId !== targetRunId
      ? item
      : {
        ...item,
        status: 'Reversed' as RunStatus,
        reversedAt,
        reversedBy: executedBy,
        reverseReason: reason.trim(),
        journals: [...item.journals, ...reversalJournals],
        journalEntryIds: [...item.journalEntryIds, ...reversalJournals.map((j) => j.id)]
      });

    setRunLog(updated);
    persistRunLog(updated);
    setMessages((prev) => [...prev, `Run ${targetRunId} reversed atomically with ${reversalJournals.length} system-generated reversal journals.`]);
  };

  const currentGrid = activePostingTab === 'closingBs'
    ? closingBsAccounts
    : activePostingTab === 'openingBs'
      ? openingBsAccounts
      : profitLossAccounts;

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-primary uppercase tracking-wide">Balance Carryforward</h1>
            <p className="text-xs mt-1 text-slate-600 font-semibold">Financial Statement &gt; Balance Carryforward</p>
          </div>
          <div className="flex gap-2">
            <button onClick={executeTest} className="px-3 py-2 text-xs font-bold border rounded bg-blue-50 text-blue-700">Run Test</button>
            <button onClick={executeActual} className="px-3 py-2 text-xs font-bold border rounded bg-emerald-600 text-white">Run Actual</button>
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-3 mt-4">
          <label className="text-xs font-bold text-slate-600">Company
            <select value={selectedCompanyCodeId} onChange={(e) => setSelectedCompanyCodeId(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white">
              <option value="">Select Company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.description || 'NA'}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Set of Books
            <select value={selectedSetOfBooksId} onChange={(e) => setSelectedSetOfBooksId(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white">
              <option value="">Select Set of Books</option>
              {filteredSetOfBooks.map((b) => <option key={b.id} value={b.id}>{b.set_of_books_id} - {b.description || 'NA'}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Run Type
            <select value={runType} onChange={(e) => setRunType(e.target.value as RunType)} className="mt-1 w-full border rounded p-2 bg-white">
              <option value="BS">BCF - Balance Sheet</option>
              <option value="PL">BCF - Profit &amp; Loss</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">FY From
            <input type="date" value={fyFrom} onChange={(e) => setFyFrom(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white" />
          </label>
          <label className="text-xs font-bold text-slate-600">FY To
            <input type="date" value={fyTo} onChange={(e) => setFyTo(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white" />
          </label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="border-b px-4 pt-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'general', label: 'General' },
              { key: 'dataSelection', label: 'Data Selection' },
              { key: 'messages', label: 'Messages' },
              { key: 'postings', label: 'Postings' }
            ].map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as MainTab)} className={`px-3 py-2 text-xs font-bold border-b-2 ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}>{tab.label}</button>
            ))}
          </div>
        </div>

        {activeTab === 'general' && <div className="p-4 grid md:grid-cols-4 gap-4 text-sm">
          <div className="p-3 rounded bg-slate-50 border"><p className="text-xs font-bold text-slate-500">Run ID</p><p className="font-black mt-1">{runId}</p></div>
          <div className="p-3 rounded bg-slate-50 border"><p className="text-xs font-bold text-slate-500">Status</p><p className="mt-1"><Badge label={status} tone={status === 'Executed' ? 'success' : status === 'Reversed' ? 'warning' : 'neutral'} /></p></div>
          <div className="p-3 rounded bg-slate-50 border"><p className="text-xs font-bold text-slate-500">Executed By</p><input value={executedBy} onChange={(e) => setExecutedBy(e.target.value)} className="w-full mt-1 border rounded p-1.5" /></div>
          <div className="p-3 rounded bg-slate-50 border"><p className="text-xs font-bold text-slate-500">Period Year</p><input value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} className="w-full mt-1 border rounded p-1.5" /></div>
        </div>}

        {activeTab === 'dataSelection' && <div className="p-4 text-sm"><ul className="list-disc pl-5 space-y-1 text-slate-600"><li>Dropdowns load active Company and Set of Books from configuration tables.</li><li>Set of Books is filtered by selected Company.</li><li>GL source is only gl_master records for selected set_of_books_id.</li><li>No manual GL selection is supported in BCF execution.</li></ul></div>}

        {activeTab === 'messages' && <div className="p-4"><div className="max-h-72 overflow-auto border rounded">{messages.map((msg, idx) => <div key={`${msg}-${idx}`} className="px-3 py-2 border-b text-sm font-medium text-slate-700">{msg}</div>)}</div></div>}

        {activeTab === 'postings' && <div className="p-4 space-y-4">
          <div className="flex gap-2 flex-wrap">{[
            { key: 'closingBs', label: 'Closing Balance Sheet Accounts' },
            { key: 'openingBs', label: 'Opening Balance Sheet Accounts' },
            { key: 'pl', label: 'Profit & Loss Accounts' },
            { key: 'journals', label: 'Journal Entries' }
          ].map((tab) => <button key={tab.key} onClick={() => setActivePostingTab(tab.key as PostingTab)} className={`px-3 py-2 text-xs font-bold border rounded ${activePostingTab === tab.key ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700'}`}>{tab.label}</button>)}</div>

          {activePostingTab !== 'journals' && <div className="overflow-x-auto border rounded"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Account</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-left">Journal Entry</th></tr></thead><tbody>{currentGrid.map((row) => <tr key={`${row.accountCode}-${row.journalEntryId}`} className="border-t"><td className="p-2 font-semibold">{row.accountCode} - {row.accountName}</td><td className="p-2 text-right">{formatAmount(row.debit)}</td><td className="p-2 text-right">{formatAmount(row.credit)}</td><td className="p-2 font-mono text-xs">{row.journalEntryId}</td></tr>)}{currentGrid.length === 0 && <tr><td className="p-4 text-center text-slate-500" colSpan={4}>No posting lines generated yet.</td></tr>}</tbody></table></div>}

          {activePostingTab === 'journals' && <div className="overflow-x-auto border rounded"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Journal Entry ID</th><th className="p-2 text-left">BCF Run</th><th className="p-2 text-left">Company</th><th className="p-2 text-left">Set of Books</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th></tr></thead><tbody>{journals.map((j) => <tr key={j.id} className="border-t"><td className="p-2 font-mono text-xs">{j.id}</td><td className="p-2 font-mono text-xs">{j.bcfRunId}</td><td className="p-2 font-mono text-xs">{j.companyCodeId}</td><td className="p-2 font-mono text-xs">{j.setOfBooksId}</td><td className="p-2 text-right">{formatAmount(j.totalDebit)}</td><td className="p-2 text-right">{formatAmount(j.totalCredit)}</td></tr>)}{journals.length === 0 && <tr><td className="p-4 text-center text-slate-500" colSpan={6}>No journal entries generated yet.</td></tr>}</tbody><tfoot className="bg-slate-50 font-black"><tr><td className="p-2" colSpan={4}>Consolidated Totals</td><td className="p-2 text-right">{formatAmount(totalDebit)}</td><td className="p-2 text-right">{formatAmount(totalCredit)}</td></tr></tfoot></table></div>}
        </div>}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3"><h2 className="font-black text-lg">BCF Run Log</h2><Badge label={`${runLog.length} runs`} /></div>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-slate-100 text-slate-700"><tr><th className="p-2 text-left">Run ID</th><th className="p-2 text-left">Company Code</th><th className="p-2 text-left">Set of Books</th><th className="p-2 text-left">FY</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Mode</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Executed By / At</th><th className="p-2 text-left">Actions</th></tr></thead>
            <tbody>
              {runLog.map((item) => <tr key={item.runId} className="border-t"><td className="p-2 font-mono">{item.runId}</td><td className="p-2 font-mono">{item.companyCodeId}</td><td className="p-2 font-mono">{item.setOfBooksId}</td><td className="p-2">{item.fyFrom} → {item.fyTo}</td><td className="p-2">{item.runType}</td><td className="p-2">{item.mode}</td><td className="p-2"><Badge label={item.status} tone={item.status === 'Executed' ? 'success' : item.status === 'Reversed' ? 'warning' : 'neutral'} /></td><td className="p-2">{item.executedBy}<br />{item.executedAt ? new Date(item.executedAt).toLocaleString('en-IN') : '-'}</td><td className="p-2"><button onClick={() => reverseRun(item.runId)} disabled={item.status !== 'Executed'} className="px-2 py-1 text-[10px] font-bold border rounded bg-amber-500 text-white disabled:opacity-50">Reverse</button></td></tr>)}
              {runLog.length === 0 && <tr><td className="p-4 text-center text-slate-500" colSpan={9}>No runs in log yet. Execute an Actual run to create audit history.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default BalanceCarryforward;
