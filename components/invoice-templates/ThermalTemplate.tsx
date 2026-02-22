

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
        
        const items = (bill.items || []).map(item => {
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

            const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
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
                expiry
            };
        });
        
        const gstBreakdown: Record<number, { taxable: number; tax: number }> = {};
        (items || []).forEach(item => {
            const rate = item.gstPercent || 0;
            if (!gstBreakdown[rate]) gstBreakdown[rate] = { taxable: 0, tax: 0 };
            gstBreakdown[rate].taxable += item.taxableValue;
            gstBreakdown[rate].tax += item.gstAmount;
        });

        return { items, subtotal, totalGst, gstBreakdown, totalQty, totalDiscountValue };
    }, [bill.items, isNonGst, bill.inventory]);

    return (
        <div className="w-full text-black font-sans leading-tight relative">
            <div className="thermal-corner-ribbon"></div>

            <div className="text-center pt-4 mb-2">
                <h1 className="text-2xl font-bold uppercase tracking-tight text-gray-900">{bill.pharmacy.pharmacy_name}</h1>
                <p className="text-xs text-gray-700 leading-snug px-4 whitespace-pre-line mt-1">
                    {bill.pharmacy.address}
                </p>
                <div className="text-xs mt-1 text-gray-700 font-medium">
                    <p>PHONE : {bill.pharmacy.mobile}</p>
                    {!isNonGst && bill.pharmacy.gstin && <p>GSTIN : {bill.pharmacy.gstin}</p>}
                </div>
            </div>
            
            <div className="flex justify-between items-center text-xs font-bold border-t-0 border-b-0 border-gray-400 py-1 mb-1 mt-3">
                <span>Bill No: {bill.id}</span>
                <span>Date: {new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            {isCredit && <div className="text-center text-xs font-bold uppercase border-b border-black border-dashed mb-1 pb-1">CREDIT BILL</div>}
            
            <div className="border-b border-black border-dashed my-1"></div>
            
            <table className="w-full text-xs table-fixed">
                <thead>
                    <tr className="text-left font-bold">
                        <th className="w-[8%] align-top">SN</th>
                        <th className="w-[37%] align-top">Item</th>
                        <th className="w-[10%] text-center align-top">Qty</th>
                        <th className="w-[15%] text-right align-top">Price</th>
                        <th className="w-[15%] text-right align-top">Disc</th>
                        <th className="w-[15%] text-right align-top">Amt</th>
                    </tr>
                </thead>
                <tbody className="leading-snug">
                    <tr><td colSpan={6} className="border-b border-black border-dashed h-1"></td></tr>
                    <tr className="h-1"></tr>
                    
                    {(billDetails.items || []).map((item, index) => (
                        <tr key={item.id}>
                            <td className="align-top py-1">{index + 1}</td>
                            <td className="align-top py-1 pr-1 font-medium">
                                <div>{item.name}</div>
                                <div className="text-[9px] text-gray-600">
                                    {item.batch && <span>{item.batch}</span>}
                                    {item.batch && item.expiry && <span> | </span>}
                                    {item.expiry && <span>Exp: {item.expiry}</span>}
                                </div>
                            </td>
                            <td className="align-top text-center py-1">
                                {item.quantity}
                            </td>
                            <td className="align-top text-right py-1">
                                {item.rate.toFixed(2)}
                            </td>
                            <td className="align-top text-right py-1 text-gray-600">
                                {item.itemTotalDiscount > 0 ? item.itemTotalDiscount.toFixed(2) : '-'}
                            </td>
                            <td className="align-top text-right py-1 font-bold">
                                {item.finalPrice.toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="border-b border-black border-dashed my-2"></div>
            
            <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold">Subtotal</span>
                <span className="font-medium text-gray-600">{billDetails.totalQty} Items</span>
                <span className="font-bold">₹ {billDetails.subtotal.toFixed(2)}</span>
            </div>

            {!isNonGst && (
                <div className="flex flex-col items-end text-[10px] text-gray-600 mt-1 mb-1 space-y-0.5">
                    {Object.entries(billDetails.gstBreakdown).map(([rate, data]) => {
                        if (parseFloat(rate) === 0) return null;
                        const typedData = data as { taxable: number; tax: number };
                        return (
                            <div key={rate} className="flex justify-end w-full space-x-4">
                                <span>GST @ {rate}% on {typedData.taxable.toFixed(2)}</span>
                                <span>{typedData.tax.toFixed(2)}</span>
                            </div>
                        )
                    })}
                </div>
            )}

            {(bill.schemeDiscount || 0) > 0 && (
                <div className="flex justify-end text-xs mb-0.5 text-gray-700">
                    <span className="mr-4">Bill Disc:</span>
                    <span>- {bill.schemeDiscount.toFixed(2)}</span>
                </div>
            )}
            
            {(bill.roundOff || 0) !== 0 && (
                <div className="flex justify-end text-xs mb-0.5 text-gray-700">
                    <span className="mr-4">Round Off:</span>
                    <span>{bill.roundOff > 0 ? '+' : ''}{bill.roundOff.toFixed(2)}</span>
                </div>
            )}

            {(billDetails.totalDiscountValue + (bill.schemeDiscount || 0)) > 0 && (
                <div className="flex justify-end text-xs mb-0.5 text-green-700 font-bold">
                    <span className="mr-4">Total Savings:</span>
                    <span>₹ {(billDetails.totalDiscountValue + (bill.schemeDiscount || 0)).toFixed(2)}</span>
                </div>
            )}

            <div className="border-b border-black border-dashed my-1"></div>
            
            <div className="flex justify-between items-center text-lg font-bold mt-1">
                <span>TOTAL</span>
                <span>₹ {Math.round(bill.total).toFixed(2)}</span>
            </div>
            
            <div className="border-b border-black border-dashed my-2"></div>
            
            <div className="text-center mt-4">
                <p className="font-bold text-sm">Thank You</p>
                <p className="text-[10px] text-gray-500 mt-1">Visit Again</p>
            </div>
            
            <div className="border-b border-black border-dashed mt-4 mb-2">
                <p className="text-[6pt] font-normal lowercase opacity-50 text-center">Computer Generated Invoice - Medimart Retail ERP</p>
            </div>
        </div>
    );
};

export default ThermalTemplate;