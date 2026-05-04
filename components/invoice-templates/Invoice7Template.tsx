import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem, AppConfigurations } from '../../types';
import { formatPackLooseQuantity } from '../../utils/quantity';
import { resolveEffectivePricingMode, resolvePosLineAmountCalculationMode } from '../../utils/billing';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[]; configurations: AppConfigurations; };
}

type ComputedItem = (DetailedBill['items'][number] & {
  rate: number;
  finalPrice: number;
  gstAmount: number;
  taxableValue: number;
  itemTotalDiscount: number;
  billedRate: number;
});

const MM_TO_PX = 96 / 25.4;
const PAGE_HEIGHT_MM = 150;
const PAGE_MARGIN_MM = 4;
const PRINTABLE_HEIGHT_PX = (PAGE_HEIGHT_MM - (PAGE_MARGIN_MM * 2)) * MM_TO_PX;

const HEADER_HEIGHT_PX = 210;
const TABLE_HEADER_HEIGHT_PX = 18;
const FOOTER_HEIGHT_PX = 110;
const ROW_HEIGHT_PX = 24;

const Invoice7Template: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';
  const posLineAmountMode = resolvePosLineAmountCalculationMode(bill.configurations);
  const isIncludingDiscountMode = posLineAmountMode === 'including_discount';
  const companyPhone = String(bill.pharmacy.mobile || '-').trim().toUpperCase();
  const companyGstin = String(bill.pharmacy.gstin || '-').trim().toUpperCase();
  const companyDrugLicense = String((bill.pharmacy as any).drug_license || (bill.pharmacy as any).drugLicense || '-').trim().toUpperCase();

  const billDetails = useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;

    const effectivePricingMode = resolveEffectivePricingMode(bill.pharmacy?.organization_type, bill.pricingMode, bill.configurations);

    const items: ComputedItem[] = (bill.items || []).map((item) => {
      const rate = effectivePricingMode === 'mrp' ? (item.mrp ?? 0) : (item.rate ?? item.mrp ?? 0);
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const grossAmount = rate * billedQty;
      const tradeDiscountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      const schemeDiscountAmount = item.schemeDiscountAmount || 0;
      const itemTotalDiscount = tradeDiscountAmount + schemeDiscountAmount;
      const finalPrice = isIncludingDiscountMode ? Math.max(0, grossAmount - itemTotalDiscount) : Math.max(0, grossAmount);

      const effectiveGstPercent = isNonGst ? 0 : (item.gstPercent || 0);
      const isInclusive = effectivePricingMode === 'mrp';
      const taxableValue = isInclusive && effectiveGstPercent > 0 ? finalPrice / (1 + (effectiveGstPercent / 100)) : finalPrice;
      const gstAmount = isInclusive ? (finalPrice - taxableValue) : (taxableValue * (effectiveGstPercent / 100));

      subtotal += finalPrice;
      totalGst += gstAmount;

      return { ...item, rate, finalPrice, gstAmount, taxableValue, itemTotalDiscount, billedRate: rate };
    });

    const taxableAmount = Number(bill.subtotal || subtotal || 0);
    const summarySubtotal = Number(taxableAmount + (bill.totalItemDiscount || 0) + (bill.schemeDiscount || 0));
    const discount = Math.max(0, Number(summarySubtotal - taxableAmount));

    return {
      items,
      subtotal: summarySubtotal,
      taxableAmount,
      discount,
      totalGst: (isNonGst ? 0 : (bill.totalGst || totalGst)),
      grandTotal: bill.total || 0
    };
  }, [bill, isNonGst, isIncludingDiscountMode]);

  const paginatedItems = useMemo(() => {
    const rowsWithoutFooter = Math.max(1, Math.floor((PRINTABLE_HEIGHT_PX - HEADER_HEIGHT_PX - TABLE_HEADER_HEIGHT_PX) / ROW_HEIGHT_PX));
    const rowsWithFooter = Math.max(1, Math.floor((PRINTABLE_HEIGHT_PX - HEADER_HEIGHT_PX - TABLE_HEADER_HEIGHT_PX - FOOTER_HEIGHT_PX) / ROW_HEIGHT_PX));

    const items = billDetails.items || [];
    if (!items.length) {
      return [{ items: [], showFooter: true }];
    }

    const pages: Array<{ items: ComputedItem[]; showFooter: boolean }> = [];
    let start = 0;

    while (start < items.length) {
      const remaining = items.length - start;
      if (remaining <= rowsWithFooter) {
        pages.push({ items: items.slice(start), showFooter: true });
        break;
      }

      const take = Math.min(rowsWithoutFooter, remaining - rowsWithFooter);
      pages.push({ items: items.slice(start, start + take), showFooter: false });
      start += take;
    }

    if (pages.length > 1 && pages[pages.length - 1].items.length === 0) {
      pages.pop();
      pages[pages.length - 1].showFooter = true;
    }

    return pages;
  }, [billDetails.items]);

  const renderHeader = () => (
    <>
      <div className="text-center mb-1">
        <h1 className="text-[10px] font-bold uppercase tracking-tight">{bill.pharmacy.pharmacy_name}</h1>
        <p className="text-[8px] leading-[1.2] whitespace-pre-line">{bill.pharmacy.address}</p>
        <div className="text-[8px] mt-0.5 space-y-0">
          <p>PH: {companyPhone}</p>
          <p>GSTIN: {companyGstin}</p>
          <p>DL NO: {companyDrugLicense}</p>
        </div>
      </div>

      <div className="border-t border-b border-dashed border-black py-0.5 mb-1 flex justify-between items-center gap-1 text-[8px]">
        <span className="truncate">Bill: {bill.invoiceNumber || bill.id}</span>
        <span>{new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      </div>

      {bill.customerName && bill.customerName.toLowerCase() !== 'cash' && (
        <div className="text-[8px] border-b border-dashed border-black pb-0.5 mb-1">
          <p>Customer: {bill.customerName}</p>
          {bill.customerPhone && <p>Ph: {bill.customerPhone}</p>}
        </div>
      )}

      {isCredit && <div className="text-center text-[8px] font-bold uppercase border-b border-dashed border-black pb-0.5 mb-1">CREDIT BILL</div>}
    </>
  );

  const renderFooter = () => (
    <>
      <div className="border-t border-dashed border-black mt-1 pt-1 space-y-0.5 text-[8px]">
        <div className="flex justify-between"><span>Subtotal</span><span>₹{billDetails.subtotal.toFixed(2)}</span></div>
        {billDetails.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-₹{billDetails.discount.toFixed(2)}</span></div>}
        {!isNonGst && <div className="flex justify-between"><span>Tax</span><span>₹{billDetails.totalGst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Taxable</span><span>₹{billDetails.taxableAmount.toFixed(2)}</span></div>
      </div>

      <div className="border-t border-b border-dashed border-black mt-1 py-0.5 flex justify-between text-[10px] font-bold">
        <span>TOTAL</span>
        <span>₹{billDetails.grandTotal.toFixed(2)}</span>
      </div>

      <p className="text-center text-[8px] mt-1">Thank You • Visit Again</p>
    </>
  );

  return (
    <div className="invoice-7">
      <style>{`
        .invoice-7 {
          width: 100mm;
          max-width: 100mm;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          color: #000;
          font-size: 8px;
          line-height: 1.2;
        }

        .invoice-page {
          width: 100mm;
          height: 150mm;
          box-sizing: border-box;
          padding: 3mm;
          display: flex;
          flex-direction: column;
          page-break-after: always;
          break-after: page;
          overflow: hidden;
        }

        .invoice-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        @media print {
          @page {
            size: 100mm 150mm;
            margin: 4mm;
          }

          .invoice-page {
            width: 100mm;
            height: 150mm;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .invoice-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      {paginatedItems.map((page, pageIndex) => (
        <section className="invoice-page" key={`invoice7-page-${pageIndex}`}>
          {renderHeader()}

          <table className="w-full table-fixed text-[8px] leading-[1.2]">
            <thead>
              <tr className="font-bold border-b border-dashed border-black">
                <th className="w-[14%] text-center pb-0.5">Qty</th>
                <th className="w-[60%] text-left pb-0.5">Item</th>
                <th className="w-[26%] text-right pb-0.5">Amt</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id} className="align-top h-[24px]">
                  <td className="py-0.5 text-center">{formatPackLooseQuantity(item.quantity, item.looseQuantity, item.freeQuantity)}</td>
                  <td className="py-0.5 pr-1 break-words">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-[7px] text-gray-700">GST {item.gstPercent || 0}%</div>
                  </td>
                  <td className="py-0.5 text-right font-semibold">{item.finalPrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {page.showFooter && page.items.length > 0 && renderFooter()}
        </section>
      ))}
    </div>
  );
};

export default Invoice7Template;
