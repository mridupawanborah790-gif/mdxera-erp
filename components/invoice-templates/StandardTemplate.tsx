

import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem, AppConfigurations } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { formatPackLooseQuantity } from '../../utils/quantity';
import { calculateBillingTotals } from '../../utils/billing';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[]; configurations: AppConfigurations; };
}

const StandardTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';

  const computedBillTotals = useMemo(() => calculateBillingTotals({
    items: bill.items || [],
    billDiscount: bill.schemeDiscount || 0,
    isNonGst,
    configurations: bill.configurations,
    organizationType: bill.pharmacy?.organization_type,
    pricingMode: bill.pricingMode
  }), [bill.items, bill.schemeDiscount, bill.configurations, isNonGst, bill.pharmacy?.organization_type, bill.pricingMode]);

  const itemsWithCalculations = useMemo(() => {
    const effectivePricingMode = bill.pricingMode || (bill.pharmacy?.organization_type === 'Distributor' ? 'rate' : (bill.configurations?.displayOptions?.pricingMode || 'mrp'));

    return (bill.items || []).map(item => {
      const rate = effectivePricingMode === 'mrp' ? (item.mrp ?? 0) : (item.rate ?? item.mrp ?? 0);
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const tradeDiscount = (rate * billedQty) * ((item.discountPercent || 0) / 100);
      const schemeDiscount = item.schemeDiscountAmount || 0;
      const totalDiscount = tradeDiscount + schemeDiscount;
      const amount = (rate * billedQty) - totalDiscount;
      
      const invItem = bill.inventory?.find(i => i.id === item.inventoryItemId);
      const unit = item.packType || invItem?.packType || '-';

      return {
        ...item,
        unit,
        totalDiscount,
        amount,
        billedRate: rate
      };
    });
  }, [bill.items, bill.inventory, bill.pricingMode, bill.pharmacy?.organization_type, bill.configurations]);

  const totalSaved = useMemo(() => {
    return itemsWithCalculations.reduce((acc, i) => acc + (i.totalDiscount || 0), 0) + (bill.schemeDiscount || 0);
  }, [itemsWithCalculations, bill.schemeDiscount]);

  return (
    <div className="bg-white text-black font-sans p-10 min-h-[297mm] w-full mx-auto flex flex-col leading-snug antialiased border border-gray-100">
      {/* 1. Header with Logo and Pharmacy Details */}
      <div className="flex justify-between items-start mb-2">
        <div className="w-24">
          {bill.pharmacy.pharmacy_logo_url && (
            <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="w-full h-auto object-contain" />
          )}
        </div>
        <div className="text-right flex-1 pl-10">
          <h1 className="text-2xl font-black uppercase text-gray-900 tracking-tight">{bill.pharmacy.pharmacy_name}</h1>
          <p className="text-[10pt] font-bold text-gray-700">{bill.pharmacy.address}</p>
          <div className="text-[10pt] text-gray-600 font-medium">
            <span className="mr-4">Phone no.: {bill.pharmacy.mobile}</span>
            <span>Email: {bill.pharmacy.email}</span>
          </div>
        </div>
      </div>

      {/* 2. Bill Title */}
      <div className="border-t-2 border-black mt-2 pt-2 pb-4">
        <h2 className="text-center text-xl font-black uppercase tracking-widest border-b-2 border-black pb-2 mb-6">
          {isNonGst ? 'Bill of Supply' : 'Tax Invoice'}
        </h2>
      </div>

      {/* 3. Bill To & Invoice Details */}
      <div className="flex justify-between items-start mb-6 px-1">
        <div className="w-1/2">
          <h3 className="text-[10pt] font-black uppercase text-gray-400 mb-1 tracking-widest">Bill To</h3>
          <p className="text-[11pt] font-black text-gray-900">{bill.customerName}</p>
          <div className="text-[10pt] text-gray-600 font-medium space-y-0.5">
            {bill.customerDetails?.address && <p className="max-w-xs">{bill.customerDetails.address}</p>}
            {bill.customerPhone && <p>Ph: {bill.customerPhone}</p>}
            {!isNonGst && bill.customerDetails?.gstNumber && <p>GSTIN: {bill.customerDetails.gstNumber}</p>}
          </div>
        </div>
        <div className="w-1/2 text-right">
          <h3 className="text-[10pt] font-black uppercase text-gray-400 mb-1 tracking-widest">Invoice Details</h3>
          <div className="text-[11pt] space-y-1 font-bold">
            <p>Invoice No.: <span className="font-mono">{bill.id}</span></p>
            <p>Date: {new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* 4. Main Product Table */}
      <div className="flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#2e3b84] text-white">
              <th className="p-2 text-center w-[5%] font-bold text-[10pt]">#</th>
              <th className="p-2 text-left w-[40%] font-bold text-[10pt]">Item Name</th>
              <th className="p-2 text-center w-[10%] font-bold text-[10pt]">Qty</th>
              <th className="p-2 text-right w-[15%] font-bold text-[10pt]">Rate</th>
              <th className="p-2 text-right w-[10%] font-bold text-[10pt]">Disc%</th>
              <th className="p-2 text-right w-[20%] font-bold text-[10pt]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {itemsWithCalculations.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100 h-10">
                <td className="p-2 text-center">{idx + 1}</td>
                <td className="p-2">
                  <p className="font-bold">{item.name}</p>
                  <p className="text-[8pt] text-gray-400">Pack: {item.unit}</p>
                </td>
                <td className="p-2 text-center">{formatPackLooseQuantity(item.quantity, item.looseQuantity)}</td>
                <td className="p-2 text-right">{(item.billedRate || 0).toFixed(2)}</td>
                <td className="p-2 text-right">{item.discountPercent || 0}</td>
                <td className="p-2 text-right font-bold">{(item.amount || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. Summary Footer */}
      <div className="mt-10 border-t-2 border-black pt-6">
        <div className="flex justify-between items-start">
          <div className="w-2/3">
            <p className="text-[10pt] font-black uppercase text-gray-400 mb-2 tracking-widest">Amount in Words</p>
            <p className="text-[11pt] font-bold italic text-gray-800">{numberToWords(bill.total || 0)}</p>
            
            <div className="mt-10 text-[9pt] text-gray-500 max-w-sm">
              <h4 className="font-black uppercase tracking-widest mb-2">Terms & Conditions</h4>
              <p className="whitespace-pre-line">{bill.pharmacy.terms_and_conditions || "1. Goods once sold will not be taken back.\n2. Standard warranty applies where applicable."}</p>
            </div>
          </div>
          
          <div className="w-1/3 text-right">
            <div className="space-y-2 text-[10pt]">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold uppercase">Subtotal</span>
                <span className="font-bold">₹{(bill.subtotal || 0).toFixed(2)}</span>
              </div>
              {!isNonGst && (
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold uppercase">Tax (GST)</span>
                  <span className="font-bold">₹{(bill.totalGst || 0).toFixed(2)}</span>
                </div>
              )}
              {totalSaved > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="font-bold uppercase italic">Total Savings</span>
                  <span className="font-bold">- ₹{(totalSaved || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-4 mt-2 border-t-2 border-black flex justify-between items-center">
                <span className="text-[12pt] font-black uppercase">Grand Total</span>
                <span className="text-[18pt] font-black text-[#2e3b84]">₹{(bill.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Signature Area */}
      <div className="mt-20 flex justify-between items-end">
        <div className="text-[8pt] text-gray-400">
          <p>Digital Signature Not Required</p>
          <p>Generated via Medimart Retail ERP</p>
        </div>
        <div className="text-center w-64">
          <p className="text-[9pt] font-black uppercase mb-1">{bill.pharmacy.pharmacy_name}</p>
          <div className="h-10"></div>
          <p className="border-t border-black pt-2 text-[10pt] font-black uppercase tracking-widest">{bill.pharmacy.full_name}</p>
          <p className="text-[8pt] font-bold text-gray-400">Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
};

export default StandardTemplate;
