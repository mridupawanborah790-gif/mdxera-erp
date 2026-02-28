import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { formatExpiryToMMYY } from '../../utils/helpers';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const ThermalTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';

  const billDetails = useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;
    let totalQty = 0;
    let totalDiscountValue = 0;

    const items = (bill.items || []).map((item) => {
      const rate = item.rate ?? item.mrp ?? 0;
      const grossAmount = rate * (item.quantity || 0);
      const tradeDiscountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      const schemeDiscountAmount = item.schemeDiscountAmount || 0;
      const itemTotalDiscount = tradeDiscountAmount + schemeDiscountAmount;
      const finalPrice = grossAmount - itemTotalDiscount;
      const effectiveGstPercent = isNonGst ? 0 : (item.gstPercent || 0);

      const taxableValue = finalPrice / (1 + (effectiveGstPercent / 100));
      const gstAmount = finalPrice - taxableValue;

      subtotal += finalPrice;
      totalGst += gstAmount;
      totalQty += item.quantity;
      totalDiscountValue += itemTotalDiscount;

      const inventoryItem = bill.inventory?.find((inv) => inv.id === item.inventoryItemId);
      const batch = item.batch || inventoryItem?.batch || '';
      const expiry = formatExpiryToMMYY(item.expiry || inventoryItem?.expiry);

      return {
        ...item,
        rate,
        finalPrice,
        gstAmount,
        taxableValue,
        itemTotalDiscount,
        batch,
        expiry,
      };
    });

    const gstBreakdown: Record<number, { taxable: number; tax: number }> = {};
    (items || []).forEach((item) => {
      const rate = item.gstPercent || 0;
      if (!gstBreakdown[rate]) gstBreakdown[rate] = { taxable: 0, tax: 0 };
      gstBreakdown[rate].taxable += item.taxableValue;
      gstBreakdown[rate].tax += item.gstAmount;
    });

    return { items, subtotal, totalGst, gstBreakdown, totalQty, totalDiscountValue };
  }, [bill.items, isNonGst, bill.inventory]);

  return (
    <div className="w-[76mm] max-w-[76mm] text-black font-mono text-[10px] leading-tight px-1 py-1">
      <div className="text-center mb-1">
        <h1 className="text-sm font-bold uppercase tracking-tight">{bill.pharmacy.pharmacy_name}</h1>
        <p className="text-[9px] leading-snug whitespace-pre-line">{bill.pharmacy.address}</p>
        <div className="text-[9px] mt-0.5">
          <p>PH: {bill.pharmacy.mobile}</p>
          {!isNonGst && bill.pharmacy.gstin && <p>GSTIN: {bill.pharmacy.gstin}</p>}
        </div>
      </div>

      <div className="border-t border-b border-dashed border-black py-0.5 mb-1 flex justify-between items-center gap-1 text-[9px]">
        <span className="truncate">Bill: {bill.id}</span>
        <span>{new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      </div>

      {isCredit && <div className="text-center text-[9px] font-bold uppercase border-b border-dashed border-black pb-0.5 mb-1">CREDIT BILL</div>}

      <table className="w-full table-fixed text-[9px]">
        <thead>
          <tr className="font-bold border-b border-dashed border-black">
            <th className="w-[44%] text-left pb-0.5">Description</th>
            <th className="w-[12%] text-center pb-0.5">Qty</th>
            <th className="w-[20%] text-right pb-0.5">Rate</th>
            <th className="w-[24%] text-right pb-0.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(billDetails.items || []).map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-0.5 pr-1 break-words">
                <div className="font-semibold">{item.name}</div>
                <div className="text-[8px] text-gray-700">
                  {item.batch && <span>{item.batch}</span>}
                  {item.batch && item.expiry && <span> | </span>}
                  {item.expiry && <span>Exp {item.expiry}</span>}
                </div>
              </td>
              <td className="py-0.5 text-center">{item.quantity}</td>
              <td className="py-0.5 text-right">{item.rate.toFixed(2)}</td>
              <td className="py-0.5 text-right font-semibold">{item.finalPrice.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black mt-1 pt-1 space-y-0.5 text-[9px]">
        <div className="flex justify-between"><span>Items</span><span>{billDetails.totalQty}</span></div>
        <div className="flex justify-between"><span>Subtotal</span><span>{billDetails.subtotal.toFixed(2)}</span></div>

        {!isNonGst && (
          <>
            {Object.entries(billDetails.gstBreakdown).map(([rate, data]) => {
              if (parseFloat(rate) === 0) return null;
              const typedData = data as { taxable: number; tax: number };
              return (
                <div key={rate} className="flex justify-between gap-2">
                  <span className="truncate">GST {rate}% on {typedData.taxable.toFixed(2)}</span>
                  <span>{typedData.tax.toFixed(2)}</span>
                </div>
              );
            })}
          </>
        )}

        {(bill.schemeDiscount || 0) > 0 && <div className="flex justify-between"><span>Bill Disc</span><span>-{bill.schemeDiscount.toFixed(2)}</span></div>}
        {(bill.roundOff || 0) !== 0 && <div className="flex justify-between"><span>Round Off</span><span>{bill.roundOff > 0 ? '+' : ''}{bill.roundOff.toFixed(2)}</span></div>}
        {(billDetails.totalDiscountValue + (bill.schemeDiscount || 0)) > 0 && (
          <div className="flex justify-between font-semibold">
            <span>Savings</span>
            <span>{(billDetails.totalDiscountValue + (bill.schemeDiscount || 0)).toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-b border-dashed border-black mt-1 py-0.5 flex justify-between text-[11px] font-bold">
        <span>TOTAL</span>
        <span>{Math.round(bill.total).toFixed(2)}</span>
      </div>

      <div className="text-[9px] mt-1">
        <div className="flex justify-between"><span>Payment</span><span>{bill.paymentMode || 'Cash'}</span></div>
        <div className="flex justify-between"><span>Tax Total</span><span>{billDetails.totalGst.toFixed(2)}</span></div>
      </div>

      <p className="text-center text-[9px] mt-1">Thank You • Visit Again</p>
    </div>
  );
};

export default ThermalTemplate;
