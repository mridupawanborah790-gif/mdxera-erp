import React, { useEffect, useRef, useState } from 'react';
import type { InventoryItem, RegisteredPharmacy } from '../types';
import { renderBarcode } from '../utils/barcode';

interface PrintBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  pharmacy: RegisteredPharmacy | null;
}

const PrintBarcodeModal: React.FC<PrintBarcodeModalProps> = ({ isOpen, onClose, item, pharmacy }) => {
  const [labelCount, setLabelCount] = useState(12);

  if (!isOpen || !item || !pharmacy) return null;

  const handlePrint = () => {
    window.print();
  };

  const BarcodeLabel: React.FC<{ item: InventoryItem; pharmacy: RegisteredPharmacy }> = ({ item, pharmacy }) => {
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
      if (barcodeRef.current && item.barcode) {
        renderBarcode(barcodeRef.current, item.barcode);
      }
    }, [item.barcode]);

    return (
      <div className="barcode-label">
        <p className="pharmacy-name">{pharmacy.pharmacy_name}</p>
        <p className="product-name">{item.name}</p>
        <svg ref={barcodeRef} className="max-w-full h-10"></svg>
        <p className="mrp">MRP: ₹{(item.mrp || 0).toFixed(2)}</p>
      </div>
    );
  };

  return (
    <div id="print-barcode-modal-container" className="fixed inset-0 bg-black bg-opacity-60 z-[300] flex justify-center items-start pt-10 backdrop-blur-sm overflow-y-auto print:bg-white print:pt-0">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh] my-4 print:my-0 print:shadow-none print:max-h-none print:w-full print:max-w-none">
        <div className="flex justify-between items-center p-4 border-b no-print">
          <h3 className="text-lg font-semibold text-gray-800">Print Barcode Labels</h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
                <label htmlFor="label-count" className="text-sm font-medium">Quantity:</label>
                <input
                id="label-count"
                type="number"
                value={labelCount}
                onChange={(e) => setLabelCount(parseInt(e.target.value, 10) || 1)}
                className="w-20 p-2 border border-gray-300 rounded-md text-center font-bold"
                min="1"
                />
            </div>
             <button onClick={handlePrint} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print Labels
             </button>
             <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
             </button>
          </div>
        </div>

        <div className="p-3 border-b bg-blue-50/50 no-print">
            <p className="text-xs text-blue-800 font-medium">
              <strong>Generating labels for:</strong> {item.name} | <strong>Barcode:</strong> {item.barcode}
            </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-gray-100 print:bg-white print:p-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-3 print:gap-2 mx-auto max-w-fit">
            {Array.from({ length: labelCount }).map((_, idx) => (
              <BarcodeLabel key={idx} item={item} pharmacy={pharmacy} />
            ))}
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex justify-end no-print">
            <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Dismiss
            </button>
        </div>

        <style>{`
          .barcode-label {
            width: 50mm;
            height: 35mm;
            border: 1px dashed #ccc;
            padding: 2mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            background: white;
            box-sizing: border-box;
          }
          .barcode-label .pharmacy-name {
            font-size: 8pt;
            font-weight: 800;
            margin-bottom: 0.5mm;
            text-transform: uppercase;
            overflow: hidden;
            white-space: nowrap;
            width: 100%;
            color: #000;
          }
          .barcode-label .product-name {
            font-size: 7pt;
            font-weight: 600;
            margin-bottom: 1mm;
            overflow: hidden;
            height: 8pt;
            width: 100%;
            text-transform: uppercase;
          }
          .barcode-label .mrp {
            font-size: 8pt;
            font-weight: 800;
            margin-top: 0.5mm;
            color: #000;
          }
          @media print {
            body { margin: 0; padding: 0; }
            #root, #chatbot-container, .notification-container, .no-print { display: none !important; }
            #print-barcode-modal-container {
              position: absolute !important;
              left: 0;
              top: 0;
              width: 100%;
              height: auto;
              background: white;
              padding: 0;
              margin: 0;
              visibility: visible !important;
              display: block !important;
            }
            #print-barcode-modal-container > div {
              border: none !important;
              max-height: none !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .barcode-label { 
              border: 0.1mm solid #eee; 
              page-break-inside: avoid; 
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default PrintBarcodeModal;