

import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { formatPackLooseQuantity } from '../../utils/quantity';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const ModernTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';

  const billDetails = useMemo(() => {
    let totalTradeDiscount = 0;
    let totalItemSchemeDiscount = 0;
    
    const processedItems = (bill.items || []).map(item => {
        const totalMrp = (item.mrp || 0) * (item.quantity || 0);
        const tradeDiscount = totalMrp * ((item.discountPercent || 0) / 100);
        const schemeDiscount = item.schemeDiscountAmount || 0;
        
        totalTradeDiscount += tradeDiscount;
        totalItemSchemeDiscount += schemeDiscount;

        const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
        const batch = item.batch || inventoryItem?.batch || '';
        const expiry = item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '');

        return { ...item, batch, expiry, schemeDiscount };
    });

    return { totalTradeDiscount, totalItemSchemeDiscount, processedItems };
  }, [bill.items, bill.inventory]);

  const hasGst = (bill.items || []).some(item => (item.gstPercent || 0) > 0);
  
  const displaySubtotal = isNonGst ? (bill.subtotal + (bill.totalGst || 0)) : bill.subtotal;
  
  const MIN_ROWS = 5;
  const emptyRows = Math.max(0, MIN_ROWS - (bill.items || []).length);

  return (
    <div className="bg-white text-gray-700 text-sm leading-tight p-8 min-h-[1000px] flex flex-col w-full mx-auto relative">
      <div className="flex-shrink-0">
          {!bill.hideRetailerOnBill && (
          <div className="flex justify-between items-start mb-6 border-b pb-4">
            <div>
               {!isNonGst ? (
                   <>
                       {bill.pharmacy.pharmacy_logo_url && (
                          <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="h-10 mb-2 object-contain"/>
                        )}
                        <h1 className="text-xl font-bold text-gray-900">{bill.pharmacy.pharmacy_name}</h1>
                        <p className="font-semibold text-xs text-gray-600 mb-0.5">{new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                        <div className="text-xs text-gray-500 mt-1">
                            {hasGst && <span>GSTIN: {bill.pharmacy.gstin} | </span>}
                            <span>Ph: {bill.pharmacy.mobile}</span>
                        </div>
                   </>
               ) : (
                    <p className="font-semibold text-xs text-gray-600 mb-0.5">{new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
               )}
            </div>
            <div className="text-right">
                <h2 className="text-2xl font-bold text-gray-300 uppercase tracking-widest">
                    {isCredit ? 'CREDIT BILL' : (isNonGst ? 'ESTIMATE' : 'INVOICE')}
                </h2>
                <p className="font-mono text-gray-800 font-bold text-lg">#{bill.invoiceNumber || bill.id}</p>
            </div>
          </div>
          )}

          <div className="text-xs mb-6 bg-gray-50 p-4 rounded border border-gray-100">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
                    <span className="font-bold text-gray-900 text-sm block">{bill.customerName}</span>
                    {bill.customerDetails?.address && <p className="mt-1">{bill.customerDetails.address}</p>}
                    <div className="flex flex-wrap gap-x-4 mt-1 text-gray-500">
                        {bill.customerDetails?.phone && <span>Ph: {bill.customerDetails.phone}</span>}
                        {bill.customerDetails?.gstNumber && <span>GST: {bill.customerDetails.gstNumber}</span>}
                        {bill.customerDetails?.drugLicense && <span>DL: {bill.customerDetails.drugLicense}</span>}
                    </div>
                </div>
                {bill.referredBy && (
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Referred By</p>
                        <p className="font-medium text-gray-800">{bill.referredBy}</p>
                    </div>
                )}
            </div>
          </div>
      </div>

      <div className="flex-1">
        <div className="flex justify-between items-center py-2 border-b-2 border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">
            <div className="flex-1">Item Description</div>
            <div className="w-12 text-center">Qty</div>
            <div className="w-16 text-right">Price</div>
            <div className="w-16 text-right">Disc</div>
            <div className="w-16 text-right">Sch</div>
            <div className="w-24 text-right">Total</div>
        </div>

        {(billDetails.processedItems || []).map(item => {
            const totalMrp = (item.mrp || 0) * (item.quantity || 0);
            const tradeDiscount = totalMrp * ((item.discountPercent || 0) / 100);
            const schemeDiscount = item.schemeDiscountAmount || 0;
            const finalAmount = totalMrp - tradeDiscount - schemeDiscount;

            return (
                <div key={item.id} className="flex justify-between items-start py-3 border-b border-gray-50">
                    <div className="flex-1 pr-4">
                        <p className="font-bold text-gray-800 text-xs">{item.name}</p>
                        <div className="flex items-center text-[10px] text-gray-400 mt-0.5 space-x-2 flex-wrap gap-y-1">
                            {item.batch && <span className="font-medium text-gray-500">Batch: {item.batch}</span>}
                            {item.expiry && <span className="font-medium text-gray-500">Exp: {item.expiry}</span>}
                            {item.hsnCode && <span>HSN: {item.hsnCode}</span>}
                            {!isNonGst && (item.gstPercent || 0) > 0 && <span>GST: {item.gstPercent}%</span>}
                        </div>
                    </div>
                    <div className="w-12 text-center text-xs">
                        {formatPackLooseQuantity(item.quantity, item.looseQuantity, item.freeQuantity)}
                    </div>
                    <div className="w-16 text-right text-xs">
                        {(item.mrp || 0).toFixed(1)}
                    </div>
                    <div className="w-16 text-right text-xs text-red-500">
                        {item.discountPercent ? `${item.discountPercent}%` : '-'}
                    </div>
                    <div className="w-16 text-right text-xs text-green-600">
                        {schemeDiscount ? schemeDiscount.toFixed(1) : '-'}
                    </div>
                    <div className="w-24 text-right font-semibold text-sm">
                        {(finalAmount || 0).toFixed(2)}
                    </div>
                </div>
            )
        })}
        
        {Array.from({ length: emptyRows }).map((_, i) => (
            <div key={`empty-${i}`} className="flex justify-between items-center py-3 border-b border-dashed border-gray-50">
                <div className="flex-1">&nbsp;</div>
                <div className="w-12">&nbsp;</div>
                <div className="w-16">&nbsp;</div>
                <div className="w-16">&nbsp;</div>
                <div className="w-16">&nbsp;</div>
                <div className="w-24">&nbsp;</div>
            </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t-2 border-gray-100 flex-shrink-0">
        <div className="flex justify-end">
            <div className="w-full md:w-1/2 lg:w-5/12 space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal</span>
                    <span>{(displaySubtotal || 0).toFixed(2)}</span>
                </div>
                {!isNonGst && (
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>Tax</span>
                        <span>+{(bill.totalGst || 0).toFixed(2)}</span>
                    </div>
                )}
                {billDetails.totalTradeDiscount > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>Trade Discount</span>
                        <span>- {(billDetails.totalTradeDiscount || 0).toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between font-bold text-lg text-gray-900 border-t border-gray-200 pt-2 mt-2">
                    <span>Total</span>
                    <span>₹{(bill.total || 0).toFixed(2)}</span>
                </div>
            </div>
        </div>
        {!bill.hideRetailerOnBill && !isNonGst && (
            <div className="mt-8 text-center text-[10px] text-gray-400">
                <p className="font-semibold text-gray-500 mb-1">{bill.pharmacy.pharmacy_name}</p>
                <p>Thank you for your business. Generated via Medimart Retail ERP.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default ModernTemplate;
