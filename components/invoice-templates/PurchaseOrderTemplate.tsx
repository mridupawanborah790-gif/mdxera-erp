
import React from 'react';
import type { PurchaseOrder, Distributor, RegisteredPharmacy } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { useMemo } from 'react';
import { PurchaseOrderStatus } from '../../types';

interface TemplateProps {
  purchaseOrder: PurchaseOrder & { distributor: Distributor };
  pharmacy: RegisteredPharmacy;
}

const ITEMS_PER_PAGE = 25;
const FINAL_PAGE_ITEM_CAPACITY = 10;

const PurchaseOrderTemplate: React.FC<TemplateProps> = ({ purchaseOrder, pharmacy }) => {
  const displayUppercase = (value?: string | null) => value?.toUpperCase() || '';
  const subtotal = purchaseOrder.totalAmount || 0;
  const totalGst = purchaseOrder.items.reduce((acc, item) => {
    const itemTotal = (Number(item.purchasePrice || 0)) * (item.quantity || 0);
    const gstAmount = itemTotal * ((Number(item.gstPercent || 0)) / 100);
    return acc + gstAmount;
  }, 0);
  const grandTotal = subtotal + totalGst;

  const isReceived = purchaseOrder.status === PurchaseOrderStatus.RECEIVED;

  const customTerms = pharmacy.purchase_order_terms 
    ? pharmacy.purchase_order_terms.split('\n').filter(t => t.trim() !== '')
    : [
        'Please supply the items as per the quantities and rates specified.',
        'Items must have at least 12 months of remaining shelf life upon delivery.',
        'Any price discrepancy or stock unavailability must be reported within 24 hours.',
        'Goods should be accompanied by a proper Tax Invoice.'
      ];

  // Helper to chunk items for pagination: dense item pages + a lighter final page for totals/footer.
  const itemChunks = useMemo(() => {
    const items = [...purchaseOrder.items];
    const chunks: Array<typeof purchaseOrder.items> = [];

    while (items.length > FINAL_PAGE_ITEM_CAPACITY) {
      chunks.push(items.splice(0, ITEMS_PER_PAGE));
    }

    if (items.length === 0 && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      const carryOverCount = Math.min(FINAL_PAGE_ITEM_CAPACITY, lastChunk.length);
      items.push(...lastChunk.splice(lastChunk.length - carryOverCount, carryOverCount));
      if (lastChunk.length === 0) chunks.pop();
    }

    chunks.push(items);

    // Keep one page so final summary can still render even with no rows.
    return chunks.length > 0 ? chunks : [[]];
  }, [purchaseOrder.items]);

  return (
    <div className="text-gray-800 font-sans bg-white w-full">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm !important;
          }
          .po-page {
            break-after: page;
            page-break-after: always;
            min-height: auto;
            padding: 2mm 2mm 0 !important;
            box-sizing: border-box;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .po-page:last-of-type {
            break-after: auto;
            page-break-after: auto;
          }
          #print-area {
            padding: 0 !important;
            margin: 0 !important;
          }
          .po-items-table {
            table-layout: fixed;
            width: 100%;
          }
          .po-items-table tr,
          .po-items-table td,
          .po-items-table th {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .po-items-table thead {
            display: table-header-group;
          }
        }
        .uppercase-text {
          text-transform: uppercase;
        }
      `}</style>
      
      {itemChunks.map((chunk, pageIndex) => {
        const isFinalPage = pageIndex === itemChunks.length - 1;
        const pageItemStartIndex = itemChunks.slice(0, pageIndex).reduce((acc, rows) => acc + rows.length, 0);
        return (
        <div key={pageIndex} className="po-page mb-4 print:mb-0 flex flex-col min-h-[285mm]">
          {/* --- HEADER --- */}
          <header className="mb-1.5 pt-0.5">
            <div className="grid grid-cols-2 gap-2 items-stretch">
              <div className="flex flex-col justify-between min-h-[82px] border border-gray-200 rounded-md p-2">
                {pharmacy.pharmacy_logo_url && (
                  <img src={pharmacy.pharmacy_logo_url} alt="Logo" className="h-8 w-auto max-h-8 object-contain mb-0.5" />
                )}
                <h1 className="text-base font-bold text-blue-700 leading-tight uppercase-text">{displayUppercase(pharmacy.pharmacy_name)}</h1>
                <div className="text-[10px] text-gray-600 space-y-0 mt-0.5">
                  <p>Ph: <span className="font-semibold text-gray-800">{pharmacy.mobile}</span></p>
                  {pharmacy.email && <p>Email: {pharmacy.email}</p>}
                  <p>GSTIN: <span className="font-semibold text-gray-800 uppercase-text">{displayUppercase(pharmacy.gstin)}</span></p>
                </div>
              </div>
              <div className="border border-gray-200 rounded-md p-2 min-h-[82px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-black tracking-tight text-gray-900 leading-none">PURCHASE ORDER</h2>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap pt-0.5">Page {pageIndex + 1} of {itemChunks.length}</div>
                </div>
                <div className="text-[11px] bg-gray-50 p-1.5 rounded-md border border-gray-200 text-left">
                  <p className="flex justify-between"><strong>PO Number:</strong> <span className="font-mono ml-4">{purchaseOrder.serialId}</span></p>
                  <p className="flex justify-between"><strong>Date:</strong> <span className="ml-4">{new Date(purchaseOrder.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1 mb-1 text-xs items-stretch">
              <div className="border border-blue-200 bg-blue-50/50 p-2 rounded-md min-h-[76px]">
                <h3 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-0.5">Vendor / Supplier</h3>
                <p className="font-bold text-gray-900 text-[13px] uppercase-text leading-tight">{displayUppercase(purchaseOrder.distributorName)}</p>
                {purchaseOrder.distributor.address && <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-1 uppercase-text leading-snug">{displayUppercase(purchaseOrder.distributor.address)}</p>}
                {purchaseOrder.distributor.gst_number && <p className="text-[10px] font-medium text-gray-700 mt-0.5 uppercase-text">GSTIN: {displayUppercase(purchaseOrder.distributor.gst_number)}</p>}
              </div>
              <div className="border border-green-200 bg-green-50/50 p-2 rounded-md min-h-[76px]">
                <h3 className="text-[10px] font-bold text-green-800 uppercase tracking-widest mb-0.5">Ship To / Deliver To</h3>
                <p className="font-bold text-gray-900 text-[13px] uppercase-text leading-tight">{displayUppercase(pharmacy.pharmacy_name)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-1 uppercase-text leading-snug">{displayUppercase(pharmacy.address)}</p>
              </div>
            </div>
          </header>

          {/* --- ITEMS TABLE --- */}
          <div className="flex-1 flex flex-col">
          <table className="po-items-table w-full text-[10px] border-collapse mt-0.5">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="py-1 px-1 text-center font-bold w-6 border border-gray-700">#</th>
                <th className="py-1 px-1.5 text-left font-bold border border-gray-700">Item Description</th>
                <th className="py-1 px-1 text-center font-bold w-12 border border-gray-700">HSN</th>
                <th className="py-1 px-1 text-center font-bold w-9 border border-gray-700">Pack</th>
                <th className="py-1 px-1 text-center font-bold w-8 border border-gray-700">Qty</th>
                <th className="py-1 px-1 text-center font-bold w-8 border border-gray-700">Free</th>
                <th className="py-1 px-1 text-right font-bold w-14 border border-gray-700">Rate</th>
                <th className="py-1 px-1 text-right font-bold w-14 border border-gray-700">MRP</th>
                <th className="py-1 px-1 text-center font-bold w-8 border border-gray-700">GST%</th>
                <th className="py-1 px-1 text-right font-bold w-16 border border-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {chunk.map((item, index) => {
                const itemTotal = (Number(item.purchasePrice || 0)) * (item.quantity || 0);
                const actualIndex = pageItemStartIndex + index + 1;
                return (
                  <tr key={item.id} className="border-b border-gray-300">
                    <td className="py-0.5 px-1 border-x border-gray-300 text-center align-middle">{actualIndex}</td>
                    <td className="py-0.5 px-1.5 border-r border-gray-300 align-middle">
                      <p className="font-semibold text-gray-900 leading-tight truncate">{item.name}</p>
                    </td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-center align-middle">{item.hsnCode || '-'}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-center align-middle">{item.packType || item.unitOfMeasurement || '—'}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-center font-semibold align-middle">{item.quantity}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-center align-middle">{item.freeQuantity || 0}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-right align-middle">₹{Number(item.purchasePrice || 0).toFixed(2)}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-right align-middle">₹{Number(item.mrp || 0).toFixed(2)}</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-center align-middle">{Number(item.gstPercent || 0)}%</td>
                    <td className="py-0.5 px-1 border-r border-gray-300 text-right font-bold text-gray-900 align-middle">₹{Number(itemTotal || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {chunk.length > 0 && pageIndex < itemChunks.length - 1 && (
            <p className="pt-1 pb-0.5 text-center italic text-gray-400 text-[9px]">
              Items continued on next page...
            </p>
          )}

          {/* --- FOOTER --- */}
          {isFinalPage && (
            <div className="mt-3 pt-3 border-t-2 border-gray-200">
              <div className="flex justify-between items-start">
                <div className="w-7/12">
                  {/* Closure Remarks Section */}
                  {isReceived && purchaseOrder.remarks && (
                    <div className="mb-6 p-3 bg-green-50 border-l-4 border-green-500 rounded-r-lg">
                        <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-1">Receipt / Closure Remarks</p>
                        <p className="text-sm font-medium text-gray-800 leading-snug">{purchaseOrder.remarks}</p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Total Amount in Words</p>
                    <p className="text-sm font-bold text-gray-800 italic leading-snug">{numberToWords(grandTotal || 0)}</p>
                  </div>
                  
                  <div className="mt-6">
                    <h3 className="text-xs font-bold text-gray-700 uppercase mb-1 underline">Terms & Instructions</h3>
                    <ul className="text-[10px] text-gray-600 list-disc list-inside space-y-1">
                      {customTerms.map((term, i) => (
                        <li key={i}>{term}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="w-4/12">
                  <div className="bg-blue-50/30 p-4 rounded-xl border-2 border-blue-100 space-y-2.5">
                    <div className="flex justify-between text-xs font-medium text-gray-600">
                      <span>Subtotal</span>
                      <span>₹{Number(subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-gray-600 pb-2 border-b border-blue-100">
                      <span>GST (Estimated)</span>
                      <span>₹{Number(totalGst || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-black text-blue-900 pt-1">
                      <span>TOTAL</span>
                      <span>₹{Number(grandTotal || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-12 text-center">
                    <div className="h-16 flex items-end justify-center">
                       <div className="border-b-2 border-gray-400 w-3/4 mx-auto"></div>
                    </div>
                    <p className="mt-2 text-xs font-bold text-gray-900 uppercase">{pharmacy.full_name}</p>
                    <p className="text-[10px] text-gray-500 font-medium">Authorized Signatory</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-3">
                <p>This is a computer generated Purchase Order from <strong>MDXERA Retail ERP</strong>. E.&O.E.</p>
              </div>
            </div>
          )}
        </div>
      )})}
    </div>
  );
};

export default PurchaseOrderTemplate;
