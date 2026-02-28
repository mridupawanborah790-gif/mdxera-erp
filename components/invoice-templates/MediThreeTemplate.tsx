import React, { useMemo } from 'react';
import type { AppConfigurations, DetailedBill, InventoryItem } from '../../types';
import { numberToWords } from '../../utils/numberToWords';
import { calculateBillingTotals } from '../../utils/billing';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[]; configurations: AppConfigurations };
  orientation?: 'portrait' | 'landscape';
}

const MediThreeTemplate: React.FC<TemplateProps> = ({ bill, orientation = 'portrait' }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isLandscape = orientation === 'landscape';

  const computedTotals = useMemo(() => calculateBillingTotals({
    items: bill.items || [],
    billDiscount: bill.schemeDiscount || 0,
    isNonGst,
    configurations: bill.configurations,
  }), [bill.items, bill.schemeDiscount, bill.configurations, isNonGst]);

  const calculations = useMemo(() => {
    const items = (bill.items || []).map((item, index) => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
      const unitsPerPack = item.unitsPerPack || 1;
      const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
      const rate = item.rate ?? item.mrp ?? 0;
      const gross = billedQty * rate;
      const tradeDiscount = gross * ((item.discountPercent || 0) / 100);
      const flatDiscount = item.itemFlatDiscount || 0;
      const schemeDiscount = item.schemeDiscountAmount || 0;
      const lineAmount = Number.isFinite(item.finalAmount)
        ? (item.finalAmount as number)
        : Number.isFinite(item.amount)
          ? (item.amount as number)
          : Math.max(0, gross - tradeDiscount - flatDiscount - schemeDiscount);

      const gstPercent = isNonGst ? 0 : (item.gstPercent || 0);
      const taxable = gstPercent > 0 ? lineAmount / (1 + gstPercent / 100) : lineAmount;
      const gstAmount = Math.max(0, lineAmount - taxable);

      return {
        ...item,
        sn: index + 1,
        manufacturer: item.manufacturer || inventoryItem?.manufacturer || '-',
        pack: item.packType || inventoryItem?.packType || item.unitOfMeasurement || (item.unitsPerPack ? `${item.unitsPerPack}` : '-'),
        hsn: item.hsnCode || inventoryItem?.hsnCode || '-',
        batch: item.batch || inventoryItem?.batch || '-',
        qtyText: `${item.quantity || 0}${item.freeQuantity ? `+${item.freeQuantity}` : ''}`,
        expiry: item.expiry || (inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '-'),
        sgstRate: gstPercent / 2,
        cgstRate: gstPercent / 2,
        taxable,
        gstAmount,
        lineAmount,
      };
    });

    return { items };
  }, [bill.items, bill.inventory, isNonGst]);

  const totals = {
    subTotal: computedTotals.subtotal || bill.subtotal || 0,
    discount: computedTotals.billDiscount || bill.schemeDiscount || 0,
    taxTotal: isNonGst ? 0 : (computedTotals.tax || bill.totalGst || 0),
    grandTotal: bill.total || (computedTotals.baseTotal + (bill.roundOff || computedTotals.autoRoundOff || 0)),
  };

  const columnWidths = isLandscape
    ? {
        sn: '3%',
        description: '24%',
        manufacturer: '10%',
        pack: '6%',
        hsn: '7%',
        batch: '7%',
        qty: '7%',
        mrp: '6%',
        rate: '6%',
        expiry: '6%',
        discount: '5%',
        sgst: '4%',
        cgst: '4%',
        amount: '5%',
      }
    : {
        sn: '3%',
        description: '18%',
        manufacturer: '8%',
        pack: '5%',
        hsn: '8%',
        batch: '8%',
        qty: '7%',
        mrp: '6%',
        rate: '6%',
        expiry: '6%',
        discount: '5%',
        sgst: '5%',
        cgst: '5%',
        amount: '10%',
      };

  return (
    <div className={`medi-three-template text-black bg-white w-full font-sans text-[8px] leading-tight ${isLandscape ? 'medi-three-landscape' : 'medi-three-portrait'}`}>
      <style>{`
        .medi-three-template {
          padding: 4mm;
          box-sizing: border-box;
          width: ${isLandscape ? '210mm' : '148mm'};
          min-height: ${isLandscape ? '148mm' : '210mm'};
        }
        .medi-three-box { border: 1px solid #111; }
        .medi-three-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .medi-three-grid th,
        .medi-three-grid td { border: 1px solid #111; padding: 2px 3px; vertical-align: middle; }
        .medi-three-grid thead th { font-size: 7px; text-transform: uppercase; background: #fff; }
        .medi-three-grid tbody td { font-size: 7px; }
        .medi-three-grid .right { text-align: right; }
        .medi-three-grid .center { text-align: center; }
        .medi-three-grid .left { text-align: left; }
        .medi-three-grid .desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .medi-three-title { font-size: 15px; font-weight: 700; letter-spacing: 0.1em; text-align: center; }
        .medi-three-meta { display: grid; grid-template-columns: 1fr 1fr; }
        .medi-three-meta > div { border-top: 1px solid #111; padding: 3px 5px; min-height: 34px; }
        .medi-three-meta > div:first-child { border-right: 1px solid #111; }
        .medi-three-summary { border-top: 1px solid #111; display: grid; grid-template-columns: 1fr ${isLandscape ? '220px' : '190px'}; }
        .medi-three-summary-left { border-right: 1px solid #111; padding: 4px 5px; }
        .medi-three-summary-right { padding: 4px 5px; }
        .medi-three-summary-right .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 8px; }
        .medi-three-summary-right .grand { border-top: 1px solid #111; padding-top: 3px; margin-top: 3px; font-size: 10px; font-weight: 700; }
        @media print {
          @page { size: A5 ${orientation}; margin: 4mm; }
          .medi-three-template { padding: 3mm; }
          .medi-three-grid thead { display: table-header-group; }
          .medi-three-grid tfoot { display: table-row-group; }
          .medi-three-row { break-inside: avoid; page-break-inside: avoid; }
          .medi-three-grid { width: 100%; }
          .medi-three-box {
            break-inside: auto;
            page-break-inside: auto;
          }
        }

        @media screen {
          .medi-three-template {
            width: ${isLandscape ? '210mm' : '148mm'};
            min-height: ${isLandscape ? '148mm' : '210mm'};
          }
        }
      `}</style>

      <div className="medi-three-box">
        <div className="medi-three-title">GST INVOICE</div>

        <div className="medi-three-meta">
          <div>
            <div><strong>{bill.pharmacy.pharmacy_name}</strong></div>
            <div>{bill.pharmacy.address}</div>
            <div><strong>GSTIN:</strong> {bill.pharmacy.gstin || '-'}</div>
          </div>
          <div>
            <div><strong>Invoice No:</strong> {bill.id}</div>
            <div><strong>Invoice Date:</strong> {new Date(bill.date).toLocaleDateString('en-GB')}</div>
            <div><strong>Terms:</strong> Cash</div>
          </div>
        </div>

        <div className="medi-three-meta" style={{ gridTemplateColumns: '1fr' }}>
          <div style={{ borderRight: 0 }}>
            <div><strong>Customer:</strong> {bill.customerName || 'Walk-in Customer'}</div>
            <div><strong>Address:</strong> {bill.customerDetails?.address || '-'}</div>
            <div><strong>Phone:</strong> {bill.customerDetails?.phone || bill.customerPhone || '-'}</div>
          </div>
        </div>

        <table className="medi-three-grid">
          <thead>
            <tr>
              <th style={{ width: '3%' }}>S.N</th>
              <th style={{ width: columnWidths.description }}>Product Description</th>
              <th style={{ width: columnWidths.manufacturer }}>Mfr.</th>
              <th style={{ width: columnWidths.pack }}>Pack</th>
              <th style={{ width: columnWidths.hsn }}>HSN</th>
              <th style={{ width: columnWidths.batch }}>Batch</th>
              <th style={{ width: columnWidths.qty }}>Qty + Free</th>
              <th style={{ width: columnWidths.mrp }}>MRP</th>
              <th style={{ width: columnWidths.rate }}>Rate</th>
              <th style={{ width: columnWidths.expiry }}>Expiry</th>
              <th style={{ width: columnWidths.discount }}>Disc%</th>
              <th style={{ width: columnWidths.sgst }}>SGST</th>
              <th style={{ width: columnWidths.cgst }}>CGST</th>
              <th style={{ width: columnWidths.amount }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {calculations.items.map(item => (
              <tr key={item.id} className="medi-three-row">
                <td className="center">{item.sn}</td>
                <td className="left desc">{item.name}</td>
                <td className="left">{item.manufacturer}</td>
                <td className="center">{item.pack}</td>
                <td className="center">{item.hsn}</td>
                <td className="center">{item.batch}</td>
                <td className="center">{item.qtyText}</td>
                <td className="right">{(item.mrp || 0).toFixed(2)}</td>
                <td className="right">{(item.rate || item.mrp || 0).toFixed(2)}</td>
                <td className="center">{item.expiry}</td>
                <td className="center">{(item.discountPercent || 0).toFixed(2)}</td>
                <td className="center">{item.sgstRate.toFixed(2)}%</td>
                <td className="center">{item.cgstRate.toFixed(2)}%</td>
                <td className="right">{item.lineAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="medi-three-summary">
          <div className="medi-three-summary-left">
            <div><strong>Amount in words:</strong> {numberToWords(totals.grandTotal)}</div>
          </div>
          <div className="medi-three-summary-right">
            <div className="row"><span>Sub Total</span><strong>{totals.subTotal.toFixed(2)}</strong></div>
            {totals.discount > 0 && <div className="row"><span>Discount</span><strong>-{totals.discount.toFixed(2)}</strong></div>}
            <div className="row"><span>Tax Total</span><strong>{totals.taxTotal.toFixed(2)}</strong></div>
            <div className="row grand"><span>Grand Total</span><span>{totals.grandTotal.toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediThreeTemplate;
