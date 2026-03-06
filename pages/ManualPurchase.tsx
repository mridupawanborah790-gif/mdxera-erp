import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/Card';
import { InventoryItem, Medicine, Purchase, PurchaseItem, RegisteredPharmacy, Supplier } from '../types';
import { fuzzyMatch } from '../utils/search';
import { handleEnterToNextField } from '../utils/navigation';

interface ManualPurchaseProps {
  currentUser: RegisteredPharmacy | null;
  suppliers: Supplier[];
  inventory: InventoryItem[];
  medicines: Medicine[];
  purchases: Purchase[];
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
  onAddPurchase: (purchase: Purchase, supplierGst: string) => Promise<void>;
  onSaved: () => Promise<void>;
  onAddMedicineMaster: (med: Omit<Medicine, 'id'>) => Promise<Medicine>;
}

type ManualLine = {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
  itemCode?: string;
  inventoryItemId?: string;
};

const round2 = (n: number) => Number((n || 0).toFixed(2));

const newLine = (): ManualLine => ({
  id: crypto.randomUUID(),
  description: '',
  qty: 1,
  rate: 0,
  amount: 0,
  discount: 0,
  taxPercent: 0,
  taxAmount: 0,
  lineTotal: 0,
});

const recalcLine = (line: ManualLine): ManualLine => {
  const amount = round2(Math.max(0, line.qty) * Math.max(0, line.rate));
  const discount = round2(Math.max(0, line.discount));
  const taxable = round2(Math.max(0, amount - discount));
  const taxAmount = round2((taxable * Math.max(0, line.taxPercent)) / 100);
  return { ...line, amount, discount, taxAmount, lineTotal: round2(taxable + taxAmount) };
};

const ManualPurchase: React.FC<ManualPurchaseProps> = ({
  currentUser,
  suppliers,
  inventory,
  medicines,
  purchases,
  addNotification,
  onAddPurchase,
  onSaved,
  onAddMedicineMaster,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState('');
  const [phone, setPhone] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [grnNumber, setGrnNumber] = useState('');
  const [purchaseNo, setPurchaseNo] = useState('AUTO');
  const [lines, setLines] = useState<ManualLine[]>([newLine()]);
  const [searchText, setSearchText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isAddMasterOpen, setIsAddMasterOpen] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialCode, setNewMaterialCode] = useState('');
  const [newMaterialGst, setNewMaterialGst] = useState('');

  const dateInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLSelectElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const itemSearchInputRef = useRef<HTMLInputElement>(null);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const matchingItems = useMemo(() => {
    const term = searchText.trim();
    if (!term) return [] as InventoryItem[];
    return inventory
      .filter((item) => fuzzyMatch(item.name, term) || fuzzyMatch(item.code || '', term) || fuzzyMatch(item.barcode || '', term))
      .slice(0, 12);
  }, [inventory, searchText]);

  const metrics = useMemo(() => {
    const subTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    const totalDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));
    const totalGst = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const rawGrand = round2(subTotal - totalDiscount + totalGst);
    const roundedGrand = round2(Math.round(rawGrand));
    const roundOff = round2(roundedGrand - rawGrand);
    return { subTotal, totalDiscount, totalGst, grandTotal: roundedGrand, roundOff };
  }, [lines]);

  useEffect(() => {
    if (selectedSupplier) {
      setPhone(selectedSupplier.phone || selectedSupplier.mobile || '');
    }
  }, [selectedSupplier]);

  useEffect(() => {
    const t = setTimeout(() => dateInputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const updateLine = (id: string, patch: Partial<ManualLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? recalcLine({ ...line, ...patch }) : line)));
  };

  const addItemLine = (item: InventoryItem) => {
    const targetLine = lines.find((line) => !line.description.trim());
    const patch: Partial<ManualLine> = {
      description: item.name,
      itemCode: item.code,
      inventoryItemId: item.id,
      qty: 1,
      rate: Number(item.purchasePrice || 0),
      taxPercent: Number(item.gstPercent || 0),
    };

    if (targetLine) {
      updateLine(targetLine.id, patch);
    } else {
      setLines((prev) => [...prev, recalcLine({ ...newLine(), ...patch })]);
    }

    setSearchText('');
  };

  const handleRowNavigation = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const fieldOrder = ['qty', 'rate', 'discount', 'tax'];
    const fieldId = e.currentTarget.id;
    const fieldIndex = fieldOrder.findIndex((f) => fieldId.startsWith(`${f}-`));
    if (fieldIndex === -1 || !['Enter', 'Tab', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;

    const isPrev = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
    const lineIndex = lines.findIndex((line) => line.id === id);
    if (lineIndex === -1) return;

    e.preventDefault();
    const targetFieldIndex = isPrev ? fieldIndex - 1 : fieldIndex + 1;

    if (targetFieldIndex >= 0 && targetFieldIndex < fieldOrder.length) {
      const target = document.getElementById(`${fieldOrder[targetFieldIndex]}-${id}`);
      target?.focus();
      if (target instanceof HTMLInputElement) target.select();
      return;
    }

    const targetLineIndex = isPrev ? lineIndex - 1 : lineIndex + 1;
    if (targetLineIndex < 0) {
      itemSearchInputRef.current?.focus();
      return;
    }

    if (targetLineIndex >= lines.length) {
      const idToFocus = crypto.randomUUID();
      setLines((prev) => [...prev, { ...newLine(), id: idToFocus }]);
      setTimeout(() => document.getElementById(`qty-${idToFocus}`)?.focus(), 0);
      return;
    }

    const targetLineId = lines[targetLineIndex].id;
    const targetField = isPrev ? fieldOrder[fieldOrder.length - 1] : fieldOrder[0];
    const target = document.getElementById(`${targetField}-${targetLineId}`);
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };

  const hasMaterialMasterRecord = (line: ManualLine) => {
    const codeMatch = (line.itemCode || '').trim().toLowerCase();
    const nameMatch = line.description.trim().toLowerCase();
    return medicines.some((m) => {
      const medCode = (m.materialCode || '').trim().toLowerCase();
      const medName = (m.name || '').trim().toLowerCase();
      return (codeMatch && medCode === codeMatch) || (!!nameMatch && medName === nameMatch);
    });
  };

  const validate = async (): Promise<string | null> => {
    if (!currentUser) return 'User context missing.';
    if (!supplierId) return 'Supplier is mandatory.';
    if (!supplierInvoiceNumber.trim()) return 'Supplier invoice number is mandatory.';

    const duplicate = purchases.find((p) => {
      const sameSupplier = (p.supplier || '').trim().toLowerCase() === (selectedSupplier?.name || '').trim().toLowerCase();
      const sameInvoice = (p.invoiceNumber || '').trim().toLowerCase() === supplierInvoiceNumber.trim().toLowerCase();
      return sameSupplier && sameInvoice && p.status !== 'cancelled';
    });
    if (duplicate) return `Supplier invoice number ${supplierInvoiceNumber} already exists for this supplier.`;

    const nonEmptyLines = lines.filter((l) => l.description.trim());
    if (nonEmptyLines.length === 0) return 'At least one item is required.';

    for (const [idx, line] of nonEmptyLines.entries()) {
      if (line.qty <= 0) return `Qty must be greater than 0 (line ${idx + 1}).`;
      if (line.rate < 0) return `Rate must be greater than or equal to 0 (line ${idx + 1}).`;
      const existsInInventory = !!line.inventoryItemId;
      if (!existsInInventory || !hasMaterialMasterRecord(line)) {
        return `Item must exist in Material Master (line ${idx + 1}). Please add/link item in Material Master.`;
      }
    }

    return null;
  };

  const buildPurchase = (status: 'draft' | 'completed'): Purchase => {
    const purchaseId = `${Date.now()}`;
    const purchaseItems: PurchaseItem[] = lines
      .filter((line) => line.description.trim())
      .map((line) => ({
        id: line.id,
        name: line.description,
        brand: '',
        category: 'General',
        batch: 'UNSET',
        expiry: '',
        quantity: line.qty,
        looseQuantity: 0,
        freeQuantity: 0,
        purchasePrice: line.rate,
        mrp: line.rate,
        gstPercent: line.taxPercent,
        hsnCode: '',
        discountPercent: 0,
        schemeDiscountPercent: 0,
        schemeDiscountAmount: 0,
        lineBaseAmount: line.amount,
        taxableValue: round2(line.amount - line.discount),
        gstAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        inventoryItemId: line.inventoryItemId,
      }));

    return {
      id: purchaseId,
      purchaseSerialId: purchaseNo === 'AUTO' ? purchaseId : purchaseNo,
      organization_id: currentUser!.organization_id,
      user_id: currentUser!.user_id,
      supplier: selectedSupplier?.name || '',
      invoiceNumber: supplierInvoiceNumber.trim(),
      date,
      items: purchaseItems,
      totalAmount: metrics.grandTotal,
      subtotal: metrics.subTotal,
      totalGst: metrics.totalGst,
      totalItemDiscount: metrics.totalDiscount,
      totalItemSchemeDiscount: 0,
      schemeDiscount: 0,
      roundOff: metrics.roundOff,
      status,
      referenceDocNumber: grnNumber.trim() || undefined,
    };
  };

  const onSave = async (status: 'draft' | 'completed') => {
    const err = await validate();
    if (err) {
      addNotification(err, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const record = buildPurchase(status);
      await onAddPurchase(record, selectedSupplier?.gst_number || '');
      setPurchaseNo('AUTO');
      setSupplierInvoiceNumber('');
      setGrnNumber('');
      setLines([newLine()]);
      addNotification(status === 'draft' ? 'Manual purchase saved as draft.' : 'Manual purchase posted successfully.', 'success');
      await onSaved();
      itemSearchInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMaterialMaster = async () => {
    const name = newMaterialName.trim();
    if (!name) return addNotification('Material name is required.', 'error');

    await onAddMedicineMaster({
      organization_id: currentUser?.organization_id || '',
      name,
      materialCode: newMaterialCode.trim() || name.toUpperCase().replace(/\s+/g, '-').slice(0, 16),
      gstRate: Number(newMaterialGst || 0),
      is_active: true,
      isPurchaseEnabled: true,
      isSalesEnabled: true,
    });

    setIsAddMasterOpen(false);
    setNewMaterialName('');
    setNewMaterialCode('');
    setNewMaterialGst('');
    addNotification('Material master created. You can now select inventory item for this material.', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-app-bg overflow-hidden" onKeyDown={handleEnterToNextField}>
      <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest">Accounting Voucher Creation (Purchase) – Manual Purchase Entry</span>
        <span className="text-[10px] font-black uppercase text-accent">No. {purchaseNo}</span>
      </div>

      <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden">
        <Card className="p-1.5 bg-white border border-app-border rounded-none grid grid-cols-1 md:grid-cols-5 gap-2 items-end flex-shrink-0">
          <div>
            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Invoice Date</label>
            <input ref={dateInputRef} className="w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none focus:bg-yellow-50" type="date" value={date} onChange={(e) => setDate(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && supplierInputRef.current?.focus()} />
          </div>
          <div>
            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Supplier Invoice Number</label>
            <input className="w-full h-8 border border-gray-400 p-1 text-xs font-bold uppercase outline-none focus:bg-yellow-50" value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">GRN / Reference Number</label>
            <input className="w-full h-8 border border-gray-400 p-1 text-xs font-bold uppercase outline-none focus:bg-yellow-50" value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Supplier / Vendor Name</label>
            <select ref={supplierInputRef} className="w-full h-8 border border-gray-400 p-1 text-xs font-bold uppercase outline-none focus:bg-yellow-50" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && phoneInputRef.current?.focus()}>
              <option value="">Select Supplier *</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Supplier Phone</label>
            <input ref={phoneInputRef} className="w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none focus:bg-yellow-50" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && itemSearchInputRef.current?.focus()} />
          </div>
        </Card>

        <Card className="p-1.5 bg-white border border-app-border rounded-none flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2 relative">
              <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Item Search (Name / Code)</label>
              <input
                ref={itemSearchInputRef}
                className="w-full h-8 border border-gray-400 p-1 text-xs font-bold uppercase outline-none focus:bg-yellow-50"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matchingItems.length > 0) {
                    e.preventDefault();
                    addItemLine(matchingItems[0]);
                  }
                }}
                placeholder="Type item name or code"
              />
              {matchingItems.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto border border-gray-300 bg-white shadow">
                  {matchingItems.map((item) => (
                    <button key={item.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 border-b border-gray-100" onClick={() => addItemLine(item)}>
                      <span className="font-bold">{item.name}</span>
                      <span className="text-gray-500 ml-2">{item.code || 'NO CODE'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end justify-end">
              <button type="button" onClick={() => setIsAddMasterOpen(true)} className="h-8 px-3 bg-primary text-white text-[10px] font-black uppercase tracking-wide">
                Add New Material Master
              </button>
            </div>
          </div>
        </Card>

        <div className="bg-white border border-app-border overflow-auto flex-1">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-100 border-b border-gray-400 z-10">
              <tr className="text-[10px] font-black uppercase text-gray-700 tracking-wide">
                <th className="p-2 border-r border-gray-300 w-10 text-center">#</th>
                <th className="p-2 border-r border-gray-300 text-left">Description</th>
                <th className="p-2 border-r border-gray-300 w-20 text-center">Qty</th>
                <th className="p-2 border-r border-gray-300 w-28 text-right">Rate</th>
                <th className="p-2 border-r border-gray-300 w-28 text-right">Amount</th>
                <th className="p-2 border-r border-gray-300 w-28 text-right">Discount</th>
                <th className="p-2 border-r border-gray-300 w-20 text-center">Tax %</th>
                <th className="p-2 border-r border-gray-300 w-28 text-right">Tax Amt</th>
                <th className="p-2 w-32 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.id} className="border-b border-gray-200 h-10 text-xs font-bold uppercase">
                  <td className="p-2 border-r border-gray-200 text-center text-gray-500">{i + 1}</td>
                  <td className="p-2 border-r border-gray-200">
                    <input className="w-full bg-transparent outline-none" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} placeholder="Item description" />
                  </td>
                  <td className="p-2 border-r border-gray-200">
                    <input id={`qty-${line.id}`} className="w-full text-center bg-transparent outline-none" type="number" min={0} value={line.qty || ''} onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })} onKeyDown={(e) => handleRowNavigation(e, line.id)} />
                  </td>
                  <td className="p-2 border-r border-gray-200">
                    <input id={`rate-${line.id}`} className="w-full text-right bg-transparent outline-none" type="number" min={0} value={line.rate || ''} onChange={(e) => updateLine(line.id, { rate: Number(e.target.value) })} onKeyDown={(e) => handleRowNavigation(e, line.id)} />
                  </td>
                  <td className="p-2 border-r border-gray-200 text-right text-gray-700">{line.amount.toFixed(2)}</td>
                  <td className="p-2 border-r border-gray-200">
                    <input id={`discount-${line.id}`} className="w-full text-right bg-transparent outline-none" type="number" min={0} value={line.discount || ''} onChange={(e) => updateLine(line.id, { discount: Number(e.target.value) })} onKeyDown={(e) => handleRowNavigation(e, line.id)} />
                  </td>
                  <td className="p-2 border-r border-gray-200">
                    <input id={`tax-${line.id}`} className="w-full text-center bg-transparent outline-none" type="number" min={0} value={line.taxPercent || ''} onChange={(e) => updateLine(line.id, { taxPercent: Number(e.target.value) })} onKeyDown={(e) => handleRowNavigation(e, line.id)} />
                  </td>
                  <td className="p-2 border-r border-gray-200 text-right text-gray-700">{line.taxAmount.toFixed(2)}</td>
                  <td className="p-2 text-right font-black text-gray-800">{line.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-100 border border-gray-300 px-3 py-2 text-xs font-bold flex flex-wrap gap-4 justify-end flex-shrink-0">
          <div>Subtotal: <span className="text-gray-800">{metrics.subTotal.toFixed(2)}</span></div>
          <div>Total Discount: <span className="text-gray-800">{metrics.totalDiscount.toFixed(2)}</span></div>
          <div>Total GST: <span className="text-gray-800">{metrics.totalGst.toFixed(2)}</span></div>
          <div>Round Off: <span className="text-gray-800">{metrics.roundOff.toFixed(2)}</span></div>
          <div className="text-primary">Grand Total: {metrics.grandTotal.toFixed(2)}</div>
        </div>

        <div className="flex gap-2 justify-end flex-shrink-0">
          <button disabled={isSubmitting} className="px-4 h-9 border border-gray-400 bg-white text-xs font-bold uppercase disabled:opacity-50" onClick={() => onSave('draft')}>Save Draft</button>
          <button disabled={isSubmitting} className="px-4 h-9 bg-emerald-600 text-white text-xs font-bold uppercase disabled:opacity-50" onClick={() => onSave('completed')}>Post Voucher</button>
        </div>
      </div>

      {isAddMasterOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-full max-w-md bg-white border border-gray-300 p-4 space-y-3">
            <h3 className="text-sm font-black uppercase">Add New Material Master</h3>
            <input className="w-full h-9 border border-gray-300 px-2 text-sm" placeholder="Material Name" value={newMaterialName} onChange={(e) => setNewMaterialName(e.target.value)} />
            <input className="w-full h-9 border border-gray-300 px-2 text-sm" placeholder="Material Code (optional)" value={newMaterialCode} onChange={(e) => setNewMaterialCode(e.target.value)} />
            <input className="w-full h-9 border border-gray-300 px-2 text-sm" placeholder="GST %" type="number" min={0} value={newMaterialGst} onChange={(e) => setNewMaterialGst(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-9 px-3 border border-gray-300 text-xs font-bold uppercase" onClick={() => setIsAddMasterOpen(false)}>Cancel</button>
              <button className="h-9 px-3 bg-primary text-white text-xs font-bold uppercase" onClick={handleAddMaterialMaster}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualPurchase;
