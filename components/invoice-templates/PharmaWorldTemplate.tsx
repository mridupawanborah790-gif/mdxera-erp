import React, { useMemo } from 'react';
import type { DetailedBill, InventoryItem } from '../../types';
import { numberToWords } from '../../utils/numberToWords';

interface TemplateProps {
  bill: DetailedBill & { inventory?: InventoryItem[] };
}

const PharmaWorldTemplate: React.FC<TemplateProps> = ({ bill }) => {
  const isNonGst = bill.billType === 'non-gst';
  const isCredit = bill.paymentMode === 'Credit';

  const calculations = useMemo(() => {
    const items = (bill.items || []).map(item => {
      const inventoryItem = bill.inventory?.find(inv => inv.id === item.inventoryItemId);
      const totalMrp = (item.mrp || 0) * (item.quantity || 0);

      const tradeDiscountAmount = totalMrp * ((item.discountPercent || 0) / 100);
      const priceAfterDiscount = totalMrp - tradeDiscountAmount;
      
      const taxableValue = priceAfterDiscount / (1 + ((item.gstPercent || 0) / 100));
      const gstAmount = priceAfterDiscount - taxableValue;
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
      const rate = (item.quantity || 0) > 0 ? taxableValue / item.quantity : 0;

      return {
        ...item,
        manufacturer: inventoryItem?.manufacturer || item.brand || 'N/A',
        batch: inventoryItem?.batch || 'N/A',
        expiry: inventoryItem?.expiry ? new Date(inventoryItem.expiry).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : 'N/A',
        taxableValue,
        cgst,
        sgst,
        rate,
        finalAmount: taxableValue + gstAmount,
        totalDiscountAmount: tradeDiscountAmount
      };
    });

    const subTotal = (items || []).reduce((sum, item) => sum + item.taxableValue, 0);
    const totalCgst = (items || []).reduce((sum, item) => sum + item.cgst, 0);
    const totalSgst = (items || []).reduce((sum, item) => sum + item.sgst, 0);
    const totalDiscount = (items || []).reduce((sum, item) => sum + item.totalDiscountAmount, 0);

    const gstSummary: { [rate: number]: { taxable: number; sgst: number; cgst: number } } = {};
    (items || []).forEach(item => {
        const gstRate = item.gstPercent || 0;
        if (!gstSummary[gstRate]) {
            gstSummary[gstRate] = { taxable: 0, sgst: 0, cgst: 0 };
        }
        gstSummary[gstRate].taxable += item.taxableValue;
        gstSummary[gstRate].sgst += item.sgst;
        gstSummary[gstRate].cgst += item.cgst;
    });

    return { items, subTotal, totalCgst, totalSgst, totalDiscount, gstSummary };
  }, [bill]);

  return (
    <div className="bg-white text-[9px] text-gray-800 font-sans p-8 w-full mx-auto font-mono min-h-full">
      {!bill.hideRetailerOnBill && (
      <div className="grid grid-cols-2 mb-1 items-start">
        <div className="col-span-1">
          {!isNonGst && (
              <>
                  <h1 className="text-xl font-bold uppercase">{bill.pharmacy.pharmacy_name}</h1>
                  <p>{bill.pharmacy.address}</p>
                  <p>Phone: {bill.pharmacy.mobile}</p>
                  <p>GSTIN: {bill.pharmacy.gstin} | D.L.No.: {bill.pharmacy.drug_license}</p>
              </>
          )}
        </div>
        <div className="col-span-1 text-center font-bold text-lg flex items-center justify-center pt-4">
          <div className="border-y-2 border-black py-0.5 px-4">
            {isCredit ? 'CREDIT BILL' : (isNonGst ? 'ESTIMATE' : 'GST INVOICE')}
          </div>
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 border-y-2 border-black mt-1 py-1">
          <div className="border-r-2 border-black pr-1">
            <p className="font-bold">Buyer's Details:</p>
            <p>{bill.customerName}</p>
              <>
                {bill.customerDetails?.address && <p>{bill.customerDetails.address}</p>}
                {bill.customerDetails?.phone && <p>Phone: {bill.customerDetails.phone}</p>}
                {bill.customerDetails?.gstNumber && <p>GST: {bill.customerDetails.gstNumber}</p>}
                {bill.customerDetails?.panNumber && <p>PAN: {bill.customerDetails.panNumber}</p>}
                {bill.customerDetails?.drugLicense && <p>D.L.No: {bill.customerDetails.drugLicense}</p>}
              </>
          </div>
          <div className="pl-2">
            <p><strong>Invoice No.:</strong> {bill.id}</p>
            <p><strong>Inv. Date:</strong> {new Date(bill.date).toLocaleDateString('en-IN')}</p>
          </div>
      </div>

      <table className="w-full mt-1 border-collapse">
        <thead className="border-t-2 border-b-2 border-black">
          <tr>
            <th className="p-0.5 text-left font-semibold w-[6%]">Qty+F.Qty</th>
            <th className="p-0.5 text-left font-semibold w-[5%]">Pack</th>
            <th className="p-0.5 text-left font-semibold w-[24%]">Product Description</th>
            <th className="p-0.5 text-left font-semibold w-[10%]">Mfr.</th>
            <th className="p-0.5 text-left font-semibold w-[6%]">HSN</th>
            <th className="p-0.5 text-left font-semibold w-[7%]">Batch</th>
            <th className="p-0.5 text-center font-semibold w-[4%]">Exp.</th>
            <th className="p-0.5 text-right font-semibold w-[6%]">M.R.P</th>
            <th className="p-0.5 text-right font-semibold w-[6%]">Rate</th>
            <th className="p-0.5 text-right font-semibold w-[4%]">Disc%</th>
            <th className="p-0.5 text-right font-semibold w-[4%]">SGST%</th>
            <th className="p-0.5 text-right font-semibold w-[4%]">CGST%</th>
            <th className="p-0.5 text-right font-semibold w-[10%]">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(calculations.items || []).map(item => (
            <tr key={item.id} className="border-b">
              <td className="p-0.5">{item.quantity}{item.freeQuantity ? `+${item.freeQuantity}` : ''}</td>
              <td className="p-0.5">{item.packType || 'N/A'}</td>
              <td className="p-0.5">{item.name}</td>
              <td className="p-0.5">{item.manufacturer}</td>
              <td className="p-0.5">{item.hsnCode}</td>
              <td className="p-0.5">{item.batch}</td>
              <td className="p-0.5 text-center">{item.expiry}</td>
              <td className="p-0.5 text-right">{(item.mrp || 0).toFixed(2)}</td>
              <td className="p-0.5 text-right">{(item.taxBasis === 'I-Incl.MRP' ? (item.mrp || 0) : (item.rate || 0)).toFixed(2)}</td>
              <td className="p-0.5 text-right">{(item.discountPercent || 0).toFixed(2)}</td>
              <td className="p-0.5 text-right">{!isNonGst ? ((item.gstPercent || 0) / 2).toFixed(2) : '-'}</td>
              <td className="p-0.5 text-right">{!isNonGst ? ((item.gstPercent || 0) / 2).toFixed(2) : '-'}</td>
              <td className="p-0.5 text-right font-semibold">{(item.finalAmount || 0).toFixed(2)}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 15 - (calculations.items || []).length) }).map((_, i) => (
            <tr key={`empty-${i}`} className="border-b h-5"><td colSpan={13}>&nbsp;</td></tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-start justify-between mt-1 border-t-2 border-black pt-1">
          <div className="w-8/12 pr-4">
              <div className="border-b-2 border-black pb-1">
                  <p><strong>Amount in Words:</strong> {numberToWords(bill.total || 0)}</p>
              </div>
              {!isNonGst && (
              <div className="border-b-2 border-black py-1">
                 <table className="w-full">
                     <thead className="border-b border-black">
                         <tr>
                            <th className="font-semibold text-left">GST Rate</th>
                            <th className="font-semibold text-right">Taxable</th>
                            <th className="font-semibold text-right">SGST</th>
                            <th className="font-semibold text-right">CGST</th>
                            <th className="font-semibold text-right">Total</th>
                         </tr>
                     </thead>
                     <tbody>
                         {Object.entries(calculations.gstSummary).map(([rate, values]) => {
                             const typedValues = values as { taxable: number; sgst: number; cgst: number };
                             return (
                                 <tr key={rate}>
                                     <td>{parseFloat(rate).toFixed(2)}%</td>
                                     <td className="text-right">{typedValues.taxable.toFixed(2)}</td>
                                     <td className="text-right">{typedValues.sgst.toFixed(2)}</td>
                                     <td className="text-right">{typedValues.cgst.toFixed(2)}</td>
                                     <td className="text-right">{(typedValues.sgst + typedValues.cgst).toFixed(2)}</td>
                                 </tr>
                             );
                         })}
                     </tbody>
                 </table>
              </div>
              )}
          </div>

          <div className="w-4/12 flex flex-col justify-between h-full">
              <div className="w-full">
                  <div className="space-y-px text-[10px]">
                      <div className="flex justify-between"><span>SUB TOTAL</span> <span>{(calculations.subTotal || 0).toFixed(2)}</span></div>
                      { (bill.schemeDiscount || 0) > 0 && <div className="flex justify-between"><span>Bill Discount</span> <span>{(bill.schemeDiscount || 0).toFixed(2)}</span></div>}
                      <div className="flex justify-between"><span>Discount</span> <span>{(calculations.totalDiscount || 0).toFixed(2)}</span></div>
                      {!isNonGst && <div className="flex justify-between"><span>Cgst Amount</span> <span>{(calculations.totalCgst || 0).toFixed(2)}</span></div>}
                      {!isNonGst && <div className="flex justify-between"><span>Sgst Amount</span> <span>{(calculations.totalSgst || 0).toFixed(2)}</span></div>}
                      {(bill.roundOff || 0) !== 0 && <div className="flex justify-between"><span>Round Off</span> <span>{(bill.roundOff || 0).toFixed(2)}</span></div>}
                  </div>
                  <div className="flex justify-between font-bold text-base border-y-2 border-black my-1 py-1">
                      <span>GRAND TOTAL</span>
                      <span>₹ {(bill.total || 0).toFixed(2)}</span>
                  </div>
              </div>
              <div className="mt-8 text-center text-xs self-end w-full">
                  {!bill.hideRetailerOnBill && !isNonGst && <p>For {bill.pharmacy.pharmacy_name}</p>}
                  <div className="h-10"></div>
                  {!bill.hideRetailerOnBill && !isNonGst && <p className="border-t border-black pt-0.5 inline-block">Authorised Signatory</p>}
                  <p className="text-[8px]">E.&O.E.</p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default PharmaWorldTemplate;