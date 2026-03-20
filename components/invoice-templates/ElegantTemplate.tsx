import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { formatPackLooseQuantity } from '../../utils/quantity';
import { numberToWords } from '../../utils/numberToWords';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const ElegantTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';
  
  const calculations = useMemo(() => {
    let totalTradeDiscount = 0;
    let totalItemSchemeDiscount = 0;
    
    const items = (bill.items || []).map(item => {
      const totalMrp = (item.mrp || 0) * (item.quantity || 0);
      const tradeDiscountAmount = totalMrp * ((item.discountPercent || 0) / 100);
      const schemeDiscountAmount = item.schemeDiscountAmount || 0;
      const totalLineDiscount = tradeDiscountAmount + schemeDiscountAmount;
      const priceAfterDiscount = totalMrp - totalLineDiscount;
      
      totalTradeDiscount += tradeDiscountAmount;
      totalItemSchemeDiscount += schemeDiscountAmount;

      const taxableValue = priceAfterDiscount / (1 + ((item.gstPercent || 0) / 100));
      const gstAmount = priceAfterDiscount - taxableValue;

      // Lookup Batch & Expiry
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
      const batch = item.batch || inventoryItem?.batch || '';
      const expiry = item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '');

      return {
        ...item,
        unit: item.packType || (item.unit === 'pack' ? 'Pack' : 'Pcs'),
        amount: priceAfterDiscount,
        taxableValue,
        gstAmount,
        batch,
        expiry
      };
    });

    const totalTaxableValue = (items || []).reduce((sum, item) => sum + item.taxableValue, 0);
    const totalGst = (items || []).reduce((sum, item) => sum + item.gstAmount, 0);
    const grandTotal = bill.total || 0;
    
    return { 
        items, 
        totalTaxableValue, 
        totalTradeDiscount,
        totalItemSchemeDiscount,
        totalGst, 
        grandTotal,
    };
  }, [bill]);

  return (
    <div className="bg-white text-gray-800 text-xs font-sans leading-tight p-8 min-h-full flex flex-col w-full mx-auto relative">
        {/* --- HEADER --- */}
        {!bill.hideRetailerOnBill && (
        <header className="flex justify-between items-start pb-4 mb-4 border-b-2 border-primary">
            <div className="flex items-center space-x-3">
                {!isNonGst && bill.pharmacy.pharmacy_logo_url && (
                    <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="h-12 w-12 object-contain"/>
                )}
                <div>
                    {!isNonGst && <h1 className="text-xl font-bold text-primary">{bill.pharmacy.pharmacy_name}</h1>}
                    <p className="font-semibold text-xs mb-0.5">{new Date(bill.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    {!isNonGst && (
                        <>
                            <p className="text-[10px] text-gray-600 max-w-xs">{bill.pharmacy.address}</p>
                            <p className="text-[10px] text-gray-600">GSTIN: {bill.pharmacy.gstin}</p>
                        </>
                    )}
                </div>
            </div>
            <div className="text-right">
                <h2 className="text-lg font-bold uppercase text-gray-400">
                    {isCredit ? 'CREDIT BILL' : (isNonGst ? 'Estimate' : 'Invoice')}
                </h2>
                <p className="text-sm font-semibold">#{bill.id}</p>
            </div>
        </header>
        )}

        {/* --- CUSTOMER --- */}
        <section className="mb-4 bg-gray-50 p-4 rounded border border-gray-100">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Bill To</p>
                    <p className="font-bold text-base text-gray-800">{bill.customerName}</p>
                    {bill.customerDetails?.address && <p className="text-gray-600">{bill.customerDetails.address}</p>}
                    <div className="flex flex-wrap gap-x-3 mt-1 text-gray-600">
                        {bill.customerDetails?.phone && <span>Ph: {bill.customerDetails.phone}</span>}
                        {bill.customerDetails?.gstNumber && <span>GST: {bill.customerDetails.gstNumber}</span>}
                        {bill.customerDetails?.drugLicense && <span>DL: {bill.customerDetails.drugLicense}</span>}
                    </div>
                </div>
                {bill.referredBy && (
                    <div className="text-right">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Referred By</p>
                        <p className="font-medium text-gray-800">{bill.referredBy}</p>
                    </div>
                )}
            </div>
        </section>

        {/* --- ITEMS TABLE --- */}
        <div className="flex-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="py-2 px-1 text-left w-6">#</th>
                <th className="py-2 px-1 text-left">Description</th>
                <th className="py-2 px-1 text-left w-20">Batch</th>
                <th className="py-2 px-1 text-center w-12">Exp</th>
                <th className="py-2 px-1 text-center w-12">Qty</th>
                <th className="py-2 px-1 text-right w-16">Price</th>
                <th className="py-2 px-1 text-right w-12">Disc%</th>
                <th className="py-2 px-1 text-right w-20">Amount</th>
              </tr>
            </thead>
            <tbody>
              {calculations.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 h-8">
                  <td className="px-1 text-center">{idx + 1}</td>
                  <td className="px-1 font-semibold">{item.name}</td>
                  <td className="px-1 font-mono text-[10px]">{item.batch}</td>
                  <td className="px-1 text-center text-[10px]">{item.expiry}</td>
                  <td className="px-1 text-center">{formatPackLooseQuantity(item.quantity, item.looseQuantity)}</td>
                  <td className="px-1 text-right">{(item.mrp || 0).toFixed(2)}</td>
                  <td className="px-1 text-right">{item.discountPercent || 0}</td>
                  <td className="px-1 text-right font-semibold">{(item.amount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- FOOTER --- */}
        <footer className="mt-8 pt-4 border-t-2 border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Amount In Words</p>
              <p className="text-[11px] font-semibold italic">{numberToWords(bill.total || 0)}</p>
              <div className="mt-6 text-[9px] text-gray-400 max-w-sm">
                <p className="font-bold uppercase mb-1">Terms and Conditions</p>
                <p className="whitespace-pre-line">{bill.pharmacy.terms_and_conditions || "Goods once sold will not be returned."}</p>
              </div>
            </div>
            <div className="w-64 space-y-1.5 text-right">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">Subtotal</span>
                <span className="font-semibold">₹{(calculations.totalTaxableValue + calculations.totalGst).toFixed(2)}</span>
              </div>
              {bill.schemeDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="font-bold">Total Savings</span>
                  <span className="font-semibold">-₹{(bill.schemeDiscount || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t-2 border-primary flex justify-between items-baseline">
                <span className="text-sm font-black uppercase text-primary">Grand Total</span>
                <span className="text-xl font-black text-gray-900">₹{(bill.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="mt-12 text-center text-[9px] text-gray-400">
            <p>Generated via Medimart Retail ERP</p>
          </div>
        </footer>
    </div>
  );
};

export default ElegantTemplate;
