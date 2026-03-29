import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  UserRole,
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
type SearchBy = 'GSTIN' | 'Party Name' | 'EWAY No' | 'Invoice No';

type InvoiceCandidate = {
  sourceId: string;
  invoiceNo: string;
  date: string;
  gstin: string;
  partyName: string;
  partyAddress: string;
  partyState: string;
  partyPlace: string;
  partyPincode: string;
  shipToState: string;
  invoiceAmount: number;
  taxableAmount: number;
  totalTaxAmount: number;
  items: Array<{ hsn: string; productName: string; quantity: number; taxableAmount: number; sgst: number; cgst: number; igst: number; cess: number; }>;
  sourceType: InvoiceType;
  customerId?: string | null;
};

type EWayDraft = {
  subType: EWayBillSubSupplyType;
  docType: EWayBillDocumentType;
  consigneeName: string;
  consigneeGstin: string;
  consigneeAddress: string;
  toState: string;
  shipToState: string;
  toPlace: string;
  toPincode: string;
  transporterName: string;
  transporterGstin: string;
  transportMode: EWayBillTransportMode;
  distance: number;
  transportDocNo: string;
  transportDate: string;
  vehicleNo: string;
  vehicleType: EWayBillVehicleType;
  transactionType: EWayBill['transactionType'];
  exportPath: string;
  lastCheckedOn?: string;
  uploadStatus?: 'Ready' | 'Validated' | 'Generated' | 'Failed';
  uploadError?: string;
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const VEHICLE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{3,4}$/;

const ROLE_PERMISSIONS: Record<UserRole, { view: boolean; generate: boolean; edit: boolean; print: boolean; export: boolean; configureCredentials: boolean }> = {
  owner: { view: true, generate: true, edit: true, print: true, export: true, configureCredentials: true },
  admin: { view: true, generate: true, edit: true, print: true, export: true, configureCredentials: true },
  manager: { view: true, generate: true, edit: true, print: true, export: true, configureCredentials: false },
  purchase: { view: true, generate: true, edit: true, print: true, export: true, configureCredentials: false },
  clerk: { view: true, generate: false, edit: false, print: true, export: false, configureCredentials: false },
  viewer: { view: true, generate: false, edit: false, print: false, export: false, configureCredentials: false },
};

const toDateOnly = (value?: string): string => {
  if (!value) return new Date().toISOString().split('T')[0];
  return value.split('T')[0];
};

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const makeCsvLine = (values: Array<string | number>) => values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');

const downloadBlob = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const permissions = currentUser ? ROLE_PERMISSIONS[currentUser.role] : ROLE_PERMISSIONS.viewer;
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('Sales');
  const [appliedInvoiceType, setAppliedInvoiceType] = useState<InvoiceType>('Sales');
  const [periodFrom, setPeriodFrom] = useState(() => new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from: string; to: string }>({ from: new Date(new Date().setDate(1)).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });
  const [search, setSearch] = useState('');
  const [searchBy, setSearchBy] = useState<SearchBy>('Party Name');
  const [onlyAbove50k, setOnlyAbove50k] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [screen, setScreen] = useState<'selection' | 'details'>('selection');
  const [isEditing, setIsEditing] = useState(true);
  const [showValidationResult, setShowValidationResult] = useState<string[]>([]);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [draftMap, setDraftMap] = useState<Record<string, EWayDraft>>({});
  const [historyMap, setHistoryMap] = useState<Record<string, Array<{ at: string; status: string; message: string }>>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const invoiceRows = useMemo<InvoiceCandidate[]>(() => {
    if (appliedInvoiceType === 'Sales') {
      return transactions.map((tx) => {
        const customer = customers.find((c) => c.id === tx.customerId) || customers.find((c) => c.name === tx.customerName);
        const items = (tx.items || []).map((it) => {
          const taxable = toNumber(it.amount || it.finalAmount);
          const tax = (taxable * toNumber(it.gstPercent)) / 100;
          return { hsn: it.hsnCode || '-', productName: it.name, quantity: toNumber(it.quantity), taxableAmount: taxable, sgst: tax / 2, cgst: tax / 2, igst: 0, cess: 0 };
        });
        return {
          sourceId: tx.id,
          invoiceNo: tx.invoiceNumber || tx.id,
          date: toDateOnly(tx.date),
          gstin: customer?.gstNumber || '',
          partyName: tx.customerName,
          partyAddress: customer?.address || customer?.address_line1 || tx.customerName,
          partyState: customer?.state || '',
          partyPlace: customer?.city || customer?.district || tx.customerName,
          partyPincode: customer?.pincode || '',
          shipToState: customer?.state || '',
          invoiceAmount: toNumber(tx.total),
          taxableAmount: toNumber(tx.subtotal),
          totalTaxAmount: toNumber(tx.totalGst),
          items,
          sourceType: 'Sales',
          customerId: tx.customerId,
        };
      });
    }

    if (appliedInvoiceType === 'Purchase') {
      return purchases.map((p) => {
        const supplier = suppliers.find((s) => s.name === p.supplier);
        const items = (p.items || []).map((it) => {
          const taxable = toNumber(it.taxableValue || it.lineBaseAmount);
          const tax = toNumber(it.gstAmount);
          return { hsn: it.hsnCode || '-', productName: it.name, quantity: toNumber(it.quantity), taxableAmount: taxable, sgst: tax / 2, cgst: tax / 2, igst: 0, cess: 0 };
        });
        return {
          sourceId: p.id,
          invoiceNo: p.invoiceNumber || p.purchaseSerialId,
          date: toDateOnly(p.date),
          gstin: supplier?.gst_number || '',
          partyName: p.supplier,
          partyAddress: supplier?.address || p.supplier,
          partyState: supplier?.state || '',
          partyPlace: supplier?.city || supplier?.district || p.supplier,
          partyPincode: supplier?.pincode || '',
          shipToState: supplier?.state || '',
          invoiceAmount: toNumber(p.totalAmount),
          taxableAmount: toNumber(p.subtotal),
          totalTaxAmount: toNumber(p.totalGst),
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
        partyAddress: customer?.address || customer?.address_line1 || sc.customerName,
        partyState: customer?.state || '',
        partyPlace: customer?.city || customer?.district || sc.customerName,
        partyPincode: customer?.pincode || '',
        shipToState: customer?.state || '',
        invoiceAmount: toNumber(sc.totalAmount),
        taxableAmount: toNumber(sc.subtotal),
        totalTaxAmount: toNumber(sc.totalGst),
        items: (sc.items || []).map((it) => {
          const taxable = toNumber(it.amount || it.finalAmount);
          const tax = (taxable * toNumber(it.gstPercent)) / 100;
          return { hsn: it.hsnCode || '-', productName: it.name, quantity: toNumber(it.quantity), taxableAmount: taxable, sgst: tax / 2, cgst: tax / 2, igst: 0, cess: 0 };
        }),
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
        partyAddress: supplier?.address || dc.supplier,
        partyState: supplier?.state || '',
        partyPlace: supplier?.city || supplier?.district || dc.supplier,
        partyPincode: supplier?.pincode || '',
        shipToState: supplier?.state || '',
        invoiceAmount: toNumber(dc.totalAmount),
        taxableAmount: toNumber(dc.subtotal),
        totalTaxAmount: toNumber(dc.totalGst),
        items: (dc.items || []).map((it) => ({
          hsn: it.hsnCode || '-',
          productName: it.name,
          quantity: toNumber(it.quantity),
          taxableAmount: toNumber(it.taxableValue || it.lineBaseAmount),
          sgst: toNumber(it.gstAmount) / 2,
          cgst: toNumber(it.gstAmount) / 2,
          igst: 0,
          cess: 0,
        })),
        sourceType: 'Challan' as const,
      };
    });

    return [...salesRows, ...purchaseRows];
  }, [appliedInvoiceType, transactions, purchases, salesChallans, deliveryChallans, customers, suppliers]);

  const findLinkedEway = (row: InvoiceCandidate) => ewayBills.find((e) => e.documentNo === row.invoiceNo || e.linkedTransactionId === row.sourceId || e.linkedPurchaseId === row.sourceId);

  const filteredRows = useMemo(() => {
    return invoiceRows.filter((row) => {
      if (row.date < appliedPeriod.from || row.date > appliedPeriod.to) return false;
      if (onlyAbove50k && row.invoiceAmount <= 50000) return false;
      const existing = findLinkedEway(row);
      if (pendingOnly && existing) return false;
      if (!search.trim()) return true;
      const needle = search.toLowerCase();
      if (searchBy === 'GSTIN') return (row.gstin || '').toLowerCase().includes(needle);
      if (searchBy === 'EWAY No') return (existing?.eWayBillNo || '').toLowerCase().includes(needle);
      if (searchBy === 'Invoice No') return row.invoiceNo.toLowerCase().includes(needle);
      return row.partyName.toLowerCase().includes(needle);
    });
  }, [invoiceRows, appliedPeriod, onlyAbove50k, pendingOnly, search, searchBy, ewayBills]);

  const selectedRow = useMemo(() => filteredRows.find((row) => row.sourceId === selectedInvoiceId) || null, [filteredRows, selectedInvoiceId]);

  useEffect(() => {
    if (!selectedRow) return;
    if (!draftMap[selectedRow.sourceId]) {
      const generated = findLinkedEway(selectedRow);
      setDraftMap((prev) => ({
        ...prev,
        [selectedRow.sourceId]: {
          subType: EWayBillSubSupplyType.SALES,
          docType: EWayBillDocumentType.TAX_INVOICE,
          consigneeName: generated?.toTrdName || selectedRow.partyName,
          consigneeGstin: generated?.toGstin || selectedRow.gstin,
          consigneeAddress: generated?.toAddr1 || selectedRow.partyAddress,
          toState: selectedRow.partyState,
          shipToState: selectedRow.shipToState || selectedRow.partyState,
          toPlace: generated?.toPlace || selectedRow.partyPlace,
          toPincode: String(generated?.toPincode || selectedRow.partyPincode || ''),
          transporterName: generated?.transporterName || '',
          transporterGstin: generated?.transporterId || '',
          transportMode: generated?.transportMode || EWayBillTransportMode.ROAD,
          distance: generated?.distance || 0,
          transportDocNo: '',
          transportDate: toDateOnly(generated?.eWayBillDate || new Date().toISOString()),
          vehicleNo: generated?.vehicleNo || '',
          vehicleType: generated?.vehicleType || EWayBillVehicleType.REGULAR,
          transactionType: generated?.transactionType || 'Regular',
          exportPath: '',
          uploadStatus: generated ? 'Generated' : 'Ready',
          lastCheckedOn: undefined,
          uploadError: '',
        },
      }));
      setIsEditing(!generated);
    }
  }, [selectedRow, draftMap, ewayBills]);

  useEffect(() => {
    if (selectedInvoiceId && rowRefs.current[selectedInvoiceId]) {
      rowRefs.current[selectedInvoiceId]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedInvoiceId, filteredRows.length]);

  const selectedDraft = selectedRow ? draftMap[selectedRow.sourceId] : undefined;

  const hsnSummary = useMemo(() => {
    const src = selectedRow?.items || [];
    const summary = new Map<string, { hsn: string; taxableAmount: number; sgst: number; cgst: number; igst: number; cess: number; taxRate: number }>();
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

  const saveDraftPatch = <K extends keyof EWayDraft>(key: K, value: EWayDraft[K]) => {
    if (!selectedRow || !selectedDraft) return;
    setDraftMap((prev) => ({ ...prev, [selectedRow.sourceId]: { ...prev[selectedRow.sourceId], [key]: value } }));
  };

  const appendHistory = (rowId: string, status: string, message: string) => {
    setHistoryMap((prev) => ({
      ...prev,
      [rowId]: [{ at: new Date().toISOString(), status, message }, ...(prev[rowId] || [])].slice(0, 15),
    }));
  };

  const credentials = (configurations as any)?.ewayLoginSetup || {};
  const checkCredentials = (): string[] => {
    const errs: string[] = [];
    if (!credentials?.ewayLoginId || !credentials?.ewayPassword) errs.push('E-Way credentials are not configured. Open E-Way Login Setup.');
    if (credentials?.ewayLoginId && String(credentials.ewayLoginId).length < 4) errs.push('E-Way login ID appears invalid.');
    if (credentials?.ewayPassword && String(credentials.ewayPassword).length < 4) errs.push('E-Way password appears invalid.');
    return errs;
  };

  const runValidation = (): string[] => {
    const errors: string[] = [];
    if (!selectedRow || !selectedDraft) {
      errors.push('Invoice not selected.');
      return errors;
    }
    const existing = findLinkedEway(selectedRow);
    if (existing) errors.push('Duplicate E-Way already exists for this invoice. Use View instead of Generate.');
    if (!selectedRow.invoiceNo) errors.push('Invoice number missing.');
    if (selectedRow.taxableAmount <= 0) errors.push('Taxable amount must be greater than zero.');
    if (!selectedRow.items.length) errors.push('HSN/tax line details are missing.');
    if (!selectedDraft.consigneeName.trim()) errors.push('Consignee name is required.');
    if (!selectedDraft.consigneeAddress.trim()) errors.push('Consignee address is required.');
    if (!selectedDraft.toState.trim()) errors.push('To State is required.');
    if (!selectedDraft.toPlace.trim()) errors.push('To Place is required.');
    if (!selectedDraft.toPincode.trim() || selectedDraft.toPincode.length < 6) errors.push('Valid destination pincode is required.');

    const isRegisteredParty = Boolean(selectedDraft.consigneeGstin.trim());
    if (isRegisteredParty && !GSTIN_REGEX.test(selectedDraft.consigneeGstin.trim().toUpperCase())) {
      errors.push('Consignee GSTIN is invalid.');
    }

    if (!selectedDraft.transporterName.trim()) errors.push('Transporter name is required.');
    if (selectedDraft.transporterGstin && !GSTIN_REGEX.test(selectedDraft.transporterGstin.trim().toUpperCase())) {
      errors.push('Transporter GSTIN/ID is invalid.');
    }
    if (!selectedDraft.transportMode) errors.push('Transport mode is mandatory.');
    if (!selectedDraft.distance || selectedDraft.distance <= 0) errors.push('Distance must be greater than zero.');
    if (selectedDraft.transportMode === EWayBillTransportMode.ROAD) {
      if (!selectedDraft.vehicleNo.trim()) errors.push('Vehicle number missing for Road mode.');
      if (selectedDraft.vehicleNo.trim() && !VEHICLE_REGEX.test(selectedDraft.vehicleNo.trim().replace(/\s+/g, ''))) {
        errors.push('Vehicle number format seems invalid.');
      }
    }

    errors.push(...checkCredentials());
    return errors;
  };

  const applyFilters = () => {
    if (periodFrom > periodTo) {
      addNotification('Period From Date cannot be greater than Period To Date.', 'warning');
      return;
    }
    setAppliedPeriod({ from: periodFrom, to: periodTo });
    setAppliedInvoiceType(invoiceType);
    setSelectedInvoiceId(null);
    addNotification('Filters updated.', 'success');
  };

  const handleCheck = () => {
    if (!selectedRow) {
      addNotification('Select an invoice before checking.', 'warning');
      return;
    }
    const errors = runValidation();
    setShowValidationResult(errors);
    const now = new Date().toISOString();
    saveDraftPatch('lastCheckedOn', now);
    if (errors.length) {
      saveDraftPatch('uploadStatus', 'Failed');
      saveDraftPatch('uploadError', errors.join(' | '));
      appendHistory(selectedRow.sourceId, 'Validation Failed', errors.join(' | '));
      addNotification(`Validation failed: ${errors.join(' | ')}`, 'warning');
      return;
    }
    saveDraftPatch('uploadStatus', 'Validated');
    saveDraftPatch('uploadError', '');
    appendHistory(selectedRow.sourceId, 'Validated', 'Ready for upload');
    addNotification('Validation passed. Ready to generate E-Way Bill.', 'success');
  };

  const simulatePortalUpload = async (draft: EWayDraft) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (draft.transporterGstin && draft.transporterGstin.endsWith('0000')) throw new Error('invalid transporter ID');
    if (!credentials?.ewayLoginId || !credentials?.ewayPassword) throw new Error('credential invalid');
    return {
      eWayBillNo: `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      generatedOn: new Date().toISOString(),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  };

  const handleUpload = async () => {
    if (!permissions.generate) {
      addNotification('You do not have permission to generate E-Way bills.', 'warning');
      return;
    }
    if (!currentUser || !selectedRow || !selectedDraft) return;

    const errors = runValidation();
    setShowValidationResult(errors);
    if (errors.length) {
      const firstFailure = errors[0].toLowerCase();
      const exactReason = firstFailure.includes('gstin')
        ? 'invalid GSTIN'
        : firstFailure.includes('transporter')
          ? 'invalid transporter ID'
          : firstFailure.includes('vehicle')
            ? 'vehicle number missing'
            : firstFailure.includes('distance')
              ? 'distance missing'
              : firstFailure.includes('credential')
                ? 'credential invalid'
                : firstFailure.includes('duplicate')
                  ? 'duplicate EWAY already exists'
                  : 'payload validation failed';
      saveDraftPatch('uploadStatus', 'Failed');
      saveDraftPatch('uploadError', exactReason);
      appendHistory(selectedRow.sourceId, 'Upload Failed', exactReason);
      addNotification(`Cannot generate EWB: ${exactReason}`, 'error');
      return;
    }

    try {
      setInlineLoading(true);
      const portalResult = await simulatePortalUpload(selectedDraft);
      const generated: EWayBill = {
        id: crypto.randomUUID(),
        organization_id: currentUser.organization_id,
        linkedTransactionId: selectedRow.sourceType === 'Sales' ? selectedRow.sourceId : undefined,
        linkedPurchaseId: selectedRow.sourceType === 'Purchase' ? selectedRow.sourceId : undefined,
        eWayBillNo: portalResult.eWayBillNo,
        eWayBillNo_str: portalResult.eWayBillNo,
        eWayBillDate: portalResult.generatedOn,
        validUntil: portalResult.validUntil,
        supplyType: selectedRow.sourceType === 'Purchase' ? EWayBillSupplyType.INWARD : EWayBillSupplyType.OUTWARD,
        subSupplyType: selectedDraft.subType,
        documentType: selectedDraft.docType,
        documentNo: selectedRow.invoiceNo,
        documentDate: selectedRow.date,
        fromGstin: currentUser.gstin || currentUser.retailer_gstin || '',
        fromTrdName: currentUser.pharmacy_name,
        fromAddr1: currentUser.address || '-',
        fromPlace: currentUser.district || currentUser.state || '-',
        fromPincode: Number(currentUser.pincode || 0),
        fromStateCode: 0,
        toGstin: selectedDraft.consigneeGstin,
        toTrdName: selectedDraft.consigneeName,
        toAddr1: selectedDraft.consigneeAddress,
        toAddr2: '',
        toPlace: selectedDraft.toPlace,
        toPincode: Number(selectedDraft.toPincode || 0),
        toStateCode: 0,
        transactionType: selectedDraft.transactionType,
        totalValue: selectedRow.invoiceAmount,
        cgstValue: selectedRow.items.reduce((acc, cur) => acc + cur.cgst, 0),
        sgstValue: selectedRow.items.reduce((acc, cur) => acc + cur.sgst, 0),
        igstValue: selectedRow.items.reduce((acc, cur) => acc + cur.igst, 0),
        cessValue: selectedRow.items.reduce((acc, cur) => acc + cur.cess, 0),
        transportMode: selectedDraft.transportMode,
        transporterName: selectedDraft.transporterName,
        transporterId: selectedDraft.transporterGstin,
        vehicleNo: selectedDraft.vehicleNo || undefined,
        vehicleType: selectedDraft.vehicleType,
        distance: selectedDraft.distance,
        status: EWayBillStatus.GENERATED,
      };

      await onGenerate(generated);
      setDraftMap((prev) => ({
        ...prev,
        [selectedRow.sourceId]: {
          ...prev[selectedRow.sourceId],
          uploadStatus: 'Generated',
          uploadError: '',
        },
      }));
      appendHistory(selectedRow.sourceId, 'Generated', `EWB ${portalResult.eWayBillNo}`);
      setIsEditing(false);
      addNotification(`E-Way Bill generated successfully. EWB No: ${portalResult.eWayBillNo}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'portal login failed';
      saveDraftPatch('uploadStatus', 'Failed');
      saveDraftPatch('uploadError', message);
      appendHistory(selectedRow.sourceId, 'Upload Failed', message);
      addNotification(`Generation failed: ${message}`, 'error');
    } finally {
      setInlineLoading(false);
    }
  };

  const selectedEway = selectedRow ? findLinkedEway(selectedRow) : undefined;

  const calculateDistance = () => {
    if (!selectedDraft || !currentUser) return;
    const fromPin = String(currentUser.pincode || '').slice(0, 3);
    const toPin = selectedDraft.toPincode.slice(0, 3);
    if (!fromPin || !toPin) {
      addNotification('Cannot calculate distance without both source and destination pincodes.', 'warning');
      return;
    }
    const calculated = Math.max(1, Math.abs(Number(fromPin) - Number(toPin)) * 8);
    saveDraftPatch('distance', calculated);
    addNotification(`Distance calculated: ${calculated} KM`, 'success');
  };

  const handleView = () => {
    if (!selectedRow) return;
    const existing = findLinkedEway(selectedRow);
    if (!existing) {
      addNotification('No generated E-Way bill found for this invoice. You can continue editing.', 'warning');
      return;
    }
    setIsEditing(false);
    addNotification(`Viewing E-Way Bill ${existing.eWayBillNo} in read-only mode.`, 'success');
  };

  const handleEdit = () => {
    if (!permissions.edit) {
      addNotification('You do not have permission to edit E-Way details.', 'warning');
      return;
    }
    if (!selectedRow) return;
    const existing = findLinkedEway(selectedRow);
    if (existing && existing.status !== EWayBillStatus.GENERATED) {
      addNotification(`E-Way status is ${existing.status}. Editing is not allowed.`, 'warning');
      return;
    }
    setIsEditing(true);
    addNotification('Edit mode enabled for allowed fields.', 'success');
  };

  const handlePrint = () => {
    if (!permissions.print) {
      addNotification('You do not have permission to print.', 'warning');
      return;
    }
    if (!selectedRow || !selectedDraft) return;
    const existing = findLinkedEway(selectedRow);
    const printWindow = window.open('', '_blank', 'width=980,height=780');
    if (!printWindow) {
      addNotification('Unable to open print preview window.', 'warning');
      return;
    }
    printWindow.document.write(`
      <html><head><title>E-Way Bill</title><style>body{font-family:Arial;padding:16px;}h2{margin:0 0 8px;}table{width:100%;border-collapse:collapse;margin-top:12px;}th,td{border:1px solid #bbb;padding:6px;text-align:left;font-size:12px;} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12px;}</style></head>
      <body>
        <h2>E-Way Bill</h2>
        <div class="grid">
          <div><b>EWAY Bill Number:</b> ${existing?.eWayBillNo || '-'}</div><div><b>Validity Up To:</b> ${existing?.validUntil ? toDateOnly(existing.validUntil) : '-'}</div>
          <div><b>Invoice No:</b> ${selectedRow.invoiceNo}</div><div><b>Date:</b> ${selectedRow.date}</div>
          <div><b>Consignor:</b> ${currentUser?.pharmacy_name || '-'}</div><div><b>Consignee:</b> ${selectedDraft.consigneeName}</div>
          <div><b>Transporter:</b> ${selectedDraft.transporterName || '-'}</div><div><b>Vehicle:</b> ${selectedDraft.vehicleNo || '-'}</div>
          <div><b>Taxable Amount:</b> ${selectedRow.taxableAmount.toFixed(2)}</div><div><b>Total Tax:</b> ${selectedRow.totalTaxAmount.toFixed(2)}</div>
        </div>
        <table><thead><tr><th>HSN</th><th>Product Name</th><th>Qty</th><th>Taxable</th><th>SGST</th><th>CGST</th><th>IGST</th><th>Cess</th></tr></thead>
          <tbody>${selectedRow.items.map((item) => `<tr><td>${item.hsn}</td><td>${item.productName}</td><td>${item.quantity}</td><td>${item.taxableAmount.toFixed(2)}</td><td>${item.sgst.toFixed(2)}</td><td>${item.cgst.toFixed(2)}</td><td>${item.igst.toFixed(2)}</td><td>${item.cess.toFixed(2)}</td></tr>`).join('')}</tbody>
        </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportExcel = () => {
    if (!permissions.export) {
      addNotification('You do not have permission to export.', 'warning');
      return;
    }
    if (!selectedRow || !selectedDraft) return;
    const existing = findLinkedEway(selectedRow);
    const lines = [
      makeCsvLine(['Invoice No', 'Date', 'Party', 'GSTIN', 'Invoice Amount', 'Taxable Amount', 'Total Tax', 'EWAY No', 'Validity', 'Transport Mode', 'Distance', 'Vehicle No']),
      makeCsvLine([selectedRow.invoiceNo, selectedRow.date, selectedDraft.consigneeName, selectedDraft.consigneeGstin, selectedRow.invoiceAmount.toFixed(2), selectedRow.taxableAmount.toFixed(2), selectedRow.totalTaxAmount.toFixed(2), existing?.eWayBillNo || '', existing?.validUntil ? toDateOnly(existing.validUntil) : '', selectedDraft.transportMode, selectedDraft.distance, selectedDraft.vehicleNo]),
      '',
      makeCsvLine(['HSN', 'Product Name', 'Quantity', 'Taxable Amount', 'SGST', 'CGST', 'IGST', 'Cess']),
      ...selectedRow.items.map((item) => makeCsvLine([item.hsn, item.productName, item.quantity, item.taxableAmount.toFixed(2), item.sgst.toFixed(2), item.cgst.toFixed(2), item.igst.toFixed(2), item.cess.toFixed(2)])),
    ];
    const file = `${selectedDraft.exportPath || selectedRow.invoiceNo}_eway.csv`;
    downloadBlob(file, lines.join('\n'), 'text/csv;charset=utf-8');
    addNotification(`Offline Excel export created: ${file}`, 'success');
  };

  const handleExportJson = () => {
    if (!permissions.export) {
      addNotification('You do not have permission to export.', 'warning');
      return;
    }
    if (!selectedRow || !selectedDraft) return;
    const payload = {
      supplyType: selectedRow.sourceType === 'Purchase' ? 'Inward' : 'Outward',
      subSupplyType: selectedDraft.subType,
      documentType: selectedDraft.docType,
      documentNo: selectedRow.invoiceNo,
      documentDate: selectedRow.date,
      fromGstin: currentUser?.gstin || currentUser?.retailer_gstin || '',
      fromTrdName: currentUser?.pharmacy_name || '',
      fromAddr1: currentUser?.address || '',
      fromPlace: currentUser?.district || '',
      fromPincode: Number(currentUser?.pincode || 0),
      toGstin: selectedDraft.consigneeGstin || undefined,
      toTrdName: selectedDraft.consigneeName,
      toAddr1: selectedDraft.consigneeAddress,
      toPlace: selectedDraft.toPlace,
      toPincode: Number(selectedDraft.toPincode || 0),
      transactionType: selectedDraft.transactionType,
      totalValue: selectedRow.invoiceAmount,
      taxableAmount: selectedRow.taxableAmount,
      sgst: selectedRow.items.reduce((a, b) => a + b.sgst, 0),
      cgst: selectedRow.items.reduce((a, b) => a + b.cgst, 0),
      igst: selectedRow.items.reduce((a, b) => a + b.igst, 0),
      cess: selectedRow.items.reduce((a, b) => a + b.cess, 0),
      transporterName: selectedDraft.transporterName,
      transporterId: selectedDraft.transporterGstin || undefined,
      transportMode: selectedDraft.transportMode,
      distance: selectedDraft.distance,
      vehicleNo: selectedDraft.vehicleNo || undefined,
      vehicleType: selectedDraft.vehicleType,
      items: selectedRow.items,
    };
    const file = `${selectedDraft.exportPath || selectedRow.invoiceNo}_eway.json`;
    downloadBlob(file, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    addNotification(`Offline JSON export created: ${file}`, 'success');
  };

  const handleBrowse = () => {
    if (!selectedRow || !selectedDraft) return;
    const value = window.prompt('Enter export file prefix/path label (browser downloads will still use Downloads folder):', selectedDraft.exportPath || selectedRow.invoiceNo);
    if (value === null) return;
    saveDraftPatch('exportPath', value.trim());
    addNotification('Export path label updated.', 'success');
  };

  const handleExit = () => {
    if (isEditing && selectedDraft?.uploadStatus !== 'Generated') {
      const ok = window.confirm('You have unsaved local changes. Exit anyway?');
      if (!ok) return;
    }
    setScreen('selection');
  };

  const canEditFields = isEditing && permissions.edit;

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
              <button className="border border-gray-600 bg-gray-100 px-2 py-1" onClick={() => { setInvoiceType(appliedInvoiceType); setPeriodFrom(appliedPeriod.from); setPeriodTo(appliedPeriod.to); addNotification('Reverted to applied filters.', 'success'); }}>Change</button>
              <button className="border border-blue-700 bg-blue-700 text-white px-2 py-1" onClick={applyFilters}>Submit</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <label className="flex flex-col gap-1 md:col-span-2">Search<input className="border border-gray-400 p-1" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label className="flex flex-col gap-1">Search By
                <select className="border border-gray-400 p-1" value={searchBy} onChange={(e) => setSearchBy(e.target.value as SearchBy)}>
                  <option>GSTIN</option><option>Party Name</option><option>EWAY No</option><option>Invoice No</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onlyAbove50k} onChange={(e) => setOnlyAbove50k(e.target.checked)} />Bill amount &gt; 50,000</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Pending E-Way Bills</label>
            </div>

            <div className="border border-gray-400 overflow-auto max-h-[38vh]">
              <table className="w-full min-w-[980px] text-[10px]">
                <thead className="bg-gray-200 sticky top-0">
                  <tr>{['Select','Invoice No','Date','GSTIN','Party Name','Invoice Amount','Taxable Amount','Total Tax Amount','EWAY Bill No','EWAY Validity'].map((h) => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const linked = findLinkedEway(row);
                    const selected = selectedInvoiceId === row.sourceId;
                    return (
                      <tr ref={(el) => { rowRefs.current[row.sourceId] = el; }} key={row.sourceId} className={`border-t border-gray-300 cursor-pointer ${selected ? 'bg-yellow-100' : 'hover:bg-blue-50'}`} onClick={() => setSelectedInvoiceId(row.sourceId)} onDoubleClick={() => setScreen('details')}>
                        <td className="p-1 border-r border-gray-300"><input type="radio" name="selectedInvoice" checked={selected} onChange={() => setSelectedInvoiceId(row.sourceId)} /></td>
                        <td className="p-1 border-r border-gray-300">{row.invoiceNo}</td>
                        <td className="p-1 border-r border-gray-300">{row.date}</td>
                        <td className="p-1 border-r border-gray-300">{row.gstin || '-'}</td>
                        <td className="p-1 border-r border-gray-300">{row.partyName}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.invoiceAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.taxableAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300 text-right">{row.totalTaxAmount.toFixed(2)}</td>
                        <td className="p-1 border-r border-gray-300">{linked?.eWayBillNo || (pendingOnly ? 'Pending' : '-')}</td>
                        <td className="p-1">{linked?.validUntil ? toDateOnly(linked.validUntil) : '-'}</td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && <tr><td colSpan={10} className="p-2 text-center text-gray-500">No eligible invoices for current filters.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="border border-gray-400 overflow-auto max-h-[22vh]">
              <table className="w-full text-[10px]"><thead className="bg-gray-200"><tr>{['HSN','Tax Rate','Taxable Amount','SGST','CGST','IGST','Cess'].map((h) => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}</tr></thead>
                <tbody>{hsnSummary.map((row) => <tr key={row.hsn} className="border-t border-gray-300"><td className="p-1 border-r">{row.hsn}</td><td className="p-1 border-r text-right">{row.taxRate.toFixed(2)}%</td><td className="p-1 border-r text-right">{row.taxableAmount.toFixed(2)}</td><td className="p-1 border-r text-right">{row.sgst.toFixed(2)}</td><td className="p-1 border-r text-right">{row.cgst.toFixed(2)}</td><td className="p-1 border-r text-right">{row.igst.toFixed(2)}</td><td className="p-1 text-right">{row.cess.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button className="border border-gray-700 bg-gray-100 px-3 py-1 disabled:opacity-50" disabled={!permissions.view} onClick={() => selectedRow ? setScreen('details') : addNotification('Select an invoice first.', 'warning')}>Open E-Way Details</button>
            </div>
          </div>
        )}

        {screen === 'details' && selectedRow && selectedDraft && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <section className="border border-gray-400 p-2">
                <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">A. Consignor Details</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">Sub Type<select disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.subType} onChange={(e) => saveDraftPatch('subType', e.target.value as EWayBillSubSupplyType)}>{Object.values(EWayBillSubSupplyType).map(v => <option key={v}>{v}</option>)}</select></label>
                  <label className="flex flex-col gap-1">Doc Type<select disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.docType} onChange={(e) => saveDraftPatch('docType', e.target.value as EWayBillDocumentType)}>{Object.values(EWayBillDocumentType).map(v => <option key={v}>{v}</option>)}</select></label>
                  <label className="flex flex-col gap-1">Invoice No<input className="border border-gray-400 p-1" value={selectedRow.invoiceNo} readOnly /></label>
                  <label className="flex flex-col gap-1">Bill Date<input className="border border-gray-400 p-1" value={selectedRow.date} readOnly /></label>
                  <div>Consignor Name: {currentUser?.pharmacy_name || '-'}</div><div>GSTIN: {currentUser?.gstin || currentUser?.retailer_gstin || '-'}</div>
                  <div>Address: {currentUser?.address || '-'}</div><div>From State: {currentUser?.state || '-'}</div>
                  <div>From Place: {currentUser?.district || '-'}</div><div>Pincode: {currentUser?.pincode || '-'}</div>
                </div>
              </section>

              <section className="border border-gray-400 p-2">
                <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">B. Consignee Details</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">Name<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.consigneeName} onChange={(e) => saveDraftPatch('consigneeName', e.target.value)} /></label>
                  <label className="flex flex-col gap-1">GSTIN<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.consigneeGstin} onChange={(e) => saveDraftPatch('consigneeGstin', e.target.value.toUpperCase())} /></label>
                  <label className="flex flex-col gap-1 col-span-2">Address<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.consigneeAddress} onChange={(e) => saveDraftPatch('consigneeAddress', e.target.value)} /></label>
                  <label className="flex flex-col gap-1">To State<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.toState} onChange={(e) => saveDraftPatch('toState', e.target.value)} /></label>
                  <label className="flex flex-col gap-1">Ship To State<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.shipToState} onChange={(e) => saveDraftPatch('shipToState', e.target.value)} /></label>
                  <label className="flex flex-col gap-1">To Place<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.toPlace} onChange={(e) => saveDraftPatch('toPlace', e.target.value)} /></label>
                  <label className="flex flex-col gap-1">Pincode<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.toPincode} onChange={(e) => saveDraftPatch('toPincode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
                  <button className="border border-gray-600 bg-gray-100 px-2 py-1 col-span-2" onClick={() => { if (!permissions.edit) { addNotification('Edit permission required.', 'warning'); return; } setIsEditing(true); addNotification('Consignee details can be edited now.', 'success'); }}>Change Consignee Details</button>
                </div>
              </section>
            </div>

            <section className="border border-gray-400 p-2">
              <h3 className="text-[10px] bg-gray-100 p-1 border mb-2">C. Transporter Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">Transporter Name<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.transporterName} onChange={(e) => saveDraftPatch('transporterName', e.target.value)} placeholder="Search / Add New" /></label>
                <label className="flex flex-col gap-1">Transporter GSTIN / ID<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.transporterGstin} onChange={(e) => saveDraftPatch('transporterGstin', e.target.value.toUpperCase())} /></label>
                <label className="flex flex-col gap-1">Transport Mode<select disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.transportMode} onChange={(e) => saveDraftPatch('transportMode', e.target.value as EWayBillTransportMode)}>{Object.values(EWayBillTransportMode).map(v => <option key={v}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1">Distance<input disabled={!canEditFields} type="number" className="border border-gray-400 p-1" value={selectedDraft.distance || ''} onChange={(e) => saveDraftPatch('distance', Number(e.target.value || 0))} /></label>
                <button className="border border-gray-600 bg-gray-100 px-2 py-1" onClick={calculateDistance}>Calculate Distance</button>
                <label className="flex flex-col gap-1">Transport Doc No<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.transportDocNo} onChange={(e) => saveDraftPatch('transportDocNo', e.target.value)} /></label>
                <label className="flex flex-col gap-1">Date<input disabled={!canEditFields} type="date" className="border border-gray-400 p-1" value={selectedDraft.transportDate} onChange={(e) => saveDraftPatch('transportDate', e.target.value)} /></label>
                <label className="flex flex-col gap-1">Vehicle No<input disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.vehicleNo} onChange={(e) => saveDraftPatch('vehicleNo', e.target.value.toUpperCase())} /></label>
                <label className="flex flex-col gap-1">Vehicle Type<select disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.vehicleType} onChange={(e) => saveDraftPatch('vehicleType', e.target.value as EWayBillVehicleType)}>{Object.values(EWayBillVehicleType).map(v => <option key={v}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1">Transaction Type<select disabled={!canEditFields} className="border border-gray-400 p-1" value={selectedDraft.transactionType} onChange={(e) => saveDraftPatch('transactionType', e.target.value as EWayBill['transactionType'])}>{['Regular','Bill To Ship To','Bill From Ship From','Combination Of 2 & 3'].map(v => <option key={v}>{v}</option>)}</select></label>
              </div>
            </section>

            <section className="border border-gray-400 p-2 space-y-2">
              <h3 className="text-[10px] bg-gray-100 p-1 border">D. E-Way Bill Data Section</h3>
              <div className="grid grid-cols-4 gap-2 text-[10px] border border-gray-300 p-2 bg-gray-50">
                <div>Invoice No: {selectedRow.invoiceNo}</div><div>Date: {selectedRow.date}</div><div>Taxable Amount: {selectedRow.taxableAmount.toFixed(2)}</div><div>EWAY Number: {selectedEway?.eWayBillNo || '-'}</div>
                <div>SGST: {selectedRow.items.reduce((acc, cur) => acc + cur.sgst, 0).toFixed(2)}</div><div>CGST: {selectedRow.items.reduce((acc, cur) => acc + cur.cgst, 0).toFixed(2)}</div><div>IGST: {selectedRow.items.reduce((acc, cur) => acc + cur.igst, 0).toFixed(2)}</div><div>Cess: {selectedRow.items.reduce((acc, cur) => acc + cur.cess, 0).toFixed(2)}</div>
              </div>
              <div className="border border-gray-400 overflow-auto max-h-[22vh]"><table className="w-full text-[10px]"><thead className="bg-gray-200"><tr>{['HSN','Product Name','Quantity','Taxable Amount','SGST','CGST','IGST','Cess'].map(h => <th key={h} className="p-1 border-r border-gray-400 text-left">{h}</th>)}</tr></thead>
                <tbody>{selectedRow.items.map((item, idx) => <tr key={`${item.hsn}-${idx}`} className="border-t border-gray-300"><td className="p-1 border-r">{item.hsn}</td><td className="p-1 border-r">{item.productName}</td><td className="p-1 border-r text-right">{item.quantity}</td><td className="p-1 border-r text-right">{item.taxableAmount.toFixed(2)}</td><td className="p-1 border-r text-right">{item.sgst.toFixed(2)}</td><td className="p-1 border-r text-right">{item.cgst.toFixed(2)}</td><td className="p-1 border-r text-right">{item.igst.toFixed(2)}</td><td className="p-1 text-right">{item.cess.toFixed(2)}</td></tr>)}</tbody>
              </table></div>
            </section>

            <section className="border border-gray-300 p-2 bg-gray-50 text-[10px]">
              <div>Status: {selectedDraft.uploadStatus || 'Ready'} | Last Checked: {selectedDraft.lastCheckedOn ? toDateOnly(selectedDraft.lastCheckedOn) : '-'}</div>
              {selectedDraft.uploadError && <div className="text-red-600">Last Error: {selectedDraft.uploadError}</div>}
              {showValidationResult.length > 0 && (
                <ul className="list-disc list-inside text-red-700 mt-1">{showValidationResult.map((issue, idx) => <li key={`${issue}-${idx}`}>{issue}</li>)}</ul>
              )}
              {(historyMap[selectedRow.sourceId] || []).length > 0 && (
                <div className="mt-2">History: {(historyMap[selectedRow.sourceId] || []).map((h, idx) => <span key={`${h.at}-${idx}`} className="mr-2">[{toDateOnly(h.at)} - {h.status}]</span>)}</div>
              )}
            </section>

            <div className="flex flex-wrap gap-2 justify-end">
              <button disabled={!permissions.generate || inlineLoading} className="border border-blue-700 bg-blue-700 text-white px-3 py-1 disabled:opacity-50" onClick={handleUpload}>{inlineLoading ? 'Uploading...' : 'Upload (Generate EWB)'}</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1 disabled:opacity-50" disabled={!permissions.export} onClick={handleExportExcel}>Offline Excel</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1 disabled:opacity-50" disabled={!permissions.export} onClick={handleExportJson}>Offline JSON</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={handleView}>View</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1 disabled:opacity-50" disabled={!permissions.edit} onClick={handleEdit}>Edit</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1 disabled:opacity-50" disabled={!permissions.print} onClick={handlePrint}>Print</button>
              <button className="border border-amber-700 bg-amber-500 text-white px-3 py-1" onClick={handleCheck}>Check</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={handleExit}>Exit</button>
              <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={handleBrowse}>Browse</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EWayBilling;
