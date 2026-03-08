import React, { useMemo, useState, useEffect, useCallback } from 'react';
import type { Transaction } from '../types';

type ReportMenuGroup = {
  id: string;
  label: string;
  children?: Array<{ id: string; label: string }>;
};

interface DailyReportsProps {
  transactions: Transaction[];
  reportId?: string;
}

const reportMenuGroups: ReportMenuGroup[] = [
  {
    id: 'dailyWorking',
    label: 'Daily Working',
    children: [
      { id: 'dispatchSummary', label: 'Dispatch Summary' },
      { id: 'reorderManagement', label: 'Re-order Management' },
      { id: 'stockSaleAnalysis', label: 'Stock & Sale Analysis' },
      { id: 'multiBillPrinting', label: 'Multi Bill / Other Printing' },
      { id: 'challanToBill', label: 'Challan to Bill' },
      { id: 'pendingChallans', label: 'Pending Challans' },
      { id: 'dispatchManagementReports', label: 'Dispatch Management Reports' },
      { id: 'rateComparisonStatement', label: 'Rate Comparison Statement' },
      { id: 'mergeBillsSingleOrder', label: 'Merge Bills in Single Order' },
      { id: 'partyNotVisited', label: 'Party Not Visited' },
      { id: 'billNotPrinted', label: 'Bill Not Printed' },
    ],
  },
  { id: 'fastReports', label: 'Fast Reports' },
  { id: 'businessAnalysis', label: 'Business Analysis' },
  { id: 'orderCrm', label: 'Order CRM' },
  { id: 'saleReport', label: 'Sale Report' },
  { id: 'purchaseReport', label: 'Purchase Report' },
  { id: 'inventoryReports', label: 'Inventory Reports' },
  { id: 'abcAnalysis', label: 'ABC Analysis' },
  { id: 'allAccountingRecords', label: 'All Accounting Records' },
  { id: 'purchasePlanning', label: 'Purchase Planning' },
];

const reportNameMap = new Map(reportMenuGroups.flatMap(group => (group.children || [{ id: group.id, label: group.label }]).map(item => [item.id, item.label])));

const formatDate = (date: string) => {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-GB');
};

const DailyReports: React.FC<DailyReportsProps> = ({ transactions, reportId }) => {
  const defaultReportId = reportId && reportNameMap.has(reportId) ? reportId : 'dispatchSummary';
  const [activeGroup, setActiveGroup] = useState('dailyWorking');
  const [activeReportId, setActiveReportId] = useState(defaultReportId);
  const [selectedRow, setSelectedRow] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!reportId || !reportNameMap.has(reportId)) return;
    setActiveReportId(reportId);
    const parentGroup = reportMenuGroups.find(group => group.children?.some(child => child.id === reportId));
    if (parentGroup) setActiveGroup(parentGroup.id);
  }, [reportId]);

  const reportRows = useMemo(() => {
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    const filtered = transactions
      .filter(tx => {
        const txDate = new Date(tx.date);
        if (from && txDate < from) return false;
        if (to) {
          const endOfDay = new Date(to);
          endOfDay.setHours(23, 59, 59, 999);
          if (txDate > endOfDay) return false;
        }
        return true;
      })
      .slice(0, 40)
      .map(tx => ({
        date: formatDate(tx.date),
        partyName: tx.customerName || 'Walk-in Customer',
        remark: tx.referredBy || tx.paymentMode || '-',
        voucherNo: tx.id,
        debit: tx.paymentMode === 'Credit' ? Number(tx.total || 0) : 0,
        credit: tx.paymentMode !== 'Credit' ? Number(tx.total || 0) : 0,
        type: tx.status || 'Sale',
        items: tx.items || [],
      }));

    return filtered;
  }, [transactions, fromDate, toDate]);

  useEffect(() => {
    setSelectedRow(0);
  }, [activeReportId, fromDate, toDate]);

  const selectedVoucher = reportRows[selectedRow];

  const handleKeyNav = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!reportRows.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedRow(prev => Math.min(prev + 1, reportRows.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedRow(prev => Math.max(prev - 1, 0));
    }
    if (event.key.toLowerCase() === 'home') {
      event.preventDefault();
      setSelectedRow(0);
    }
    if (event.key.toLowerCase() === 'end') {
      event.preventDefault();
      setSelectedRow(reportRows.length - 1);
    }
  }, [reportRows.length]);

  const totalDebit = reportRows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = reportRows.reduce((sum, row) => sum + row.credit, 0);

  return (
    <main className="flex-1 overflow-hidden flex bg-[#d4d8d3] font-mono" tabIndex={0} onKeyDown={handleKeyNav}>
      <aside className="w-80 border-r-2 border-[#83918e] bg-[#e8ece8] overflow-y-auto">
        <div className="bg-[#3f6e68] text-white px-3 py-2 text-sm font-bold tracking-wide">MDXERA Daily Reports</div>
        {reportMenuGroups.map(group => (
          <div key={group.id} className="border-b border-[#b2b9b5]">
            <button
              onClick={() => setActiveGroup(group.id)}
              className={`w-full text-left px-3 py-2 text-[15px] font-semibold ${activeGroup === group.id ? 'bg-[#d6dfdb] text-[#14302b]' : 'hover:bg-[#dee4e1] text-[#2f3836]'}`}
            >
              {group.label}
            </button>
            {activeGroup === group.id && group.children && (
              <div className="bg-white border-t border-[#c2ccc8]">
                {group.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => setActiveReportId(child.id)}
                    className={`w-full text-left px-5 py-2 text-[14px] border-b border-gray-200 ${activeReportId === child.id ? 'bg-[#1d4c45] text-white font-bold' : 'hover:bg-[#edf3f1]'}`}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="h-10 bg-[#335f59] text-white px-4 flex items-center justify-between border-b-2 border-[#233f3a]">
          <h1 className="text-lg font-bold tracking-wide">{reportNameMap.get(activeReportId) || 'Daily Reports'} - MDXERA ERP</h1>
          <span className="text-xs uppercase tracking-widest text-[#e4f2ee]">F2 Date · ↑↓ Move · Home/End Jump</span>
        </div>

        <div className="px-4 py-3 bg-[#ebefea] border-b border-[#c4ccc7] flex items-end gap-4">
          <div>
            <label className="block text-xs uppercase font-bold text-[#37534f]">Period From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-[#7f8f8a] px-2 py-1 bg-white text-sm" />
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[#37534f]">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-[#7f8f8a] px-2 py-1 bg-white text-sm" />
          </div>
          <button onClick={() => { setFromDate(''); setToDate(''); }} className="px-3 py-1.5 border border-[#6b7a76] bg-white text-xs font-bold uppercase">Clear</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto bg-[#f5f6f3]">
            <table className="w-full text-[13px] leading-tight min-w-[980px]">
              <thead className="sticky top-0 bg-[#d5dfdb] border-b-2 border-[#83918e] text-[#1c3531]">
                <tr>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Party Name</th>
                  <th className="px-2 py-1 text-left">Remark</th>
                  <th className="px-2 py-1 text-left">Voucher No</th>
                  <th className="px-2 py-1 text-right">Debit</th>
                  <th className="px-2 py-1 text-right">Credit</th>
                  <th className="px-2 py-1 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, index) => (
                  <tr key={row.voucherNo} className={`${selectedRow === index ? 'bg-[#2f5d57] text-white font-bold' : 'border-b border-[#d4d8d3]'}`}>
                    <td className="px-2">{row.date}</td>
                    <td className="px-2">{row.partyName}</td>
                    <td className="px-2">{row.remark}</td>
                    <td className="px-2">{row.voucherNo}</td>
                    <td className="px-2 text-right">{row.debit ? row.debit.toFixed(2) : '-'}</td>
                    <td className="px-2 text-right">{row.credit ? row.credit.toFixed(2) : '-'}</td>
                    <td className="px-2">{row.type}</td>
                  </tr>
                ))}
                {!reportRows.length && (
                  <tr>
                    <td className="px-2 py-4 text-center text-sm text-gray-500" colSpan={7}>No vouchers found for selected period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="w-80 border-l-2 border-[#889792] bg-[#ecefed] overflow-auto">
            <div className="bg-[#406a64] text-white px-3 py-2 text-sm font-bold">Voucher Detail Panel</div>
            {selectedVoucher ? (
              <div className="p-3 text-sm space-y-2">
                <p><span className="font-bold">Voucher:</span> {selectedVoucher.voucherNo}</p>
                <p><span className="font-bold">Date:</span> {selectedVoucher.date}</p>
                <p><span className="font-bold">Party:</span> {selectedVoucher.partyName}</p>
                <p><span className="font-bold">Type:</span> {selectedVoucher.type}</p>
                <p><span className="font-bold">Remark:</span> {selectedVoucher.remark}</p>
                <div className="pt-2 border-t border-[#b9c4be]">
                  <p className="font-bold text-xs uppercase mb-1">Line Items</p>
                  <ul className="space-y-1">
                    {selectedVoucher.items.slice(0, 6).map((item: any, idx: number) => (
                      <li key={`${item.name}-${idx}`} className="text-xs flex justify-between gap-2"><span>{item.name}</span><span>{item.quantity}</span></li>
                    ))}
                    {!selectedVoucher.items.length && <li className="text-xs text-gray-500">No line items available.</li>}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="p-3 text-sm text-gray-500">Select a row to view voucher details.</p>
            )}
          </div>
        </div>

        <div className="h-12 bg-[#dae2de] border-t-2 border-[#8c9995] px-4 flex items-center justify-between text-[13px] font-bold text-[#1f3833]">
          <span>Total Vouchers: {reportRows.length}</span>
          <span>Debit Total: {totalDebit.toFixed(2)} | Credit Total: {totalCredit.toFixed(2)}</span>
        </div>
      </section>
    </main>
  );
};

export default DailyReports;
