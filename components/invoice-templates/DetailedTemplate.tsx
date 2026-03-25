
import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { formatPackLooseQuantity } from '../../utils/quantity';
import { getDisplaySchemePercent, hasLineLevelSchemeDiscount } from '../../utils/billing';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const DetailedTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';
  
  const billDetails = useMemo(() => {
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalDiscount = bill.totalItemDiscount || 0;
    let totalTradeDiscount = 0;
    let totalItemSchemeDiscount = 0;

    const itemsWithCalculations = (bill.items || []).map(item => {
        const totalMrp = (item.mrp || 0) * (item.quantity || 0);
        const tradeDiscountAmount = totalMrp * ((item.discountPercent || 0) / 100);
        const schemeDiscountAmount = item.schemeDiscountAmount || 0;
        
        const finalAmount = totalMrp - tradeDiscountAmount - schemeDiscountAmount;
        
        totalTradeDiscount += tradeDiscountAmount;
        totalItemSchemeDiscount += schemeDiscountAmount;

        const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);

        const effectiveGst = isNonGst ? 0 : (item.gstPercent || 0);

        const taxableValue = finalAmount / (1 + (effectiveGst / 100));
        const gstAmount = finalAmount - taxableValue;

        subtotal += taxableValue;
        totalCgst += gstAmount / 2;
        totalSgst += gstAmount / 2;

        return {
            ...item,
            batch: inventoryItem?.batch || 'N/A',
            expiry: inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : 'N/A',
            manufacturer: inventoryItem?.manufacturer || item.brand || 'N/A',
            finalAmount: finalAmount,
            taxableValue,
            gstAmount
        };
    });

    return { items: itemsWithCalculations, subtotal, totalCgst, totalSgst, totalDiscount, totalTradeDiscount, totalItemSchemeDiscount };
  }, [bill, isNonGst]);

  const showSchemeColumn = (billDetails.items || []).some(item => hasLineLevelSchemeDiscount(item));

  return (
    <div className="bg-white text-[10px] text-gray-800 font-sans p-8 w-full mx-auto leading-tight min-h-full flex flex-col">
      
      {!bill.hideRetailerOnBill && !isNonGst && (
        <div className="text-center mb-6">
            {bill.pharmacy.pharmacy_logo_url && (
                <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="h-16 w-auto max-h-16 object-contain mx-auto mb-2" />
            )}
            <h1 className="text-2xl font-bold uppercase text-[#11A66C] mb-1 tracking-wide">{bill.pharmacy.pharmacy_name}</h1>
            {bill.pharmacy.address && <p className="text-[10px] whitespace-pre-line mb-1">{bill.pharmacy.address}</p>}
            
            <div className="flex flex-col items-center justify-center space-y-0.5">
                <p className="text-[10px] font-medium">Phone: {bill.pharmacy.mobile}</p>
                <p className="text-[10px] font-medium">
                    {/* Fix: Changed retailer_gstin to gstin */}
                    GSTIN: {bill.pharmacy.gstin} <span className="mx-1">|</span> D.L.No.: {bill.pharmacy.drug_license}
                </p>
                {bill.pharmacy.email && <p className="text-[10px] font-medium">Email: {bill.pharmacy.email}</p>}
            </div>
        </div>
      )}

      <div className="text-center mb-6 relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center">
            <span className="bg-white px-6 py-1 text-sm font-bold uppercase tracking-widest border border-gray-300 text-gray-700">
                {isCredit ? 'CREDIT BILL' : (isNonGst ? 'Estimate' : 'Tax Invoice')}
            </span>
        </div>
      </div>

      <div className="flex justify-between items-start mb-4 px-2">
        <div className="text-left space-y-1.5">
            <div className="flex items-center">
                <span className="font-bold w-20">Invoice No:</span>
                <span className="font-mono text-sm">{bill.invoiceNumber || bill.id}</span>
            </div>
            <div className="flex items-center">
                <span className="font-bold w-20">Date:</span>
                <span>{new Date(bill.date).toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
        </div>

        <div className="text-right space-y-1">
            <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide mb-1">Billed To</p>
            <p className="font-bold text-sm text-gray-800">{bill.customerName}</p>
            {bill.customerDetails?.address && <p className="text-[10px] whitespace-pre-line max-w-[200px] ml-auto">{bill.customerDetails.address}</p>}
            
            <div className="text-[10px] text-gray-600">
                {bill.customerDetails?.phone && <p>Ph: {bill.customerDetails.phone}</p>}
                {(bill.customerDetails?.gstNumber || bill.customerDetails?.drugLicense) && (
                    <p>
                        {bill.customerDetails.gstNumber && <span>GST: {bill.customerDetails.gstNumber} </span>}
                        {bill.customerDetails.gstNumber && bill.customerDetails.drugLicense && <span> | </span>}
                        {bill.customerDetails.drugLicense && <span>DL: {bill.customerDetails.drugLicense}</span>}
                    </p>
                )}
            </div>
            {bill.referredBy && <p className="text-[10px] mt-1 font-medium text-blue-600">Ref By: {bill.referredBy}</p>}
        </div>
      </div>

      <table className="w-full mt-2 border-collapse border border-black text-[9px]">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-1.5 border-r border-b border-black text-center font-semibold w-[5%]">Qty</th>
            <th className="p-1.5 border-r border-b border-black text-left font-semibold w-[5%]">Pack</th>
            <th className="p-1.5 border-r border-b border-black text-left font-semibold w-[30%]">Product Description</th>
            <th className="p-1.5 border-r border-b border-black text-left font-semibold w-[10%]">Mfr.</th>
            <th className="p-1.5 border-r border-b border-black text-left font-semibold w-[5%]">HSN</th>
            <th className="p-1.5 border-r border-b border-black text-left font-semibold w-[8%]">Batch</th>
            <th className="p-1.5 border-r border-b border-black text-center font-semibold w-[5%]">Exp.</th>
            <th className="p-1.5 border-r border-b border-black text-right font-semibold w-[6%]">M.R.P</th>
            <th className="p-1.5 border-r border-b border-black text-right font-semibold w-[6%]">Rate</th>
            <th className="p-1.5 border-r border-b border-black text-right font-semibold w-[4%]">Disc%</th>
            {showSchemeColumn && <th className="p-1.5 border-r border-b border-black text-right font-semibold w-[4%]">Sch%</th>}
            <th className="p-1.5 border-r border-b border-black text-right font-semibold w-[4%]">GST%</th>
            <th className="p-1.5 border-b border-black text-right font-semibold w-[8%]">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(billDetails.items || []).map(item => (
            <tr key={item.id}>
              <td className="p-1 border-r border-b border-black text-center">
                  {formatPackLooseQuantity(item.quantity, item.looseQuantity)}
                  {item.freeQuantity ? <span className="text-[8px] ml-0.5">+{item.freeQuantity}</span> : ''}
              </td>
              <td className="p-1 border-r border-b border-black">{item.packType || 'N/A'}</td>
              <td className="p-1 border-r border-b border-black font-medium">{item.name}</td>
              <td className="p-1 border-r border-b border-black">{item.manufacturer}</td>
              <td className="p-1 border-r border-b border-black">{item.hsnCode}</td>
              <td className="p-1 border-r border-b border-black">{item.batch}</td>
              <td className="p-1 border-r border-b border-black text-center">{item.expiry}</td>
              <td className="p-1 border-r border-b border-black text-right">
                {item.oldMrp && item.oldMrp > item.mrp && (
                    <span className="line-through text-gray-500 text-[8px] mr-1">{item.oldMrp.toFixed(2)}</span>
                )}
                {(item.mrp || 0).toFixed(2)}
              </td>
              <td className="p-1 border-r border-b border-black text-right">{(item.mrp || 0).toFixed(2)}</td>
              <td className="p-1 border-r border-b border-black text-right">{(item.discountPercent || 0).toFixed(2)}</td>
              {showSchemeColumn && (
                <td className="p-1 border-r border-b border-black text-right">
                  {getDisplaySchemePercent(item) > 0 ? getDisplaySchemePercent(item).toFixed(2) : ''}
                </td>
              )}
              <td className="p-1 border-r border-b border-black text-right">{!isNonGst ? (item.gstPercent || 0).toFixed(0) : '-'}</td>
              <td className="p-1 border-b border-black text-right font-semibold">{(item.finalAmount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-start justify-between mt-4 border-t-2 border-black pt-2">
          <div className="pr-4 flex-1">
              <p className="text-[10px] mb-2"><strong>Amount in Words:</strong> {numberToWords(bill.total || 0)}</p>
              
              <div className="flex items-start space-x-8">
                  {!bill.hideRetailerOnBill && !isNonGst && (
                  <div className="text-[9px] text-gray-700 space-y-0.5 border p-2 rounded border-gray-200 bg-gray-50">
                      <p className="font-bold border-b border-gray-300 pb-0.5 mb-0.5">BANK DETAILS</p>
                      <p><span className="font-semibold">Bank:</span> {bill.pharmacy.bank_account_name}</p>
                      <p><span className="font-semibold">A/c No:</span> {bill.pharmacy.bank_account_number}</p>
                      <p><span className="font-semibold">IFSC:</span> {bill.pharmacy.bank_ifsc_code}</p>
                  </div>
                  )}
                  {bill.pharmacy.bank_upi_id && !isNonGst && (
                      <div className="text-center flex-shrink-0">
                          <div className="border border-gray-300 p-1 bg-white inline-block rounded">
                              <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${bill.pharmacy.bank_upi_id}&pn=${encodeURIComponent(bill.pharmacy.pharmacy_name)}&am=${(bill.total || 0).toFixed(2)}&cu=INR&tn=Bill%20${bill.invoiceNumber || bill.id}`)}`}
                                  alt="UPI QR"
                                  className="w-20 h-20 rendering-pixelated"
                              />
                          </div>
                          <p className="text-[8px] font-bold mt-0.5 text-gray-500">SCAN TO PAY</p>
                      </div>
                  )}
              </div>
              <div className="text-[8px] mt-4 text-gray-400">
                  {bill.pharmacy.terms_and_conditions ? (
                      <p className="whitespace-pre-wrap">{bill.pharmacy.terms_and_conditions}</p>
                  ) : (
                      <p>Subject to {bill.pharmacy.address ? bill.pharmacy.address.split(',').pop()?.trim() : 'local'} jurisdiction. E.&amp;O.E.</p>
                  )}
              </div>
          </div>

          <div className="flex flex-col items-end w-[240px]">
              <div className="w-full space-y-1 text-[10px] border-b border-black pb-2 mb-2">
                  <div className="flex justify-between"><span>Subtotal</span> <span>{(billDetails.subtotal || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Trade Discount</span> <span>- {(billDetails.totalTradeDiscount || 0).toFixed(2)}</span></div>
                  {billDetails.totalItemSchemeDiscount > 0 && (
                    <div className="flex justify-between text-gray-600"><span>Scheme Discount</span> <span>- {(billDetails.totalItemSchemeDiscount || 0).toFixed(2)}</span></div>
                  )}
                  {bill.schemeDiscount > 0 && <div className="flex justify-between text-gray-600"><span>Bill Discount</span> <span>- {(bill.schemeDiscount || 0).toFixed(2)}</span></div>}
                  {!isNonGst && (
                      <>
                        <div className="flex justify-between text-gray-600"><span>SGST</span> <span>+{(billDetails.totalSgst || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between text-gray-600"><span>CGST</span> <span>+{(billDetails.totalCgst || 0).toFixed(2)}</span></div>
                      </>
                  )}
                  {(bill.roundOff || 0) !== 0 && <div className="flex justify-between text-gray-600"><span>Round Off</span> <span>{bill.roundOff > 0 ? '+' : ''}{(bill.roundOff || 0).toFixed(2)}</span></div>}
              </div>
              <div className="w-full flex justify-between font-bold text-lg bg-gray-100 p-2 rounded border border-gray-200">
                  <span>GRAND TOTAL</span>
                  <span>₹ {(bill.total || 0).toFixed(2)}</span>
              </div>
              <div className="mt-8 text-center w-full">
                  {!bill.hideRetailerOnBill && !isNonGst && <p className="text-[9px] font-semibold">{bill.pharmacy.pharmacy_name}</p>}
                  <div className="h-8"></div> 
                  {!bill.hideRetailerOnBill && !isNonGst && <p className="border-t border-gray-400 pt-1 text-[9px] inline-block px-4">Authorized Signatory</p>}
              </div>
          </div>
      </div>

    </div>
  );
};

export default DetailedTemplate;
