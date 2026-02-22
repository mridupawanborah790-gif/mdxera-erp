
import React from 'react';
import type { PurchaseOrder, Distributor, RegisteredPharmacy } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { useMemo } from 'react';
import { PurchaseOrderStatus } from '../../types';

interface TemplateProps {
  purchaseOrder: PurchaseOrder & { distributor: Distributor };
  pharmacy: RegisteredPharmacy;
}

const ITEMS_PER_PAGE = 15;

const PurchaseOrderTemplate: React.FC<TemplateProps> = ({ purchaseOrder, pharmacy }) => {
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

  // Helper to chunk items for pagination
  const itemChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < purchaseOrder.items.length; i += ITEMS_PER_PAGE) {
      chunks.push(purchaseOrder.items.slice(i, i + ITEMS_PER_PAGE));
    }
    // Ensure at least one page if no items
    return chunks.length > 0 ? chunks : [[]];
  }, [purchaseOrder.items]);

  return (
    <div className="text-gray-800 font-sans bg-white w-full">
      <style>{`
        @media print {
          @page {
            margin: 5mm !important;
          }
          .po-page {
            page-break-after: always;
            min-height: 98vh;
            padding: 5mm !important;
            box-sizing: border-box;
          }
          .po-page:last-child {
            page-break-after: auto;
          }
          #print-area {
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
      
      {itemChunks.map((chunk, pageIndex) => (
        <div key={pageIndex} className="po-page mb-10 print:mb-0">
          {/* --- HEADER --- */}
          <header className="mb-6 pt-2">
            <div className="flex justify-between items-start">
              <div>
                {pharmacy.pharmacy_logo_url && (
                  <img src={pharmacy.pharmacy_logo_url} alt="Logo" className="h-16 w-auto max-h-16 object-contain mb-2" />
                )}
                <h1 className="text-2xl font-bold text-blue-700 leading-tight">{pharmacy.pharmacy_name}</h1>
                <div className="text-xs text-gray-600 space-y-0.5 mt-1">
                  <p>Ph: <span className="font-semibold text-gray-800">{pharmacy.mobile}</span></p>
                  {pharmacy.email && <p>Email: {pharmacy.email}</p>}
                  {/* Fix: Changed retailer_gstin to gstin */}
                  <p>GSTIN: <span className="font-semibold text-gray-800">{pharmacy.gstin}</span></p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black tracking-tighter text-gray-900 mb-1">PURCHASE ORDER</h2>
                <div className="text-[10px] text-gray-400 mb-2">Page {pageIndex + 1} of {itemChunks.length}</div>
                <div className="text-sm bg-gray-100 p-2 rounded-lg border border-gray-200 inline-block text-left min-w-[200px]">
                  <p className="flex justify-between"><strong>PO Number:</strong> <span className="font-mono ml-4">{purchaseOrder.serialId}</span></p>
                  <p className="flex justify-between"><strong>Date:</strong> <span className="ml-4">{new Date(purchaseOrder.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 mb-4 text-sm">
              <div className="border border-blue-200 bg-blue-50/50 p-3 rounded-lg">
                <h3 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-1">Vendor / Supplier</h3>
                <p className="font-bold text-gray-900 text-base">{purchaseOrder.distributorName}</p>
                {purchaseOrder.distributor.address && <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{purchaseOrder.distributor.address}</p>}
                {/* Fix: Rename purchaseOrder.distributor.gstNumber to purchaseOrder.distributor.gst_number */}
                {purchaseOrder.distributor.gst_number && <p className="text-xs font-medium text-gray-700 mt-1">GSTIN: {purchaseOrder.distributor.gst_number}</p>}
              </div>
              <div className="border border-green-200 bg-green-50/50 p-3 rounded-lg">
                <h3 className="text-[10px] font-bold text-green-800 uppercase tracking-widest mb-1">Ship To / Deliver To</h3>
                <p className="font-bold text-gray-900 text-base">{pharmacy.pharmacy_name}</p>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{pharmacy.address}</p>
              </div>
            </div>
          </header>

          {/* --- ITEMS TABLE --- */}
          <table className="w-full text-xs border-collapse mt-2">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="py-2 px-2 text-left font-bold w-8 border border-gray-700">#</th>
                <th className="py-2 px-2 text-left font-bold border border-gray-700">Item Description</th>
                <th className="py-2 px-2 text-center font-bold w-20 border border-gray-700">Pack</th>
                <th className="py-2 px-2 text-center font-bold w-12 border border-gray-700">Qty</th>
                <th className="py-2 px-2 text-center font-bold w-12 border border-gray-700">Free</th>
                <th className="py-2 px-2 text-right font-bold w-20 border border-gray-700">Rate</th>
                <th className="py-2 px-2 text-right font-bold w-20 border border-gray-700">MRP</th>
                <th className="py-2 px-2 text-right font-bold w-12 border border-gray-700">GST%</th>
                <th className="py-2 px-2 text-right font-bold w-24 border border-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {chunk.map((item, index) => {
                const itemTotal = (Number(item.purchasePrice || 0)) * (item.quantity || 0);
                const actualIndex = (pageIndex * ITEMS_PER_PAGE) + index + 1;
                return (
                  <tr key={item.id} className="border-b border-gray-300">
                    <td className="py-2 px-2 border-x border-gray-300 text-center">{actualIndex}</td>
                    <td className="py-2 px-2 border-r border-gray-300">
                      <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase font-medium">
                        {item.manufacturer || item.brand}
                        {item.hsnCode && ` | HSN: ${item.hsnCode}`}
                      </p>
                    </td>
                    <td className="py-2 px-2 border-r border-gray-300 text-center">{item.packType || item.unitOfMeasurement || '—'}</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-center font-bold">{item.quantity}</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-center">{item.freeQuantity || 0}</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-right font-medium">₹{Number(item.purchasePrice || 0).toFixed(2)}</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-right">₹{Number(item.mrp || 0).toFixed(2)}</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-right">{Number(item.gstPercent || 0)}%</td>
                    <td className="py-2 px-2 border-r border-gray-300 text-right font-bold text-gray-900">₹{Number(itemTotal || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {pageIndex < itemChunks.length - 1 && (
                <tr>
                    <td colSpan={9} className="py-4 text-center italic text-gray-400 text-[10px]">
                        Items continued on next page...
                    </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* --- FOOTER --- */}
          {pageIndex === itemChunks.length - 1 && (
            <div className="mt-8 pt-4 border-t-2 border-gray-200">
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
              
              <div className="mt-12 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-4">
                <p>This is a computer generated Purchase Order from <strong>MDXERA Retail ERP</strong>. E.&O.E.</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PurchaseOrderTemplate;
