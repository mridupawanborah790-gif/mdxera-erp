import React, { useMemo, useRef, useState } from 'react';
import { arrayToCsvRow, downloadCsv, parseCsvLine } from '../utils/csv';
import type { MasterPriceMaintainRecord, Medicine, RegisteredPharmacy } from '../types';

interface MasterPriceMaintainProps {
  medicines: Medicine[];
  currentUser: RegisteredPharmacy | null;
  onUpdateMedicine: (medicine: Medicine) => void;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

type UploadParseRow = {
  rowNumber: number;
  materialCode: string;
  mrp: number;
  rateA: number;
  rateB: number;
  rateC: number;
  defaultDiscountPercent: number;
  schemePercent: number;
  schemeCalculationBasis: 'after_discount' | 'before_discount';
  schemeFormat: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'inactive';
};

type UploadValidationResult = {
  parsed: UploadParseRow[];
  errors: Array<{ rowNumber: number; reason: string }>;
};

type UploadAuditEntry = {
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  totalRecords: number;
  successCount: number;
  failedCount: number;
};

const REQUIRED_HEADERS = [
  'Material Code',
  'MRP',
  'Rate A',
  'Rate B',
  'Rate C',
  'Default Discount %',
  'Scheme %',
  'Scheme Calculation Basis',
  'Scheme Format',
  'Valid From',
  'Valid To',
  'Status'
] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);
const toDisplayDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
};

const toIsoDate = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const dt = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : trimmed;
  }

  const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dmyMatch) return null;
  const [, d, m, y] = dmyMatch;
  const iso = `${y}-${m}-${d}`;
  const dt = new Date(`${iso}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : iso;
};

const parseNumeric = (value: string) => {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
};

const normalizeBasis = (value: string): 'after_discount' | 'before_discount' | null => {
  const v = value.trim().toLowerCase();
  if (!v) return 'after_discount';
  if (['after disc%', 'after discount', 'after_discount', 'afterdisc'].includes(v)) return 'after_discount';
  if (['before discount', 'before_discount', 'at same level / before discount'].includes(v)) return 'before_discount';
  return null;
};

const normalizeStatus = (value: string): 'active' | 'inactive' | null => {
  const v = value.trim().toLowerCase();
  if (v === 'active') return 'active';
  if (v === 'inactive') return 'inactive';
  return null;
};

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const excelXmlFromMatrix = (rows: string[][]): string => {
  const xmlRows = rows
    .map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type=\"String\">${escapeHtml(String(cell ?? ''))}</Data></Cell>`).join('')}</Row>`)
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="MasterPriceMaintain">
  <Table>
   ${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;
};

const downloadBlob = (content: BlobPart, fileName: string, type: string) => {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const generateSimplePdf = (headers: string[], rows: string[][]): Uint8Array => {
  const lines = [headers.join(' | '), ...rows.map(r => r.join(' | '))];
  const escaped = lines.map(line => line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
  const textCommands = escaped.map((line, idx) => `BT /F1 8 Tf 30 ${790 - idx * 12} Td (${line.slice(0, 180)}) Tj ET`).join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${textCommands.length} >> stream\n${textCommands}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach(obj => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const encoded = new TextEncoder().encode(pdf);
  return new Uint8Array(encoded);
};

const isSupportedSchemeFormat = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^\d+(?:\.\d+)?\s*\+\s*\d+(?:\.\d+)?$/.test(normalized)) return true;
  if (/^\d+(?:\.\d+)?\s*in\s*\d+(?:\.\d+)?$/.test(normalized)) return true;
  return false;
};

const isOverlapping = (incoming: MasterPriceMaintainRecord, records: MasterPriceMaintainRecord[]) => {
  if (incoming.status !== 'active') return false;
  const startA = new Date(incoming.validFrom).getTime();
  const endA = new Date(incoming.validTo).getTime();
  return records.some(record => {
    if (record.status !== 'active') return false;
    if (record.id === incoming.id) return false;
    const startB = new Date(record.validFrom).getTime();
    const endB = new Date(record.validTo).getTime();
    return startA <= endB && startB <= endA;
  });
};

const parseExcelXmlRows = (text: string): string[][] => {
  if (!text.includes('<Workbook') || !text.includes('<Row')) return [];
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const rows = Array.from(xml.getElementsByTagName('Row'));
  return rows.map(row => {
    const cells = Array.from(row.getElementsByTagName('Cell'));
    return cells.map(cell => {
      const data = cell.getElementsByTagName('Data')[0];
      return (data?.textContent || '').trim();
    });
  });
};

const MasterPriceMaintain: React.FC<MasterPriceMaintainProps> = ({ medicines, currentUser, onUpdateMedicine, addNotification }) => {
  const [materialSearch, setMaterialSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [rateTypeFilter, setRateTypeFilter] = useState<'all' | 'rateA' | 'rateB' | 'rateC'>('all');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadValidationResult | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadAuditTrail, setUploadAuditTrail] = useState<UploadAuditEntry[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const editableTemplate = (medicine: Medicine): MasterPriceMaintainRecord => ({
    id: crypto.randomUUID(),
    materialCode: medicine.materialCode,
    materialName: medicine.name,
    mrp: Number(medicine.mrp || 0),
    rateA: Number(medicine.rateA || 0),
    rateB: Number(medicine.rateB || 0),
    rateC: Number(medicine.rateC || 0),
    defaultDiscountPercent: Number(medicine.defaultDiscountPercent || 0),
    schemePercent: Number(medicine.schemePercent || 0),
    schemeType: medicine.schemeCalculationBasis || medicine.schemeType || 'after_discount',
    schemeCalculationBasis: medicine.schemeCalculationBasis || medicine.schemeType || 'after_discount',
    schemeFormat: medicine.schemeFormat || '',
    schemeRate: Number(medicine.schemeRate || 0),
    validFrom: todayIso(),
    validTo: '2099-12-31',
    status: 'active',
    remarks: '',
    lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
    lastUpdatedOn: new Date().toISOString(),
    auditTrail: []
  });

  const [draft, setDraft] = useState<MasterPriceMaintainRecord | null>(null);

  const filteredMedicines = useMemo(() => {
    return medicines.filter(m => {
      const search = materialSearch.trim().toLowerCase();
      const matchesSearch = !search || m.name.toLowerCase().includes(search) || m.materialCode.toLowerCase().includes(search);
      const current = (m.masterPriceMaintains || []).find(r => r.status === 'active' && todayIso() >= r.validFrom && todayIso() <= r.validTo);
      const matchesStatus = statusFilter === 'all' || (current?.status || 'inactive') === statusFilter;
      const matchesRateType = rateTypeFilter === 'all' || Number(current?.[rateTypeFilter] || m[rateTypeFilter] || 0) > 0;
      return matchesSearch && matchesStatus && matchesRateType;
    });
  }, [medicines, materialSearch, statusFilter, rateTypeFilter]);

  const exportRows = useMemo(() => {
    return filteredMedicines.map(med => {
      const active = (med.masterPriceMaintains || []).find(r => r.status === 'active' && todayIso() >= r.validFrom && todayIso() <= r.validTo);
      const row = active || editableTemplate(med);
      return [
        med.materialCode,
        med.name,
        Number(row.mrp || 0).toFixed(2),
        Number(row.rateA || 0).toFixed(2),
        Number(row.rateB || 0).toFixed(2),
        Number(row.rateC || 0).toFixed(2),
        Number(row.defaultDiscountPercent || 0).toFixed(2),
        Number(row.schemePercent || 0).toFixed(2),
        (row.schemeCalculationBasis || row.schemeType) === 'before_discount' ? 'Before Discount' : 'After Disc%',
        row.schemeFormat || '',
        toDisplayDate(row.validFrom),
        toDisplayDate(row.validTo),
        row.status === 'active' ? 'Active' : 'Inactive'
      ];
    });
  }, [filteredMedicines]);

  const exportHeaders = [
    'Material Code',
    'Material Name',
    'MRP',
    'Rate A',
    'Rate B',
    'Rate C',
    'Default Discount %',
    'Scheme %',
    'Scheme Calculation Basis',
    'Scheme Format',
    'Valid From',
    'Valid To',
    'Status'
  ];

  const startEdit = (medicine: Medicine) => {
    setEditingMaterialId(medicine.id);
    setDraft(editableTemplate(medicine));
  };

  const saveDraft = () => {
    if (!editingMaterialId || !draft) return;

    if (!draft.materialCode || !draft.materialName) {
      addNotification('Material is mandatory.', 'error');
      return;
    }
    if (!draft.validFrom || !draft.validTo || new Date(draft.validTo) < new Date(draft.validFrom)) {
      addNotification('Valid dates are required and Valid To must be >= Valid From.', 'error');
      return;
    }
    if ([draft.mrp, draft.rateA, draft.rateB, draft.rateC].some(v => Number(v) < 0)) {
      addNotification('Rates and MRP must be >= 0.', 'error');
      return;
    }
    if (draft.defaultDiscountPercent < 0 || draft.defaultDiscountPercent > 100 || draft.schemePercent < 0 || draft.schemePercent > 100) {
      addNotification('Discount and Scheme must be between 0 and 100.', 'error');
      return;
    }
    if (Number(draft.schemeRate || 0) < 0) {
      addNotification('Scheme Rate must be >= 0.', 'error');
      return;
    }

    const normalizedSchemeFormat = String(draft.schemeFormat || '').trim();
    const hasSchemeData = draft.schemePercent > 0 || Number(draft.schemeRate || 0) > 0 || normalizedSchemeFormat.length > 0;
    if (hasSchemeData && !(draft.schemeCalculationBasis || draft.schemeType)) {
      addNotification('Scheme Calculation Basis is required when scheme is maintained.', 'error');
      return;
    }
    if (normalizedSchemeFormat && !isSupportedSchemeFormat(normalizedSchemeFormat)) {
      addNotification('Scheme Format supports patterns like "10+1" or "1 in 10".', 'error');
      return;
    }

    const medicine = medicines.find(m => m.id === editingMaterialId);
    if (!medicine) return;

    const existingRecords = medicine.masterPriceMaintains || [];
    if (isOverlapping(draft, existingRecords)) {
      addNotification('Overlapping validity detected for this material. Please correct date range.', 'error');
      return;
    }

    const nextRecords = [...existingRecords, {
      ...draft,
      lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
      lastUpdatedOn: new Date().toISOString(),
      auditTrail: [
        ...(draft.auditTrail || []),
        {
          changedAt: new Date().toISOString(),
          changedBy: currentUser?.full_name || currentUser?.email,
          sourceModule: 'Master Price Maintain' as const,
          field: 'pricing_record',
          oldValue: 'N/A',
          newValue: `MRP:${draft.mrp} RateA:${draft.rateA} RateB:${draft.rateB} RateC:${draft.rateC} Disc:${draft.defaultDiscountPercent} Sch:${draft.schemePercent} Basis:${draft.schemeCalculationBasis || draft.schemeType} Format:${normalizedSchemeFormat || '-'} SchRate:${Number(draft.schemeRate || 0)}`
        }
      ]
    }];

    onUpdateMedicine({
      ...medicine,
      mrp: draft.mrp.toFixed(2),
      rateA: draft.rateA,
      rateB: draft.rateB,
      rateC: draft.rateC,
      defaultDiscountPercent: draft.defaultDiscountPercent,
      schemePercent: draft.schemePercent,
      schemeType: draft.schemeCalculationBasis || draft.schemeType,
      schemeCalculationBasis: draft.schemeCalculationBasis || draft.schemeType,
      schemeFormat: normalizedSchemeFormat || undefined,
      schemeRate: Number(draft.schemeRate || 0),
      masterPriceMaintains: nextRecords
    });

    addNotification('Master Price Maintain saved and synced.', 'success');
    setEditingMaterialId(null);
    setDraft(null);
  };

  const downloadCurrentData = (mode: 'csv' | 'excel' | 'pdf') => {
    if (!exportRows.length) {
      addNotification('No records available for export with current filters.', 'warning');
      return;
    }

    if (mode === 'csv') {
      const csv = [arrayToCsvRow(exportHeaders), ...exportRows.map(r => arrayToCsvRow(r))].join('\n');
      downloadCsv(csv, 'master_price_maintain_export.csv');
      return;
    }

    if (mode === 'excel') {
      const xml = excelXmlFromMatrix([exportHeaders, ...exportRows]);
      downloadBlob(xml, 'master_price_maintain_export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return;
    }

    const pdfBytes = generateSimplePdf(exportHeaders, exportRows);
    downloadBlob(pdfBytes as unknown as BlobPart, 'master_price_maintain_export.pdf', 'application/pdf');
  };

  const downloadTemplate = (mode: 'csv' | 'excel') => {
    const note = 'Do not change column names. Fill data as per format. Date format: DD-MM-YYYY.';
    const sampleRows = [
      ['PARA001', '100', '90', '92', '95', '5', '10', 'After Disc%', '10+1', '01-04-2026', '30-04-2026', 'Active'],
      ['DOLO650', '120', '105', '108', '110', '2', '5', 'Before Discount', '5+1', '01-04-2026', '31-05-2026', 'Active'],
      ['AZI500', '150', '135', '138', '140', '3', '4', 'After Disc%', '1 in 10', '01-05-2026', '30-06-2026', 'Inactive']
    ];

    if (mode === 'csv') {
      const lines = [arrayToCsvRow([note]), arrayToCsvRow(exportHeaders), ...sampleRows.map(r => arrayToCsvRow(r))].join('\n');
      downloadCsv(lines, 'master_price_maintain_template.csv');
      return;
    }

    const xml = excelXmlFromMatrix([[note], exportHeaders, ...sampleRows]);
    downloadBlob(xml, 'master_price_maintain_template.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const readUploadFile = async (file: File): Promise<string[][]> => {
    const text = await file.text();
    const ext = file.name.toLowerCase();

    if (ext.endsWith('.csv')) {
      return text.split(/\r?\n/).filter(line => line.trim()).map(parseCsvLine);
    }

    const xmlRows = parseExcelXmlRows(text);
    if (xmlRows.length) return xmlRows;

    return text
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map(line => line.includes('\t') ? line.split('\t').map(v => v.trim()) : parseCsvLine(line));
  };

  const validateUpload = (matrix: string[][]): UploadValidationResult => {
    if (!matrix.length) return { parsed: [], errors: [{ rowNumber: 0, reason: 'File is empty.' }] };

    const startIndex = matrix[0][0]?.toLowerCase().includes('do not change') ? 1 : 0;
    const headers = matrix[startIndex] || [];
    const indexMap = Object.fromEntries(REQUIRED_HEADERS.map(h => [h, headers.findIndex(v => v.trim().toLowerCase() === h.toLowerCase())]));
    const missingHeaders = REQUIRED_HEADERS.filter(h => indexMap[h] === -1);
    if (missingHeaders.length) {
      return { parsed: [], errors: [{ rowNumber: 0, reason: `Missing mandatory columns: ${missingHeaders.join(', ')}` }] };
    }

    const parsed: UploadParseRow[] = [];
    const errors: Array<{ rowNumber: number; reason: string }> = [];
    const medicinesByCode = new Map(medicines.map(m => [m.materialCode.toLowerCase(), m]));

    matrix.slice(startIndex + 1).forEach((row, i) => {
      const rowNumber = startIndex + i + 2;
      const get = (h: (typeof REQUIRED_HEADERS)[number]) => (row[indexMap[h]] || '').trim();

      const materialCode = get('Material Code');
      if (!materialCode) {
        errors.push({ rowNumber, reason: 'Material Code is mandatory.' });
        return;
      }

      const material = medicinesByCode.get(materialCode.toLowerCase());
      if (!material) {
        errors.push({ rowNumber, reason: `Material Code ${materialCode} does not exist.` });
        return;
      }

      const mrp = parseNumeric(get('MRP'));
      const rateA = parseNumeric(get('Rate A'));
      const rateB = parseNumeric(get('Rate B'));
      const rateC = parseNumeric(get('Rate C'));
      const defaultDiscountPercent = parseNumeric(get('Default Discount %'));
      const schemePercent = parseNumeric(get('Scheme %'));

      if ([mrp, rateA, rateB, rateC, defaultDiscountPercent, schemePercent].some(v => Number.isNaN(v))) {
        errors.push({ rowNumber, reason: 'Numeric fields contain invalid values.' });
        return;
      }
      if ([mrp, rateA, rateB, rateC].some(v => v < 0)) {
        errors.push({ rowNumber, reason: 'MRP / Rates cannot be negative.' });
        return;
      }
      if (defaultDiscountPercent < 0 || defaultDiscountPercent > 100 || schemePercent < 0 || schemePercent > 100) {
        errors.push({ rowNumber, reason: 'Scheme % and Discount % must be between 0 and 100.' });
        return;
      }

      const validFrom = toIsoDate(get('Valid From'));
      const validTo = toIsoDate(get('Valid To'));
      if (!validFrom || !validTo) {
        errors.push({ rowNumber, reason: 'Date format invalid. Use DD-MM-YYYY or YYYY-MM-DD.' });
        return;
      }
      if (new Date(validFrom) > new Date(validTo)) {
        errors.push({ rowNumber, reason: 'Valid From must be less than or equal to Valid To.' });
        return;
      }

      const basis = normalizeBasis(get('Scheme Calculation Basis'));
      if (!basis) {
        errors.push({ rowNumber, reason: 'Scheme Calculation Basis is invalid.' });
        return;
      }

      const schemeFormat = get('Scheme Format');
      if (schemeFormat && !isSupportedSchemeFormat(schemeFormat)) {
        errors.push({ rowNumber, reason: 'Scheme Format supports 10+1 or 1 in 10 pattern.' });
        return;
      }

      const status = normalizeStatus(get('Status'));
      if (!status) {
        errors.push({ rowNumber, reason: 'Status must be Active or Inactive.' });
        return;
      }

      const incomingDraft: MasterPriceMaintainRecord = {
        id: crypto.randomUUID(),
        materialCode,
        materialName: material.name,
        mrp,
        rateA,
        rateB,
        rateC,
        defaultDiscountPercent,
        schemePercent,
        schemeType: basis,
        schemeCalculationBasis: basis,
        schemeFormat,
        schemeRate: 0,
        validFrom,
        validTo,
        status,
        remarks: '',
        lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
        lastUpdatedOn: new Date().toISOString(),
        auditTrail: []
      };

      if (isOverlapping(incomingDraft, material.masterPriceMaintains || [])) {
        errors.push({ rowNumber, reason: 'Overlapping date range for same material.' });
        return;
      }

      parsed.push({ rowNumber, materialCode, mrp, rateA, rateB, rateC, defaultDiscountPercent, schemePercent, schemeCalculationBasis: basis, schemeFormat, validFrom, validTo, status });
    });

    const byCode = new Map<string, UploadParseRow[]>();
    parsed.forEach(row => {
      const arr = byCode.get(row.materialCode) || [];
      arr.push(row);
      byCode.set(row.materialCode, arr);
    });

    byCode.forEach(records => {
      const sorted = [...records].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev.status === 'active' && curr.status === 'active' && new Date(prev.validTo) >= new Date(curr.validFrom)) {
          errors.push({ rowNumber: curr.rowNumber, reason: 'Overlapping date ranges in upload file for same material.' });
        }
      }
    });

    return { parsed, errors };
  };

  const handleUploadFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const matrix = await readUploadFile(file);
      const result = validateUpload(matrix);
      setUploadFileName(file.name);
      setUploadPreview(result);
      if (!result.errors.length) {
        addNotification(`File validated successfully. ${result.parsed.length} rows ready for import.`, 'success');
      } else {
        addNotification(`Validation completed with ${result.errors.length} error(s).`, 'warning');
      }
    } catch (error) {
      console.error(error);
      addNotification('Unable to parse upload file. Please use template format.', 'error');
      setUploadPreview(null);
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const confirmUpload = () => {
    if (!uploadPreview) return;

    const validRows = uploadPreview.parsed.filter(row => !uploadPreview.errors.some(e => e.rowNumber === row.rowNumber));
    const medicinesByCode = new Map(medicines.map(m => [m.materialCode.toLowerCase(), m]));

    validRows.forEach(row => {
      const medicine = medicinesByCode.get(row.materialCode.toLowerCase());
      if (!medicine) return;

      const newRecord: MasterPriceMaintainRecord = {
        id: crypto.randomUUID(),
        materialCode: medicine.materialCode,
        materialName: medicine.name,
        mrp: row.mrp,
        rateA: row.rateA,
        rateB: row.rateB,
        rateC: row.rateC,
        defaultDiscountPercent: row.defaultDiscountPercent,
        schemePercent: row.schemePercent,
        schemeType: row.schemeCalculationBasis,
        schemeCalculationBasis: row.schemeCalculationBasis,
        schemeFormat: row.schemeFormat,
        schemeRate: 0,
        validFrom: row.validFrom,
        validTo: row.validTo,
        status: row.status,
        remarks: 'Imported via bulk upload',
        lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
        lastUpdatedOn: new Date().toISOString(),
        auditTrail: [{
          changedAt: new Date().toISOString(),
          changedBy: currentUser?.full_name || currentUser?.email,
          sourceModule: 'Master Price Maintain',
          field: 'bulk_import',
          oldValue: 'N/A',
          newValue: `Imported from ${uploadFileName}`
        }]
      };

      const nextRecords = [...(medicine.masterPriceMaintains || []), newRecord];
      onUpdateMedicine({
        ...medicine,
        mrp: row.mrp.toFixed(2),
        rateA: row.rateA,
        rateB: row.rateB,
        rateC: row.rateC,
        defaultDiscountPercent: row.defaultDiscountPercent,
        schemePercent: row.schemePercent,
        schemeType: row.schemeCalculationBasis,
        schemeCalculationBasis: row.schemeCalculationBasis,
        schemeFormat: row.schemeFormat || undefined,
        masterPriceMaintains: nextRecords
      });
    });

    setUploadAuditTrail(prev => [{
      fileName: uploadFileName,
      uploadedBy: currentUser?.full_name || currentUser?.email || 'System',
      uploadedAt: new Date().toISOString(),
      totalRecords: uploadPreview.parsed.length,
      successCount: validRows.length,
      failedCount: uploadPreview.errors.length
    }, ...prev].slice(0, 10));

    addNotification(`Import completed. सफल: ${validRows.length}, Failed: ${uploadPreview.errors.length}`, uploadPreview.errors.length ? 'warning' : 'success');
    setUploadPreview(null);
    setUploadFileName('');
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-2 p-2 border border-gray-300 bg-white">
        <input className="border border-gray-300 px-2 py-1 text-sm" placeholder="Material search" value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} />
        <select className="border border-gray-300 px-2 py-1 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className="border border-gray-300 px-2 py-1 text-sm" value={rateTypeFilter} onChange={e => setRateTypeFilter(e.target.value as any)}>
          <option value="all">Rate Type: All</option>
          <option value="rateA">Rate A</option>
          <option value="rateB">Rate B</option>
          <option value="rateC">Rate C</option>
        </select>
        <button className="border border-gray-300 px-2 py-1 text-sm" onClick={() => downloadCurrentData('excel')}>Download Excel (.xlsx)</button>
        <button className="border border-gray-300 px-2 py-1 text-sm" onClick={() => downloadCurrentData('csv')}>Download CSV (.csv)</button>
      </div>

      <div className="grid grid-cols-5 gap-2 p-2 border border-gray-300 bg-white">
        <button className="border border-gray-300 px-2 py-1 text-sm" onClick={() => downloadCurrentData('pdf')}>Download PDF (.pdf)</button>
        <button className="border border-gray-300 px-2 py-1 text-sm" onClick={() => downloadTemplate('excel')}>Download Template (Excel)</button>
        <button className="border border-gray-300 px-2 py-1 text-sm" onClick={() => downloadTemplate('csv')}>Download Template (CSV)</button>
        <label className="border border-gray-300 px-2 py-1 text-sm cursor-pointer text-center">
          Upload Excel / CSV
          <input ref={uploadInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUploadFileChange} />
        </label>
        {uploadPreview ? (
          <button className="px-2 py-1 bg-primary text-white text-sm disabled:opacity-50" disabled={uploadPreview.parsed.length === 0} onClick={confirmUpload}>Confirm Import</button>
        ) : <div />}
      </div>

      {uploadPreview && (
        <div className="border border-gray-300 bg-white p-2 text-xs">
          <div className="font-semibold">Upload Summary ({uploadFileName})</div>
          <div>Total records: {uploadPreview.parsed.length}</div>
          <div>सफल (Success): {uploadPreview.parsed.filter(row => !uploadPreview.errors.some(e => e.rowNumber === row.rowNumber)).length}</div>
          <div>Failed rows: {uploadPreview.errors.length}</div>
          {uploadPreview.errors.length > 0 && (
            <div className="mt-2 max-h-28 overflow-auto border border-gray-200 p-2 bg-red-50">
              {uploadPreview.errors.map(err => (
                <div key={`${err.rowNumber}-${err.reason}`}>Row {err.rowNumber}: {err.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {uploadAuditTrail.length > 0 && (
        <div className="border border-gray-300 bg-white p-2 text-xs">
          <div className="font-semibold mb-1">Upload Audit</div>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-1 text-left">File name</th>
                <th className="p-1 text-left">Uploaded by</th>
                <th className="p-1 text-left">Date/time</th>
                <th className="p-1 text-right">Total</th>
                <th className="p-1 text-right">Success</th>
                <th className="p-1 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {uploadAuditTrail.map(entry => (
                <tr key={`${entry.fileName}-${entry.uploadedAt}`} className="border-t border-gray-200">
                  <td className="p-1">{entry.fileName}</td>
                  <td className="p-1">{entry.uploadedBy}</td>
                  <td className="p-1">{new Date(entry.uploadedAt).toLocaleString()}</td>
                  <td className="p-1 text-right">{entry.totalRecords}</td>
                  <td className="p-1 text-right">{entry.successCount}</td>
                  <td className="p-1 text-right">{entry.failedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white border border-gray-300">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-2 text-left">Material Code</th><th className="p-2 text-left">Material Name</th><th className="p-2 text-right">Rate A</th><th className="p-2 text-right">Rate B</th><th className="p-2 text-right">Rate C</th><th className="p-2 text-right">Disc %</th><th className="p-2 text-right">Sch %</th><th className="p-2 text-left">Scheme Basis</th><th className="p-2 text-left">Scheme Format</th><th className="p-2 text-right">Scheme Rate</th><th className="p-2 text-left">Valid From</th><th className="p-2 text-left">Valid To</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMedicines.map(med => {
              const active = (med.masterPriceMaintains || []).find(r => r.status === 'active' && todayIso() >= r.validFrom && todayIso() <= r.validTo);
              const row = active || editableTemplate(med);
              const isEditing = editingMaterialId === med.id && draft;
              const value = isEditing ? draft : row;

              return (
                <tr key={med.id} className="border-t border-gray-200">
                  <td className="p-2">{med.materialCode}</td>
                  <td className="p-2">{med.name}</td>
                  {(['rateA', 'rateB', 'rateC', 'defaultDiscountPercent', 'schemePercent'] as const).map(field => (
                    <td key={field} className="p-2 text-right">
                      {isEditing ? <input type="number" min={0} className="w-20 border border-gray-300 px-1 py-0.5 text-right" value={Number((value as any)[field] || 0)} onChange={e => setDraft(prev => prev ? ({ ...prev, [field]: Number(e.target.value) }) : prev)} /> : Number((value as any)[field] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td className="p-2">
                    {isEditing ? (
                      <select className="border border-gray-300 px-1 py-0.5 text-xs" value={value.schemeCalculationBasis || value.schemeType || 'after_discount'} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeCalculationBasis: e.target.value as 'after_discount' | 'before_discount', schemeType: e.target.value as 'after_discount' | 'before_discount' }) : prev)}>
                        <option value="after_discount">After Disc% (Recommended)</option>
                        <option value="before_discount">At Same Level / Before Discount</option>
                      </select>
                    ) : ((value.schemeCalculationBasis || value.schemeType) === 'before_discount' ? 'Before Discount' : 'After Disc%')}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input type="text" className="w-28 border border-gray-300 px-1 py-0.5 text-xs uppercase" value={value.schemeFormat || ''} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeFormat: e.target.value }) : prev)} placeholder="10+1 / 1 in 10" />
                    ) : (value.schemeFormat || '—')}
                  </td>
                  <td className="p-2 text-right">
                    {isEditing ? (
                      <input type="number" min={0} className="w-20 border border-gray-300 px-1 py-0.5 text-right" value={Number(value.schemeRate || 0)} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeRate: Number(e.target.value) }) : prev)} />
                    ) : Number(value.schemeRate || 0).toFixed(2)}
                  </td>
                  <td className="p-2">{isEditing ? <input type="date" className="border border-gray-300 px-1 py-0.5" value={value.validFrom} onChange={e => setDraft(prev => prev ? ({ ...prev, validFrom: e.target.value }) : prev)} /> : value.validFrom}</td>
                  <td className="p-2">{isEditing ? <input type="date" className="border border-gray-300 px-1 py-0.5" value={value.validTo} onChange={e => setDraft(prev => prev ? ({ ...prev, validTo: e.target.value }) : prev)} /> : value.validTo}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <select className="border border-gray-300 px-1 py-0.5" value={value.status} onChange={e => setDraft(prev => prev ? ({ ...prev, status: e.target.value as 'active' | 'inactive' }) : prev)}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (value.status === 'active' ? 'Active' : 'Inactive')}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <div className="flex gap-1"><button className="px-2 py-1 bg-primary text-white" onClick={saveDraft}>Save</button><button className="px-2 py-1 border border-gray-300" onClick={() => { setEditingMaterialId(null); setDraft(null); }}>Cancel</button></div>
                    ) : <button className="px-2 py-1 border border-gray-300" onClick={() => startEdit(med)}>Edit</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MasterPriceMaintain;
