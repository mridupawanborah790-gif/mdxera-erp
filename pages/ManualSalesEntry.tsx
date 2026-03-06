import React, { useEffect, useMemo, useState } from 'react';
import { Customer, RegisteredPharmacy, Transaction } from '../types';
import { supabase } from '../services/supabaseClient';
import * as storage from '../services/storageService';

interface ManualSalesEntryProps {
  currentUser: RegisteredPharmacy | null;
  customers: Customer[];
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
  onSaved: () => Promise<void>;
}

type GlOption = { id: string; label: string };

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

const ManualSalesEntry: React.FC<ManualSalesEntryProps> = ({ currentUser, customers, addNotification, onSaved }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<ManualLine[]>([newLine()]);
  const [salesGlId, setSalesGlId] = useState('');
  const [discountGlId, setDiscountGlId] = useState('');
  const [taxGlId, setTaxGlId] = useState('');
  const [customerControlGlId, setCustomerControlGlId] = useState('');
  const [salesOptions, setSalesOptions] = useState<GlOption[]>([]);
  const [taxOptions, setTaxOptions] = useState<GlOption[]>([]);
  const [expenseOptions, setExpenseOptions] = useState<GlOption[]>([]);

  const metrics = useMemo(() => {
    const subTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    const totalDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));
    const taxableValue = round2(subTotal - totalDiscount);
    const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const grandTotal = round2(taxableValue + tax);
    return { subTotal, totalDiscount, taxableValue, tax, grandTotal };
  }, [lines]);

  useEffect(() => {
    const loadSetup = async () => {
      if (!currentUser) return;
      const ctx = await (await import('../services/companyDefaultsService')).loadDefaultPostingContext(currentUser.organization_id);
      const setOfBooksId = ctx.setOfBooksId;
      const [{ data: glRows }, { data: assignments }, { data: books }] = await Promise.all([
        supabase.from('gl_master').select('id, gl_code, gl_name, gl_type, posting_allowed, set_of_books_id').eq('organization_id', currentUser.organization_id).eq('set_of_books_id', setOfBooksId),
        supabase.from('gl_assignments').select('sales_gl, discount_gl, tax_gl').eq('organization_id', currentUser.organization_id).eq('set_of_books_id', setOfBooksId),
        supabase.from('set_of_books').select('default_customer_gl_id').eq('organization_id', currentUser.organization_id).eq('id', setOfBooksId).single(),
      ]);

      const allowedGlIds = new Set((assignments || []).flatMap((a: any) => [a.sales_gl, a.discount_gl, a.tax_gl].filter(Boolean).map(String)));
      const inBookRows = (glRows || []).filter((g: any) => g.set_of_books_id === setOfBooksId);
      const sales = inBookRows
        .filter((g: any) => g.gl_type === 'Income' && g.posting_allowed && (allowedGlIds.size === 0 || allowedGlIds.has(String(g.id))))
        .map((g: any) => ({ id: String(g.id), label: `${g.gl_code} - ${g.gl_name}` }));
      const taxs = inBookRows.filter((g: any) => /tax|gst/i.test(`${g.gl_code} ${g.gl_name}`)).map((g: any) => ({ id: String(g.id), label: `${g.gl_code} - ${g.gl_name}` }));
      const expenses = inBookRows.filter((g: any) => g.gl_type === 'Expense').map((g: any) => ({ id: String(g.id), label: `${g.gl_code} - ${g.gl_name}` }));

      setSalesOptions(sales);
      setTaxOptions(taxs);
      setExpenseOptions(expenses);
      setSalesGlId(sales[0]?.id || '');
      setDiscountGlId(expenses.find((g) => /discount/i.test(g.label))?.id || expenses[0]?.id || '');
      setTaxGlId(taxs.find((g) => /output|gst/i.test(g.label))?.id || taxs[0]?.id || '');
      setCustomerControlGlId(String((books as any)?.default_customer_gl_id || ''));

    };

    loadSetup().catch((e) => addNotification(e?.message || 'Unable to load GL setup', 'error'));
  }, [addNotification, currentUser]);

  const updateLine = (id: string, patch: Partial<ManualLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? recalcLine({ ...line, ...patch }) : line)));
  };


  const ensureVoucherNumber = async (): Promise<string> => {
    if (voucherNo) return voucherNo;
    if (!currentUser) throw new Error('User context missing.');
    const reservation = await storage.reserveVoucherNumber('sales-gst', currentUser);
    setVoucherNo(reservation.documentNumber);
    return reservation.documentNumber;
  };

  const validate = async (): Promise<string | null> => {
    if (!currentUser) return 'User context missing.';
    if (!salesGlId) return 'Sales GL is mandatory.';
    for (const [idx, line] of lines.entries()) {
      if (!line.description.trim()) return `Description is mandatory for line ${idx + 1}.`;
      if (line.qty < 0 || line.rate < 0) return `Qty and Rate must be ≥ 0 (line ${idx + 1}).`;
    }
    if (voucherNo) {
      const { data: duplicate } = await supabase
        .from('sales_bill')
        .select('id')
        .eq('organization_id', currentUser.organization_id)
        .eq('id', voucherNo)
        .maybeSingle();
      if (duplicate?.id) return `Voucher number ${voucherNo} already exists.`;
    }
    return null;
  };

  const buildTransaction = (status: 'draft' | 'completed', docNumber: string): Transaction => {
    const selectedCustomer = customers.find((c) => c.id === customerId);
    return {
      id: docNumber,
      organization_id: currentUser!.organization_id,
      user_id: currentUser!.user_id,
      date,
      customerName: selectedCustomer?.name || 'Walking Customer',
      customerId: selectedCustomer?.id || null,
      customerPhone: phone || selectedCustomer?.phone || '',
      referredBy: narration,
      items: lines.map((line) => ({
        id: line.id,
        inventoryItemId: '',
        name: line.description,
        mrp: line.rate,
        quantity: line.qty,
        unit: 'pack',
        gstPercent: line.taxPercent,
        discountPercent: 0,
        itemFlatDiscount: line.discount,
        amount: line.amount,
        finalAmount: line.lineTotal,
        rate: line.rate,
        taxableValue: round2(line.amount - line.discount),
        gstAmount: line.taxAmount,
      } as any)),
      total: metrics.grandTotal,
      itemCount: lines.length,
      status,
      paymentMode,
      billType: 'regular',
      subtotal: metrics.subTotal,
      totalItemDiscount: metrics.totalDiscount,
      totalGst: metrics.tax,
      schemeDiscount: 0,
      roundOff: 0,
      amountReceived: ['Cash', 'Card', 'UPI'].includes(paymentMode) ? metrics.grandTotal : 0,
      createdAt: new Date().toISOString(),
    };
  };

  const onSaveDraft = async () => {
    const err = await validate();
    if (err) return addNotification(err, 'error');
    const docNumber = await ensureVoucherNumber();
    await storage.saveData('sales_bill', buildTransaction('draft', docNumber), currentUser);
    setVoucherNo('');
    addNotification('Manual sales voucher saved as draft.', 'success');
    await onSaved();
  };

  const onPost = async () => {
    const err = await validate();
    if (err) return addNotification(err, 'error');

    const docNumber = await ensureVoucherNumber();
    await storage.saveData('sales_bill', buildTransaction('draft', docNumber), currentUser);
    try {
      await storage.postManualSalesVoucher({
        voucherId: docNumber,
        voucherDate: date,
        paymentMode,
        grandTotal: metrics.grandTotal,
        taxableValue: metrics.taxableValue,
        taxAmount: metrics.tax,
        discountAmount: metrics.totalDiscount,
        salesGlId,
        taxGlId,
        discountGlId,
        customerControlGlId,
        narration,
      }, currentUser!);
      setVoucherNo('');
      addNotification('Manual sales voucher posted successfully.', 'success');
      await onSaved();
    } catch (e: any) {
      addNotification(e?.message || 'Posting failed', 'error');
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <input className="border p-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="border p-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walking Customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="border p-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="border p-2 bg-gray-100" value={voucherNo || 'Auto (generated on save/post)'} readOnly />
        <select className="border p-2" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
          {['Cash', 'Card', 'UPI', 'Credit'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className="border p-2" placeholder="Narration / Remarks" value={narration} onChange={(e) => setNarration(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 p-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left border-b"><th>Sl</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Discount</th><th>Tax %</th><th>Tax Amt</th><th>Line Total</th></tr></thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.id} className="border-b">
                <td>{i + 1}</td>
                <td><input className="border p-1 w-64" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} /></td>
                <td><input className="border p-1 w-20" type="number" min={0} value={line.qty} onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })} /></td>
                <td><input className="border p-1 w-24" type="number" min={0} value={line.rate} onChange={(e) => updateLine(line.id, { rate: Number(e.target.value) })} /></td>
                <td>{line.amount.toFixed(2)}</td>
                <td><input className="border p-1 w-24" type="number" min={0} value={line.discount} onChange={(e) => updateLine(line.id, { discount: Number(e.target.value) })} /></td>
                <td><input className="border p-1 w-20" type="number" min={0} value={line.taxPercent} onChange={(e) => updateLine(line.id, { taxPercent: Number(e.target.value) })} /></td>
                <td>{line.taxAmount.toFixed(2)}</td>
                <td>{line.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="mt-3 px-3 py-1 border" onClick={() => setLines((prev) => [...prev, newLine()])}>+ Add Line</button>
      </div>

      <div className="bg-white border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <select className="border p-2" value={salesGlId} onChange={(e) => setSalesGlId(e.target.value)}>
          <option value="">Select Sales GL *</option>
          {salesOptions.map((gl) => <option key={gl.id} value={gl.id}>{gl.label}</option>)}
        </select>
        <select className="border p-2" value={discountGlId} onChange={(e) => setDiscountGlId(e.target.value)}>
          <option value="">Discount GL (optional)</option>
          {expenseOptions.map((gl) => <option key={gl.id} value={gl.id}>{gl.label}</option>)}
        </select>
        <select className="border p-2" value={taxGlId} onChange={(e) => setTaxGlId(e.target.value)}>
          <option value="">Tax Output GL (optional)</option>
          {taxOptions.map((gl) => <option key={gl.id} value={gl.id}>{gl.label}</option>)}
        </select>
        <input className="border p-2 bg-gray-100" value={customerControlGlId} readOnly placeholder="Customer/Receivable GL" />
      </div>

      <div className="bg-gray-50 border p-4 text-sm flex flex-wrap gap-6">
        <div>Sub Total: <b>{metrics.subTotal.toFixed(2)}</b></div>
        <div>Total Discount: <b>{metrics.totalDiscount.toFixed(2)}</b></div>
        <div>Taxable Value: <b>{metrics.taxableValue.toFixed(2)}</b></div>
        <div>Tax: <b>{metrics.tax.toFixed(2)}</b></div>
        <div>Grand Total: <b>{metrics.grandTotal.toFixed(2)}</b></div>
      </div>

      <div className="flex gap-3">
        <button className="px-4 py-2 border" onClick={onSaveDraft}>Save Draft</button>
        <button className="px-4 py-2 bg-emerald-600 text-white" onClick={onPost}>Post</button>
      </div>
    </div>
  );
};

export default ManualSalesEntry;
