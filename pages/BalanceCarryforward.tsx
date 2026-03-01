import React, { useEffect, useMemo, useState } from 'react';

type RunType = 'BS' | 'PL';
type RunMode = 'Test' | 'Actual';
type RunStatus = 'Draft' | 'Executed' | 'Reversed' | 'Closed';
type MainTab = 'general' | 'dataSelection' | 'messages' | 'postings';
type PostingTab = 'closingBs' | 'openingBs' | 'pl' | 'journals';

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
  date: string;
  reference: string;
  narration: string;
  postingGroup: string;
  totalDebit: number;
  totalCredit: number;
  lines: AccountPosting[];
}

interface RunJournalMap {
  runId: string;
  journalEntryId: string;
  reversalJournalEntryId?: string;
}

interface BcfRunLog {
  runId: string;
  orgId: string;
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
  journalMappings: RunJournalMap[];
  messages: string[];
  reversedFromRunId?: string;
  reversedBy?: string;
  reversedAt?: string;
  reverseReason?: string;
}

const STORAGE_KEY = 'mdxera.bcf.run.log.v1';

const round2 = (value: number) => Number((value || 0).toFixed(2));
const formatAmount = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sampleBsAccounts = [
  { accountCode: '1100', accountName: 'Cash In Hand', closing: 120500.34, type: 'asset' },
  { accountCode: '1210', accountName: 'Trade Receivables', closing: 84210.0, type: 'asset' },
  { accountCode: '2100', accountName: 'Trade Payables', closing: 67780.75, type: 'liability' },
  { accountCode: '2300', accountName: 'GST Payable', closing: 10234.59, type: 'liability' }
] as const;

const samplePlAccounts = [
  { accountCode: '4100', accountName: 'Sales Revenue', balance: 635200.5, nature: 'income' },
  { accountCode: '5100', accountName: 'Cost of Goods Sold', balance: 411980.65, nature: 'expense' },
  { accountCode: '5200', accountName: 'Salary Expense', balance: 89250.0, nature: 'expense' },
  { accountCode: '5300', accountName: 'Rent Expense', balance: 36250.0, nature: 'expense' }
] as const;

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

const persistRunLog = (runs: BcfRunLog[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
};

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

const BalanceCarryforward: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('general');
  const [activePostingTab, setActivePostingTab] = useState<PostingTab>('closingBs');
  const [runType, setRunType] = useState<RunType>('BS');
  const [mode, setMode] = useState<RunMode>('Test');
  const [status, setStatus] = useState<RunStatus>('Draft');
  const [runId, setRunId] = useState<string>(makeRunId());
  const [company, setCompany] = useState('MDXERA ORGANIZATION');
  const [orgId, setOrgId] = useState('ORG-001');
  const [setOfBooksId, setSetOfBooksId] = useState('SOB-PRIMARY');
  const [fyFrom, setFyFrom] = useState('2024-04-01');
  const [fyTo, setFyTo] = useState('2025-03-31');
  const [periodYear, setPeriodYear] = useState('2024-25');
  const [executedBy, setExecutedBy] = useState('System Admin');

  const [messages, setMessages] = useState<string[]>(['Create a new run and execute Test or Actual based on validation readiness.']);
  const [closingBsAccounts, setClosingBsAccounts] = useState<AccountPosting[]>([]);
  const [openingBsAccounts, setOpeningBsAccounts] = useState<AccountPosting[]>([]);
  const [profitLossAccounts, setProfitLossAccounts] = useState<AccountPosting[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [runLog, setRunLog] = useState<BcfRunLog[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountPosting | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);

  useEffect(() => {
    setRunLog(loadRunLog());
  }, []);

  const totalDebit = useMemo(() => round2(journals.reduce((acc, journal) => acc + journal.totalDebit, 0)), [journals]);
  const totalCredit = useMemo(() => round2(journals.reduce((acc, journal) => acc + journal.totalCredit, 0)), [journals]);

  const hasActualDuplicate = useMemo(() => runLog.some((item) => (
    item.orgId === orgId
    && item.setOfBooksId === setOfBooksId
    && item.fyFrom === fyFrom
    && item.fyTo === fyTo
    && item.runType === runType
    && item.mode === 'Actual'
    && item.status !== 'Reversed'
  )), [runLog, orgId, setOfBooksId, fyFrom, fyTo, runType]);

  const hasPendingDraft = useMemo(() => runLog.some((item) => (
    item.orgId === orgId
    && item.setOfBooksId === setOfBooksId
    && item.fyFrom === fyFrom
    && item.fyTo === fyTo
    && item.status === 'Draft'
    && item.runId !== runId
  )), [runLog, orgId, setOfBooksId, fyFrom, fyTo, runId]);

  const generatePostings = (targetRunType: RunType) => {
    const nextMessages: string[] = [];
    const nextClosingBs: AccountPosting[] = [];
    const nextOpeningBs: AccountPosting[] = [];
    const nextPl: AccountPosting[] = [];
    const nextJournals: JournalEntry[] = [];

    if (targetRunType === 'BS') {
      sampleBsAccounts.forEach((row, index) => {
        const journalId = makeJournalId(index);
        const amount = round2(row.closing);
        const closingLine: AccountPosting = {
          accountCode: row.accountCode,
          accountName: row.accountName,
          debit: row.type === 'liability' ? amount : 0,
          credit: row.type === 'asset' ? amount : 0,
          journalEntryId: journalId,
          lineMemo: 'Closing balance carryforward'
        };
        const openingLine: AccountPosting = {
          accountCode: row.accountCode,
          accountName: row.accountName,
          debit: row.type === 'asset' ? amount : 0,
          credit: row.type === 'liability' ? amount : 0,
          journalEntryId: journalId,
          lineMemo: 'Opening balance carryforward'
        };
        nextClosingBs.push(closingLine);
        nextOpeningBs.push(openingLine);
        nextJournals.push({
          id: journalId,
          date: fyTo,
          reference: runId,
          narration: `BCF BS carryforward for ${row.accountName}`,
          postingGroup: `Ledger Group ${index + 1}`,
          totalDebit: round2(closingLine.debit + openingLine.debit),
          totalCredit: round2(closingLine.credit + openingLine.credit),
          lines: [closingLine, openingLine]
        });
      });
      nextMessages.push('BCF-BS simulation prepared: closing balance sheet mapped to opening balances.');
    }

    if (targetRunType === 'PL') {
      const journalId = makeJournalId(0);
      let incomeTotal = 0;
      let expenseTotal = 0;
      samplePlAccounts.forEach((row) => {
        const amount = round2(row.balance);
        if (row.nature === 'income') incomeTotal += amount;
        if (row.nature === 'expense') expenseTotal += amount;

        nextPl.push({
          accountCode: row.accountCode,
          accountName: row.accountName,
          debit: row.nature === 'income' ? amount : 0,
          credit: row.nature === 'expense' ? amount : 0,
          journalEntryId: journalId,
          lineMemo: 'P&L closing entry'
        });
      });

      const profit = round2(incomeTotal - expenseTotal);
      const retainedEarningsLine: AccountPosting = {
        accountCode: '3100',
        accountName: 'Retained Earnings / Capital',
        debit: profit < 0 ? Math.abs(profit) : 0,
        credit: profit > 0 ? Math.abs(profit) : 0,
        journalEntryId: journalId,
        lineMemo: `Transfer ${profit >= 0 ? 'profit' : 'loss'} to retained earnings`
      };
      nextPl.push(retainedEarningsLine);

      nextJournals.push({
        id: journalId,
        date: fyTo,
        reference: runId,
        narration: `BCF P&L closure (${periodYear})`,
        postingGroup: 'P&L Settlement',
        totalDebit: round2(nextPl.reduce((sum, row) => sum + row.debit, 0)),
        totalCredit: round2(nextPl.reduce((sum, row) => sum + row.credit, 0)),
        lines: [...nextPl]
      });

      nextMessages.push(`BCF-P&L simulation prepared: net ${(profit >= 0 ? 'profit' : 'loss')} ${formatAmount(Math.abs(profit))} transferred to retained earnings.`);
    }

    return {
      nextClosingBs,
      nextOpeningBs,
      nextPl,
      nextJournals,
      nextMessages
    };
  };

  const applyPostingResult = (result: ReturnType<typeof generatePostings>) => {
    setClosingBsAccounts(result.nextClosingBs);
    setOpeningBsAccounts(result.nextOpeningBs);
    setProfitLossAccounts(result.nextPl);
    setJournals(result.nextJournals);
    setMessages((prev) => [...prev, ...result.nextMessages]);
  };

  const createNewRun = () => {
    setRunId(makeRunId());
    setStatus('Draft');
    setMode('Test');
    setMessages(['New run initialized. Configure run type and execute Test run first.']);
    setClosingBsAccounts([]);
    setOpeningBsAccounts([]);
    setProfitLossAccounts([]);
    setJournals([]);
    setSelectedAccount(null);
    setSelectedJournal(null);
    setSelectedRunId(null);
  };

  const executeTest = () => {
    setMode('Test');
    setStatus('Executed');
    const result = generatePostings(runType);
    applyPostingResult(result);
    setMessages((prev) => [...prev, 'Test Run completed successfully. No postings were made to the ledger.']);
  };

  const executeActual = () => {
    setMode('Actual');

    if (hasActualDuplicate) {
      setMessages((prev) => [...prev, 'Validation error: duplicate Actual run exists for same Org/SOB/FY/Run Type. Reverse previous run before re-run.']);
      return;
    }

    if (hasPendingDraft) {
      setMessages((prev) => [...prev, 'Validation error: pending Draft run found for selected FY and set of books.']);
      return;
    }

    if (fyFrom >= fyTo) {
      setMessages((prev) => [...prev, 'Validation error: FY From must be earlier than FY To.']);
      return;
    }

    const result = generatePostings(runType);
    applyPostingResult(result);

    const postJournals = result.nextJournals.map((journal) => journal.id);
    const totalDr = round2(result.nextJournals.reduce((sum, journal) => sum + journal.totalDebit, 0));
    const totalCr = round2(result.nextJournals.reduce((sum, journal) => sum + journal.totalCredit, 0));

    if (Math.abs(totalDr - totalCr) > 0.01 && result.nextJournals.length > 0) {
      setMessages((prev) => [...prev, 'Validation error: Total debit and credit mismatch in generated journals.']);
      return;
    }

    const executedAt = toTimestamp();
    const mappings = postJournals.map((journalEntryId) => ({ runId, journalEntryId }));
    const entry: BcfRunLog = {
      runId,
      orgId,
      setOfBooksId,
      company,
      fyFrom,
      fyTo,
      runType,
      mode: 'Actual',
      status: 'Executed',
      periodYear,
      executedBy,
      executedAt,
      totalDebit: totalDr,
      totalCredit: totalCr,
      journalEntryIds: postJournals,
      closingBsAccounts: result.nextClosingBs,
      openingBsAccounts: result.nextOpeningBs,
      profitLossAccounts: result.nextPl,
      journals: result.nextJournals,
      journalMappings: mappings,
      messages: [...messages, 'Actual Run executed and locked. Audit log updated.']
    };

    const nextRunLog = [entry, ...runLog];
    setRunLog(nextRunLog);
    persistRunLog(nextRunLog);
    setStatus('Executed');
    setMessages((prev) => [...prev, 'Actual Run executed and locked. System-generated journal entries posted.']);
  };

  const reverseRun = (targetRunId?: string) => {
    const runIdToReverse = targetRunId || selectedRunId || runId;
    const latestActual = runLog.find((item) => item.runId === runIdToReverse && item.mode === 'Actual');
    if (!latestActual || latestActual.status !== 'Executed') {
      setMessages((prev) => [...prev, 'Reverse not allowed: select/open an Executed Actual run from BCF Run Log first.']);
      return;
    }


    const reason = window.prompt(`Enter reversal reason for run ${latestActual.runId}`, 'Business correction') || '';
    if (!reason.trim()) {
      setMessages((prev) => [...prev, `Reversal cancelled for ${latestActual.runId}: reason is mandatory.`]);
      return;
    }

    const reversedAt = toTimestamp();
    const reversedBy = executedBy;

    const reversalJournals = latestActual.journals.map((journal, index) => {
      const reversalId = makeReversalJournalId(latestActual.runId, index);
      const reversedLines = journal.lines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
        journalEntryId: reversalId,
        lineMemo: `Reversal for ${line.journalEntryId}`
      }));

      return {
        ...journal,
        id: reversalId,
        reference: latestActual.runId,
        narration: `Reversal of ${journal.id}`,
        postingGroup: `Reversal - ${journal.postingGroup}`,
        totalDebit: journal.totalCredit,
        totalCredit: journal.totalDebit,
        lines: reversedLines,
        date: reversedAt.slice(0, 10)
      };
    });

    const existingMappings = latestActual.journalMappings?.length
      ? latestActual.journalMappings
      : latestActual.journalEntryIds.map((journalEntryId) => ({ runId: latestActual.runId, journalEntryId }));

    const reversalMappings = existingMappings.map((map, index) => ({
      ...map,
      reversalJournalEntryId: reversalJournals[index]?.id
    }));

    const updatedRun: BcfRunLog = {
      ...latestActual,
      status: 'Reversed',
      reversedFromRunId: latestActual.runId,
      reversedBy,
      reversedAt,
      reverseReason: reason.trim(),
      journalEntryIds: [...latestActual.journalEntryIds, ...reversalJournals.map((journal) => journal.id)],
      journals: [...latestActual.journals, ...reversalJournals],
      journalMappings: reversalMappings,
      messages: [...latestActual.messages, `Reversal posted for run ${latestActual.runId}. Reason: ${reason.trim()}`]
    };

    const nextRunLog = runLog.map((item) => (item.runId === latestActual.runId ? updatedRun : item));
    setRunLog(nextRunLog);
    persistRunLog(nextRunLog);
    setStatus('Reversed');
    setJournals(updatedRun.journals);
    setMessages((prev) => [...prev, `Run ${latestActual.runId} reversed successfully. Controlled re-run is now allowed.`]);
  };

  const closeRun = () => {
    setStatus('Closed');
    setMessages((prev) => [...prev, 'Run is now closed.']);
  };

  const openRun = (entry: BcfRunLog) => {
    setSelectedRunId(entry.runId);
    setRunId(entry.runId);
    setOrgId(entry.orgId);
    setSetOfBooksId(entry.setOfBooksId);
    setCompany(entry.company);
    setFyFrom(entry.fyFrom);
    setFyTo(entry.fyTo);
    setRunType(entry.runType);
    setMode(entry.mode);
    setStatus(entry.status);
    setPeriodYear(entry.periodYear);
    setExecutedBy(entry.executedBy);
    setClosingBsAccounts(entry.closingBsAccounts || []);
    setOpeningBsAccounts(entry.openingBsAccounts || []);
    setProfitLossAccounts(entry.profitLossAccounts || []);
    setJournals(entry.journals || []);
    setMessages(entry.messages || []);
    setSelectedJournal(null);
  };

  const selectedRun = useMemo(() => runLog.find((entry) => entry.runId === selectedRunId) || null, [runLog, selectedRunId]);

  const currentGrid = activePostingTab === 'closingBs'
    ? closingBsAccounts
    : activePostingTab === 'openingBs'
      ? openingBsAccounts
      : activePostingTab === 'pl'
        ? profitLossAccounts
        : [];

  return (
    <div className="bg-slate-50 min-h-full p-6 md:p-8 space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-black text-primary uppercase tracking-wide">Balance Carryforward</h1>
            <p className="text-xs mt-1 text-slate-600 font-semibold">Financial Statement &gt; Balance Carryforward</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={createNewRun} className="px-3 py-2 text-xs font-bold border rounded-md bg-white hover:bg-slate-100">New</button>
            <button onClick={executeTest} className="px-3 py-2 text-xs font-bold border rounded-md bg-blue-600 text-white hover:bg-blue-700">Execute Test</button>
            <button onClick={executeActual} className="px-3 py-2 text-xs font-bold border rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Execute Actual</button>
            <button
              onClick={() => reverseRun()}
              disabled={!selectedRun || selectedRun.status !== 'Executed'}
              className="px-3 py-2 text-xs font-bold border rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reverse
            </button>
            <button onClick={closeRun} className="px-3 py-2 text-xs font-bold border rounded-md bg-slate-800 text-white hover:bg-slate-900">Close</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <label className="text-xs font-bold text-slate-600">Company
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white" />
          </label>
          <label className="text-xs font-bold text-slate-600">Set of Books
            <input value={setOfBooksId} onChange={(e) => setSetOfBooksId(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white" />
          </label>
          <label className="text-xs font-bold text-slate-600">Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as RunMode)} className="mt-1 w-full border rounded p-2 bg-white">
              <option value="Test">Test</option>
              <option value="Actual">Actual</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Run ID
            <input value={runId} readOnly className="mt-1 w-full border rounded p-2 bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-600">Period-Year
            <input value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} className="mt-1 w-full border rounded p-2 bg-white" />
          </label>
          <label className="text-xs font-bold text-slate-600">Status
            <div className="mt-1 p-2 border rounded bg-slate-50"><Badge label={status} tone={status === 'Executed' ? 'success' : status === 'Reversed' ? 'warning' : status === 'Closed' ? 'neutral' : 'danger'} /></div>
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
        {selectedRun && (
          <div className="px-4 pt-4 pb-0 text-xs font-semibold text-slate-600">
            Run Details: <span className="font-mono">{selectedRun.runId}</span>
            {selectedRun.reversedAt ? ` • Reversed by ${selectedRun.reversedBy} on ${new Date(selectedRun.reversedAt).toLocaleString('en-IN')}` : ''}
          </div>
        )}
        <div className="border-b px-4 pt-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'general', label: 'General' },
              { key: 'dataSelection', label: 'Data Selection' },
              { key: 'messages', label: 'Messages' },
              { key: 'postings', label: 'Postings' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as MainTab)}
                className={`px-3 py-2 text-xs font-bold border-b-2 ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'general' && (
          <div className="p-4 grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded bg-slate-50 border">
              <p className="text-xs font-bold text-slate-500">Organization</p>
              <p className="font-black mt-1">{orgId}</p>
            </div>
            <div className="p-3 rounded bg-slate-50 border">
              <p className="text-xs font-bold text-slate-500">Executed By</p>
              <input value={executedBy} onChange={(e) => setExecutedBy(e.target.value)} className="w-full mt-1 border rounded p-1.5" />
            </div>
            <div className="p-3 rounded bg-slate-50 border">
              <p className="text-xs font-bold text-slate-500">Control Validation</p>
              <p className="mt-1 font-semibold">Duplicate Actual: {hasActualDuplicate ? 'Blocked' : 'Allowed'}</p>
            </div>
          </div>
        )}

        {activeTab === 'dataSelection' && (
          <div className="p-4 text-sm space-y-2">
            <p className="font-bold">Selection Basis</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>BCF-BS closes Balance Sheet accounts and opens same balances in the next fiscal year.</li>
              <li>BCF-P&amp;L closes Income/Expense accounts and transfers net result to Retained Earnings/Capital.</li>
              <li>Actual Run is blocked for duplicates by (org_id, set_of_books, fy_from, fy_to, run_type).</li>
            </ul>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="p-4">
            <div className="max-h-72 overflow-auto border rounded">
              {messages.map((msg, idx) => (
                <div key={`${msg}-${idx}`} className="px-3 py-2 border-b text-sm font-medium text-slate-700">{msg}</div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'postings' && (
          <div className="p-4 space-y-4">
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'closingBs', label: 'Closing Balance Sheet Accounts' },
                { key: 'openingBs', label: 'Opening Balance Sheet Accounts' },
                { key: 'pl', label: 'Profit & Loss Accounts' },
                { key: 'journals', label: 'Journal Entries' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActivePostingTab(tab.key as PostingTab)}
                  className={`px-3 py-2 text-xs font-bold border rounded ${activePostingTab === tab.key ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activePostingTab !== 'journals' && (
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-2 text-left">Account</th>
                      <th className="p-2 text-right">Debit</th>
                      <th className="p-2 text-right">Credit</th>
                      <th className="p-2 text-left">Journal Entry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentGrid.map((row) => (
                      <tr key={`${row.accountCode}-${row.journalEntryId}`} onClick={() => setSelectedAccount(row)} className="border-t hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 font-semibold">{row.accountCode} - {row.accountName}</td>
                        <td className="p-2 text-right">{formatAmount(row.debit)}</td>
                        <td className="p-2 text-right">{formatAmount(row.credit)}</td>
                        <td className="p-2 font-mono text-xs">{row.journalEntryId}</td>
                      </tr>
                    ))}
                    {currentGrid.length === 0 && (
                      <tr><td className="p-4 text-center text-slate-500" colSpan={4}>No posting lines generated yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activePostingTab === 'journals' && (
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-2 text-left">Journal Entry ID</th>
                      <th className="p-2 text-left">Posting Date</th>
                      <th className="p-2 text-left">Posting Group</th>
                      <th className="p-2 text-left">Narration</th>
                      <th className="p-2 text-right">Debit</th>
                      <th className="p-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journals.map((j) => (
                      <tr key={j.id} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => setSelectedJournal(j)}>
                        <td className="p-2 font-mono text-xs text-blue-700 underline">{j.id}</td>
                        <td className="p-2">{j.date}</td>
                        <td className="p-2">{j.postingGroup}</td>
                        <td className="p-2">{j.narration}</td>
                        <td className="p-2 text-right">{formatAmount(j.totalDebit)}</td>
                        <td className="p-2 text-right">{formatAmount(j.totalCredit)}</td>
                      </tr>
                    ))}
                    {journals.length === 0 && (
                      <tr><td className="p-4 text-center text-slate-500" colSpan={6}>No journal entries generated yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 font-black">
                    <tr>
                      <td className="p-2" colSpan={2}>Consolidated Totals</td>
                      <td className="p-2 text-right">{formatAmount(totalDebit)}</td>
                      <td className="p-2 text-right">{formatAmount(totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {selectedJournal && (
              <div className="border rounded p-3 bg-indigo-50">
                <p className="text-xs font-bold text-slate-500">Voucher View (Journal Drill-down)</p>
                <p className="font-black text-sm mt-1">{selectedJournal.id} • {selectedJournal.narration}</p>
                <p className="text-sm mt-1">Reference Run: <span className="font-mono">{selectedJournal.reference}</span></p>
                <div className="mt-2 overflow-x-auto border rounded bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left">Account</th>
                        <th className="p-2 text-right">Debit</th>
                        <th className="p-2 text-right">Credit</th>
                        <th className="p-2 text-left">Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedJournal.lines.map((line, index) => (
                        <tr key={`${selectedJournal.id}-${line.accountCode}-${index}`} className="border-t">
                          <td className="p-2">{line.accountCode} - {line.accountName}</td>
                          <td className="p-2 text-right">{formatAmount(line.debit)}</td>
                          <td className="p-2 text-right">{formatAmount(line.credit)}</td>
                          <td className="p-2">{line.lineMemo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedAccount && (
              <div className="border rounded p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-500">Details (Drill-down)</p>
                <p className="font-black text-sm mt-1">{selectedAccount.accountCode} - {selectedAccount.accountName}</p>
                <p className="text-sm mt-1">Journal Entry ID: <span className="font-mono">{selectedAccount.journalEntryId}</span></p>
                <p className="text-sm">Line Memo: {selectedAccount.lineMemo}</p>
                <p className="text-sm">Debit: {formatAmount(selectedAccount.debit)} | Credit: {formatAmount(selectedAccount.credit)}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg">BCF Run Log</h2>
          <Badge label={`${runLog.length} runs`} />
        </div>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">Run ID</th>
                <th className="p-2 text-left">Org</th>
                <th className="p-2 text-left">Set of Books</th>
                <th className="p-2 text-left">FY</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Mode</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Executed By / At</th>
                <th className="p-2 text-right">Dr</th>
                <th className="p-2 text-right">Cr</th>
                <th className="p-2 text-left">Journal IDs</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runLog.map((item) => (
                <tr key={item.runId} onClick={() => openRun(item)} className="border-t cursor-pointer hover:bg-blue-50">
                  <td className="p-2 font-mono text-blue-700 underline">{item.runId}</td>
                  <td className="p-2">{item.orgId}</td>
                  <td className="p-2">{item.setOfBooksId}</td>
                  <td className="p-2">{item.fyFrom} → {item.fyTo}</td>
                  <td className="p-2">{item.runType}</td>
                  <td className="p-2">{item.mode}</td>
                  <td className="p-2"><Badge label={item.status} tone={item.status === 'Executed' ? 'success' : item.status === 'Reversed' ? 'warning' : 'neutral'} /></td>
                  <td className="p-2">{item.executedBy}<br />{item.executedAt ? new Date(item.executedAt).toLocaleString('en-IN') : '-'}</td>
                  <td className="p-2 text-right">{formatAmount(item.totalDebit)}</td>
                  <td className="p-2 text-right">{formatAmount(item.totalCredit)}</td>
                  <td className="p-2 font-mono text-[10px]">JEs: {item.journals.length} • {item.journalEntryIds.join(', ')}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => reverseRun(item.runId)}
                      disabled={item.status !== 'Executed'}
                      className="px-2 py-1 text-[10px] font-bold border rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reverse
                    </button>
                  </td>
                </tr>
              ))}
              {runLog.length === 0 && (
                <tr><td className="p-4 text-center text-slate-500" colSpan={12}>No runs in log yet. Execute an Actual run to create audit history.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default BalanceCarryforward;
