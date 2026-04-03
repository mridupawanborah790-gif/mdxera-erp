import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { RegisteredPharmacy } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';
declare const XLSX: any;

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any[];
  headers: string[];
  filters: any;
  pharmacyDetails: RegisteredPharmacy | null;
}

const ColumnsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>
);

const round2 = (value: number) => Number((Number(value || 0)).toFixed(2));
type FieldType = 'text' | 'number' | 'date' | 'status';
type StructuredFilter = {
  values?: string[];
  min?: string;
  max?: string;
  startDate?: string;
  endDate?: string;
};

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const normalizeDateValue = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate()).getTime();
  }

  const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]) - 1;
    const year = Number(ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3]);
    const normalized = new Date(year, month, day);
    if (!Number.isNaN(normalized.getTime())) {
      return new Date(normalized.getFullYear(), normalized.getMonth(), normalized.getDate()).getTime();
    }
  }

  return null;
};

const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  data,
  headers,
  filters: initialFilters,
  pharmacyDetails,
}) => {
  const isDoctorWiseSalesReport = title === 'Doctor-wise Sales Report';
  const doctorSummaryHeaders = headers;
  const doctorItemHeaders = [
    'Doctor Name',
    'Doctor Code',
    'Bill No',
    'Bill Date',
    'Customer Name',
    'Item Name',
    'Batch',
    'Expiry',
    'Pack',
    'Qty',
    'Free Qty',
    'Rate',
    'Discount',
    'GST %',
    'GST Amount',
    'Line Amount (Net)',
  ];
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [activeFilters, setActiveFilters] = useState<{
    columnFilters: Record<string, string>;
    structuredFilters: Record<string, StructuredFilter>;
  }>({
    columnFilters: {},
    structuredFilters: {},
  });
  const [visibleHeaders, setVisibleHeaders] = useState<string[]>([]);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [selectedFilterFields, setSelectedFilterFields] = useState<string[]>([]);
  const [draftStructuredFilters, setDraftStructuredFilters] = useState<Record<string, StructuredFilter>>({});
  const [doctorViewMode, setDoctorViewMode] = useState<'summary' | 'item'>('summary');
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const effectiveHeaders = isDoctorWiseSalesReport && doctorViewMode === 'item' ? doctorItemHeaders : doctorSummaryHeaders;

  useEffect(() => {
    if (isOpen) {
      setSortConfig(null);
      setActiveFilters({ columnFilters: {}, structuredFilters: {} });
      setDoctorViewMode('summary');
      setVisibleHeaders(doctorSummaryHeaders); 
      setIsFilterPanelOpen(false);
      setSelectedFilterFields([]);
      setDraftStructuredFilters({});
    }
  }, [isOpen, doctorSummaryHeaders]);

  useEffect(() => {
    setSortConfig(null);
    setActiveFilters({ columnFilters: {}, structuredFilters: {} });
    setVisibleHeaders(effectiveHeaders);
    setIsFilterPanelOpen(false);
    setSelectedFilterFields([]);
    setDraftStructuredFilters({});
  }, [effectiveHeaders]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setIsFilterPanelOpen(false);
      }
    };
    if (isColumnDropdownOpen || isFilterPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColumnDropdownOpen, isFilterPanelOpen]);

  const doctorItemData = useMemo(() => {
    if (!isDoctorWiseSalesReport || doctorViewMode !== 'item') return [];

    const sourceRows = Array.isArray(initialFilters?.doctorWiseItemSource) ? initialFilters.doctorWiseItemSource : [];
    const groupedByDoctor = new Map<string, {
      doctorName: string;
      doctorCode: string;
      rows: any[];
      totals: { qty: number; sales: number; discount: number; gst: number };
    }>();
    let grandQty = 0;
    let grandSales = 0;
    let grandDiscount = 0;
    let grandGst = 0;

    sourceRows.forEach((tx: any) => {
      const doctorName = String(tx.doctorName || '').trim();
      if (!doctorName) return;
      const doctorKey = `${doctorName.toLowerCase()}|${String(tx.doctorCode || '').toLowerCase()}`;
      const doctorGroup = groupedByDoctor.get(doctorKey) || {
        doctorName,
        doctorCode: tx.doctorCode || 'N/A',
        rows: [] as any[],
        totals: { qty: 0, sales: 0, discount: 0, gst: 0 },
      };

      (tx.items || []).forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        const freeQty = Number(item.freeQuantity || 0);
        const rate = Number(item.rate ?? item.mrp ?? 0);
        const tradeDiscount = Number(item.itemFlatDiscount || 0) + (qty * rate * (Number(item.discountPercent || 0) / 100));
        const discount = tradeDiscount + Number(item.schemeDiscountAmount || 0);
        const taxable = (qty * rate) - discount;
        const gstPercent = Number(item.gstPercent || 0);
        const gstAmount = taxable * (gstPercent / 100);
        const lineNet = taxable + gstAmount;

        doctorGroup.rows.push({
          'Doctor Name': doctorGroup.doctorName,
          'Doctor Code': doctorGroup.doctorCode,
          'Bill No': tx.invoiceNumber || tx.id,
          'Bill Date': new Date(tx.date).toLocaleDateString('en-GB'),
          'Customer Name': tx.customerName || 'N/A',
          'Item Name': item.name || 'N/A',
          'Batch': item.batch || 'N/A',
          'Expiry': item.expiry ? new Date(item.expiry).toLocaleDateString('en-GB') : 'N/A',
          'Pack': item.packType || item.packUnit || item.unitOfMeasurement || 'N/A',
          'Qty': round2(qty),
          'Free Qty': round2(freeQty),
          'Rate': round2(rate),
          'Discount': round2(discount),
          'GST %': round2(gstPercent),
          'GST Amount': round2(gstAmount),
          'Line Amount (Net)': round2(lineNet),
          _rowType: 'item',
        });

        doctorGroup.totals.qty += qty;
        doctorGroup.totals.sales += lineNet;
        doctorGroup.totals.discount += discount;
        doctorGroup.totals.gst += gstAmount;
      });

      groupedByDoctor.set(doctorKey, doctorGroup);
    });

    const rows: any[] = [];
    Array.from(groupedByDoctor.values())
      .sort((a, b) => a.doctorName.localeCompare(b.doctorName))
      .forEach(group => {
        rows.push(...group.rows);
        rows.push({
          'Doctor Name': group.doctorName,
          'Doctor Code': group.doctorCode,
          'Bill No': '',
          'Bill Date': '',
          'Customer Name': '',
          'Item Name': 'DOCTOR SUBTOTAL',
          'Batch': '',
          'Expiry': '',
          'Pack': '',
          'Qty': round2(group.totals.qty),
          'Free Qty': 0,
          'Rate': 0,
          'Discount': round2(group.totals.discount),
          'GST %': 0,
          'GST Amount': round2(group.totals.gst),
          'Line Amount (Net)': round2(group.totals.sales),
          _rowType: 'subtotal',
        });
        grandQty += group.totals.qty;
        grandSales += group.totals.sales;
        grandDiscount += group.totals.discount;
        grandGst += group.totals.gst;
      });

    if (rows.length > 0) {
      rows.push({
        'Doctor Name': 'GRAND TOTAL',
        'Doctor Code': '',
        'Bill No': '',
        'Bill Date': '',
        'Customer Name': '',
        'Item Name': '',
        'Batch': '',
        'Expiry': '',
        'Pack': '',
        'Qty': round2(grandQty),
        'Free Qty': 0,
        'Rate': 0,
        'Discount': round2(grandDiscount),
        'GST %': 0,
        'GST Amount': round2(grandGst),
        'Line Amount (Net)': round2(grandSales),
        _rowType: 'grand',
      });
    }

    return rows;
  }, [doctorViewMode, initialFilters, isDoctorWiseSalesReport]);

  const baseData = useMemo(() => {
    return isDoctorWiseSalesReport && doctorViewMode === 'item' ? doctorItemData : data;
  }, [data, doctorItemData, doctorViewMode, isDoctorWiseSalesReport]);

  const filteredData = useMemo(() => {
    if (!baseData) return [];

    return baseData.filter(row => {
      const columnMatch = Object.entries(activeFilters.columnFilters).every(([key, value]) => {
        if (!value) return true;
        return normalizeText(row[key]).includes(normalizeText(value));
      });
      if (!columnMatch) return false;

      return Object.entries(activeFilters.structuredFilters).every(([header, filter]) => {
        const rawValue = row[header];
        const normalizedCellText = normalizeText(rawValue);
        const values = (filter.values || []).map(v => String(v));

        if (values.length > 0) {
          const hasMatch = values.some(selectedValue => {
            const normalizedSelected = normalizeText(selectedValue);
            const selectedAsDate = normalizeDateValue(selectedValue);
            const cellAsDate = normalizeDateValue(rawValue);
            const selectedAsNumber = Number(selectedValue);
            const cellAsNumber = Number(rawValue);

            if (selectedAsDate !== null && cellAsDate !== null) {
              return cellAsDate === selectedAsDate;
            }
            if (!Number.isNaN(selectedAsNumber) && !Number.isNaN(cellAsNumber)) {
              return cellAsNumber === selectedAsNumber;
            }
            return normalizedCellText.includes(normalizedSelected);
          });

          if (!hasMatch) return false;
        }

        const min = filter.min !== '' && filter.min !== undefined ? Number(filter.min) : undefined;
        const max = filter.max !== '' && filter.max !== undefined ? Number(filter.max) : undefined;
        if (min !== undefined || max !== undefined) {
          const n = Number(rawValue);
          if (Number.isNaN(n)) return false;
          if (min !== undefined && n < min) return false;
          if (max !== undefined && n > max) return false;
        }

        const startDate = normalizeDateValue(filter.startDate);
        const endDate = normalizeDateValue(filter.endDate);
        if (startDate !== null || endDate !== null) {
          const rowDate = normalizeDateValue(rawValue);
          if (rowDate === null) return false;
          if (startDate !== null && rowDate < startDate) return false;
          if (endDate !== null && rowDate > endDate) return false;
        }

        return true;
      });
    });
  }, [activeFilters.columnFilters, activeFilters.structuredFilters, baseData]);

  const processedData = useMemo(() => {
    const workingData = [...filteredData];
    if (sortConfig !== null) {
      workingData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }

        const strA = String(aValue ?? '').toLowerCase();
        const strB = String(bValue ?? '').toLowerCase();

        if (strA < strB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (strA > strB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return workingData;
  }, [filteredData, sortConfig]);

  const fieldMetadata = useMemo(() => {
    return effectiveHeaders.reduce((acc, header) => {
      const values = baseData
        .map(row => row?.[header])
        .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      const uniqueValues = Array.from(new Set(values.map(v => String(v))));
      const numericCount = values.filter(v => !Number.isNaN(Number(v))).length;
      const dateCount = values.filter(v => normalizeDateValue(v) !== null).length;
      const isStatus = /status/i.test(header) || (uniqueValues.length > 0 && uniqueValues.length <= 6);
      let fieldType: FieldType = 'text';
      if (values.length > 0 && numericCount === values.length) fieldType = 'number';
      else if (/date/i.test(header) || (values.length > 0 && dateCount / values.length > 0.8)) fieldType = 'date';
      else if (isStatus) fieldType = 'status';
      acc[header] = { fieldType, options: uniqueValues.sort((a, b) => a.localeCompare(b)).slice(0, 200) };
      return acc;
    }, {} as Record<string, { fieldType: FieldType; options: string[] }>);
  }, [baseData, effectiveHeaders]);

  const columnTotals = useMemo(() => {
    if (!processedData || processedData.length === 0) {
        return {};
    }
    const totals: { [key: string]: number } = {};
    visibleHeaders.forEach(header => {
        const firstValidValue = processedData.find(row => row[header] != null)?.[header];
        if (typeof firstValidValue === 'number') {
            const sum = processedData.reduce((acc, row) => acc + (Number(row[header]) || 0), 0);
            totals[header] = sum;
        }
    });
    return totals;
  }, [processedData, visibleHeaders]);

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (header: string, value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      columnFilters: {
        ...prev.columnFilters,
        [header]: value,
      },
    }));
  };

  const toggleHeaderVisibility = (header: string) => {
    setVisibleHeaders(prev => 
      prev.includes(header) ? prev.filter(h => h !== header) : [...prev, header]
    );
  };

  if (!isOpen || !pharmacyDetails) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded.');
      return;
    }
    const rows = processedData.map(row => {
      const mapped: Record<string, any> = {};
      visibleHeaders.forEach(header => {
        mapped[header] = row[header];
      });
      return mapped;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
    XLSX.writeFile(wb, `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadCsv = () => {
    if (processedData.length === 0) {
        alert("No data to download.");
        return;
    }

    const filterString = [
        initialFilters.startDate && `From: ${initialFilters.startDate}`,
        initialFilters.endDate && `To: ${initialFilters.endDate}`,
        initialFilters.invoiceIdFilter && `ID Filter: "${initialFilters.invoiceIdFilter}"`,
    ].filter(Boolean).join(' | ');

    // 1. Build Metadata Header
    const metaRows = [
        arrayToCsvRow([pharmacyDetails.pharmacy_name]),
        arrayToCsvRow([pharmacyDetails.address]),
        arrayToCsvRow([`GST: ${pharmacyDetails.gstin}`, `DL: ${pharmacyDetails.drug_license}`]),
        arrayToCsvRow(['']), // Spacer
        arrayToCsvRow(['REPORT TITLE:', title]),
        arrayToCsvRow(['GENERATED ON:', new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })]),
        arrayToCsvRow(['FILTERS APPLIED:', filterString || 'None']),
        arrayToCsvRow(['']), // Spacer
    ];

    // 2. Build Table Data
    const tableHeaderRow = arrayToCsvRow(visibleHeaders);
    const dataRows = processedData.map(row => arrayToCsvRow(visibleHeaders.map(header => {
        const value = row[header];
        if (typeof value === 'number') return value.toFixed(2);
        return value;
    })));

    // 3. Build Totals Row
    const includeGenericTotals = !(isDoctorWiseSalesReport && doctorViewMode === 'item');
    const totalsRowArr = includeGenericTotals
      ? visibleHeaders.map((header, index) => {
          if (index === 0) return 'TOTALS';
          const total = columnTotals[header];
          return total !== undefined ? total.toFixed(2) : '';
        })
      : [];

    // Combine everything
    const csvContent = [
        ...metaRows,
        tableHeaderRow,
        ...dataRows,
        ...(includeGenericTotals ? [arrayToCsvRow(['']), arrayToCsvRow(totalsRowArr)] : [])
    ].join('\n');
    
    const formattedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloadCsv(csvContent, `${formattedTitle}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const appliedFilters = [
    initialFilters.startDate && `From: ${initialFilters.startDate}`,
    initialFilters.endDate && `To: ${initialFilters.endDate}`,
    initialFilters.invoiceIdFilter && `ID Filter: "${initialFilters.invoiceIdFilter}"`,
  ].filter(Boolean).join(' | ');
  const emptyMessage = initialFilters?.emptyMessage || 'No data found for selected date range';
  const activeFilterChips = [
    ...Object.entries(activeFilters.columnFilters)
      .filter(([, value]) => normalizeText(value))
      .map(([header, value]) => `${header} contains "${String(value).trim()}"`),
    ...Object.entries(activeFilters.structuredFilters).flatMap(([header, filter]) => {
    const chips: string[] = [];
    (filter.values || []).forEach(v => chips.push(`${header}: ${v}`));
    if (filter.min) chips.push(`${header} ≥ ${filter.min}`);
    if (filter.max) chips.push(`${header} ≤ ${filter.max}`);
    if (filter.startDate) chips.push(`${header} from ${filter.startDate}`);
    if (filter.endDate) chips.push(`${header} to ${filter.endDate}`);
    return chips;
  })];

  return (
    <div id="print-report-modal-container" className="fixed inset-0 bg-white z-[100] flex flex-col animate-in fade-in duration-200 text-xs">
      <style>{`
        @media print {
            @page { 
              margin: 0.3cm; 
              size: auto;
            }
            body { margin: 0; padding: 0; color: #000 !important; background: white !important; }
            #print-area {
                padding: 0 !important;
                display: block !important;
                overflow: visible !important;
                background: white !important;
            }
            .no-print { display: none !important; }
            
            table { width: 100% !important; border-collapse: collapse; border: 0.1px solid #000; }
            th, td { border: 0.1px solid #000; padding: 2pt 4pt !important; font-size: 8pt !important; color: #000 !important; white-space: pre-line !important; }
            
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }

            tr { page-break-inside: avoid; }
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }

        .report-content {
          background: white;
          padding: 0.3cm;
          width: 98%;
          max-width: 1600px;
          margin: 1rem auto;
          color: #000;
        }
        
        .report-table { width: 100%; table-layout: auto; }
        .report-table td { white-space: pre-line; }
      `}</style>
      
      <div className="flex-shrink-0 no-print bg-gray-900 text-white p-4 flex justify-between items-center shadow-lg">
          <div className="flex items-center space-x-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">{title}</h2>
              <span className="px-2 py-1 text-[9px] font-black uppercase rounded bg-blue-900/60 border border-blue-700">Preview</span>
              {isDoctorWiseSalesReport && (
                  <div className="flex items-center bg-gray-800 rounded border border-gray-700 overflow-hidden text-[10px] font-bold">
                      <button
                          onClick={() => setDoctorViewMode('summary')}
                          className={`px-3 py-1.5 transition-colors ${doctorViewMode === 'summary' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                          Doctor Summary
                      </button>
                      <button
                          onClick={() => setDoctorViewMode('item')}
                          className={`px-3 py-1.5 transition-colors ${doctorViewMode === 'item' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                          Item-wise Detail
                      </button>
                  </div>
              )}
              <div className="relative" ref={columnDropdownRef}>
                  <button onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)} className="flex items-center space-x-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors">
                      <ColumnsIcon />
                      <span>COLUMNS</span>
                  </button>
                  {isColumnDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-xl z-[110] p-2 text-black">
                          <p className="text-[9px] font-black text-gray-400 uppercase mb-2 px-1">Select Columns</p>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                              {effectiveHeaders.map(h => (
                                  <label key={h} className="flex items-center p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                      <input 
                                          type="checkbox" 
                                          checked={visibleHeaders.includes(h)} 
                                          onChange={() => toggleHeaderVisibility(h)}
                                          className="mr-2 h-3 w-3 rounded text-primary focus:ring-primary"
                                      />
                                      <span className="text-[10px] font-medium">{h}</span>
                                  </label>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
              <div className="relative" ref={filterPanelRef}>
                  <button onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)} className="flex items-center space-x-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors">
                      <span>FILTER</span>
                  </button>
                  {isFilterPanelOpen && (
                    <div className="absolute top-full left-0 mt-1 w-[640px] max-w-[92vw] bg-white border border-gray-200 rounded shadow-xl z-[120] p-3 text-black">
                      <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Apply Filters</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border border-gray-200 rounded p-2 max-h-72 overflow-y-auto custom-scrollbar">
                          <p className="text-[9px] font-black uppercase text-gray-400 mb-2">Filter Fields</p>
                          {effectiveHeaders.map(header => (
                            <label key={header} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 text-[11px]">
                              <input
                                type="checkbox"
                                checked={selectedFilterFields.includes(header)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedFilterFields(prev => [...prev, header]);
                                  else {
                                    setSelectedFilterFields(prev => prev.filter(h => h !== header));
                                    setDraftStructuredFilters(prev => {
                                      const copy = { ...prev };
                                      delete copy[header];
                                      return copy;
                                    });
                                  }
                                }}
                              />
                              <span className="font-semibold">{header}</span>
                            </label>
                          ))}
                        </div>
                        <div className="border border-gray-200 rounded p-2 max-h-72 overflow-y-auto custom-scrollbar space-y-3">
                          <p className="text-[9px] font-black uppercase text-gray-400">Selected Field Filters</p>
                          {selectedFilterFields.length === 0 && <p className="text-[11px] text-gray-500">Select at least one field to configure filters.</p>}
                          {selectedFilterFields.map(header => {
                            const meta = fieldMetadata[header];
                            const current = draftStructuredFilters[header] || {};
                            return (
                              <div key={header} className="border border-gray-200 rounded p-2">
                                <p className="text-[10px] font-black uppercase mb-2">{header} <span className="text-gray-400">({meta?.fieldType || 'text'})</span></p>
                                {(meta?.fieldType === 'text' || meta?.fieldType === 'status') && (
                                  <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                                    {meta.options.map(opt => (
                                      <label key={opt} className="flex items-center gap-2 text-[11px]">
                                        <input
                                          type="checkbox"
                                          checked={(current.values || []).includes(opt)}
                                          onChange={(e) => {
                                            const selected = new Set(current.values || []);
                                            if (e.target.checked) selected.add(opt);
                                            else selected.delete(opt);
                                            setDraftStructuredFilters(prev => ({ ...prev, [header]: { ...current, values: Array.from(selected) } }));
                                          }}
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {meta?.fieldType === 'number' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="number" placeholder="Min" value={current.min || ''} onChange={(e) => setDraftStructuredFilters(prev => ({ ...prev, [header]: { ...current, min: e.target.value } }))} className="border border-gray-300 px-2 py-1 text-[11px]" />
                                    <input type="number" placeholder="Max" value={current.max || ''} onChange={(e) => setDraftStructuredFilters(prev => ({ ...prev, [header]: { ...current, max: e.target.value } }))} className="border border-gray-300 px-2 py-1 text-[11px]" />
                                  </div>
                                )}
                                {meta?.fieldType === 'date' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="date" value={current.startDate || ''} onChange={(e) => setDraftStructuredFilters(prev => ({ ...prev, [header]: { ...current, startDate: e.target.value } }))} className="border border-gray-300 px-2 py-1 text-[11px]" />
                                    <input type="date" value={current.endDate || ''} onChange={(e) => setDraftStructuredFilters(prev => ({ ...prev, [header]: { ...current, endDate: e.target.value } }))} className="border border-gray-300 px-2 py-1 text-[11px]" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button className="px-3 py-1.5 text-[10px] font-black uppercase border border-gray-300" onClick={() => { setDraftStructuredFilters({}); setSelectedFilterFields([]); }}>Clear</button>
                        <button className="px-3 py-1.5 text-[10px] font-black uppercase bg-primary text-white" onClick={() => { setActiveFilters(prev => ({ ...prev, structuredFilters: draftStructuredFilters })); setIsFilterPanelOpen(false); }}>Apply Filter</button>
                      </div>
                    </div>
                  )}
              </div>
          </div>
          
          <div className="flex items-center space-x-3">
              <button onClick={handleDownloadCsv} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
              </button>
              <button onClick={handleExportExcel} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors flex items-center">
                  XLSX
              </button>
              <button onClick={handlePrint} className="px-4 py-1.5 bg-[#11A66C] hover:bg-[#0f8a5a] text-white rounded text-[10px] font-bold transition-colors flex items-center shadow-md shadow-green-900/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  PRINT / PDF
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 custom-scrollbar pb-10">
          <div id="print-area" className="report-content shadow-2xl border border-gray-200">
              
              <div className="flex justify-between items-center mb-8 border-b-2 border-black pb-4 gap-4">
                  <div className="flex-1 text-left">
                      <h1 className="text-xl font-black uppercase text-black leading-tight">{pharmacyDetails.pharmacy_name}</h1>
                      <p className="text-[9pt] font-medium text-black mt-1 whitespace-pre-line">{pharmacyDetails.address}</p>
                      <div className="flex space-x-4 mt-2 text-[8pt] font-bold text-gray-700">
                          <span>GSTIN: {pharmacyDetails.gstin}</span>
                          <span>DL: {pharmacyDetails.drug_license}</span>
                      </div>
                  </div>
                  
                  <div className="flex-shrink-0 flex justify-center px-4">
                      {pharmacyDetails.pharmacy_logo_url && (
                          <img src={pharmacyDetails.pharmacy_logo_url} alt="Pharmacy Logo" className="h-20 w-auto object-contain" />
                      )}
                  </div>

                  <div className="flex-1 text-right">
                      <h2 className="text-lg font-black text-black border-2 border-black px-4 py-1 inline-block uppercase tracking-tighter mb-2">
                        {title}
                      </h2>
                      <div className="text-[8pt] text-gray-600 font-bold uppercase space-y-0.5">
                          <p>DATE: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          <p>GENERATED AT: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                      </div>
                  </div>
              </div>

              {appliedFilters && (
                <div className="mb-6 p-2 bg-gray-50 border border-gray-200 text-[8pt] font-bold flex space-x-4">
                    <span className="text-gray-400">FILTERS:</span>
                    <span>{appliedFilters}</span>
                </div>
              )}
              {activeFilterChips.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2 no-print">
                  {activeFilterChips.map(chip => (
                    <span key={chip} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-semibold text-blue-900">
                      {chip}
                    </span>
                  ))}
                  <button
                    onClick={() => {
                      setActiveFilters({ columnFilters: {}, structuredFilters: {} });
                      setDraftStructuredFilters({});
                      setSelectedFilterFields([]);
                    }}
                    className="px-2 py-1 rounded-full border border-gray-300 text-[10px] font-bold uppercase"
                  >
                    Clear All
                  </button>
                </div>
              )}

              <table className="report-table">
                  <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100">
                          {visibleHeaders.map(header => (
                              <th key={header} className="p-2 text-left font-black uppercase tracking-wider text-[8pt]">
                                  <div className="flex flex-col space-y-2">
                                      <div 
                                          className="flex items-center justify-between cursor-pointer group no-print"
                                          onClick={() => requestSort(header)}
                                      >
                                          <span>{header}</span>
                                          <span className="text-[7pt] text-gray-400 group-hover:text-primary">
                                              {sortConfig?.key === header ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕'}
                                          </span>
                                      </div>
                                      <span className="hidden print:inline">{header}</span>
                                      <input 
                                          type="text" 
                                          placeholder="Filter..."
                                          value={activeFilters.columnFilters[header] || ''}
                                          onChange={(e) => handleFilterChange(header, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="no-print w-full p-1 border border-gray-300 rounded text-[7pt] font-medium bg-white focus:ring-1 focus:ring-primary outline-none"
                                      />
                                  </div>
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody>
                      {processedData.map((row, rIdx) => (
                          <tr
                              key={rIdx}
                              className={`border-b border-gray-100 transition-colors ${
                                row._rowType === 'subtotal'
                                  ? 'bg-amber-50 font-bold'
                                  : row._rowType === 'grand'
                                    ? 'bg-gray-200 font-black'
                                    : 'hover:bg-gray-50'
                              }`}
                          >
                              {visibleHeaders.map(header => {
                                  const val = row[header];
                                  const isNumeric = typeof val === 'number';
                                  return (
                                      <td key={header} className={`p-2 text-[9pt] ${isNumeric ? 'text-right font-mono' : ''}`}>
                                          {isNumeric ? val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (val ?? '-')}
                                      </td>
                                  );
                              })}
                          </tr>
                      ))}
                      {processedData.length === 0 && (
                          <tr><td colSpan={visibleHeaders.length} className="p-12 text-center text-[10pt] font-medium text-gray-400 italic uppercase tracking-widest">{emptyMessage}</td></tr>
                      )}
                  </tbody>
                  {Object.keys(columnTotals).length > 0 && !(isDoctorWiseSalesReport && doctorViewMode === 'item') && (
                    <tfoot className="border-t-2 border-black font-black bg-gray-100">
                        <tr>
                            {visibleHeaders.map((header, index) => {
                                const total = columnTotals[header];
                                return (
                                    <td key={header} className={`p-2 text-[9pt] ${total !== undefined ? 'text-right font-mono' : ''}`}>
                                        {index === 0 && !total ? 'TOTALS' : (total !== undefined ? total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                                    </td>
                                );
                            })}
                        </tr>
                    </tfoot>
                  )}
              </table>

              <div className="mt-12 flex justify-between items-end border-t border-gray-200 pt-8">
                  <div className="text-[8pt] text-gray-500 font-bold uppercase italic">
                      <p>This is a system generated report from <strong>MDXERA ERP</strong>.</p>
                      <p>E. & O. E.</p>
                  </div>
                  <div className="text-center w-64 border-t-2 border-black pt-2">
                      <p className="text-[9pt] font-black uppercase">{pharmacyDetails.authorized_signatory}</p>
                      <p className="text-[7pt] text-gray-500 font-bold uppercase tracking-wider">Authorized Signatory</p>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default ReportPreviewModal;
