
import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem, AppConfigurations } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { calculateBillingTotals } from '../../utils/billing';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[]; configurations: AppConfigurations; };
  orientation?: 'portrait' | 'landscape';
}

const ITEMS_PER_PAGE = 10;

const MargTemplate: React.FC<TemplateProps> = ({ bill, orientation = 'portrait' }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isLandscape = orientation === 'landscape';
  
  const displayOptions = bill.configurations?.displayOptions || {};
  const showBillDiscount = displayOptions.showBillDiscountOnPrint !== false;
  const isMode8 = displayOptions.calculationMode === '8';
  const showItemWiseDisc = displayOptions.showItemWiseDiscountOnPrint !== false;
  const showSchemeColumn = (bill.items || []).some(item => (item.schemeDiscountPercent || 0) > 0 || (item.schemeDiscountAmount || 0) > 0);

  const computedBillTotals = useMemo(() => calculateBillingTotals({
    items: bill.items || [],
    billDiscount: bill.schemeDiscount || 0,
    isNonGst,
    configurations: bill.configurations,
  }), [bill.items, bill.schemeDiscount, bill.configurations, isNonGst]);

  const calculations = useMemo(() => {
    let subtotalValue = 0;
    let totalSgst = 0;
    let totalCgst = 0;

    const items = (bill.items || []).map(item => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);

      const rate = item.rate ?? item.mrp ?? 0;
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const lineGross = billedQty * rate;
      const tradeDiscount = lineGross * ((item.discountPercent || 0) / 100);
      const schemeDiscount = item.schemeDiscountAmount || 0;
      const lineAmount = Number.isFinite(item.finalAmount)
        ? (item.finalAmount as number)
        : Number.isFinite(item.amount)
          ? (item.amount as number)
          : (lineGross - tradeDiscount - schemeDiscount);
      
      const effectiveGst = isNonGst ? 0 : (item.gstPercent || 0);
      const taxableVal = lineAmount / (1 + (effectiveGst / 100));
      const gstAmt = lineAmount - taxableVal;
      
      subtotalValue += lineAmount;
      totalSgst += gstAmt / 2;
      totalCgst += gstAmt / 2;

      return {
        ...item,
        hsn: item.hsnCode || inventoryItem?.hsnCode || '',
        pack: item.packType || inventoryItem?.packType || item.unitOfMeasurement || (item.unitsPerPack ? `${item.unitsPerPack}` : ''),
        batch: item.batch || inventoryItem?.batch || '',
        expiry: item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : ''),
        taxableVal,
        gstAmt,
        lineTotal: lineAmount,
        displayName: (() => {
          const packLabel = item.packType?.trim() || inventoryItem?.packType?.trim() || '';
          return packLabel ? `${item.name} (${packLabel})` : item.name;
        })()
      };
    });

    const gstSummary: { [rate: number]: { taxable: number; sgst: number; cgst: number } } = {};
    items.forEach(item => {
        const r = item.gstPercent || 0;
        if (!gstSummary[r]) gstSummary[r] = { taxable: 0, sgst: 0, cgst: 0 };
        gstSummary[r].taxable += item.taxableVal;
        gstSummary[r].sgst += (item.gstAmt / 2);
        gstSummary[r].cgst += (item.gstAmt / 2);
    });

    const chunks = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      chunks.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    const itemChunks = chunks.length > 0 ? chunks : [[]];

    const tradeDiscount = computedBillTotals.tradeDiscount || bill.totalItemDiscount || 0;
    const billDiscount = showBillDiscount ? (computedBillTotals.billDiscount || 0) : 0;
    const taxableValue = computedBillTotals.taxableValue;
    const totalGst = isNonGst ? 0 : computedBillTotals.tax;
    const roundOff = bill.roundOff || computedBillTotals.autoRoundOff || 0;
    const grandTotal = bill.total || (taxableValue + totalGst + roundOff);

    return { items, itemChunks, subtotalValue, totalSgst, totalCgst, gstSummary, tradeDiscount, billDiscount, taxableValue, totalGst, roundOff, grandTotal };
  }, [bill, isNonGst, computedBillTotals, showBillDiscount]);

  return (
    <div className="bg-white text-black font-sans w-full mx-auto leading-tight min-h-full flex flex-col antialiased" style={{ fontSize: isLandscape ? '8pt' : '8.5pt' }}>
      <style>{`
        @media print {
          @page { 
            margin: 0mm !important; 
            size: A5 ${orientation}; 
          }
          body { margin: 0; padding: 0; }
          .marg-page {
            page-break-after: always;
            width: ${isLandscape ? '210mm' : '148mm'};
            height: ${isLandscape ? '148mm' : '210mm'};
            padding: 4mm !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: white !important;
            border: 0 !important;
          }
          .marg-page:last-child {
            page-break-after: auto;
          }
        }
        @media screen {
          .marg-page {
            width: ${isLandscape ? '210mm' : '148mm'};
            height: ${isLandscape ? '148mm' : '210mm'};
            padding: 4mm;
            background: white;
            box-shadow: 0 0 5px rgba(0,0,0,0.1);
            margin-bottom: 10px;
            overflow: hidden;
          }
        }
        .erp-table { border: 1px solid black; }
        .erp-table th { border: 1px solid black; padding: 1px 3px; font-weight: 600 !important; font-size: 7.5pt; }
        .erp-table td { border-left: 1px solid black; border-right: 1px solid black; padding: 1px 3px; font-size: 8pt; font-weight: 500; }
        .font-mono-erp { font-family: 'Courier New', Courier, monospace; }
        .footer-border { border: 1px solid black; border-top: 0; }
        .row-height { height: 26px; }
      `}</style>

      {calculations.itemChunks.map((chunk, pageIdx) => (
        <div key={pageIdx} className="marg-page">
          <div className="grid grid-cols-3 border-t border-x border-black">
            <div className="p-1.5 border-r border-black">
              <h1 className="text-base font-black uppercase text-blue-900 mb-0.5 leading-none">{bill.pharmacy.pharmacy_name}</h1>
              <p className="text-[6.5pt] uppercase font-bold text-gray-700 line-clamp-1 leading-tight">{bill.pharmacy.address}</p>
              <p className="text-[7.5pt] mt-0.5 font-black leading-none"><span className="opacity-50">PH:</span> {bill.pharmacy.mobile}</p>
              {!isNonGst && <p className="text-[7.5pt] font-black leading-none"><span className="opacity-50">GST:</span> {bill.pharmacy.gstin}</p>}
            </div>
            
            <div className="flex flex-col items-center justify-center border-r border-black p-1">
                {bill.pharmacy.pharmacy_logo_url ? (
                    <img src={bill.pharmacy.pharmacy_logo_url} alt="Logo" className="h-8 w-auto object-contain mb-0.5" />
                ) : (
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-black text-sm border border-black mb-0.5">M</div>
                )}
                <span className="text-[8pt] font-black uppercase text-center border-y border-black w-full py-0.5 bg-gray-50">
                    {bill.paymentMode === 'Credit' ? 'CREDIT' : 'CASH'}
                </span>
            </div>

            <div className="p-1.5">
               <h3 className="text-[6pt] font-black uppercase underline mb-0.5 text-gray-500">Party Details:</h3>
               <p className="font-black uppercase text-[8.5pt] truncate text-gray-950 leading-tight">{bill.customerName}</p>
               <div className="mt-0.5 space-y-0.5 text-[7pt] font-bold text-gray-600">
                 <p className="truncate">{bill.customerDetails?.address || 'N/A'}</p>
                 <p><span className="opacity-50">PH:</span> {bill.customerPhone || bill.customerDetails?.phone || '-'}</p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-y border-x border-black bg-gray-100">
              <div className="col-span-2 py-0.5 flex items-center justify-center border-r border-black">
                  <h2 className="text-lg font-black uppercase tracking-[0.2em] text-gray-900 leading-none">{isNonGst ? 'ESTIMATE' : 'GST INVOICE'}</h2>
              </div>
              <div className="p-0.5 pl-2 flex flex-col justify-center text-[8pt]">
                  <p className="font-bold leading-none">INV: <span className="font-mono font-black text-blue-900">{bill.id}</span></p>
                  <p className="font-bold uppercase text-[6.5pt] mt-0.5">DATE: {new Date(bill.date).toLocaleDateString('en-GB')}</p>
              </div>
          </div>

          <table className="w-full erp-table border-collapse flex-1 bg-white">
            <thead>
              <tr className="bg-gray-100 text-[7pt] font-semibold uppercase border-b border-black">
                <th className="w-[4%]">#</th>
                <th className="w-[10%]">QTY+F</th>
                <th className="text-left w-[23%]">DESCRIPTION</th>
                <th className="w-[8%]">HSN</th>
                <th className="w-[7%]">PACK</th>
                <th className="w-[9%]">BATCH</th>
                <th className="w-[7%]">EXP.</th>
                <th className="w-[8%] text-right">M.R.P</th>
                <th className="w-[8%] text-right">RATE</th>
                {showItemWiseDisc && <th className="w-[5%]">D%</th>}
                {showSchemeColumn && <th className="w-[5%]">SCH%</th>}
                <th className="w-[5%]">GST%</th>
                <th className="w-[11%] text-right border-r-0">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="text-[8.5pt] font-medium">
              {chunk.map((item, idx) => {
                const sn = (pageIdx * ITEMS_PER_PAGE) + idx + 1;
                return (
                  <tr key={item.id} className="row-height border-b border-gray-100">
                    <td className="text-center font-black">{sn}</td>
                    <td className="text-center font-black">{item.quantity}+{item.freeQuantity || 0}</td>
                    <td className="font-black uppercase truncate text-gray-900">{item.displayName}</td>
                    <td className="text-center font-mono-erp text-[7.5pt]">{item.batch}</td>
                    <td className="text-center text-[7pt]">{item.expiry}</td>
                    <td className="text-right">{(item.mrp || 0).toFixed(2)}</td>
                    <td className="text-right text-blue-900">{(item.rate || 0).toFixed(2)}</td>
                    {showItemWiseDisc && <td className="text-center text-red-600">{item.discountPercent || '0'}</td>}
                    {showSchemeColumn && <td className="text-center text-emerald-700">{item.schemeDiscountPercent || '-'}</td>}
                    <td className="text-center">{(item.gstPercent || 0).toFixed(0)}</td>
                    <td className="text-right font-black border-r-0 text-gray-950">{(item.lineTotal || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - chunk.length) }).map((_, i) => (
                <tr key={`spacer-${i}`} className="row-height border-b border-gray-100 last:border-b-0">
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    {showItemWiseDisc && <td className="border-r border-black"></td>}
                    {showSchemeColumn && <td className="border-r border-black"></td>}
                    <td className="border-r border-black"></td>
                    <td className=""></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-2 footer-border flex-shrink-0 bg-white">
                <div className="border-r border-black p-1.5 flex flex-col justify-between">
                  {!isNonGst && (
                    <table className="w-full text-[6.5pt] border-collapse erp-table mb-1">
                        <thead className="bg-gray-100 uppercase font-black">
                          <tr>
                            <th className="text-left py-0.5">GST Rate</th>
                            <th className="text-right py-0.5">Taxable</th>
                            <th className="text-right py-0.5">SGST</th>
                            <th className="text-right py-0.5">CGST</th>
                          </tr>
                        </thead>
                        <tbody className="font-black">
                          {Object.entries(calculations.gstSummary).map(([rate, vals]) => {
                            const v = vals as any;
                            if (parseFloat(rate) === 0) return null;
                            return (
                              <tr key={rate}>
                                <td className="font-black">{rate}%</td>
                                <td className="text-right">{v.taxable.toFixed(2)}</td>
                                <td className="text-right">{v.sgst.toFixed(2)}</td>
                                <td className="text-right">{v.cgst.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                    </table>
                  )}

                  <div className="mt-1">
                    <p className="text-[7.5pt] font-black uppercase text-gray-950 border-b border-dashed border-gray-300 pb-1 mb-1 leading-tight">
                      {numberToWords(calculations.grandTotal)}
                    </p>
                    <div className="mt-2 flex justify-between items-end">
                        <div>
                            <span className="text-base font-black text-gray-900 mr-2">BAL:</span>
                            <span className="text-base font-black text-red-600">₹{(calculations.grandTotal - (bill.amountReceived || 0)).toFixed(2)}</span>
                        </div>
                        <div className="text-center pr-1">
                            <p className="text-[6pt] font-black mb-4 uppercase tracking-wider">FOR {bill.pharmacy.pharmacy_name}</p>
                            <p className="text-[7pt] font-black border-t border-black pt-0.5 px-4 inline-block uppercase leading-none">Auth. Signatory</p>
                        </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-gray-50/80">
                  <div className="p-2 flex-1 space-y-1 text-[8.5pt] font-bold">
                      <div className="flex justify-between"><span>SUB TOTAL</span> <span className="font-black">₹ {(bill.subtotal || 0).toFixed(2)}</span></div>
                      
                      {showBillDiscount && calculations.billDiscount > 0 && (
                        <div className="flex justify-between text-indigo-700 font-black">
                            <span>{isMode8 ? 'Adjustment (Mode 8)' : 'Bill Discount'}</span> 
                            <span>- {calculations.billDiscount.toFixed(2)}</span>
                        </div>
                      )}

                      {!isNonGst && <div className="flex justify-between text-gray-600"><span>Tax Amount</span> <span className="font-black text-gray-900">{(calculations.totalGst || 0).toFixed(2)}</span></div>}
                      <div className="flex justify-between text-gray-500"><span>Round Off</span> <span className="text-[8pt] font-normal">{(calculations.roundOff || 0).toFixed(2)}</span></div>
                  </div>
                  <div className="p-2 bg-white border-t border-black flex justify-between items-center shadow-inner">
                      <span className="text-sm font-black text-gray-800 tracking-tighter">GRAND TOTAL</span>
                      <span className="text-2xl font-black text-blue-900 tracking-tighter">₹ {calculations.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
            </div>
        </div>
      ))}
    </div>
  );
};

export default MargTemplate;
