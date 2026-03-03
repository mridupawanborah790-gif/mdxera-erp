import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { numberToWords } from '../../utils/numberToWords';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const ITEMS_PER_PAGE = 10;

const AbhigyanTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';

  const calculations = useMemo(() => {
    let subTotalTaxable = 0;

    const items = (bill.items || []).map((item, idx) => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
      
      const rate = item.rate ?? item.mrp ?? 0;
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const lineAmount = billedQty * rate;
      
      const effectiveGst = isNonGst ? 0 : (item.gstPercent || 0);
      const taxableVal = lineAmount / (1 + (effectiveGst / 100));
      const gstAmt = lineAmount - taxableVal;
      
      subTotalTaxable += taxableVal;

      return {
        ...item,
        sn: idx + 1,
        hsn: item.hsnCode || inventoryItem?.hsnCode || '',
        packSize: item.packType || inventoryItem?.packType || item.unitOfMeasurement || (item.unitsPerPack ? `${item.unitsPerPack} units` : ''),
        gstRate: item.gstPercent || 0,
        taxableVal,
        gstAmt,
        lineTotal: lineAmount,
        displayName: (() => {
          const packLabel = item.packType?.trim() || inventoryItem?.packType?.trim() || '';
          return packLabel ? `${item.name} (${packLabel})` : item.name;
        })(),
        unitLabel: item.packType || 'pkt'
      };
    });

    const gstSummary: { [rate: number]: { taxable: number; sgst: number; cgst: number; igst: number } } = {};
    (items || []).forEach(item => {
        const r = item.gstPercent || 0;
        if (!gstSummary[r]) gstSummary[r] = { taxable: 0, sgst: 0, cgst: 0, igst: 0 };
        gstSummary[r].taxable += item.taxableVal;
        gstSummary[r].cgst += item.gstAmt / 2;
        gstSummary[r].sgst += item.gstAmt / 2;
    });

    const chunks = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      chunks.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    const itemChunks = chunks.length > 0 ? chunks : [[]];

        const totalTax = isNonGst ? 0 : (bill.totalGst || Object.values(gstSummary).reduce((sum, slab) => sum + slab.cgst + slab.sgst + slab.igst, 0));
    const subTotal = bill.subtotal || (subTotalTaxable + totalTax);
    const billDiscount = bill.schemeDiscount || 0;
    const roundOff = bill.roundOff || 0;
    const grandTotal = bill.total || (subTotal - billDiscount + totalTax + roundOff);

    return { items, itemChunks, subTotalTaxable, gstSummary, subTotal, totalTax, billDiscount, roundOff, grandTotal };
  }, [bill, isNonGst]);

  const totalQty = (bill.items || []).reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="bg-white text-black font-sans w-full mx-auto leading-tight text-[9pt] border border-gray-300 print:border-0 print:p-0 overflow-hidden" style={{ fontWeight: 400 }}>
      <style>{`
        .abhigyan-table { border-collapse: collapse; width: 100%; border: 1px solid black; }
        .abhigyan-table th { border: 1px solid black; padding: 2px; background-color: transparent; font-weight: 600; text-transform: none; font-size: 8pt; }
        .abhigyan-table td { border-left: 1px solid black; border-right: 1px solid black; padding: 1px 4px; border-top: 0; border-bottom: 0; font-size: 8.5pt; font-weight: 500; }
        .abhigyan-table tfoot tr { border-top: 1px solid black; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
        .border-t-black { border-top: 1px solid black !important; }
        .row-min-h { height: 19px; }
        @media print {
          .abhigyan-page { page-break-after: always; }
          .abhigyan-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {calculations.itemChunks.map((chunk, pageIdx) => (
      <div key={pageIdx} className="abhigyan-page p-2">

      {/* Header Grid */}
      <div className="text-center mb-0.5">
          <h2 className="text-[9pt] font-bold uppercase tracking-widest leading-none">Tax Invoice</h2>
      </div>

      <div className="grid grid-cols-2 border border-black border-b-0">
          <div className="p-1 border-r border-black">
              <p className="font-bold text-[10pt] leading-tight">{bill.pharmacy.pharmacy_name}</p>
              <p className="text-[7.5pt] whitespace-pre-line leading-tight opacity-80">{bill.pharmacy.address}</p>
              <div className="text-[7.5pt] mt-0.5 space-y-0.5">
                <p><span className="font-bold">GSTIN/UIN:</span> {bill.pharmacy.gstin}</p>
                <p><span className="font-bold">State Name:</span> {(bill.pharmacy.address || '').split(',').pop()?.trim() || 'Assam'}, Code: 18</p>
              </div>
          </div>
          <div className="grid grid-cols-2">
              <div className="p-1 border-r border-b border-black">
                  <p className="text-[7pt] font-bold text-gray-500 uppercase leading-none">Invoice No.</p>
                  <p className="font-bold text-[9pt]">{bill.id}</p>
              </div>
              <div className="p-1 border-b border-black">
                  <p className="text-[7pt] font-bold text-gray-500 uppercase leading-none">Dated</p>
                  <p className="font-bold text-[9pt]">{new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric'})}</p>
              </div>
              <div className="p-1 border-r border-black">
                  <p className="text-[7pt] font-bold text-gray-500 uppercase leading-none">Ref No.</p>
                  <p className="text-[8.5pt]">-</p>
              </div>
              <div className="p-1">
                  <p className="text-[7pt] font-bold text-gray-500 uppercase leading-none">Mode of Pay</p>
                  <p className="font-bold text-[8.5pt]">{bill.paymentMode}</p>
              </div>
          </div>
      </div>

      {/* Consignee & Buyer */}
      <div className="grid grid-cols-2 border border-black border-t-0">
          <div className="p-1 border-r border-black">
              <p className="text-[7pt] font-bold text-gray-500 uppercase mb-0.5 leading-none">Consignee (Ship to)</p>
              <p className="font-bold uppercase text-[8.5pt] leading-tight truncate">{bill.customerName}</p>
              <p className="text-[8pt] line-clamp-1 opacity-80">{bill.customerDetails?.address || 'N/A'}</p>
              <p className="text-[8pt]"><span className="font-bold">GSTIN:</span> {bill.customerDetails?.gstNumber || 'N/A'}</p>
          </div>
          <div className="p-1">
              <p className="text-[7pt] font-bold text-gray-500 uppercase mb-0.5 leading-none">Buyer (Bill to)</p>
              <p className="font-bold uppercase text-[8.5pt] leading-tight truncate">{bill.customerName}</p>
              <p className="text-[8pt] line-clamp-1 opacity-80">{bill.customerDetails?.address || 'N/A'}</p>
              <p className="text-[8pt]"><span className="font-bold">GSTIN:</span> {bill.customerDetails?.gstNumber || 'N/A'}</p>
          </div>
      </div>

      {/* Item Table */}
      <table className="abhigyan-table border-t-0 border-b-0">
          <thead>
              <tr>
                  <th className="w-[5%]">Sl.</th>
                  <th className="w-[36%] text-left">Description of Goods</th>
                  <th className="w-[9%]">Pack</th>
                  <th className="w-[10%]">HSN/SAC</th>
                  <th className="w-[8%]">GST</th>
                  <th className="w-[8%]">Qty</th>
                  <th className="w-[8%]">Rate</th>
                  <th className="w-[6%]">Per</th>
                  <th className="w-[10%] text-right">Amount</th>
              </tr>
          </thead>
          <tbody>
              {(chunk || []).map((item, index) => (
                  <tr key={item.id} className="row-min-h">
                      <td className="text-center">{(pageIdx * ITEMS_PER_PAGE) + index + 1}</td>
                      <td className="font-bold truncate">{item.displayName}</td>
                      <td className="text-center">{item.hsn}</td>
                      <td className="text-center">{item.gstRate}%</td>
                      <td className="text-center">{item.quantity.toFixed(2)} {item.unitLabel}</td>
                      <td className="text-center">{(item.rate ?? 0).toFixed(2)}</td>
                      <td className="text-center">{item.unitLabel}</td>
                      <td className="text-right font-bold">{item.lineTotal.toFixed(2)}</td>
                  </tr>
              ))}
              
              {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - chunk.length) }).map((_, i) => (
                  <tr key={`spacer-${i}`} className="row-min-h">
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                      <td className="border-l border-r border-black"></td>
                  </tr>
              ))}
              
              {/* Local Tax Rows inside table */}
              {!isNonGst && Object.entries(calculations.gstSummary).map(([rate, vals], idx) => {
                  const v = vals as { taxable: number; sgst: number; cgst: number; igst: number };
                  return (
                      <React.Fragment key={rate}>
                        <tr className={idx === 0 ? "border-t-black row-min-h" : "row-min-h"}>
                            <td className="border-l border-r border-black"></td>
                            <td className="text-right font-bold italic border-l border-r border-black" colSpan={6}>Output @{parseFloat(rate)/2}% CGST</td>
                            <td className="text-right border-l border-r border-black">{v.cgst.toFixed(2)}</td>
                        </tr>
                        <tr className="row-min-h">
                            <td className="border-l border-r border-black"></td>
                            <td className="text-right font-bold italic border-l border-r border-black" colSpan={6}>Output @{parseFloat(rate)/2}% SGST</td>
                            <td className="text-right border-l border-r border-black">{v.sgst.toFixed(2)}</td>
                        </tr>
                      </React.Fragment>
                  );
              })}
          </tbody>
          <tfoot>
              <tr className="bg-gray-50 border-t border-black">
                  <td colSpan={4} className="p-1 text-right font-bold uppercase text-[8pt]">Total</td>
                  <td className="p-1 text-center font-bold text-[8.5pt]">{totalQty.toFixed(2)}</td>
                  <td colSpan={2}></td>
                  <td className="p-1 text-right font-bold text-[9.5pt]">₹ {calculations.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
          </tfoot>
      </table>

      {/* Amount in words */}
      <div className="border border-black border-t-0 p-1">
          <p className="text-[7pt] text-gray-500 font-bold uppercase leading-none">Amount Chargeable (in words)</p>
          <p className="font-bold uppercase text-[8pt] italic">{numberToWords(calculations.grandTotal)}</p>
      </div>

      {/* Tax Analysis Table */}
      {!isNonGst && (
          <table className="abhigyan-table border-t-0 text-[7pt]">
              <thead>
                  <tr>
                      <th rowSpan={2} className="text-left w-[20%]">HSN/SAC</th>
                      <th rowSpan={2} className="w-[15%]">Taxable Val</th>
                      <th colSpan={2} className="w-[20%]">Central Tax</th>
                      <th colSpan={2} className="w-[20%]">State Tax</th>
                      <th rowSpan={2} className="w-[25%]">Total Tax</th>
                  </tr>
                  <tr>
                      <th className="w-[10%]">Rate</th>
                      <th className="w-[10%]">Amt</th>
                      <th className="w-[10%]">Rate</th>
                      <th className="w-[10%]">Amt</th>
                  </tr>
              </thead>
              <tbody>
                  {Object.entries(calculations.gstSummary).map(([rate, vals]) => {
                      const v = vals as { taxable: number; sgst: number; cgst: number; igst: number };
                      return (
                          <tr key={rate} className="border-b-main-alt">
                              <style>{` .border-b-main-alt { border-bottom: 0.5px solid black !important; } `}</style>
                              <td className="p-0.5 text-left font-bold">{calculations.items.find(i => String(i.gstRate) === rate)?.hsn || '-'}</td>
                              <td className="p-0.5 text-right">{v.taxable.toFixed(2)}</td>
                              <td className="p-0.5 text-center">{(parseFloat(rate)/2)}%</td>
                              <td className="p-0.5 text-right">{v.cgst.toFixed(2)}</td>
                              <td className="p-0.5 text-center">{(parseFloat(rate)/2)}%</td>
                              <td className="p-0.5 text-right">{v.sgst.toFixed(2)}</td>
                              <td className="p-0.5 text-right font-bold">{(v.cgst + v.sgst).toFixed(2)}</td>
                          </tr>
                      );
                  })}
              </tbody>
              <tfoot>
                  <tr className="bg-gray-50 border-t border-black">
                      <td className="p-0.5 text-right font-bold uppercase">Total</td>
                      <td className="p-0.5 text-right font-bold">{calculations.subTotalTaxable.toFixed(2)}</td>
                      <td></td>
                      <td className="p-0.5 text-right font-bold">{(Object.values(calculations.gstSummary) as { cgst: number }[]).reduce((a: number, b) => a + b.cgst, 0).toFixed(2)}</td>
                      <td></td>
                      <td className="p-0.5 text-right font-bold">{(Object.values(calculations.gstSummary) as { sgst: number }[]).reduce((a: number, b) => a + b.sgst, 0).toFixed(2)}</td>
                      <td className="p-0.5 text-right font-bold">{(Object.values(calculations.gstSummary) as { cgst: number; sgst: number }[]).reduce((a: number, b) => a + (b.cgst + b.sgst), 0).toFixed(2)}</td>
                  </tr>
              </tfoot>
          </table>
      )}

      {/* Tax Amount in Words */}
      {!isNonGst && (
        <div className="border border-black border-t-0 p-1">
            <p className="text-[7pt] text-gray-500 font-bold uppercase leading-none">Tax Amount (in words)</p>
            <p className="font-bold text-[8pt] uppercase italic opacity-80 truncate">
                {numberToWords((Object.values(calculations.gstSummary) as { cgst: number; sgst: number }[]).reduce((a: number, b) => a + (b.cgst + b.sgst), 0))}
            </p>
        </div>
      )}

      {/* Declaration & Footer */}
      <div className="grid grid-cols-2 border border-black border-t-0">
          <div className="p-1 border-r border-black flex flex-col justify-center">
              <p className="text-[7pt] font-bold underline mb-0.5 uppercase tracking-tighter">Declaration</p>
              <p className="text-[7.5pt] leading-tight italic text-gray-700">
                  We declare that this invoice shows the actual price and particulars are true.
              </p>
          </div>
          <div className="p-1 text-right flex flex-col justify-between items-end min-h-[50px]">
              <p className="text-[7.5pt] font-bold">for {bill.pharmacy.pharmacy_name}</p>
              <div className="mt-auto">
                <p className="text-[7.5pt] font-bold border-t border-black pt-0.5 px-4">Authorised Signatory</p>
              </div>
          </div>
      </div>

      <div className="text-center py-1 text-[7pt] font-bold uppercase text-gray-400 leading-none">
          SUBJECT TO {(bill.pharmacy.address || '').split(',').pop()?.trim() || 'NAGAON'} JURISDICTION
          <p className="text-[6pt] font-normal lowercase opacity-50 mt-0.5">Computer Generated Invoice - MDXERA ERP</p>
      </div>
      </div>
      ))}
    </div>
  );
};

export default AbhigyanTemplate;
