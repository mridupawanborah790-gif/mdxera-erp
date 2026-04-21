

import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types/types';
import { formatPackLooseQuantity } from '../../utils/quantity';
import { numberToWords } from '../../utils/numberToWords';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const ProfessionalTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';

  const billDetails = useMemo(() => {
    let totalTradeDiscount = 0;
    let totalItemSchemeDiscount = 0;

    const items = (bill.items || []).map(item => {
        const totalMrp = (item.mrp || 0) * (item.quantity || 0);
        const tradeDiscountAmount = totalMrp * ((item.discountPercent || 0) / 100);
        const schemeDiscountAmount = item.schemeDiscountAmount || 0;
        
        const finalAmount = totalMrp - tradeDiscountAmount - schemeDiscountAmount;
        
        totalTradeDiscount += tradeDiscountAmount;
        totalItemSchemeDiscount += schemeDiscountAmount;

        // Lookup Batch & Expiry
        const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
        const batch = item.batch || inventoryItem?.batch || '';
        const expiry = item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '');

        return { ...item, finalAmount, totalDiscount: tradeDiscountAmount + schemeDiscountAmount, batch, expiry };
    });
    return { items, totalTradeDiscount, totalItemSchemeDiscount };
  }, [bill.items, bill.inventory]);

  const totalQuantity = (bill.items || []).reduce((sum, item) => sum + item.quantity + (item.freeQuantity || 0), 0);
  const hasGst = (bill.items || []).some(item => (item.gstPercent || 0) > 0);
  
  // If Non-GST bill, treat subtotal as inclusive (Subtotal + Tax) so footer math works without visible Tax row
  const displaySubtotal = isNonGst ? (bill.subtotal + (bill.totalGst || 0)) : bill.subtotal;

  // Added p-8 to allow edge-to-edge container but keep content safe
  return (
    <div className="text-gray-800 leading-snug p-8 min-h-full">
      {/* Header */}
      {!bill.hideRetailerOnBill && (
      <div className="text-center mb-1 border-b-2 border-gray-800 pb-1">
        {!isNonGst && (
            <>
                {bill.pharmacy.pharmacy_logo_url && (
                    <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="h-10 mx-auto mb-0.5"/>
                )}
                <h1 className="text-xl font-bold uppercase">{bill.pharmacy.pharmacy_name}</h1>
            </>
        )}
        <p className="text-sm font-semibold">{new Date(bill.date).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
        {!isNonGst && (
            <>
                {hasGst && <p className="text-xs">GSTIN: {bill.pharmacy.gstin}</p>}
                <p className="text-xs">{bill.pharmacy.address} | Ph: {bill.pharmacy.mobile}</p>
            </>
        )}
        <h2 className="text-sm font-bold uppercase mt-1">
            {isCredit ? 'CREDIT BILL' : (isNonGst ? 'Estimate' : 'Bill of Supply')}
        </h2>
      </div>
      )}

      {/* Bill To and Invoice Details */}
      <div className="flex justify-between mb-2 text-xs">
        <div>
          <p className="font-bold uppercase text-gray-500 text-[10px]">Billed To:</p>
          <p className="font-semibold text-sm">{bill.customerName}</p>
          {bill.customerDetails?.address && <p className="text-[10px] max-w-[200px]">{bill.customerDetails.address}</p>}
          <div className="mt-0.5 space-y-0.5">
             {bill.customerDetails?.phone && <p className="text-[10px]">Ph: {bill.customerDetails.phone}</p>}
             {bill.customerDetails?.gstNumber && <p className="text-[10px]">GSTIN: {bill.customerDetails.gstNumber}</p>}
             {bill.customerDetails?.drugLicense && <p className="text-[10px]">DL: {bill.customerDetails.drugLicense}</p>}
          </div>
        </div>
        <div className="text-right">
          <p><span className="font-semibold">Inv No:</span> {bill.invoiceNumber || bill.id}</p>
          {bill.referredBy && <p><span className="font-semibold">Ref By:</span> {bill.referredBy}</p>}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-xs">
        <thead className="border-b-2 border-gray-800">
          <tr>
            <th className="py-0.5 text-left">#</th>
            <th className="py-0.5 text-left">Item Name</th>
            <th className="py-0.5 text-left">Batch</th>
            <th className="py-0.5 text-center">Exp</th>
            <th className="py-0.5 text-center">Qty</th>
            <th className="py-0.5 text-right">Price</th>
            <th className="py-0.5 text-right">Disc%</th>
            <th className="py-0.5 text-center">GST%</th>
            <th className="py-0.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(billDetails.items || []).map((item, index) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-0.5">{index + 1}</td>
                <td className="py-0.5">{item.name}</td>
                <td className="py-0.5 text-[10px]">{item.batch}</td>
                <td className="py-0.5 text-center text-[10px]">{item.expiry}</td>
                <td className="py-0.5 text-center">
                    {formatPackLooseQuantity(item.quantity, item.looseQuantity, item.freeQuantity)}
                </td>
                <td className="py-0.5 text-right">{(item.mrp || 0).toFixed(2)}</td>
                <td className="py-0.5 text-right">{(item.discountPercent || 0)}%</td>
                <td className="py-0.5 text-center">{!isNonGst ? item.gstPercent || 0 : '-'}%</td>
                <td className="py-0.5 text-right font-semibold">{(item.finalAmount || 0).toFixed(2)}</td>
              </tr>
            )
          )}
        </tbody>
        <tfoot className="border-t-2 border-gray-800 font-semibold">
          <tr>
            <td colSpan={4} className="py-0.5 text-left">Total Qty: {totalQuantity}</td>
            <td colSpan={3}></td>
            <td colSpan={2} className="py-0.5 text-right">Total: {(bill.total || 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Footer Section */}
      <div className="mt-2 flex justify-between items-start text-xs">
        <div className="w-7/12 pr-2">
          <p className="font-semibold">Amount In Words:</p>
          <p className="capitalize text-[10px]">{numberToWords(bill.total || 0)}</p>
        </div>
        <div className="w-5/12 space-y-0.5 text-right">
          <div className="flex justify-between"><span>Sub Total</span> <span>{(displaySubtotal || 0).toFixed(2)}</span></div>
          {!isNonGst && <div className="flex justify-between"><span>GST</span> <span>+{(bill.totalGst || 0).toFixed(2)}</span></div>}
          <div className="flex justify-between"><span>Discount</span> <span>- {((billDetails.totalTradeDiscount || 0) + (billDetails.totalItemSchemeDiscount || 0) + (bill.schemeDiscount || 0)).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold border-t border-gray-800 pt-0.5"><span>Net Amount</span> <span>₹{(bill.total || 0).toFixed(2)}</span></div>
        </div>
      </div>

      {!bill.hideRetailerOnBill && !isNonGst && (
      <div className="mt-4 text-right text-xs">
        <p>For: {bill.pharmacy.pharmacy_name}</p>
        <div className="h-6"></div>
        <p>Authorized Signatory</p>
      </div>
      )}
    </div>
  );
};

export default ProfessionalTemplate;
