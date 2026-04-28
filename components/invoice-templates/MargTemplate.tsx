
import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem, AppConfigurations } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { getDisplaySchemePercent, hasLineLevelSchemeDiscount, isRateFieldAvailable, resolveEffectivePricingMode, resolvePosLineAmountCalculationMode } from '../../utils/billing';
import { calculateCustomerReceivableBreakdown } from '../../utils/helpers';
import { formatPackLooseQuantity } from '../../utils/quantity';
import BankDetailsInline from './BankDetailsInline';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[]; configurations: AppConfigurations; };
  orientation?: 'portrait' | 'landscape';
}

const ITEMS_PER_PAGE = 14;
const SMART_PAGE_HEIGHT = 730;
const SMART_HEADER_HEIGHT = 190;
const SMART_TABLE_HEADER_HEIGHT = 28;
const SMART_ROW_HEIGHT = 17;
const SMART_SUMMARY_HEIGHT = 220;

const MargTemplate: React.FC<TemplateProps> = ({ bill, orientation = 'portrait' }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isLandscape = orientation === 'landscape';
  
  const displayOptions = bill.configurations?.displayOptions || {};
  const showBillDiscount = displayOptions.showBillDiscountOnPrint !== false;
  const isMode8 = displayOptions.calculationMode === '8';
  const showItemWiseDisc = displayOptions.showItemWiseDiscountOnPrint !== false;
  const showTradeDiscountColumn = showItemWiseDisc && (bill.items || []).some(item => (item.discountPercent || 0) > 0);
  const showSchemeColumn = (bill.items || []).some(item => hasLineLevelSchemeDiscount(item));
  const showRateColumn = isRateFieldAvailable(bill.configurations);
  const posLineAmountMode = resolvePosLineAmountCalculationMode(bill.configurations);
  const isIncludingDiscountMode = posLineAmountMode === 'including_discount';

  const calculations = useMemo(() => {
    let subtotalValue = 0;
    let totalSgst = 0;
    let totalCgst = 0;

    const effectivePricingMode = resolveEffectivePricingMode(bill.pharmacy?.organization_type, bill.pricingMode, bill.configurations);

    const items = (bill.items || []).map(item => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);

      const rate = effectivePricingMode === 'mrp' ? (item.mrp ?? 0) : (item.rate ?? item.mrp ?? 0);
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const itemGross = billedQty * rate;
      const tradeDiscount = itemGross * ((item.discountPercent || 0) / 100);
      const lineManualFlat = item.itemFlatDiscount || 0;
      const schemeDiscount = item.schemeDiscountAmount || 0;
      
      const lineAmount = isIncludingDiscountMode
        ? Math.max(0, itemGross - tradeDiscount - schemeDiscount - lineManualFlat)
        : Math.max(0, itemGross);
      
      const effectiveGst = isNonGst ? 0 : (item.gstPercent || 0);
      const isInclusive = effectivePricingMode === 'mrp';

      const taxableVal = isInclusive && effectiveGst > 0
        ? lineAmount / (1 + (effectiveGst / 100))
        : lineAmount;
      const gstAmt = isInclusive ? (lineAmount - taxableVal) : (taxableVal * (effectiveGst / 100));
      
      subtotalValue += lineAmount;
      totalSgst += gstAmt / 2;
      totalCgst += gstAmt / 2;

      return {
        ...item,
        hsn: item.hsnCode || inventoryItem?.hsnCode || '',
        pack: item.packType || inventoryItem?.packType || item.unitOfMeasurement || (item.unitsPerPack ? `${item.unitsPerPack}` : ''),
        batch: item.batch || inventoryItem?.batch || '',
        expiry: item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : ''),
        billedQty,
        billedRate: rate,
        displayAmount: lineAmount,
        displayQty: formatPackLooseQuantity(item.quantity, item.looseQuantity, item.freeQuantity),
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
    const adjustedChunks = [...itemChunks];

    if (adjustedChunks.length > 0) {
      const lastChunk = adjustedChunks[adjustedChunks.length - 1];
      let remainingPageHeight = SMART_PAGE_HEIGHT - SMART_HEADER_HEIGHT - SMART_TABLE_HEADER_HEIGHT - (lastChunk.length * SMART_ROW_HEIGHT);
      const summaryHeight = SMART_SUMMARY_HEIGHT;

      if (remainingPageHeight < summaryHeight && lastChunk.length > 1) {
        const overflowChunk: typeof lastChunk = [];
        while (remainingPageHeight < summaryHeight && lastChunk.length > 1) {
          const shifted = lastChunk.pop();
          if (!shifted) break;
          overflowChunk.unshift(shifted);
          remainingPageHeight = SMART_PAGE_HEIGHT - SMART_HEADER_HEIGHT - SMART_TABLE_HEADER_HEIGHT - (lastChunk.length * SMART_ROW_HEIGHT);
        }
        if (overflowChunk.length > 0) {
          adjustedChunks.push(overflowChunk);
        }
      }
    }

    const tradeDiscount = bill.totalItemDiscount || 0;
    const billDiscount = showBillDiscount ? (bill.schemeDiscount || 0) : 0;
    const taxableValue = Math.max(0, (bill.total || 0) - (bill.totalGst || 0) - (bill.roundOff || 0));
    const totalGst = isNonGst ? 0 : (bill.totalGst || 0);
    const roundOff = bill.roundOff || 0;
    const adjustment = bill.adjustment || 0;
    const grandTotal = bill.total || 0;
    const schemeDiscount = (bill.items || []).reduce((sum, item) => sum + Number(item.schemeDiscountAmount || 0), 0);
    return { items, itemChunks: adjustedChunks, subtotalValue, totalSgst, totalCgst, gstSummary, tradeDiscount, schemeDiscount, billDiscount, adjustment, taxableValue, totalGst, roundOff, grandTotal };
  }, [bill, isNonGst, showBillDiscount, isIncludingDiscountMode]);

  const toUpperDisplay = (value?: string | null) => (value || '').toString().trim().toUpperCase();
  const customerAddressLine1 = toUpperDisplay(bill.customerDetails?.address_line1 || bill.customerDetails?.address);
  const customerDistrict = toUpperDisplay(bill.customerDetails?.district);
  const customerState = toUpperDisplay(bill.customerDetails?.state);
  const customerPincode = toUpperDisplay(bill.customerDetails?.pincode);
  const customerAddressParts = [customerAddressLine1, customerDistrict, customerState].filter(Boolean);
  const customerAddressCompact = customerAddressParts.length > 0
    ? `${customerAddressParts.join(', ')}${customerPincode ? ` - ${customerPincode}` : ''}`
    : (customerPincode ? customerPincode : '');
  const customerPhone = toUpperDisplay(bill.customerPhone || bill.customerDetails?.phone);
  const customerGstin = toUpperDisplay(bill.customerDetails?.gstNumber);
  const customerDrugLicense = toUpperDisplay(bill.customerDetails?.drugLicense);
  const companyPhone = toUpperDisplay(bill.pharmacy.mobile || '-');
  const companyGstin = toUpperDisplay(bill.pharmacy.gstin || '-');
  const companyDrugLicense = toUpperDisplay((bill.pharmacy as any).drug_license || (bill.pharmacy as any).drugLicense || '-');
  const companyBankName = (bill.pharmacy as any).bank_account_name || (bill.pharmacy as any).bank_name;
  const companyAccountNumber = (bill.pharmacy as any).bank_account_number || (bill.pharmacy as any).account_number;
  const companyIfscCode = (bill.pharmacy as any).bank_ifsc_code || (bill.pharmacy as any).ifsc_code;
  const isCreditBill = String(bill.paymentMode || '').trim().toLowerCase() === 'credit';
  const hasSelectedCustomer = Boolean(bill.customerDetails?.id);
  const netOutstandingReceivable = hasSelectedCustomer
    ? calculateCustomerReceivableBreakdown(bill.customerDetails).netOutstanding
    : 0;
  const capturedPreviousBalance = Number(bill.previousBalanceBeforeBill);
  const hasCapturedPreviousBalance = Number.isFinite(capturedPreviousBalance);
  const previousBalance = hasSelectedCustomer
    ? (hasCapturedPreviousBalance
        ? capturedPreviousBalance
        : (isCreditBill ? netOutstandingReceivable - calculations.grandTotal : netOutstandingReceivable))
    : 0;
  const balanceAfterBill = hasSelectedCustomer
    ? (isCreditBill
        ? Number((previousBalance + calculations.grandTotal).toFixed(2))
        : Number(previousBalance.toFixed(2)))
    : 0;

  return (
    <div className="invoice-container bg-white text-black font-sans w-full mx-auto leading-tight min-h-full flex flex-col antialiased" style={{ fontSize: isLandscape ? '8pt' : '8.5pt' }}>
      <style>{`
        @media print {
          .invoice-container { page-break-inside: avoid; break-inside: avoid; }
          .invoice-footer, .amount-in-words, .bank-details { page-break-inside: avoid; break-inside: avoid; }
          @page { 
            margin: 0mm !important; 
            size: A5 ${orientation}; 
          }
          body { margin: 0; padding: 0; }
          .marg-page {
            page-break-after: always;
            width: ${isLandscape ? '210mm' : '148mm'};
            min-height: ${isLandscape ? '148mm' : '210mm'};
            height: auto;
            padding: 4mm !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: visible;
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
            min-height: ${isLandscape ? '148mm' : '210mm'};
            height: auto;
            padding: 4mm;
            background: white;
            box-shadow: 0 0 5px rgba(0,0,0,0.1);
            margin-bottom: 10px;
            overflow: visible;
          }
        }
        .erp-table { border: 1px solid black; }
        .erp-table th { border: 1px solid black; padding: 2px 4px; font-weight: 600 !important; font-size: 7.5pt; line-height: 1.2; }
        .erp-table td { border-left: 1px solid black; border-right: 1px solid black; padding: 2px 4px; font-size: 8pt; font-weight: 500; line-height: 1.2; }
        .items-table th,
        .items-table td {
          line-height: 1.05;
        }
        .items-table td {
          padding-top: 0.5px;
          padding-bottom: 0.5px;
          padding-left: 2px;
          padding-right: 2px;
          vertical-align: middle;
        }
        .items-table td > * {
          margin-top: 0;
          margin-bottom: 0;
        }
        .invoice-items {
          border-bottom: 1px solid #000;
        }
        .invoice-items td,
        .invoice-items th {
          font-family: inherit;
          font-size: inherit;
          font-weight: normal;
        }
        .invoice-items tbody tr:last-child td {
          border-bottom: 1px solid #000;
        }
        .invoice-items .page-break-footer td {
          border-bottom: 1px solid #000;
        }
        .font-mono-erp { font-family: 'Courier New', Courier, monospace; }
        .footer-border { border: 1px solid black; border-top: 0; }
        .row-height { height: 17px; }
        .invoice-container { padding-bottom: 20px; min-height: 100%; height: auto; overflow: visible; }
        .invoice-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
        .amount-in-words, .bank-details, .invoice-footer { page-break-inside: avoid; break-inside: avoid; }
        .invoice-meta {
          display: flex;
          justify-content: flex-end;
          gap: 20px;
          font-size: 12px;
        }
        .invoice-summary-block {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .invoice-table {
          page-break-inside: auto;
        }
        .invoice-table tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        .invoice-header {
          margin-bottom: 4px;
        }
      `}</style>

      {calculations.itemChunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === calculations.itemChunks.length - 1;
        const pageTotal = chunk.reduce((acc, item) => acc + (item.displayAmount || 0), 0);

        return (
        <div key={pageIdx} className="marg-page">
          <div className="grid grid-cols-3 border-t border-x border-black invoice-header">
            <div className="p-1.5 border-r border-black">
              <h1 className="text-base font-black uppercase text-blue-900 mb-0.5 leading-none">{bill.pharmacy.pharmacy_name}</h1>
              {bill.pharmacy.address && <p className="text-[6.5pt] uppercase font-bold text-gray-700 leading-tight whitespace-pre-line">{bill.pharmacy.address}</p>}
              <p className="text-[7.5pt] mt-0.5 font-normal leading-none tracking-[0.02em]">PH: {companyPhone}</p>
              <p className="text-[7.5pt] font-normal leading-none tracking-[0.02em]">GSTIN: {companyGstin}</p>
              <p className="text-[7.5pt] font-normal leading-none tracking-[0.02em]">DL NO: {companyDrugLicense}</p>
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
               <p className="uppercase text-[8.5pt] text-gray-950 leading-tight">{toUpperDisplay(bill.customerName)}</p>
               <div className="mt-0.5 space-y-0.5 text-[7pt] font-normal text-gray-700">
                 {customerPhone && <p>PH: {customerPhone}</p>}
                 {customerAddressCompact && <p className="leading-tight">ADDRESS: {customerAddressCompact}</p>}
                 {customerGstin ? <p>GSTIN: {customerGstin}</p> : (bill.customerDetails?.panNumber ? <p>PAN: {toUpperDisplay(bill.customerDetails.panNumber)}</p> : null)}
                 {customerDrugLicense && <p>DL NO: {customerDrugLicense}</p>}
               </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-y border-x border-black bg-gray-100">
              <div className="col-span-2 py-0.5 flex items-center justify-center border-r border-black">
                  <h2 className="text-lg font-black uppercase tracking-[0.2em] text-gray-900 leading-none">{isNonGst ? 'ESTIMATE' : 'GST INVOICE'}</h2>
              </div>
              <div className="p-0.5 pl-2 flex items-center justify-end text-[8pt]">
                  <p className="invoice-meta font-bold leading-none uppercase">
                    <span>INV: <span className="font-mono font-black text-blue-900 normal-case">{bill.invoiceNumber || bill.id}</span></span>
                    <span>|</span>
                    <span>DATE: {new Date(bill.date).toLocaleDateString('en-GB')}</span>
                  </p>
              </div>
          </div>

          <div className="flex flex-col">
          <table className="w-full erp-table items-table invoice-items invoice-table border-collapse bg-white">
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
                {showRateColumn && <th className="w-[8%] text-right">RATE</th>}
                {showTradeDiscountColumn && <th className="w-[5%]">D%</th>}
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
                    <td className="text-center font-black">{item.displayQty}</td>
                    <td className="font-black uppercase truncate text-gray-900">{item.displayName}</td>
                    <td className="text-center">{item.hsn}</td>
                    <td className="text-center text-[7pt]">{item.pack}</td>
                    <td className="text-center">{item.batch}</td>
                    <td className="text-center text-[7pt]">{item.expiry}</td>
                    <td className="text-right">{(item.mrp || 0).toFixed(2)}</td>
                    {showRateColumn && <td className="text-right text-blue-900">{(item.billedRate || 0).toFixed(2)}</td>}
                    {showTradeDiscountColumn && <td className="text-center text-red-600">{item.discountPercent || '0'}</td>}
                    {showSchemeColumn && (
                      <td className="text-center text-emerald-700">
                        {getDisplaySchemePercent(item) > 0 ? getDisplaySchemePercent(item).toFixed(2) : ''}
                      </td>
                    )}
                    <td className="text-center">{(item.gstPercent || 0).toFixed(0)}</td>
                    <td className="text-right font-black border-r-0 text-gray-950">{(item.displayAmount || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {isLastPage && Array.from({ length: Math.max(0, ITEMS_PER_PAGE - chunk.length) }).map((_, i) => (
                <tr key={`spacer-${i}`} className="row-height border-b border-gray-100 last:border-b-0">
                    {showRateColumn && <td className="border-r border-black"></td>}
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    <td className="border-r border-black"></td>
                    {showTradeDiscountColumn && <td className="border-r border-black"></td>}
                    {showSchemeColumn && <td className="border-r border-black"></td>}
                    <td className="border-r border-black"></td>
                    <td className=""></td>
                </tr>
              ))}
              {!isLastPage && (
                <tr className="page-break-footer">
                  <td colSpan={11 + (showTradeDiscountColumn ? 1 : 0) + (showSchemeColumn ? 1 : 0)} style={{ borderBottom: '1px solid #000' }}></td>
                </tr>
              )}
            </tbody>
          </table>

          {!isLastPage && (
            <div className="grid grid-cols-2 border-x border-b border-black bg-white">
              <div className="border-r border-black p-1.5">
                <p className="text-[8pt] font-black text-gray-700 uppercase">--- Continued on Next Page ---</p>
              </div>
              <div className="p-1.5 flex justify-between items-center bg-gray-50/80">
                <span className="text-sm font-black text-gray-800 tracking-tighter">Page Total:</span>
                <span className="text-2xl font-black text-blue-900 tracking-tighter">₹ {pageTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
          </div>

          {isLastPage && (
          <div className="invoice-footer invoice-summary-block grid grid-cols-2 footer-border flex-shrink-0 bg-white">
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
                    <>
                      <BankDetailsInline
                        bankName={companyBankName}
                        accountNumber={companyAccountNumber}
                        ifscCode={companyIfscCode}
                        className="bank-details text-[7pt] text-gray-700 mb-1.5 leading-tight"
                      />
                      <p className="amount-in-words text-[7.5pt] font-black uppercase text-gray-950 border-b border-dashed border-gray-300 pb-1 mb-1 leading-tight">
                        {numberToWords(calculations.grandTotal)}
                      </p>
                      <div className="invoice-bottom mt-2">
                          <div>
                              {hasSelectedCustomer && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8pt] font-black uppercase text-gray-900">Previous Bal:</span>
                                    <span className="text-[8pt] font-black text-red-600">₹{previousBalance.toFixed(2)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8pt] font-black uppercase text-gray-900">Balance After Bill:</span>
                                    <span className="text-[8pt] font-black text-red-600">₹{balanceAfterBill.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}
                          </div>
                          <div className="text-center pr-1">
                              <p className="text-[6pt] font-black mb-4 uppercase tracking-wider">FOR {bill.pharmacy.pharmacy_name}</p>
                              <p className="text-[7pt] font-black border-t border-black pt-0.5 px-4 inline-block uppercase leading-none">Auth. Signatory</p>
                          </div>
                      </div>
                    </>
                  </div>
                </div>

                <div className="flex flex-col bg-gray-50/80">
                  <>
                    <div className="p-2 flex-1 space-y-1 text-[8.5pt] font-bold">
                        <div className="flex justify-between"><span>SUB TOTAL</span> <span className="font-black">₹ {(calculations.subtotalValue || 0).toFixed(2)}</span></div>
                        
                        {!isIncludingDiscountMode && calculations.tradeDiscount > 0 && (
                          <div className="flex justify-between text-indigo-700 font-black">
                              <span>Trade Discount (₹)</span>
                              <span>- {calculations.tradeDiscount.toFixed(2)}</span>
                          </div>
                        )}

                        {calculations.schemeDiscount > 0 && (
                          <div className="flex justify-between text-emerald-700 font-black">
                              <span>Scheme Discount (₹)</span>
                              <span>- {calculations.schemeDiscount.toFixed(2)}</span>
                          </div>
                        )}

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
                  </>
                </div>
            </div>
          )}
        </div>
      )})}
    </div>
  );
};

export default MargTemplate;
