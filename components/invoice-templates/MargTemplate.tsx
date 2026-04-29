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

// ─── Calibrated Page Capacity Constants ─────────────────────────────────────
// Accurately tuned to the physical dimensions of the A5 paper size.
const REGULAR_CAP_PORTRAIT  = 28; // Max items when page has the small continuation footer
const LAST_CAP_PORTRAIT     = 20; // Max items when page has the large main footer

const REGULAR_CAP_LANDSCAPE = 16;
const LAST_CAP_LANDSCAPE    = 11; // Increased safely so 8-11 items won't force a page split!

const MargTemplate: React.FC<TemplateProps> = ({ bill, orientation = 'portrait' }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isLandscape = orientation === 'landscape';

  const REGULAR_CAP = isLandscape ? REGULAR_CAP_LANDSCAPE : REGULAR_CAP_PORTRAIT;
  const LAST_CAP    = isLandscape ? LAST_CAP_LANDSCAPE    : LAST_CAP_PORTRAIT;

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

    const effectivePricingMode = resolveEffectivePricingMode(
      bill.pharmacy?.organization_type,
      bill.pricingMode,
      bill.configurations
    );

    const items = (bill.items || []).map(item => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);

      const rate = effectivePricingMode === 'mrp'
        ? (item.mrp ?? 0)
        : (item.rate ?? item.mrp ?? 0);
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
      const gstAmt = isInclusive
        ? (lineAmount - taxableVal)
        : (taxableVal * (effectiveGst / 100));

      subtotalValue += lineAmount;
      totalSgst += gstAmt / 2;
      totalCgst += gstAmt / 2;

      return {
        ...item,
        hsn: item.hsnCode || inventoryItem?.hsnCode || '',
        pack: item.packType || inventoryItem?.packType || item.unitOfMeasurement || (item.unitsPerPack ? `${item.unitsPerPack}` : ''),
        batch: item.batch || inventoryItem?.batch || '',
        expiry: item.expiry || (inventoryItem?.expiry
          ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' })
          : ''),
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
      gstSummary[r].sgst += item.gstAmt / 2;
      gstSummary[r].cgst += item.gstAmt / 2;
    });

    // ─── Smart Balance Chunking ───────────────────────────────────────────
    const chunks: (typeof items)[] = [];
    let idx = 0;
    const total = items.length;

    while (idx < total) {
      const remaining = total - idx;

      // 1. If everything left fits easily with the large main footer, we are done.
      if (remaining <= LAST_CAP) {
        chunks.push(items.slice(idx));
        break;
      }

      // 2. If the remaining items fit on the current page, BUT won't leave room for the footer,
      //    we must spill over. To prevent a 0-item final page, we calculate a smart portion 
      //    of items to hold back for the final page to balance the look.
      if (remaining <= REGULAR_CAP) {
        const leaveForLastPage = Math.min(LAST_CAP, Math.max(1, Math.floor(remaining / 2)));
        const takeNow = remaining - leaveForLastPage;
        
        chunks.push(items.slice(idx, idx + takeNow));
        idx += takeNow;
      } else {
        // 3. We have plenty of items. Safely pack this page to the absolute maximum.
        chunks.push(items.slice(idx, idx + REGULAR_CAP));
        idx += REGULAR_CAP;
      }
    }

    if (chunks.length === 0) chunks.push([]); // Fallback for 0-item invoices

    // Cumulative offset for continuous item numbering
    const chunkStartSerials = chunks.map((_, i) =>
      chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0)
    );

    const tradeDiscount  = bill.totalItemDiscount || 0;
    const billDiscount   = showBillDiscount ? (bill.schemeDiscount || 0) : 0;
    const taxableValue   = Math.max(0, (bill.total || 0) - (bill.totalGst || 0) - (bill.roundOff || 0));
    const totalGst       = isNonGst ? 0 : (bill.totalGst || 0);
    const roundOff       = bill.roundOff || 0;
    const adjustment     = bill.adjustment || 0;
    const grandTotal     = bill.total || 0;
    const schemeDiscount = (bill.items || []).reduce(
      (sum, item) => sum + Number(item.schemeDiscountAmount || 0), 0
    );

    return {
      items, chunks, chunkStartSerials,
      subtotalValue, totalSgst, totalCgst, gstSummary,
      tradeDiscount, schemeDiscount, billDiscount, adjustment,
      taxableValue, totalGst, roundOff, grandTotal
    };
  }, [bill, isNonGst, showBillDiscount, isIncludingDiscountMode, REGULAR_CAP, LAST_CAP]);

  const toUpperDisplay = (value?: string | null) =>
    (value || '').toString().trim().toUpperCase();

  const customerAddressLine1  = toUpperDisplay(bill.customerDetails?.address_line1 || bill.customerDetails?.address);
  const customerDistrict      = toUpperDisplay(bill.customerDetails?.district);
  const customerState         = toUpperDisplay(bill.customerDetails?.state);
  const customerPincode       = toUpperDisplay(bill.customerDetails?.pincode);
  const customerAddressParts  = [customerAddressLine1, customerDistrict, customerState].filter(Boolean);
  const customerAddressCompact = customerAddressParts.length > 0
    ? `${customerAddressParts.join(', ')}${customerPincode ? ` - ${customerPincode}` : ''}`
    : (customerPincode || '');
  const customerPhone       = toUpperDisplay(bill.customerPhone || bill.customerDetails?.phone);
  const customerGstin       = toUpperDisplay(bill.customerDetails?.gstNumber);
  const customerDrugLicense = toUpperDisplay(bill.customerDetails?.drugLicense);
  const companyPhone        = toUpperDisplay(bill.pharmacy.mobile || '-');
  const companyGstin        = toUpperDisplay(bill.pharmacy.gstin || '-');
  const companyDrugLicense  = toUpperDisplay(
    (bill.pharmacy as any).drug_license || (bill.pharmacy as any).drugLicense || '-'
  );
  const companyBankName     = (bill.pharmacy as any).bank_account_name || (bill.pharmacy as any).bank_name;
  const companyAccountNumber = (bill.pharmacy as any).bank_account_number || (bill.pharmacy as any).account_number;
  const companyIfscCode     = (bill.pharmacy as any).bank_ifsc_code || (bill.pharmacy as any).ifsc_code;

  const isCreditBill           = String(bill.paymentMode || '').trim().toLowerCase() === 'credit';
  const hasSelectedCustomer    = Boolean(bill.customerDetails?.id);
  const netOutstandingReceivable = hasSelectedCustomer
    ? calculateCustomerReceivableBreakdown(bill.customerDetails).netOutstanding
    : 0;
  const capturedPreviousBalance  = Number(bill.previousBalanceBeforeBill);
  const hasCapturedPreviousBalance = Number.isFinite(capturedPreviousBalance);
  const previousBalance = hasSelectedCustomer
    ? (hasCapturedPreviousBalance
        ? capturedPreviousBalance
        : (isCreditBill
            ? netOutstandingReceivable - calculations.grandTotal
            : netOutstandingReceivable))
    : 0;
  const balanceAfterBill = hasSelectedCustomer
    ? (isCreditBill
        ? Number((previousBalance + calculations.grandTotal).toFixed(2))
        : Number(previousBalance.toFixed(2)))
    : 0;

  return (
    <div
      className="invoice-container bg-white text-black font-sans w-full mx-auto leading-tight antialiased"
      style={{ fontSize: isLandscape ? '8pt' : '8.5pt' }}
    >
      <style>{`
        /* ── Print: each .marg-page = one physical A5 page ── */
        @media print {
          @page {
            margin: 0mm !important;
            size: A5 ${orientation};
          }
          body { margin: 0; padding: 0; }

          .marg-page {
            page-break-after: always;
            break-after: always;
            page-break-inside: avoid;
            break-inside: avoid;
            width:  ${isLandscape ? '210mm' : '148mm'};
            height: ${isLandscape ? '148mm' : '210mm'};
            padding: 4mm !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: white !important;
          }
          .marg-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .invoice-items tr { page-break-inside: avoid; break-inside: avoid; }
          .invoice-footer-block { page-break-inside: avoid; break-inside: avoid; }
        }

        /* ── Screen: mimic A5 pages visually ── */
        @media screen {
          .marg-page {
            width:  ${isLandscape ? '210mm' : '148mm'};
            height: ${isLandscape ? '148mm' : '210mm'}; /* STRICT HEIGHT prevents collapsing */
            padding: 4mm;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
          }
        }

        /* ── Shared table styles ── */
        .erp-table { border: 1px solid black; border-collapse: collapse; }
        .erp-table th {
          border: 1px solid black;
          padding: 1px 3px;
          font-weight: 600;
          font-size: 7.5pt;
        }
        .erp-table td {
          border-left:  1px solid black;
          border-right: 1px solid black;
          padding: 1px 3px;
          font-size: 8pt;
          font-weight: 500;
        }

        /* ── Items table ── */
        .items-table th,
        .items-table td {
          line-height: 1.05;
          padding-top:    1px;
          padding-bottom: 1px;
          padding-left:   2px;
          padding-right:  2px;
          vertical-align: middle;
        }

        .invoice-items {
          width: 100%;
          border-collapse: collapse;
        }
        .invoice-items thead th {
          border: 1px solid #000;
          background: #f3f4f6;
        }
        .invoice-items tbody td {
          border-left:  1px solid #000;
          border-right: 1px solid #000;
          border-bottom: 1px solid #e5e7eb; /* light divider between rows */
        }
        /* Bottom border on the last data row to seal the table gracefully */
        .invoice-items tbody tr:last-child td {
          border-bottom: 1px solid #000;
        }
        /* Row height */
        .row-height { height: 17px; }

        /* ── Footer ── */
        .footer-border { border: 1px solid black; border-top: 0; }

        /* ── Misc ── */
        .invoice-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .amount-in-words,
        .bank-details,
        .invoice-footer { page-break-inside: avoid; break-inside: avoid; }

        .invoice-header-right { width: 100%; display: flex; justify-content: flex-end; }
        .invoice-meta {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
      `}</style>

      {calculations.chunks.map((chunk, pageIdx) => {
        const isLastPage  = pageIdx === calculations.chunks.length - 1;
        const startSerial = calculations.chunkStartSerials[pageIdx];
        const pageTotal   = chunk.reduce((acc, item) => acc + (item.displayAmount || 0), 0);

        return (
          <div key={pageIdx} className="marg-page">

            {/* ── HEADER (every page) ── */}
            <div className="invoice-header" style={{ flexShrink: 0 }}>
              <div className="grid grid-cols-3 border-t border-x border-black">
                {/* Left: pharmacy info */}
                <div className="p-1.5 border-r border-black">
                  <h1 className="text-base font-black uppercase text-blue-900 mb-0.5 leading-none">
                    {bill.pharmacy.pharmacy_name}
                  </h1>
                  {bill.pharmacy.address && (
                    <p className="text-[6.5pt] uppercase font-bold text-gray-700 leading-tight whitespace-pre-line">
                      {bill.pharmacy.address}
                    </p>
                  )}
                  <p className="text-[7.5pt] mt-0.5 font-normal leading-none">PH: {companyPhone}</p>
                  <p className="text-[7.5pt] font-normal leading-none">GSTIN: {companyGstin}</p>
                  <p className="text-[7.5pt] font-normal leading-none">DL NO: {companyDrugLicense}</p>
                </div>

                {/* Centre: logo + bill type badge */}
                <div className="flex flex-col items-center justify-center border-r border-black p-1">
                  {bill.pharmacy.pharmacy_logo_url ? (
                    <img
                      src={bill.pharmacy.pharmacy_logo_url}
                      alt="Logo"
                      className="h-8 w-auto object-contain mb-0.5"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-black text-sm border border-black mb-0.5">
                      M
                    </div>
                  )}
                  <span className="text-[8pt] font-black uppercase text-center border-y border-black w-full py-0.5 bg-gray-50">
                    {bill.paymentMode === 'Credit' ? 'CREDIT' : 'CASH'}
                  </span>
                </div>

                {/* Right: customer details */}
                <div className="p-1.5">
                  <h3 className="text-[6pt] font-black uppercase underline mb-0.5 text-gray-500">Party Details:</h3>
                  <p className="uppercase text-[8.5pt] text-gray-950 leading-tight">
                    {toUpperDisplay(bill.customerName)}
                  </p>
                  <div className="mt-0.5 space-y-0.5 text-[7pt] font-normal text-gray-700">
                    {customerPhone && <p>PH: {customerPhone}</p>}
                    {customerAddressCompact && (
                      <p className="leading-tight">ADDRESS: {customerAddressCompact}</p>
                    )}
                    {customerGstin
                      ? <p>GSTIN: {customerGstin}</p>
                      : bill.customerDetails?.panNumber
                        ? <p>PAN: {toUpperDisplay(bill.customerDetails.panNumber)}</p>
                        : null
                    }
                    {customerDrugLicense && <p>DL NO: {customerDrugLicense}</p>}
                  </div>
                </div>
              </div>

              {/* Invoice title + number/date bar */}
              <div className="grid grid-cols-3 border-y border-x border-black bg-gray-100">
                <div className="col-span-2 py-0.5 flex items-center justify-center border-r border-black">
                  <h2 className="text-lg font-black uppercase tracking-[0.2em] text-gray-900 leading-none">
                    {isNonGst ? 'ESTIMATE' : 'GST INVOICE'}
                  </h2>
                </div>
                <div className="p-0.5 pl-2 flex items-center">
                  <div className="invoice-header-right">
                    <div className="invoice-meta">
                      <span>
                        INV:{' '}
                        <span className="font-mono font-black text-blue-900">
                          {bill.invoiceNumber || bill.id}
                        </span>
                      </span>
                      <span>|</span>
                      <span>DATE: {new Date(bill.date).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── flex: 1 expands to push everything else down */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <table className="invoice-items erp-table items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="text-[7pt] font-semibold uppercase">
                    <th style={{ width: '4%' }}>#</th>
                    <th style={{ width: '10%' }}>QTY+F</th>
                    <th className="text-left" style={{ width: '23%' }}>DESCRIPTION</th>
                    <th style={{ width: '8%' }}>HSN</th>
                    <th style={{ width: '7%' }}>PACK</th>
                    <th style={{ width: '9%' }}>BATCH</th>
                    <th style={{ width: '7%' }}>EXP.</th>
                    <th className="text-right" style={{ width: '8%' }}>M.R.P</th>
                    {showRateColumn && (
                      <th className="text-right" style={{ width: '8%' }}>RATE</th>
                    )}
                    {showTradeDiscountColumn && (
                      <th style={{ width: '5%' }}>D%</th>
                    )}
                    {showSchemeColumn && (
                      <th style={{ width: '5%' }}>SCH%</th>
                    )}
                    <th style={{ width: '5%' }}>GST%</th>
                    <th className="text-right" style={{ width: '11%', borderRight: 0 }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="text-[8.5pt] font-medium">
                  {chunk.map((item, idx) => {
                    const sn = startSerial + idx + 1;
                    return (
                      <tr key={item.id} className="row-height">
                        <td className="text-center font-black">{sn}</td>
                        <td className="text-center font-black">{item.displayQty}</td>
                        <td className="font-black uppercase text-gray-900" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }}>
                          {item.displayName}
                        </td>
                        <td className="text-center">{item.hsn}</td>
                        <td className="text-center text-[7pt]">{item.pack}</td>
                        <td className="text-center">{item.batch}</td>
                        <td className="text-center text-[7pt]">{item.expiry}</td>
                        <td className="text-right">{(item.mrp || 0).toFixed(2)}</td>
                        {showRateColumn && (
                          <td className="text-right text-blue-900">{(item.billedRate || 0).toFixed(2)}</td>
                        )}
                        {showTradeDiscountColumn && (
                          <td className="text-center text-red-600">{item.discountPercent || '0'}</td>
                        )}
                        {showSchemeColumn && (
                          <td className="text-center text-emerald-700">
                            {getDisplaySchemePercent(item) > 0 ? getDisplaySchemePercent(item).toFixed(2) : ''}
                          </td>
                        )}
                        <td className="text-center">{(item.gstPercent || 0).toFixed(0)}</td>
                        <td className="text-right font-black text-gray-950" style={{ borderRight: 0 }}>
                          {(item.displayAmount || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── CONTINUATION FOOTER (non-last pages) ── */}
            {!isLastPage && (
              <div
                className="grid grid-cols-2 border-x border-b border-black bg-white"
                style={{ flexShrink: 0 }}
              >
                <div className="border-r border-black p-1.5">
                  <p className="text-[8pt] font-black text-gray-700 uppercase">
                    Continued on next page… (Page {pageIdx + 1} of {calculations.chunks.length})
                  </p>
                </div>
                <div className="p-1.5 flex justify-between items-center bg-gray-50">
                  <span className="text-sm font-black text-gray-800 tracking-tighter">PAGE TOTAL</span>
                  <span className="text-2xl font-black text-blue-900 tracking-tighter">
                    ₹ {pageTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* ── MAIN FOOTER (last page only) ── */}
            {isLastPage && (
              <div className="invoice-footer-block" style={{ flexShrink: 0 }}>
                <div className="invoice-footer grid grid-cols-2 footer-border bg-white">

                  {/* Left: GST summary + bank + words + balance */}
                  <div className="border-r border-black p-1.5 flex flex-col justify-between">
                    {!isNonGst && (
                      <table className="w-full erp-table" style={{ fontSize: '6.5pt', borderCollapse: 'collapse', marginBottom: 4 }}>
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

                    <div style={{ marginTop: 4 }}>
                      <BankDetailsInline
                        bankName={companyBankName}
                        accountNumber={companyAccountNumber}
                        ifscCode={companyIfscCode}
                        className="bank-details text-[7pt] text-gray-700 leading-tight mb-1.5"
                      />
                      <p
                        className="amount-in-words font-black uppercase text-gray-950 leading-tight"
                        style={{
                          fontSize: '7.5pt',
                          borderBottom: '1px dashed #d1d5db',
                          paddingBottom: 4,
                          marginBottom: 4,
                        }}
                      >
                        {numberToWords(calculations.grandTotal)}
                      </p>

                      <div className="invoice-bottom" style={{ marginTop: 8 }}>
                        <div>
                          {hasSelectedCustomer && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase' }}>
                                  Previous Bal:
                                </span>
                                <span style={{ fontSize: '8pt', fontWeight: 900, color: '#dc2626' }}>
                                  ₹{previousBalance.toFixed(2)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase' }}>
                                  Balance After Bill:
                                </span>
                                <span style={{ fontSize: '8pt', fontWeight: 900, color: '#dc2626' }}>
                                  ₹{balanceAfterBill.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-center" style={{ paddingRight: 4 }}>
                          <p
                            className="font-black uppercase"
                            style={{ fontSize: '6pt', letterSpacing: '0.05em', marginBottom: 16 }}
                          >
                            FOR {bill.pharmacy.pharmacy_name}
                          </p>
                          <p
                            className="font-black uppercase leading-none"
                            style={{
                              fontSize: '7pt',
                              borderTop: '1px solid black',
                              paddingTop: 2,
                              paddingLeft: 16,
                              paddingRight: 16,
                              display: 'inline-block',
                            }}
                          >
                            Auth. Signatory
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: totals breakdown + grand total */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(249,250,251,0.8)' }}>
                    <div style={{ padding: 8, flex: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '8.5pt', fontWeight: 700 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>SUB TOTAL</span>
                          <span style={{ fontWeight: 900 }}>₹ {(calculations.subtotalValue || 0).toFixed(2)}</span>
                        </div>

                        {!isIncludingDiscountMode && calculations.tradeDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4338ca', fontWeight: 900 }}>
                            <span>Trade Discount (₹)</span>
                            <span>- {calculations.tradeDiscount.toFixed(2)}</span>
                          </div>
                        )}

                        {calculations.schemeDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 900 }}>
                            <span>Scheme Discount (₹)</span>
                            <span>- {calculations.schemeDiscount.toFixed(2)}</span>
                          </div>
                        )}

                        {showBillDiscount && calculations.billDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4338ca', fontWeight: 900 }}>
                            <span>{isMode8 ? 'Adjustment (Mode 8)' : 'Bill Discount'}</span>
                            <span>- {calculations.billDiscount.toFixed(2)}</span>
                          </div>
                        )}

                        {!isNonGst && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                            <span>Tax Amount</span>
                            <span style={{ fontWeight: 900, color: '#111827' }}>
                              {(calculations.totalGst || 0).toFixed(2)}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                          <span>Round Off</span>
                          <span style={{ fontWeight: 400 }}>{(calculations.roundOff || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 8,
                        background: 'white',
                        borderTop: '1px solid black',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span
                        style={{ fontSize: '0.875rem', fontWeight: 900, color: '#1f2937', letterSpacing: '-0.025em' }}
                      >
                        GRAND TOTAL
                      </span>
                      <span
                        style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.025em' }}
                      >
                        ₹ {calculations.grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>
        );
      })}
    </div>
  );
};

export default MargTemplate;