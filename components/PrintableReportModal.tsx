import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { RegisteredPharmacy } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';

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

const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  data,
  headers,
  filters: initialFilters,
  pharmacyDetails,
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleHeaders, setVisibleHeaders] = useState<string[]>([]);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSortConfig(null);
      setColumnFilters({});
      setVisibleHeaders(headers); 
    }
  }, [isOpen, headers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    };
    if (isColumnDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColumnDropdownOpen]);

  const processedData = useMemo(() => {
    if (!data) return [];
    let filteredData = [...data];

    Object.entries(columnFilters).forEach(([key, value]) => {
      if (value) {
        filteredData = filteredData.filter(row =>
          String(row[key] ?? '').toLowerCase().includes(String(value ?? '').toLowerCase())
        );
      }
    });

    if (sortConfig !== null) {
      filteredData.sort((a, b) => {
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
    
    return filteredData;
  }, [data, columnFilters, sortConfig]);

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
    setColumnFilters(prev => ({
      ...prev,
      [header]: value,
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
    const totalsRowArr = visibleHeaders.map((header, index) => {
        if (index === 0) return 'TOTALS';
        const total = columnTotals[header];
        return total !== undefined ? total.toFixed(2) : '';
    });

    // Combine everything
    const csvContent = [
        ...metaRows,
        tableHeaderRow,
        ...dataRows,
        arrayToCsvRow(['']), // Spacer before totals
        arrayToCsvRow(totalsRowArr)
    ].join('\n');
    
    const formattedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloadCsv(csvContent, `${formattedTitle}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const appliedFilters = [
    initialFilters.startDate && `From: ${initialFilters.startDate}`,
    initialFilters.endDate && `To: ${initialFilters.endDate}`,
    initialFilters.invoiceIdFilter && `ID Filter: "${initialFilters.invoiceIdFilter}"`,
  ].filter(Boolean).join(' | ');

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
              <div className="relative" ref={columnDropdownRef}>
                  <button onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)} className="flex items-center space-x-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors">
                      <ColumnsIcon />
                      <span>COLUMNS</span>
                  </button>
                  {isColumnDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-xl z-[110] p-2 text-black">
                          <p className="text-[9px] font-black text-gray-400 uppercase mb-2 px-1">Select Columns</p>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                              {headers.map(h => (
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
          </div>
          
          <div className="flex items-center space-x-3">
              <button onClick={handleDownloadCsv} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold border border-gray-700 transition-colors flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
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

              <table className="report-table">
                  <thead>
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
                                          value={columnFilters[header] || ''}
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
                          <tr key={rIdx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
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
                          <tr><td colSpan={visibleHeaders.length} className="p-12 text-center text-[10pt] font-medium text-gray-400 italic uppercase tracking-widest">No data available for the selected filters</td></tr>
                      )}
                  </tbody>
                  {Object.keys(columnTotals).length > 0 && (
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