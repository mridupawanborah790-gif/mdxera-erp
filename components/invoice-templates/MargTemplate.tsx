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

// ─── Page Capacity Constants ──────────────────────────────────────────────────
// These represent the maximum number of item rows that fit on each page type.
// "REGULAR" = a continuation page (smaller footer: just "page total" bar).
// "LAST"    = the final page (larger footer: GST table, bank details, totals).
//
// TUNING GUIDE:
//   - Increase LAST_CAP if the last page has too much empty space.
//   - Decrease LAST_CAP if the footer is getting clipped.
//   - At ~17px per row (row-height class) on A5:
//       Portrait  usable ≈ 148mm × (96/25.4) px/mm ≈ 560px for items area
//       Landscape usable ≈ 210mm × (96/25.4) px/mm ≈ 793px for items area
//   - Header ≈ 58mm portrait / 45mm landscape
//   - Main footer ≈ 55mm portrait / 42mm landscape
//   - Continuation footer ≈ 10mm

const PORTRAIT_REGULAR_CAP  = 26;   // items on a mid page (portrait)
const PORTRAIT_LAST_CAP     = 18;   // items on the final page (portrait)

const LANDSCAPE_REGULAR_CAP = 15;   // items on a mid page (landscape)
const LANDSCAPE_LAST_CAP    = 10;   // items on the final page (landscape)

// ─── Smart chunking ───────────────────────────────────────────────────────────
// Splits `items` into pages such that:
//   • every page except the last uses at most REGULAR_CAP rows
//   • the last page uses at most LAST_CAP rows
//   • we never create an empty final page
//   • we never under-fill a mid-page when the remaining items would all fit
//     on the last page anyway
function chunkItems<T>(
  items: T[],
  regularCap: number,
  lastCap: number,
): T[][] {
  const chunks: T[][] = [];
  let idx = 0;
  const total = items.length;

  // Edge-case: 0 items → one empty page so the footer still renders
  if (total === 0) return [[]];

  while (idx < total) {
    const remaining = total - idx;

    // If everything remaining fits on the last page, grab it all and stop.
    if (remaining <= lastCap) {
      chunks.push(items.slice(idx));
      break;
    }

    // If remaining items fit on ONE more regular page but won't leave enough
    // for a proper final page, split smartly: fill this page leaving at least
    // 1 item (ideally ≈ lastCap/2) for the final page to look balanced.
    if (remaining <= regularCap + lastCap) {
      // How many should go on the final page?
      const wantOnLast = Math.max(1, Math.min(lastCap, Math.ceil(remaining / 2)));
      const takeNow    = remaining - wantOnLast;

      // Only push a regular page if takeNow > 0
      if (takeNow > 0) {
        chunks.push(items.slice(idx, idx + takeNow));
        idx += takeNow;
      }
      // The remaining wantOnLast items will be caught by the first `if` in the
      // next iteration.
      continue;
    }

    // Normal case: plenty of items left — fill this page completely.
    chunks.push(items.slice(idx, idx + regularCap));
    idx += regularCap;
  }

  return chunks;
}

const MargTemplate: React.FC<TemplateProps> = ({ bill, orientation = 'portrait' }) => {
  const isNonGst   = bill.billType === 'non-gst';
  const isLandscape = orientation === 'landscape';

  const REGULAR_CAP = isLandscape ? LANDSCAPE_REGULAR_CAP : PORTRAIT_REGULAR_CAP;
  const LAST_CAP    = isLandscape ? LANDSCAPE_LAST_CAP    : PORTRAIT_LAST_CAP;

  const displayOptions           = bill.configurations?.displayOptions || {};
  const showBillDiscount         = displayOptions.showBillDiscountOnPrint !== false;
  const isMode8                  = displayOptions.calculationMode === '8';
  const showItemWiseDisc         = displayOptions.showItemWiseDiscountOnPrint !== false;
  const showTradeDiscountColumn  = showItemWiseDisc && (bill.items || []).some(item => (item.discountPercent || 0) > 0);
  const showSchemeColumn         = (bill.items || []).some(item => hasLineLevelSchemeDiscount(item));
  const showRateColumn           = isRateFieldAvailable(bill.configurations);
  const posLineAmountMode        = resolvePosLineAmountCalculationMode(bill.configurations);
  const isIncludingDiscountMode  = posLineAmountMode === 'including_discount';

  const calculations = useMemo(() => {
    let subtotalValue = 0;
    let totalSgst     = 0;
    let totalCgst     = 0;

    const effectivePricingMode = resolveEffectivePricingMode(
      bill.pharmacy?.organization_type,
      bill.pricingMode,
      bill.configurations
    );

    const items = (bill.items || []).map(item => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);

      const rate        = effectivePricingMode === 'mrp'
        ? (item.mrp ?? 0)
        : (item.rate ?? item.mrp ?? 0);
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty    = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const itemGross    = billedQty * rate;
      const tradeDiscount    = itemGross * ((item.discountPercent || 0) / 100);
      const lineManualFlat   = item.itemFlatDiscount || 0;
      const schemeDiscount   = item.schemeDiscountAmount || 0;

      const lineAmount = isIncludingDiscountMode
        ? Math.max(0, itemGross - tradeDiscount - schemeDiscount - lineManualFlat)
        : Math.max(0, itemGross);

      const effectiveGst = isNonGst ? 0 : (item.gstPercent || 0);
      const isInclusive  = effectivePricingMode === 'mrp';

      const taxableVal = isInclusive && effectiveGst > 0
        ? lineAmount / (1 + (effectiveGst / 100))
        : lineAmount;
      const gstAmt = isInclusive
        ? (lineAmount - taxableVal)
        : (taxableVal * (effectiveGst / 100));

      subtotalValue += lineAmount;
      totalSgst     += gstAmt / 2;
      totalCgst     += gstAmt / 2;

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

    // ── GST summary per rate ──────────────────────────────────────────────────
    const gstSummary: { [rate: number]: { taxable: number; sgst: number; cgst: number } } = {};
    items.forEach(item => {
      const r = item.gstPercent || 0;
      if (!gstSummary[r]) gstSummary[r] = { taxable: 0, sgst: 0, cgst: 0 };
      gstSummary[r].taxable += item.taxableVal;
      gstSummary[r].sgst    += item.gstAmt / 2;
      gstSummary[r].cgst    += item.gstAmt / 2;
    });

    // ── Page chunking ─────────────────────────────────────────────────────────
    const chunks = chunkItems(items, REGULAR_CAP, LAST_CAP);

    // Cumulative serial offsets for continuous numbering across pages
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

  // ── Address / contact helpers ─────────────────────────────────────────────
  const toUpperDisplay = (value?: string | null) =>
    (value || '').toString().trim().toUpperCase();

  const customerAddressLine1   = toUpperDisplay(bill.customerDetails?.address_line1 || bill.customerDetails?.address);
  const customerDistrict       = toUpperDisplay(bill.customerDetails?.district);
  const customerState          = toUpperDisplay(bill.customerDetails?.state);
  const customerPincode        = toUpperDisplay(bill.customerDetails?.pincode);
  const customerAddressParts   = [customerAddressLine1, customerDistrict, customerState].filter(Boolean);
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
  const companyBankName      = (bill.pharmacy as any).bank_account_name || (bill.pharmacy as any).bank_name;
  const companyAccountNumber = (bill.pharmacy as any).bank_account_number || (bill.pharmacy as any).account_number;
  const companyIfscCode      = (bill.pharmacy as any).bank_ifsc_code || (bill.pharmacy as any).ifsc_code;

  // ── Balance calculations ───────────────────────────────────────────────────
  const isCreditBill             = String(bill.paymentMode || '').trim().toLowerCase() === 'credit';
  const hasSelectedCustomer      = Boolean(bill.customerDetails?.id);
  const netOutstandingReceivable = hasSelectedCustomer
    ? calculateCustomerReceivableBreakdown(bill.customerDetails).netOutstanding
    : 0;
  const capturedPreviousBalance    = Number(bill.previousBalanceBeforeBill);
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

  // ── Page dimensions ───────────────────────────────────────────────────────
  const pageW = isLandscape ? '210mm' : '148mm';
  const pageH = isLandscape ? '148mm' : '210mm';

  return (
    <div
      className="invoice-container bg-white text-black font-sans w-full mx-auto leading-tight antialiased"
      style={{ fontSize: isLandscape ? '8pt' : '8.5pt' }}
    >
      <style>{`
        /* ═══════════════════════════════════════════════════════════════════
           PRINT STYLES
           Key insight: each .marg-page is exactly one physical A5 page.
           We use flexbox with flex-direction:column so the items wrapper
           (flex:1 1 0) absorbs all leftover vertical space, pushing the
           footer to the physical bottom of the page every time.
           overflow:hidden on the wrapper ensures rows never bleed past the
           page boundary — the cap constants control actual row count.
        ═══════════════════════════════════════════════════════════════════ */
        @media print {
          @page {
            margin: 0mm !important;
            size: ${pageW} ${pageH};
          }
          body { margin: 0; padding: 0; }

          /* Each page = exact physical sheet */
          .marg-page {
            width:  ${pageW};
            height: ${pageH};
            padding: 4mm !important;
            box-sizing: border-box;

            /* Flex column → header | items(flex:1) | footer */
            display: flex !important;
            flex-direction: column !important;

            overflow: hidden;
            background: white !important;

            page-break-after:  always;
            break-after:       always;
            page-break-inside: avoid;
            break-inside:      avoid;
          }
          .marg-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          /* Items section fills all remaining space */
          .marg-items-wrapper {
            flex: 1 1 0 !important;
            min-height: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* Items table fills the wrapper height */
          .marg-items-wrapper .invoice-items {
            flex: 1 1 0 !important;
          }

          /* Prevent rows / footer from splitting across pages */
          .invoice-items tr           { page-break-inside: avoid; break-inside: avoid; }
          .invoice-footer-block       { page-break-inside: avoid; break-inside: avoid; flex-shrink: 0; }
          .marg-continuation-footer   { flex-shrink: 0; }
          .marg-header                { flex-shrink: 0; }
        }

        /* ═══════════════════════════════════════════════════════════════════
           SCREEN STYLES
           Use block layout so each card auto-sizes to its content.
           min-height gives a visual A5 feel without forcing exact height.
        ═══════════════════════════════════════════════════════════════════ */
        @media screen {
          .marg-page {
            width:     ${pageW};
            min-height: ${pageH};
            padding:   4mm;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            margin-bottom: 12px;
            display: block;
            box-sizing: border-box;
          }
          .marg-items-wrapper {
            display: block;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           SHARED TABLE STYLES
        ═══════════════════════════════════════════════════════════════════ */
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

        .items-table th,
        .items-table td {
          line-height: 1.05;
          padding-top:    1px;
          padding-bottom: 1px;
          padding-left:   2px;
          padding-right:  2px;
          vertical-align: middle;
        }

        /* Main items table */
        .invoice-items {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .invoice-items thead th {
          border: 1px solid #000;
          background: #f3f4f6;
        }
        .invoice-items tbody td {
          border-left:   1px solid #000;
          border-right:  1px solid #000;
          border-bottom: 1px solid #e5e7eb;
        }
        /* Seal the last row */
        .invoice-items tbody tr:last-child td {
          border-bottom: 1px solid #000;
        }
        /* Fixed row height — critical for cap accuracy */
        .row-height { height: 17px; }

        /* Footer outer border */
        .footer-border { border: 1px solid black; border-top: 0; }

        /* Misc layout */
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
        const totalPages  = calculations.chunks.length;

        return (
          <div key={pageIdx} className="marg-page">

            {/* ── HEADER (every page) ───────────────────────────────────── */}
            <div className="marg-header invoice-header">
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
            {/* ── END HEADER ───────────────────────────────────────────── */}

            {/* ── ITEMS TABLE WRAPPER ───────────────────────────────────── */}
            {/* On print: flex:1 so it expands to fill all space between
                header and footer, keeping footer pinned to the page bottom.
                On screen: display:block so it auto-sizes to content.     */}
            <div className="marg-items-wrapper">
              <table
                className="invoice-items erp-table items-table"
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
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
                        <td
                          className="font-black uppercase text-gray-900"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 0,
                          }}
                        >
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
            {/* ── END ITEMS TABLE WRAPPER ───────────────────────────────── */}

            {/* ── CONTINUATION FOOTER (non-last pages) ─────────────────── */}
            {!isLastPage && (
              <div className="marg-continuation-footer grid grid-cols-2 border-x border-b border-black bg-white">
                <div className="border-r border-black p-1.5">
                  <p className="text-[8pt] font-black text-gray-700 uppercase">
                    Continued on next page… (Page {pageIdx + 1} of {totalPages})
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

            {/* ── MAIN FOOTER (last page only) ──────────────────────────── */}
            {isLastPage && (
              <div className="invoice-footer-block">
                <div className="invoice-footer grid grid-cols-2 footer-border bg-white">

                  {/* LEFT: GST summary + bank + words + balance + signatory */}
                  <div className="border-r border-black p-1.5 flex flex-col justify-between">

                    {/* GST breakdown table (GST bills only) */}
                    {!isNonGst && (
                      <table
                        className="w-full erp-table"
                        style={{ fontSize: '6.5pt', borderCollapse: 'collapse', marginBottom: 4 }}
                      >
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

                  {/* RIGHT: Totals breakdown + grand total */}
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
            {/* ── END MAIN FOOTER ──────────────────────────────────────── */}

          </div>
        );
      })}
    </div>
  );
};

export default MargTemplate;