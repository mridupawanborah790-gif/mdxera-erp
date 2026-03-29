import React, { useMemo, useState } from 'react';
import {
  AppConfigurations,
  Customer,
  DeliveryChallan,
  EWayBill,
  EWayBillDocumentType,
  EWayBillStatus,
  EWayBillSubSupplyType,
  EWayBillSupplyType,
  EWayBillTransportMode,
  EWayBillVehicleType,
  Purchase,
  RegisteredPharmacy,
  SalesChallan,
  Supplier,
  Transaction,
} from '../types';

interface EWayBillingProps {
  currentUser: RegisteredPharmacy | null;
  transactions: Transaction[];
  purchases: Purchase[];
  salesChallans: SalesChallan[];
  deliveryChallans: DeliveryChallan[];
  customers: Customer[];
  suppliers: Supplier[];
  ewayBills: EWayBill[];
  onGenerate: (ewayBill: EWayBill) => Promise<void>;
  configurations: AppConfigurations;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

type InvoiceType = 'Sales' | 'Purchase' | 'Challan';

type InvoiceCandidate = {
  sourceId: string;
  invoiceNo: string;
  date: string;
  gstin: string;
  partyName: string;
  invoiceAmount: number;
  taxableAmount: number;
  totalTaxAmount: number;
  items: Array<{ hsn: string; productName: string; quantity: number; taxableAmount: number; sgst: number; cgst: number; igst: number; cess: number; }>;
  sourceType: InvoiceType;
  customerId?: string | null;
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const toDateOnly = (value?: string): string => {
  if (!value) return new Date().toISOString().split('T')[0];
  return value.split('T')[0];
};

const EWayBilling: React.FC<EWayBillingProps> = ({
  currentUser,
  transactions,
  purchases,
  salesChallans,
  deliveryChallans,
  customers,
  suppliers,
  ewayBills,
  onGenerate,
  configurations,
  addNotification,
}) => {
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('Sales');
  const [periodFrom, setPeriodFrom] = useState(() => new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [searchBy, setSearchBy] = useState<'GSTIN' | 'Party Name' | 'EWAY No'>('Party Name');
  const [onlyAbove50k, setOnlyAbove50k] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [screen, setScreen] = useState<'selection' | 'details'>('selection');

  const [transporterName, setTransporterName] = useState('');
  const [transporterGstin, setTransporterGstin] = useState('');
  const [transportMode, setTransportMode] = useState<EWayBillTransportMode>(EWayBillTransportMode.ROAD);
  const [distance, setDistance] = useState<number>(0);
  const [transportDocNo, setTransportDocNo] = useState('');
  const [transportDate, setTransportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [vehicleType, setVehicleType] = useState<EWayBillVehicleType>(EWayBillVehicleType.REGULAR);
  const [transactionType, setTransactionType] = useState<EWayBill['transactionType']>('Regular');
  const [docType, setDocType] = useState<EWayBillDocumentType>(EWayBillDocumentType.TAX_INVOICE);
  const [subType, setSubType] = useState<EWayBillSubSupplyType>(EWayBillSubSupplyType.SALES);

  const invoiceRows = useMemo<InvoiceCandidate[]>(() => {
    if (invoiceType === 'Sales') {
      return transactions.map((tx) => {
        const customer = customers.find((c) => c.id === tx.customerId) || customers.find((c) => c.name === tx.customerName);
        const items = (tx.items || []).map((it) => {
          const taxable = Number(it.amount || it.finalAmount || 0);
          const tax = (taxable * Number(it.gstPercent || 0)) / 100;
          return {
            hsn: it.hsnCode || '-',
            productName: it.name,
            quantity: Number(it.quantity || 0),
            taxableAmount: taxable,
            sgst: tax / 2,
            cgst: tax / 2,
            igst: 0,
            cess: 0,
          };
        });
        return {
          sourceId: tx.id,
          invoiceNo: tx.invoiceNumber || tx.id,
          date: toDateOnly(tx.date),
          gstin: customer?.gstNumber || '',
          partyName: tx.customerName,
          invoiceAmount: Number(tx.total || 0),
          taxableAmount: Number(tx.subtotal || 0),
          totalTaxAmount: Number(tx.totalGst || 0),
          items,
          sourceType: 'Sales',
          customerId: tx.customerId,
        };
      });
    }

    if (invoiceType === 'Purchase') {
      return purchases.map((p) => {
        const supplier = suppliers.find((s) => s.name === p.supplier);
        const items = (p.items || []).map((it) => {
          const taxable = Number(it.taxableValue || it.lineBaseAmount || 0);
          const tax = Number(it.gstAmount || 0);
          return {
            hsn: it.hsnCode || '-',
            productName: it.name,
            quantity: Number(it.quantity || 0),
            taxableAmount: taxable,
            sgst: tax / 2,
            cgst: tax / 2,
            igst: 0,
            cess: 0,
          };
        });
        return {
          sourceId: p.id,
          invoiceNo: p.invoiceNumber || p.purchaseSerialId,
          date: toDateOnly(p.date),
          gstin: supplier?.gst_number || '',
          partyName: p.supplier,
          invoiceAmount: Number(p.totalAmount || 0),
          taxableAmount: Number(p.subtotal || 0),
          totalTaxAmount: Number(p.totalGst || 0),
          items,
          sourceType: 'Purchase',
        };
      });
    }

    const salesRows = salesChallans.map((sc) => {
      const customer = customers.find((c) => c.id === sc.customerId) || customers.find((c) => c.name === sc.customerName);
      return {
        sourceId: sc.id,
        invoiceNo: sc.challanSerialId || sc.id,
        date: toDateOnly(sc.date),
        gstin: customer?.gstNumber || '',
        partyName: sc.customerName,
        invoiceAmount: Number(sc.totalAmount || 0),
        taxableAmount: Number(sc.subtotal || 0),
        totalTaxAmount: Number(sc.totalGst || 0),
        items: (sc.items || []).map((it) => ({
          hsn: it.hsnCode || '-',
          productName: it.name,
          quantity: Number(it.quantity || 0),
          taxableAmount: Number(it.amount || it.finalAmount || 0),
          sgst: ((Number(it.amount || it.finalAmount || 0) * Number(it.gstPercent || 0)) / 100) / 2,
          cgst: ((Number(it.amount || it.finalAmount || 0) * Number(it.gstPercent || 0)) / 100) / 2,
          igst: 0,
          cess: 0,
        })),
        sourceType: 'Challan' as const,
      };
    });

    const purchaseRows = deliveryChallans.map((dc) => {
      const supplier = suppliers.find((s) => s.name === dc.supplier);
      return {
        sourceId: dc.id,
        invoiceNo: dc.challanNumber || dc.challanSerialId,
        date: toDateOnly(dc.date),
        gstin: supplier?.gst_number || '',
        partyName: dc.supplier,
        invoiceAmount: Number(dc.totalAmount || 0),
        taxableAmount: Number(dc.subtotal || 0),
        totalTaxAmount: Number(dc.totalGst || 0),
        items: (dc.items || []).map((it) => ({
          hsn: it.hsnCode || '-',
          productName: it.name,
          quantity: Number(it.quantity || 0),
          taxableAmount: Number(it.taxableValue || it.lineBaseAmount || 0),
          sgst: Number(it.gstAmount || 0) / 2,
          cgst: Number(it.gstAmount || 0) / 2,
          igst: 0,
          cess: 0,
        })),
        sourceType: 'Challan' as const,
      };
    });

    return [...salesRows, ...purchaseRows];
  }, [invoiceType, transactions, purchases, salesChallans, deliveryChallans, customers, suppliers]);

  const filteredRows = useMemo(() => {
    return invoiceRows.filter((row) => {
      if (row.date < periodFrom || row.date > periodTo) return false;
      if (onlyAbove50k && row.invoiceAmount <= 50000) return false;
      const existing = ewayBills.find((e) => e.documentNo === row.invoiceNo || e.linkedTransactionId === row.sourceId || e.linkedPurchaseId === row.sourceId);
      if (pendingOnly && existing) return false;
      if (!search.trim()) return true;
      const needle = search.toLowerCase();
      if (searchBy === 'GSTIN') return (row.gstin || '').toLowerCase().includes(needle);
      if (searchBy === 'EWAY No') return (existing?.eWayBillNo || '').toLowerCase().includes(needle);
      return row.partyName.toLowerCase().includes(needle);
    });
  }, [invoiceRows, periodFrom, periodTo, onlyAbove50k, pendingOnly, ewayBills, search, searchBy]);

  const selectedRow = filteredRows.find((row) => row.sourceId === selectedInvoiceId) || null;

  const hsnSummary = useMemo(() => {
    const src = selectedRow?.items || [];
    const summary = new Map<string, { hsn: string; taxableAmount: number; sgst: number; cgst: number; igst: number; cess: number; taxRate: number; }>();
    src.forEach((item) => {
      const current = summary.get(item.hsn) || { hsn: item.hsn, taxableAmount: 0, sgst: 0, cgst: 0, igst: 0, cess: 0, taxRate: 0 };
      current.taxableAmount += item.taxableAmount;
      current.sgst += item.sgst;
      current.cgst += item.cgst;
      current.igst += item.igst;
      current.cess += item.cess;
      const totalTax = current.sgst + current.cgst + current.igst;
      current.taxRate = current.taxableAmount > 0 ? Number(((totalTax / current.taxableAmount) * 100).toFixed(2)) : 0;
      summary.set(item.hsn, current);
    });
    return Array.from(summary.values());
  }, [selectedRow]);

  const credentials = (configurations as any)?.ewayLoginSetup || {};

  const runValidation = (): string[] => {
    const errors: string[] = [];
    if (!selectedRow) {
      errors.push('Please select an invoice.');
      return errors;
    }
    if (!selectedRow.invoiceNo) errors.push('Invoice does not exist.');
    if (!selectedRow.gstin || !GSTIN_REGEX.test(selectedRow.gstin)) errors.push('Consignee GSTIN is invalid.');
    if (!distance || distance <= 0) errors.push('Distance is mandatory.');
    if (transportMode === EWayBillTransportMode.ROAD && !vehicleNo.trim()) errors.push('Vehicle number is mandatory for road transport.');
    if (!transporterName.trim()) errors.push('Transporter is required.');
    if (!selectedRow.totalTaxAmount && selectedRow.taxableAmount <= 0) errors.push('Tax data is not present.');
    if (!selectedRow.items.length) errors.push('HSN data is not present.');
    if (!credentials?.ewayLoginId || !credentials?.ewayPassword) errors.push('E-Way credentials are not available.');
    return errors;
  };

  const handleCheck = () => {
    const errors = runValidation();
    if (errors.length) {
      addNotification(`Validation failed: ${errors.join(' | ')}`, 'warning');
      return;
    }
    addNotification('Validation passed. Ready to generate E-Way Bill.', 'success');
  };

  const handleUpload = async () => {
    if (!currentUser || !selectedRow) return;
    const errors = runValidation();
    if (errors.length) {
      addNotification(`Cannot generate EWB: ${errors.join(' | ')}`, 'error');
      return;
    }

    const ewbNo = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const generated: EWayBill = {
      id: crypto.randomUUID(),
      organization_id: currentUser.organization_id,
      linkedTransactionId: selectedRow.sourceType === 'Sales' ? selectedRow.sourceId : undefined,
      linkedPurchaseId: selectedRow.sourceType === 'Purchase' ? selectedRow.sourceId : undefined,
      eWayBillNo: ewbNo,
      eWayBillNo_str: ewbNo,
      eWayBillDate: new Date().toISOString(),
      validUntil,
      supplyType: selectedRow.sourceType === 'Purchase' ? EWayBillSupplyType.INWARD : EWayBillSupplyType.OUTWARD,
      subSupplyType: subType,
      documentType: docType,
      documentNo: selectedRow.invoiceNo,
      documentDate: selectedRow.date,
      fromGstin: currentUser.gstin || currentUser.retailer_gstin || '',
      fromTrdName: currentUser.pharmacy_name,
      fromAddr1: currentUser.address || '-',
      fromPlace: currentUser.district || currentUser.state || '-',
      fromPincode: Number(currentUser.pincode || 0),
      fromStateCode: 0,
      toGstin: selectedRow.gstin,
      toTrdName: selectedRow.partyName,
      toAddr1: selectedRow.partyName,
      toAddr2: '-',
      toPlace: selectedRow.partyName,
      toPincode: 0,
      toStateCode: 0,
      transactionType,
      totalValue: selectedRow.invoiceAmount,
      cgstValue: selectedRow.totalTaxAmount / 2,
      sgstValue: selectedRow.totalTaxAmount / 2,
      igstValue: 0,
      cessValue: 0,
      transportMode,
      transporterName,
      transporterId: transporterGstin,
      vehicleNo: vehicleNo || undefined,
      vehicleType,
      distance,
      status: EWayBillStatus.GENERATED,
    };

    await onGenerate(generated);
    addNotification(`E-Way Bill generated successfully. EWB No: ${ewbNo}`, 'success');
  };

  const selectedEway = selectedRow
    ? ewayBills.find((e) => e.documentNo === selectedRow.invoiceNo || e.linkedTransactionId === selectedRow.sourceId || e.linkedPurchaseId === selectedRow.sourceId)
    : undefined;

  return (
    <div className="p-3 sm:p-4 bg-[#F5F5F5] min-h-full text-[11px] font-bold uppercase tracking-wide">
      <div className="bg-white border-2 border-gray-400 shadow-sm">
        <div className="bg-primary text-white px-3 py-2 flex items-center justify-between">
          <span>eWAY BILL DETAILS – Generate EWAY Bill</span>
          <span className="text-[10px]">E-Way Billing Management</span>
        </div>

        {screen === 'selection' && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <label className="flex flex-col gap-1">Invoice Type
                <select className="border border-gray-400 p-1" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}>
                  <option>Sales</option><option>Purchase</option><option>Challan</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">Period From Date<input type="date" className="border border-gray-400 p-1" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></label>
              <label className="flex flex-col gap-1">Period To Date<input type="date" className="border border-gray-400 p-1" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></label>
              <button className="border border-gray-600 bg-gray-100 px-2 py-1">Change</button>
              <button className="border border-blue-700 bg-blue-700 text-white px-2 py-1">Submit</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <label className="flex flex-col gap-1 md:col-span-2">Search<input className="border border-gray-400 p-1" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label className="flex flex-col gap-1">Search By
                <select className="border border-gray-400 p-1" value={searchBy} onChange={(e) => setSearchBy(e.target.value as any)}>
                  <option>GSTIN</option><option>Party Name</option><option>EWAY No</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onlyAbove50k} onChange={(e) => setOnlyAbove50k(e.target.checked)} />Bill amount &gt; 50,000</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Pending E-Way Bills</label>
            </div>

            <div className="border border-gray-400 overflow-auto max-h-[38vh]">
              <table className="w-full min-w-[980px] text-[10px]">
                <thead className="bg-gray-200 sticky top-0">
                  <tr>
                    {['Select','Invoice No','Date','GSTIN','Party Name','Invoice Amount','Taxable Amount','Total Tax Amount','EWAY Bill No','EWAY Validity'].map((h) => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const linked = ewayBills.find((e) => e.documentNo === row.invoiceNo || e.linkedTransactionId === row.sourceId || e.linkedPurchaseId === row.sourceId);
                    const selected = selectedInvoiceId === row.sourceId;
                    return (
                      <tr
                        key={row.sourceId}
                        className={`border-t border-gray-300 cursor-pointer ${selected ? 'bg-yellow-100' : 'hover:bg-blue-50'}`}
                        onClick={() => setSelectedInvoiceId(row.sourceId)}
                        onDoubleClick={() => setScreen('details')}
                      >
                        <td className="p-1 border-r border-gray-300"><input type="checkbox" checked={selected} onChange={() => setSelectedInvoiceId(row.sourceId)} /></td>
                        <td className="p-1 border-r border-gray-300">{row.invoiceNo}</td>
                        <td className="p-1 border-r border-gray-300">{row.date}</td>
                        <td className="p-1 border-r border-gray-300">{row.gstin || '-'}</td>
                        <td className="p-1 border-r border-gray-300">{row.partyName}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.invoiceAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.taxableAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.totalTaxAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300">{linked?.eWayBillNo || '-'}</td>
                        <td className="p-1">{linked?.validUntil ? toDateOnly(linked.validUntil) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border border-gray-400 overflow-auto max-h-[22vh]">
              <table className="w-full text-[10px]">
                <thead className="bg-gray-200"><tr>{['HSN','Tax Rate','Taxable Amount','SGST','CGST','IGST','Cess'].map((h) => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {hsnSummary.map((row) => <tr key={row.hsn} className="border-t border-gray-300"><td className="p-1 border-r">{row.hsn}</td><td className="p-1 border-r text-right">{row.taxRate.toFixed(2)}%</td><td className="p-1 border-r text-right">{row.taxableAmount.toFixed(2)}</td><td className="p-1 border-r text-right">{row.sgst.toFixed(2)}</td><td className="p-1 border-r text-right">{row.cgst.toFixed(2)}</td><td className="p-1 border-r text-right">{row.igst.toFixed(2)}</td><td className="p-1 text-right">{row.cess.toFixed(2)}</td></tr>)}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button className="border border-gray-700 bg-gray-100 px-3 py-1" onClick={() => selectedRow ? setScreen('details') : addNotification('Select an invoice first.', 'warning')}>Open E-Way Details</button>
            </div>
          </div>
        )}

        {screen === 'details' && selectedRow && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <section className="border border-gray-400 p-2">
                <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">A. Consignor Details</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">Sub Type<select className="border border-gray-400 p-1" value={subType} onChange={(e) => setSubType(e.target.value as EWayBillSubSupplyType)}>{Object.values(EWayBillSubSupplyType).map(v => <option key={v}>{v}</option>)}</select></label>
                  <label className="flex flex-col gap-1">Doc Type<select className="border border-gray-400 p-1" value={docType} onChange={(e) => setDocType(e.target.value as EWayBillDocumentType)}>{Object.values(EWayBillDocumentType).map(v => <option key={v}>{v}</option>)}</select></label>
                  <label className="flex flex-col gap-1">Invoice No<input className="border border-gray-400 p-1" value={selectedRow.invoiceNo} readOnly /></label>
                  <label className="flex flex-col gap-1">Bill Date<input className="border border-gray-400 p-1" value={selectedRow.date} readOnly /></label>
                  <div>Consignor Name: {currentUser?.pharmacy_name || '-'}</div><div>GSTIN: {currentUser?.gstin || '-'}</div>
                  <div>Address: {currentUser?.address || '-'}</div><div>From State: {currentUser?.state || '-'}</div>
                  <div>From Place: {currentUser?.district || '-'}</div><div>Pincode: {currentUser?.pincode || '-'}</div>
                </div>
              </section>

              <section className="border border-gray-400 p-2">
                <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">B. Consignee Details</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">Name<input className="border border-gray-400 p-1" value={selectedRow.partyName} readOnly /></label>
                  <label className="flex flex-col gap-1">GSTIN<input className="border border-gray-400 p-1" value={selectedRow.gstin || ''} readOnly /></label>
                  <label className="flex flex-col gap-1 col-span-2">Address<input className="border border-gray-400 p-1" value={selectedRow.partyName} readOnly /></label>
                  <div>To State: -</div><div>Ship To State: -</div><div>To Place: {selectedRow.partyName}</div><div>Pincode: -</div>
                  <button className="border border-gray-600 bg-gray-100 px-2 py-1 col-span-2">Change Consignee Details</button>
                </div>
              </section>
            </div>

            <section className="border border-gray-400 p-2">
              <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">C. Transporter Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">Transporter Name<input className="border border-gray-400 p-1" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} placeholder="Search / Add New" /></label>
                <label className="flex flex-col gap-1">Transporter GSTIN / ID<input className="border border-gray-400 p-1" value={transporterGstin} onChange={(e) => setTransporterGstin(e.target.value)} /></label>
                <label className="flex flex-col gap-1">Transport Mode<select className="border border-gray-400 p-1" value={transportMode} onChange={(e) => setTransportMode(e.target.value as EWayBillTransportMode)}>{Object.values(EWayBillTransportMode).map(v => <option key={v}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1">Distance<input type="number" className="border border-gray-400 p-1" value={distance || ''} onChange={(e) => setDistance(Number(e.target.value || 0))} /></label>
                <button className="border border-gray-600 bg-gray-100 px-2 py-1">Calculate Distance</button>
                <label className="flex flex-col gap-1">Transport Doc No<input className="border border-gray-400 p-1" value={transportDocNo} onChange={(e) => setTransportDocNo(e.target.value)} /></label>
                <label className="flex flex-col gap-1">Date<input type="date" className="border border-gray-400 p-1" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} /></label>
                <label className="flex flex-col gap-1">Vehicle No<input className="border border-gray-400 p-1" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} /></label>
                <label className="flex flex-col gap-1">Vehicle Type<select className="border border-gray-400 p-1" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as EWayBillVehicleType)}>{Object.values(EWayBillVehicleType).map(v => <option key={v}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1">Transaction Type<select className="border border-gray-400 p-1" value={transactionType} onChange={(e) => setTransactionType(e.target.value as EWayBill['transactionType'])}>{['Regular','Bill To Ship To','Bill From Ship From','Combination Of 2 & 3'].map(v => <option key={v}>{v}</option>)}</select></label>
              </div>
            </section>

            <section className="border border-gray-400 p-2 space-y-2">
              <h3 className="text-[10px] bg-gray-100 p-1 border">D. E-Way Bill Data Section</h3>
              <div className="grid grid-cols-4 gap-2 text-[10px] border border-gray-300 p-2 bg-gray-50">
                <div>Invoice No: {selectedRow.invoiceNo}</div><div>Date: {selectedRow.date}</div><div>Taxable Amount: {selectedRow.taxableAmount.toFixed(2)}</div><div>EWAY Number: {selectedEway?.eWayBillNo || '-'}</div>
                <div>SGST: {(selectedRow.totalTaxAmount / 2).toFixed(2)}</div><div>CGST: {(selectedRow.totalTaxAmount / 2).toFixed(2)}</div><div>IGST: 0.00</div><div>Cess: 0.00</div>
              </div>
              <div className="border border-gray-400 overflow-auto max-h-[22vh]">
                <table className="w-full text-[10px]"><thead className="bg-gray-200"><tr>{['HSN','Product Name','Quantity','Taxable Amount','SGST','CGST','IGST','Cess'].map(h => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}</tr></thead>
                  <tbody>{selectedRow.items.map((item, idx) => <tr key={`${item.hsn}-${idx}`} className="border-t border-gray-300"><td className="p-1 border-r">{item.hsn}</td><td className="p-1 border-r">{item.productName}</td><td className="p-1 border-r text-right">{item.quantity}</td><td className="p-1 border-r text-right">{item.taxableAmount.toFixed(2)}</td><td className="p-1 border-r text-right">{item.sgst.toFixed(2)}</td><td className="p-1 border-r text-right">{item.cgst.toFixed(2)}</td><td className="p-1 border-r text-right">{item.igst.toFixed(2)}</td><td className="p-1 text-right">{item.cess.toFixed(2)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <div className="flex flex-wrap gap-2 justify-end">
              <button className="border border-blue-700 bg-blue-700 text-white px-3 py-1" onClick={handleUpload}>Upload (Generate EWB)</button>
              {['Offline Excel','Offline JSON','View','Edit','Print'].map(label => <button key={label} className="border border-gray-600 bg-gray-100 px-3 py-1">{label}</button>)}
              <button className="border border-amber-700 bg-amber-500 text-white px-3 py-1" onClick={handleCheck}>Check</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={() => setScreen('selection')}>Exit</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1">Browse</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EWayBilling;
